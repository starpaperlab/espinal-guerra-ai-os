// Safe diagnostics: only allowlisted variable names and fixed reasons may leave this helper.
// Environment values, key lengths and parser error messages are never returned.
type Variable =
  | "NEXT_PUBLIC_SUPABASE_URL"
  | "NEXT_PUBLIC_SUPABASE_PUBLISHABLE_KEY"
  | "SUPABASE_SERVICE_ROLE_KEY"
  | "CRM_WEBHOOK_SECRET";
type Issue = {
  variable: Variable;
  reason: "missing" | "https_required" | "min_32_characters";
};
export function webhookConfigurationIssues(
  env: Record<string, string | undefined>,
): Issue[] {
  const issues: Issue[] = [];
  if (!env.NEXT_PUBLIC_SUPABASE_URL)
    issues.push({ variable: "NEXT_PUBLIC_SUPABASE_URL", reason: "missing" });
  else {
    try {
      if (new URL(env.NEXT_PUBLIC_SUPABASE_URL).protocol !== "https:")
        issues.push({
          variable: "NEXT_PUBLIC_SUPABASE_URL",
          reason: "https_required",
        });
    } catch {
      issues.push({
        variable: "NEXT_PUBLIC_SUPABASE_URL",
        reason: "https_required",
      });
    }
  }
  for (const variable of [
    "NEXT_PUBLIC_SUPABASE_PUBLISHABLE_KEY",
    "SUPABASE_SERVICE_ROLE_KEY",
  ] as const) {
    if (!env[variable]) issues.push({ variable, reason: "missing" });
  }
  if (!env.CRM_WEBHOOK_SECRET)
    issues.push({ variable: "CRM_WEBHOOK_SECRET", reason: "missing" });
  else if (env.CRM_WEBHOOK_SECRET.length < 32)
    issues.push({
      variable: "CRM_WEBHOOK_SECRET",
      reason: "min_32_characters",
    });
  return issues;
}
