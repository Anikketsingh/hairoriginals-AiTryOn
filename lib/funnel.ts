/**
 * lib/funnel.ts
 *
 * Server-side funnel stage resolution and credit management.
 * Implements the Stage 0→3 generation-limit funnel from context.md §2.
 *
 * All exports are server-only — import only in Route Handlers.
 */

import { supabaseAdmin } from "@/lib/supabase/server";
import { getLoginGateMessage, getAgentGateMessage } from "@/lib/settings";
import type { FunnelStage, SessionStatus } from "@/lib/types";

// ──────────────────────────────────────────────────────────────
// Session lookup
// ──────────────────────────────────────────────────────────────

export async function getSessionByToken(token: string) {
  const { data, error } = await supabaseAdmin
    .from("device_sessions")
    .select("id, user_id, generations_used, session_token")
    .eq("session_token", token)
    .single();

  if (error || !data) return null;
  return data as {
    id: string;
    user_id: string | null;
    generations_used: number;
    session_token: string;
  };
}

// ──────────────────────────────────────────────────────────────
// Credit balance
// Returns total remaining and used credits for a session / user.
// A session can have credits via session_id OR user_id (after login).
// ──────────────────────────────────────────────────────────────

export async function getCreditBalance(
  sessionId: string | null,
  userId: string | null
): Promise<{ remaining: number; used: number }> {
  if (!sessionId && !userId) return { remaining: 0, used: 0 };

  const now = new Date().toISOString();

  // Build OR filter: credits belonging to this session OR this user
  const orFilter =
    sessionId && userId
      ? `session_id.eq.${sessionId},user_id.eq.${userId}`
      : sessionId
      ? `session_id.eq.${sessionId}`
      : `user_id.eq.${userId}`;

  const { data, error } = await supabaseAdmin
    .from("generation_credits")
    .select("amount, consumed, expires_at")
    .or(orFilter)
    .or(`expires_at.is.null,expires_at.gt.${now}`);

  if (error || !data) {
    console.error("[funnel] getCreditBalance error:", error?.message);
    return { remaining: 0, used: 0 };
  }

  const remaining = data.reduce(
    (sum, row) => sum + Math.max(0, row.amount - row.consumed),
    0
  );
  const used = data.reduce((sum, row) => sum + row.consumed, 0);

  return { remaining, used };
}

// ──────────────────────────────────────────────────────────────
// Funnel stage resolution
// ──────────────────────────────────────────────────────────────

export async function getFunnelStage(
  sessionId: string | null,
  userId: string | null
): Promise<FunnelStage> {
  const { remaining } = await getCreditBalance(sessionId, userId);
  if (userId) {
    return remaining > 0 ? 2 : 3;
  }
  return remaining > 0 ? 0 : 1;
}

// ──────────────────────────────────────────────────────────────
// Credit grants
// ──────────────────────────────────────────────────────────────

export async function grantCredits(
  sessionId: string | null,
  userId: string | null,
  source: "guest_free" | "registered_bonus" | "agent_grant" | "promo" | "monthly_refresh",
  amount: number,
  grantedBy?: string
): Promise<string | null> {
  const { data, error } = await supabaseAdmin
    .from("generation_credits")
    .insert({
      session_id: sessionId ?? null,
      user_id: userId ?? null,
      source,
      amount,
      consumed: 0,
      granted_by: grantedBy ?? null,
    })
    .select("id")
    .single();

  if (error || !data) {
    console.error("[funnel] grantCredits error:", error?.message);
    return null;
  }
  return data.id as string;
}

// ──────────────────────────────────────────────────────────────
// Atomic credit consumption (via PG function for correctness)
// Returns the consumed credit_id, or null if no credits available.
// ──────────────────────────────────────────────────────────────

export async function consumeCredit(
  sessionId: string | null,
  userId: string | null
): Promise<string | null> {
  const { data, error } = await supabaseAdmin.rpc("consume_one_credit", {
    p_session_id: sessionId ?? null,
    p_user_id: userId ?? null,
  });

  if (error) {
    console.error("[funnel] consumeCredit RPC error:", error.message);
    return null;
  }

  // data is the UUID of the consumed credit row, or null
  return (data as string | null) ?? null;
}

// ──────────────────────────────────────────────────────────────
// Full session status (used by /api/sessions/[token])
// ──────────────────────────────────────────────────────────────

export async function resolveSessionStatus(token: string): Promise<SessionStatus | null> {
  const session = await getSessionByToken(token);
  if (!session) return null;

  const { remaining, used } = await getCreditBalance(session.id, session.user_id);
  const stage = await getFunnelStage(session.id, session.user_id);

  const [loginMsg, agentMsg] = await Promise.all([
    getLoginGateMessage(),
    getAgentGateMessage(),
  ]);

  return {
    sessionId: session.id,
    sessionToken: token,
    userId: session.user_id,
    stage,
    creditsRemaining: remaining,
    creditsUsed: used,
    loginGateMessage: loginMsg as string,
    agentGateMessage: agentMsg as string,
  };
}

// ──────────────────────────────────────────────────────────────
// Touch session last_seen timestamp
// ──────────────────────────────────────────────────────────────

export async function touchSession(sessionId: string): Promise<void> {
  await supabaseAdmin
    .from("device_sessions")
    .update({ last_seen: new Date().toISOString() })
    .eq("id", sessionId);
}
