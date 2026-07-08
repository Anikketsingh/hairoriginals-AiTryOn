/**
 * lib/validate.ts
 *
 * Shared JSON body validation for Route Handlers. Every route previously
 * did `const { x, y } = await request.json()` and trusted the shape — no
 * schema, so a malformed/missing field surfaced as a confusing 500 from
 * whatever Supabase call touched it first, or (for numeric/array fields)
 * was silently coerced. parseJsonBody() centralizes the "parse, validate,
 * return a clean 400" sequence so callers get a real Zod schema instead.
 */

import { NextResponse } from "next/server";
import type { ZodType } from "zod";

export async function parseJsonBody<T>(
  request: Request,
  schema: ZodType<T>
): Promise<{ data: T; error?: undefined } | { data?: undefined; error: NextResponse }> {
  let raw: unknown;
  try {
    raw = await request.json();
  } catch {
    return { error: NextResponse.json({ error: "Malformed JSON body." }, { status: 400 }) };
  }

  const result = schema.safeParse(raw);
  if (!result.success) {
    const issue = result.error.issues[0];
    const field = issue?.path?.join(".");
    const message = issue ? (field ? `${field}: ${issue.message}` : issue.message) : "Invalid request body.";
    return { error: NextResponse.json({ error: message }, { status: 400 }) };
  }

  return { data: result.data };
}
