import { test } from "node:test";
import assert from "node:assert/strict";
import { createRequire } from "node:module";
import { randomBytes, randomUUID } from "node:crypto";
import { webhookSchema } from "../../src/modules/crm/schema";
import { receiveLead, verifySignature } from "../../src/modules/crm/webhook";
const load = createRequire(import.meta.url);
type Prepared = { body: string; headers: Record<string, string> };
const { prepareCrmRequest, prepareMappedCrmRequest } = load(
  "../../integrations/n8n/prepare-crm-request.cjs",
) as {
  prepareCrmRequest: (
    input: Record<string, unknown>,
    secret: string,
    now?: number,
  ) => Prepared;
  prepareMappedCrmRequest: (
    raw: unknown,
    mapping: unknown,
    secret: string,
    now?: number,
  ) => Prepared;
};
const secret = randomBytes(48).toString("hex");
const now = Date.now();
function event() {
  return {
    event_id: randomUUID(),
    external_id: randomUUID(),
    brand_id: randomUUID(),
    contact: { name: "PRUEBA AISLADA", email: "fixture@example.invalid" },
    source: "prueba",
    score: "85",
    classification: " hot ",
    evaluated_at: new Date(now).toISOString(),
    occurred_at: new Date(now).toISOString(),
    is_test: true,
    campaign: "Campaña de prueba",
    message: "Mensaje original",
    budget: 100,
    urgency: "Este mes",
  };
}
test("Adaptador firma el cuerpo exacto, normaliza representación sin recalificar y conserva campos", () => {
  const input = event();
  const a = prepareCrmRequest(input, secret, now);
  const b = prepareCrmRequest(input, secret, now + 10000);
  assert.equal(a.body, b.body);
  assert.notEqual(a.headers["X-CRM-Signature"], b.headers["X-CRM-Signature"]);
  assert.ok(
    verifySignature(
      secret,
      a.headers["X-CRM-Timestamp"],
      a.headers["X-CRM-Signature"],
      a.body,
      now,
    ),
  );
  const parsed = webhookSchema.parse(JSON.parse(a.body));
  assert.equal(parsed.score, 85);
  assert.equal(parsed.classification, "HOT");
  assert.equal(parsed.budget, "100");
  assert.equal(parsed.message, input.message);
  assert.equal(parsed.campaign, input.campaign);
  assert.equal(parsed.urgency, input.urgency);
  assert.equal(parsed.is_test, true);
});
test("Mapeo configurable exige claves reales, no asume estructura de un workflow", () => {
  const input = event();
  const raw = {
    capture: {
      id: input.external_id,
      name: input.contact.name,
      mail: input.contact.email,
      date: input.occurred_at,
    },
    qualification: { score: "85", kind: "warm", date: input.evaluated_at },
  };
  const mapping = {
    version: 1,
    paths: {
      event_id: "capture.id",
      external_id: "capture.id",
      "contact.name": "capture.name",
      "contact.email": "capture.mail",
      score: "qualification.score",
      classification: "qualification.kind",
      evaluated_at: "qualification.date",
      occurred_at: "capture.date",
    },
    constants: { brand_id: input.brand_id, source: "prueba", is_test: true },
  };
  const prepared = prepareMappedCrmRequest(raw, mapping, secret, now);
  const parsed = webhookSchema.parse(JSON.parse(prepared.body));
  assert.equal(parsed.classification, "WARM");
  assert.equal(parsed.contact.name, input.contact.name);
  assert.throws(() =>
    prepareMappedCrmRequest(
      raw,
      { ...mapping, paths: { ...mapping.paths, "contact.name": "missing" } },
      secret,
      now,
    ),
  );
  assert.throws(() =>
    prepareMappedCrmRequest(
      raw,
      {
        ...mapping,
        paths: { ...mapping.paths, "contact.name": "constructor.name" },
      },
      secret,
      now,
    ),
  );
  assert.throws(() =>
    prepareMappedCrmRequest(
      raw,
      {
        ...mapping,
        constants: { ...mapping.constants, organization_id: randomUUID() },
      },
      secret,
      now,
    ),
  );
});
test("Adaptador no inventa IDs, fechas, marca, evaluación, secretos ni flag de pruebas", () => {
  for (const field of [
    "event_id",
    "external_id",
    "brand_id",
    "occurred_at",
    "is_test",
  ]) {
    const input: Record<string, unknown> = event();
    delete input[field];
    assert.throws(() => prepareCrmRequest(input, secret, now));
  }
  assert.throws(() =>
    prepareCrmRequest({ ...event(), score: "abc" }, secret, now),
  );
  assert.throws(() =>
    prepareCrmRequest({ ...event(), is_test: "false" }, secret, now),
  );
  assert.throws(() => prepareCrmRequest(event(), "", now));
  assert.throws(() =>
    prepareCrmRequest(
      { ...event(), organization_id: randomUUID() },
      secret,
      now,
    ),
  );
});
test("Errores correlacionados no exponen payload, firma, correo ni secreto y bloquean escrituras sin migración", async () => {
  const logs: unknown[] = [];
  let calls = 0;
  const deps = {
    secret,
    organizationId: randomUUID(),
    now,
    report: (entry: unknown) => logs.push(entry),
    ensureReady: async () => false,
    ingest: async () => {
      calls++;
      return { data: {}, error: null };
    },
  };
  const prepared = prepareCrmRequest(event(), secret, now);
  const response = await receiveLead(
    new Request("https://example.invalid/api/integrations/n8n/leads", {
      method: "POST",
      headers: prepared.headers,
      body: prepared.body,
    }),
    deps,
  );
  assert.equal(response.status, 503);
  assert.equal(calls, 0);
  const body = await response.json();
  assert.equal(body.request_id, response.headers.get("x-crm-request-id"));
  const serialized = JSON.stringify(logs);
  assert.match(serialized, /CONTRACT_NOT_READY/);
  assert.ok(!serialized.includes(secret));
  assert.ok(!serialized.includes("fixture@example.invalid"));
  assert.ok(!serialized.includes(prepared.headers["X-CRM-Signature"]));
  const invalid = await receiveLead(
    new Request("https://example.invalid", {
      method: "POST",
      headers: { ...prepared.headers, "Content-Type": "application/jsonp" },
      body: prepared.body,
    }),
    deps,
  );
  assert.equal(invalid.status, 415);
});
