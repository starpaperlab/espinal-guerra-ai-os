import { test } from "node:test";
import assert from "node:assert/strict";
import { webhookConfigurationIssues } from "../../src/modules/automation/configuration-diagnostics";
test("Diagnóstico de configuración identifica el bloqueo sin devolver valores privados", () => {
  const env = {
    NEXT_PUBLIC_SUPABASE_URL: "https://example.invalid",
    NEXT_PUBLIC_SUPABASE_PUBLISHABLE_KEY: "public-fixture",
    SUPABASE_SERVICE_ROLE_KEY: "private-service-fixture-must-never-appear",
    CRM_WEBHOOK_SECRET: "private-short",
  };
  assert.deepEqual(webhookConfigurationIssues(env), [
    { variable: "CRM_WEBHOOK_SECRET", reason: "min_32_characters" },
  ]);
  const issues = webhookConfigurationIssues({
    ...env,
    NEXT_PUBLIC_SUPABASE_URL: "private-invalid-url-must-never-appear",
    SUPABASE_SERVICE_ROLE_KEY: "",
  });
  assert.deepEqual(issues, [
    { variable: "NEXT_PUBLIC_SUPABASE_URL", reason: "https_required" },
    { variable: "SUPABASE_SERVICE_ROLE_KEY", reason: "missing" },
    { variable: "CRM_WEBHOOK_SECRET", reason: "min_32_characters" },
  ]);
  const serialized = JSON.stringify(issues);
  for (const value of Object.values(env))
    assert.ok(!serialized.includes(value));
  assert.ok(!serialized.includes("private-invalid-url-must-never-appear"));
  assert.deepEqual(
    webhookConfigurationIssues({ ...env, CRM_WEBHOOK_SECRET: "x".repeat(32) }),
    [],
  );
});
test("Ausencias se comunican solo con nombres permitidos, sin inspeccionar otras variables", () => {
  const issues = webhookConfigurationIssues({
    UNRELATED_SECRET: "private-unrelated",
  });
  assert.equal(issues.length, 4);
  assert.ok(issues.every((i) => i.reason === "missing"));
  assert.ok(!JSON.stringify(issues).includes("UNRELATED_SECRET"));
  assert.ok(!JSON.stringify(issues).includes("private-unrelated"));
});
