/**
 * lib/settings-keys.ts
 *
 * The subset of `settings` keys that /api/admin/settings must refuse to write.
 *
 * Separate from lib/settings.ts because that module pulls in the service-role
 * Supabase client and so can't be imported from a client component — and the
 * admin settings form needs this list to strip these keys out of its bulk save.
 *
 * The maintenance switch is super_admin-plus-password; routing a write through
 * the ordinary settings save would drop the password half of that and let any
 * super_admin close the storefront. Anything else guarded by a second factor
 * belongs in this list too.
 */
export const PASSWORD_PROTECTED_SETTING_KEYS = [
  "maintenance_mode",
  "maintenance_message",
] as const;

export function isPasswordProtectedSetting(key: string): boolean {
  return (PASSWORD_PROTECTED_SETTING_KEYS as readonly string[]).includes(key);
}
