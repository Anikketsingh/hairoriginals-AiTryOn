/**
 * lib/lead-filters.ts
 *
 * Shared query filters for the CRM leads list and its Excel export
 * (app/api/admin/leads/route.ts, app/api/admin/leads/export/route.ts).
 * Both must apply the exact same search / date / read / qualified filters
 * and sales_agent row scoping, or an export could silently show more (or
 * fewer) leads than what the agent has on screen — worse, a sales_agent
 * export that skipped the scoping check would leak the whole lead book.
 */

import type { AdminContext } from "@/lib/admin-auth";
import { endOfDayIso, startOfDayIso } from "@/lib/date-range";

/**
 * Sort options the CRM list (and export, which mirrors the list's order)
 * offers. `recent_activity` is the default — see idx_leads_last_activity.
 */
export const SORT_OPTIONS = {
  recent_activity: { column: "last_activity_at", ascending: false },
  newest: { column: "created_at", ascending: false },
  oldest: { column: "created_at", ascending: true },
  most_tryons: { column: "generations_count", ascending: false },
  status: { column: "status", ascending: true },
} as const;

export type SortKey = keyof typeof SORT_OPTIONS;

export function resolveSort(params: URLSearchParams): (typeof SORT_OPTIONS)[SortKey] {
  const sortParam = params.get("sort") as SortKey | null;
  return sortParam && sortParam in SORT_OPTIONS ? SORT_OPTIONS[sortParam] : SORT_OPTIONS.recent_activity;
}

/** Structural shape of the subset of PostgrestFilterBuilder methods we chain. */
interface LeadFilterQuery<Q> {
  or(filters: string): Q;
  gte(column: string, value: string): Q;
  lte(column: string, value: string): Q;
  not(column: string, operator: string, value: null): Q;
  eq(column: string, value: boolean): Q;
}

/**
 * Applies the CRM list's search / date-range / read-status / qualified-only
 * filters, plus sales_agent row scoping, to a `leads` query. Used by both
 * the list route and the export route so the export can never drift from
 * what's on screen.
 */
export function applyLeadFilters<Q extends LeadFilterQuery<Q>>(
  query: Q,
  params: URLSearchParams,
  admin: AdminContext
): Q {
  let q = query;

  // sales_agent sees only their assigned leads plus unassigned ones they
  // could claim (context.md §5.1) — security-critical, must run for every
  // consumer of this helper.
  if (admin.role === "sales_agent") {
    q = q.or(`assigned_agent_id.eq.${admin.id},assigned_agent_id.is.null`);
  }

  const query_ = params.get("q")?.trim();
  if (query_) {
    q = q.or(`phone.ilike.%${query_}%,crm_lead_id.ilike.%${query_}%`);
  }

  // Both ends resolve in REPORTING_TIMEZONE. Previously `dateFrom` was parsed
  // as bare UTC midnight while `dateTo` used the server's local timezone, so
  // the two ends of the same range disagreed with each other and neither
  // matched the calendar day the admin actually picked.
  const from = startOfDayIso(params.get("dateFrom")?.trim());
  if (from) {
    q = q.gte("created_at", from);
  }

  const to = endOfDayIso(params.get("dateTo")?.trim());
  if (to) {
    q = q.lte("created_at", to);
  }

  if (params.get("qualifiedOnly") === "true") {
    q = q.not("phone", "is", null);
  }

  const readStatus = params.get("readStatus");
  if (readStatus === "unread") {
    q = q.eq("is_read", false);
  } else if (readStatus === "read") {
    q = q.eq("is_read", true);
  }

  return q;
}
