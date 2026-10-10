/**
 * Shared by POST /api/admin/kiosks (first code on create) and
 * POST /api/admin/kiosks/[id]/enroll (re-issue). Not a route — Next only
 * treats route.ts files in this folder as endpoints.
 */

import { supabaseAdmin } from "@/lib/supabase/server";
import { getAppBaseUrl } from "@/lib/app-url";
import { ENROLL_CODE_TTL_MS, generateEnrollCode, hashSecret } from "@/lib/kiosk-auth";

export interface Enrollment {
  code: string;
  url: string;
  expiresAt: string;
}

/**
 * Issue a fresh one-time enrollment code for a kiosk, replacing any unused
 * one. The plain code is returned once and never stored.
 */
export async function issueEnrollCode(kioskId: string): Promise<Enrollment | null> {
  const code = generateEnrollCode();
  const expiresAt = new Date(Date.now() + ENROLL_CODE_TTL_MS).toISOString();

  const { error } = await supabaseAdmin
    .from("kiosks")
    .update({ enroll_code_hash: hashSecret(code), enroll_expires_at: expiresAt })
    .eq("id", kioskId);

  if (error) {
    console.error("[kiosks] issueEnrollCode error:", error.message);
    return null;
  }
  return { code, url: `${getAppBaseUrl()}/kiosk/enroll?code=${code}`, expiresAt };
}
