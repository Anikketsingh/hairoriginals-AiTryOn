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

import { NextRequest, NextResponse } from "next/server";
import { supabaseAdmin } from "@/lib/supabase/server";
import { grantCredits, resolveSessionStatus, getSessionByToken } from "@/lib/funnel";
import { getRegisteredBonusGenerations } from "@/lib/settings";

export async function POST(request: NextRequest) {
  try {
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
    const body = await request.json();
    const sessionToken = body?.sessionToken as string | undefined;

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

    if (!existingBonus || existingBonus.length === 0) {
      const bonusAmount = await getRegisteredBonusGenerations();
      await grantCredits(null, userId, "registered_bonus", bonusAmount);
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
