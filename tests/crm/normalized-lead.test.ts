import { test } from "node:test";
import assert from "node:assert/strict";
import { createRequire } from "node:module";
import { randomBytes, randomUUID } from "node:crypto";
import { webhookSchema } from "../../src/modules/crm/schema";
const load = createRequire(import.meta.url);
export const { normalizeN8nLead } = load(
  "../../integrations/n8n/normalized-lead.cjs",
) as {
  normalizeN8nLead: (
    lead: Record<string, unknown>,
    context: Record<string, unknown>,
  ) => Record<string, unknown>;
};
const { prepareCrmRequest } = load(
  "../../integrations/n8n/prepare-crm-request.cjs",
) as {
  prepareCrmRequest: (
    event: Record<string, unknown>,
    secret: string,
    now?: number,
  ) => { body: string; headers: Record<string, string> };
};
const flat = () => ({
  name: "PRUEBA AISLADA",
  email: "capture@example.invalid",
  phone: null,
  company: null,
  source: "espinalguerra.com",
  service_interest: null,
  message: "Mensaje original de prueba",
  monthly_leads: 10,
  budget: null,
  urgency: null,
  lead_score: 60,
  classification: "WARM",
  priority: "MEDIUM",
  route_to_sales: true,
  main_problem: "Problema de prueba",
  commercial_opportunity: "Oferta sugerida, no confirmada",
  recommended_action: "Acción sugerida",
  response_suggestion: "Horario y precio sugeridos, no autorizados",
  scoring_breakdown: {
    pain_clarity: 16,
    commercial_fit: 12,
    budget_strength: 6,
    urgency: 18,
    business_impact: 8,
  },
});
const ctx = () => ({
  workflow_id: "isolated-workflow",
  execution_id: randomUUID(),
  item_index: 0,
  brand_id: randomUUID(),
  observed_at: "2026-10-25T12:00:00Z",
  is_test: true,
});
test("Contrato plano confirmado admite null opcional y conserva hechos y recomendaciones por separado", () => {
  const event = webhookSchema.parse(normalizeN8nLead(flat(), ctx()));
  assert.equal(event.contact.name, "PRUEBA AISLADA");
  assert.equal(event.contact.email, "capture@example.invalid");
  assert.equal(event.contact.phone, "");
  assert.equal(event.contact.company, "");
  assert.equal(event.service, "");
  assert.equal(event.budget, "");
  assert.equal(event.urgency, "");
  assert.equal(event.monthly_leads, 10);
  assert.equal(event.score, 60);
  assert.equal(event.classification, "WARM");
  assert.equal(event.priority, "MEDIUM");
  assert.equal(event.route_to_sales, true);
  assert.equal(event.next_action, "");
  assert.equal(event.is_test, true);
  assert.equal(event.capture_context?.capture_time_source, "n8n_observed");
  assert.equal(event.capture_context?.evaluation_time_source, "n8n_observed");
});
test("Reintento HTTP mantiene cuerpo e identidad; solo cambia firma de transporte", () => {
  const context = ctx();
  const event = normalizeN8nLead(flat(), context);
  const secret = randomBytes(48).toString("hex");
  const a = prepareCrmRequest(event, secret, 1000000000000);
  const b = prepareCrmRequest(event, secret, 1000000010000);
  assert.equal(a.body, b.body);
  assert.notEqual(a.headers["X-CRM-Signature"], b.headers["X-CRM-Signature"]);
  assert.deepEqual(normalizeN8nLead(flat(), context), event);
});
test("Identidad no usa correo ni nombre; nuevas ejecuciones requieren ID de captura para deduplicarse entre ellas", () => {
  const context = ctx();
  const a = normalizeN8nLead(flat(), context);
  const b = normalizeN8nLead(
    {
      ...flat(),
      name: "Otro nombre de prueba",
      email: "other@example.invalid",
    },
    context,
  );
  assert.equal(a.external_id, b.external_id);
  const c = normalizeN8nLead(flat(), {
    ...context,
    execution_id: randomUUID(),
  });
  assert.notEqual(a.external_id, c.external_id);
  const original = normalizeN8nLead(flat(), {
    ...context,
    source_event_id: "stable-isolated-capture",
  });
  const retried = normalizeN8nLead(flat(), {
    ...context,
    source_event_id: "stable-isolated-capture",
    execution_id: randomUUID(),
  });
  assert.equal(original.external_id, retried.external_id);
  assert.notEqual(original.event_id, retried.event_id);
});
test("Exige contexto y flag de pruebas explícitos sin inventar datos obligatorios", () => {
  for (const key of [
    "workflow_id",
    "execution_id",
    "brand_id",
    "observed_at",
    "item_index",
    "is_test",
  ]) {
    const context: Record<string, unknown> = ctx();
    delete context[key];
    assert.throws(() => normalizeN8nLead(flat(), context));
  }
  assert.throws(() => normalizeN8nLead(flat(), { ...ctx(), is_test: "false" }));
  assert.throws(() =>
    normalizeN8nLead({ ...flat(), monthly_leads: {} }, ctx()),
  );
  assert.throws(() =>
    normalizeN8nLead(flat(), { ...ctx(), observed_at: "mañana a las 10" }),
  );
  const event = normalizeN8nLead({ ...flat(), name: null }, ctx());
  assert.throws(() =>
    prepareCrmRequest(event, randomBytes(48).toString("hex")),
  );
});
test("Volumen mensual nullable o declarado en texto no se infiere del scoring ni del mensaje IA", () => {
  for (const value of [null, "10–20", 0, 100]) {
    const event = webhookSchema.parse(
      normalizeN8nLead({ ...flat(), monthly_leads: value }, ctx()),
    );
    assert.equal(event.monthly_leads, value);
    assert.equal(event.budget, "");
    assert.equal(event.next_action, "");
  }
});

test("La procedencia de prueba prevalece sobre un contexto configurado para datos reales", () => {
  assert.equal(
    normalizeN8nLead(
      { ...flat(), is_test: true },
      { ...ctx(), is_test: false, execution_mode: "production" },
    ).is_test,
    true,
  );
  assert.equal(
    normalizeN8nLead(flat(), {
      ...ctx(),
      is_test: false,
      execution_mode: "test",
    }).is_test,
    true,
  );
});

test("El destino configurado por fuente no requiere un Brand ID fijo", () => {
  const context: Record<string, unknown> = {
    ...ctx(),
    capture_source_key: "ceo-diagnostico",
  };
  delete context.brand_id;
  const body = prepareCrmRequest(
    normalizeN8nLead(flat(), context),
    randomBytes(48).toString("hex"),
  ).body;
  const parsed = webhookSchema.parse(JSON.parse(body));
  assert.equal(parsed.brand_id, undefined);
  assert.equal(parsed.capture_source_key, "ceo-diagnostico");
});
