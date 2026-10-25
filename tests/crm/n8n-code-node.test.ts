import { test } from "node:test";
import assert from "node:assert/strict";
import { compileFunction } from "node:vm";
import { createRequire } from "node:module";
import { readFile } from "node:fs/promises";
import { execFileSync } from "node:child_process";
import { randomBytes, randomUUID } from "node:crypto";
import { webhookSchema } from "../../src/modules/crm/schema";
import { verifySignature } from "../../src/modules/crm/webhook";
test("Artefacto copiable a n8n ejecuta el contrato real sin depender de imports del repositorio", async () => {
  execFileSync(process.execPath, ["scripts/build-n8n-code.mjs", "--check"]);
  const code = await readFile(
    "integrations/n8n/prepare-normalized-code-node.js.txt",
    "utf8",
  );
  const execute = compileFunction(code, [
    "$env",
    "$input",
    "$workflow",
    "$execution",
    "$now",
    "require",
  ]);
  const secret = randomBytes(48).toString("hex");
  const now = new Date().toISOString();
  const env = {
    CRM_CAPTURE_IS_TEST: "true",
    CRM_WEBHOOK_SECRET: secret,
    CRM_BRAND_ID: randomUUID(),
  };
  const run = (config: Record<string, string> = env, executionMode = "test") =>
    execute(
      config,
      {
        all: () => [
          {
            json: {
              name: "PRUEBA AISLADA",
              email: "fixture@example.invalid",
              source: "espinalguerra.com",
              service_interest: null,
              monthly_leads: null,
              lead_score: 60,
              classification: "WARM",
              route_to_sales: true,
            },
          },
        ],
      },
      { id: "isolated" },
      { id: "execution-test", mode: executionMode },
      { toISO: () => now },
      createRequire(import.meta.url),
    ) as Array<{ json: { body: string; headers: Record<string, string> } }>;
  const result = run()[0].json;
  const event = webhookSchema.parse(JSON.parse(result.body));
  assert.equal(event.contact.name, "PRUEBA AISLADA");
  assert.equal(event.service, "");
  assert.equal(event.is_test, true);
  assert.equal(event.capture_context?.identity_scope, "n8n_execution");
  assert.equal(event.next_action, "");
  assert.ok(
    verifySignature(
      secret,
      result.headers["X-CRM-Timestamp"],
      result.headers["X-CRM-Signature"],
      result.body,
    ),
  );
  assert.ok(!result.body.includes(secret));
  assert.throws(() => run({ ...env, CRM_CAPTURE_IS_TEST: "" }));
  const sourceMode = webhookSchema.parse(
    JSON.parse(
      run({
        ...env,
        CRM_BRAND_ID: "",
        CRM_CAPTURE_SOURCE_KEY: "ceo-campaign",
      })[0].json.body,
    ),
  );
  assert.equal(sourceMode.brand_id, undefined);
  assert.equal(sourceMode.capture_source_key, "ceo-campaign");
  const manual = webhookSchema.parse(
    JSON.parse(
      run({ ...env, CRM_CAPTURE_IS_TEST: "false" }, "test")[0].json.body,
    ),
  );
  assert.equal(manual.is_test, true);
  const unknown = webhookSchema.parse(
    JSON.parse(
      run({ ...env, CRM_CAPTURE_IS_TEST: "false" }, "unknown")[0].json.body,
    ),
  );
  assert.equal(unknown.is_test, true);
  const production = webhookSchema.parse(
    JSON.parse(
      run({ ...env, CRM_CAPTURE_IS_TEST: "false" }, "production")[0].json.body,
    ),
  );
  assert.equal(production.is_test, false);
});
