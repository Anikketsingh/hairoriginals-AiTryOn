"use client";

/**
 * hooks/useSession.ts
 *
 * Manages the browser-side device session for the generation funnel.
 *
 * On first mount:
 *   - Reads `hair_session_token` from localStorage.
 *   - If none, calls POST /api/sessions to create one and stores it.
 *   - Fetches the current funnel status via GET /api/sessions/[token].
 *   - Re-links the session to the signed-in user when Supabase still has an
 *     auth session but this device session isn't linked to it.
 *
 * Staying signed in depends on two things holding:
 *   1. The device token survives. It is the only handle on the user link
 *      (`device_sessions.user_id`), so it is only discarded when the server
 *      says the token is genuinely gone — never on a network blip.
 *   2. If the token is lost anyway, Supabase's own persisted auth session is
 *      the source of truth and re-links the replacement session.
 *
 * Exposes:
 *   - sessionToken: the raw token string (sent in generate requests)
 *   - sessionStatus: current stage, creditsRemaining, gate messages
 *   - sessionLoading: true while initializing
 *   - refreshStatus: call after auth to get updated credits/stage
 */

import { useState, useEffect, useCallback } from "react";
import { supabaseClient } from "@/lib/supabase/client";
import type { SessionStatus } from "@/lib/types";

const SESSION_TOKEN_KEY = "hair_session_token";
const FP_KEY = "hair_fp";

/** `gone` is true only when the server positively says the token is unknown. */
type StatusResult =
  | { ok: true; status: SessionStatus }
  | { ok: false; gone: boolean };

/** Generates a browser fingerprint — a stable-ish UUID stored in localStorage. */
function getOrCreateFingerprint(): string {
  let fp = localStorage.getItem(FP_KEY);
  if (!fp) {
    if (typeof crypto !== "undefined" && typeof crypto.randomUUID === "function") {
      fp = crypto.randomUUID();
    } else {
      // Safe fallback UUID generator for insecure contexts (like HTTP on local IP)
      fp = "xxxxxxxx-xxxx-4xxx-yxxx-xxxxxxxxxxxx".replace(/[xy]/g, (c) => {
        const r = (Math.random() * 16) | 0;
        const v = c === "x" ? r : (r & 0x3) | 0x8;
        return v.toString(16);
      });
    }
    localStorage.setItem(FP_KEY, fp);
  }
  return fp;
}

export function useSession() {
  const [sessionToken, setSessionToken] = useState<string | null>(null);
  const [sessionStatus, setSessionStatus] = useState<SessionStatus | null>(null);
  const [sessionLoading, setSessionLoading] = useState(true);

  const fetchStatus = useCallback(async (token: string): Promise<StatusResult> => {
    try {
      const res = await fetch(`/api/sessions/${token}`);
      if (res.ok) return { ok: true, status: (await res.json()) as SessionStatus };
      return { ok: false, gone: res.status === 404 };
    } catch {
      return { ok: false, gone: false };
    }
  }, []);

  const createSession = useCallback(async (): Promise<string | null> => {
    const res = await fetch("/api/sessions", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ fingerprint: getOrCreateFingerprint() }),
    });
    if (!res.ok) {
      console.error("[useSession] Failed to create session:", await res.text());
      return null;
    }
    const data = await res.json();
    const token = data.sessionToken as string;
    localStorage.setItem(SESSION_TOKEN_KEY, token);
    return token;
  }, []);

  /**
   * Hand this device session the identity Supabase already has. Only reached
   * when the two have drifted apart (a fresh token, or one created before
   * sign-in), so the `login_completed` event it records is a real re-login.
   * /api/auth/complete is idempotent: it links only an unlinked session and
   * grants the registration bonus once per user.
   */
  const relinkToAuthUser = useCallback(async (token: string): Promise<boolean> => {
    try {
      const { data } = await supabaseClient.auth.getSession();
      const accessToken = data.session?.access_token;
      if (!accessToken) return false;
      const res = await fetch("/api/auth/complete", {
        method: "POST",
        headers: {
          "Content-Type": "application/json",
          Authorization: `Bearer ${accessToken}`,
        },
        body: JSON.stringify({ sessionToken: token }),
      });
      return res.ok;
    } catch {
      return false;
    }
  }, []);

  const initSession = useCallback(async () => {
    setSessionLoading(true);
    try {
      let token = localStorage.getItem(SESSION_TOKEN_KEY);
      if (!token) {
        token = await createSession();
        if (!token) return;
      }

      let result = await fetchStatus(token);

      // The server has never heard of this token (it was reset, or the row was
      // pruned). Only now is it safe to throw it away and start fresh.
      if (!result.ok && result.gone) {
        localStorage.removeItem(SESSION_TOKEN_KEY);
        localStorage.removeItem(FP_KEY);
        token = await createSession();
        if (!token) return;
        result = await fetchStatus(token);
      }

      setSessionToken(token);

      // Couldn't reach the server. Keep the token — the user is still signed
      // in, we just don't know their credits this second.
      if (!result.ok) return;

      let status = result.status;
      if (!status.userId && (await relinkToAuthUser(token))) {
        const relinked = await fetchStatus(token);
        if (relinked.ok) status = relinked.status;
      }
      setSessionStatus(status);
    } catch (err) {
      console.error("[useSession] Unexpected error:", err);
    } finally {
      setSessionLoading(false);
    }
  }, [fetchStatus, createSession, relinkToAuthUser]);

  /** Refresh status after auth completion or credit grant. */
  const refreshStatus = useCallback(async () => {
    if (!sessionToken) return;
    const result = await fetchStatus(sessionToken);
    if (result.ok) setSessionStatus(result.status);
  }, [sessionToken, fetchStatus]);

  useEffect(() => {
    initSession();
  }, [initSession]);

  return { sessionToken, sessionStatus, sessionLoading, refreshStatus };
}
