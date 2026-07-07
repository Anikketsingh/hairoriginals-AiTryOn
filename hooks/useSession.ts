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
 *
 * Exposes:
 *   - sessionToken: the raw token string (sent in generate requests)
 *   - sessionStatus: current stage, creditsRemaining, gate messages
 *   - sessionLoading: true while initializing
 *   - refreshStatus: call after auth to get updated credits/stage
 */

import { useState, useEffect, useCallback } from "react";
import type { SessionStatus } from "@/lib/types";

const SESSION_TOKEN_KEY = "hair_session_token";

/** Generates a browser fingerprint — a stable-ish UUID stored in localStorage. */
function getOrCreateFingerprint(): string {
  const FP_KEY = "hair_fp";
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

  const fetchStatus = useCallback(async (token: string): Promise<SessionStatus | null> => {
    try {
      const res = await fetch(`/api/sessions/${token}`);
      if (!res.ok) return null;
      return (await res.json()) as SessionStatus;
    } catch {
      return null;
    }
  }, []);

  const initSession = useCallback(async () => {
    setSessionLoading(true);
    try {
      let token = localStorage.getItem(SESSION_TOKEN_KEY);

      if (!token) {
        // Create a new session
        const fingerprint = getOrCreateFingerprint();
        const res = await fetch("/api/sessions", {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({ fingerprint }),
        });

        if (!res.ok) {
          console.error("[useSession] Failed to create session:", await res.text());
          return;
        }

        const data = await res.json();
        token = data.sessionToken as string;
        localStorage.setItem(SESSION_TOKEN_KEY, token);
      }

      setSessionToken(token);

      const status = await fetchStatus(token);
      if (status) {
        setSessionStatus(status);
      } else {
        // Token is stale (server may have reset) — clear and recreate
        localStorage.removeItem(SESSION_TOKEN_KEY);
        localStorage.removeItem("hair_fp");
        setSessionToken(null);
        setSessionStatus(null);
      }
    } catch (err) {
      console.error("[useSession] Unexpected error:", err);
    } finally {
      setSessionLoading(false);
    }
  }, [fetchStatus]);

  /** Refresh status after auth completion or credit grant. */
  const refreshStatus = useCallback(async () => {
    if (!sessionToken) return;
    const status = await fetchStatus(sessionToken);
    if (status) setSessionStatus(status);
  }, [sessionToken, fetchStatus]);

  useEffect(() => {
    initSession();
  }, [initSession]);

  return { sessionToken, sessionStatus, sessionLoading, refreshStatus };
}
