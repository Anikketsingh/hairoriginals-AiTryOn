/**
 * POST /api/auth/complete
 *
 * Called by the browser immediately after a successful Supabase phone OTP
 * verification. Handles the server-side post-auth steps:
 *   1. Verify the Supabase access token from the Authorization header.
 *   2. Find or create the user record in our `users` table.
 *   3. Link the device session to the user (so credits transfer correctly).
 *   4. Grant registered_bonus_generations credits to the user account.
 *   5. Return the updated SessionStatus.
 *
 * Body (JSON): { sessionToken: string }
 * Header: Authorization: Bearer <supabase_access_token>
 */

import { NextRequest, NextResponse, after } from "next/server";
import { z } from "zod";
import { supabaseAdmin } from "@/lib/supabase/server";
import { grantCredits, resolveSessionStatus, getSessionByToken } from "@/lib/funnel";
import { getRegisteredBonusGenerations } from "@/lib/settings";
import { recordAnalyticsEvent } from "@/lib/analytics";
import { ensureLeadForSession } from "@/lib/leads";
import { sendCapiEvent } from "@/lib/meta-capi";
import { parseJsonBody } from "@/lib/validate";
import { maintenanceGuard } from "@/lib/maintenance";
import { readAttributionCookie } from "@/lib/attribution";

const bodySchema = z.object({
  sessionToken: z.string().min(1).optional(),
  // Shared with the browser pixel event so Meta dedups the two.
  eventId: z.string().optional(),
});

export async function POST(request: NextRequest) {
  try {
    const closed = await maintenanceGuard(request);
    if (closed) return closed;

    // 1. Extract the Supabase access token from Authorization header
    const authHeader = request.headers.get("authorization");
    const accessToken = authHeader?.replace(/^Bearer\s+/i, "").trim();

    if (!accessToken) {
      return NextResponse.json(
        { error: "Missing Authorization header." },
        { status: 401 }
      );
    }

    // 2. Verify token and get user identity from Supabase Auth
    const { data: userData, error: userError } =
      await supabaseAdmin.auth.getUser(accessToken);

    if (userError || !userData?.user) {
      return NextResponse.json(
        { error: "Invalid or expired access token." },
        { status: 401 }
      );
    }

    const authUser = userData.user;
    const authUserId = authUser.id;
    const phone = authUser.phone ?? null;

    // 3. Find or create the user in our `users` table.
    //    The on_auth_user_created trigger should have created it, but we
    //    upsert defensively in case there's a timing gap.
    const { data: appUser, error: upsertError } = await supabaseAdmin
      .from("users")
      .upsert(
        { auth_id: authUserId, phone },
        { onConflict: "auth_id", ignoreDuplicates: false }
      )
      .select("id")
      .single();

    if (upsertError || !appUser) {
      console.error("[/api/auth/complete] User upsert error:", upsertError?.message);
      return NextResponse.json(
        { error: "Failed to create user account." },
        { status: 500 }
      );
    }

    const userId = appUser.id as string;

    // 4. Get the session token from request body
    const parsed = await parseJsonBody(request, bodySchema);
    if (parsed.error) return parsed.error;
    const { sessionToken, eventId } = parsed.data;

    let sessionId: string | null = null;
    if (sessionToken) {
      const session = await getSessionByToken(sessionToken);
      if (session) {
        sessionId = session.id;

        // Link the device session to the user account (idempotent)
        await supabaseAdmin
          .from("device_sessions")
          .update({ user_id: userId })
          .eq("id", sessionId)
          .is("user_id", null); // only update if not already linked
      }
    }

    // 5. Grant registered_bonus_generations credits — but only once per user.
    //    Check if the user already has a registered_bonus grant.
    const { data: existingBonus } = await supabaseAdmin
      .from("generation_credits")
      .select("id")
      .eq("user_id", userId)
      .eq("source", "registered_bonus")
      .limit(1);

    // First sign-in (no registered_bonus grant yet) gets the one-time bonus.
    const isNewRegistration = !existingBonus || existingBonus.length === 0;

    if (isNewRegistration) {
      const bonusAmount = await getRegisteredBonusGenerations();
      await grantCredits(null, userId, "registered_bonus", bonusAmount);
    }

    await recordAnalyticsEvent("login_completed", {}, sessionId, userId);

    // 5b. Auto-register the user as a CRM lead the moment they sign in, and
    //     dispatch lead.created to the DC CRM so an agent is routed to them.
    //     Idempotent — a returning user with an existing lead is a no-op.
    await ensureLeadForSession({
      sessionId,
      userId,
      source: "registration",
      funnelStage: 2,
      attribution: readAttributionCookie(request),
    });

    // 5c. Meta Conversions API: server-side twin of the browser 'Schedule' pixel
    //     event fired on OTP verification, deduped via the shared eventId. Sent
    //     via after() so it never delays sign-in.
    {
      const forwardedFor = request.headers.get("x-forwarded-for");
      const clientIp =
        forwardedFor?.split(",")[0]?.trim() || request.headers.get("x-real-ip");
      after(() =>
        sendCapiEvent({
          eventName: "Schedule",
          eventId,
          eventSourceUrl:
            request.headers.get("origin") || request.headers.get("referer"),
          userData: {
            phone,
            clientIpAddress: clientIp,
            clientUserAgent: request.headers.get("user-agent"),
            fbp: request.cookies.get("_fbp")?.value ?? null,
            fbc: request.cookies.get("_fbc")?.value ?? null,
          },
        })
      );
    }

    // 6. Return updated session status
    if (sessionToken) {
      const status = await resolveSessionStatus(sessionToken);
      if (status) {
        return NextResponse.json({ ...status, userId }, { status: 200 });
      }
    }

    return NextResponse.json({ userId, success: true }, { status: 200 });
  } catch (err) {
    console.error("[/api/auth/complete] Unexpected error:", err);
    return NextResponse.json(
      { error: "An unexpected error occurred." },
      { status: 500 }
    );
  }
}
