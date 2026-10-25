import { test } from "node:test";
import assert from "node:assert/strict";
import { createRequire } from "node:module";
import { randomBytes, randomUUID } from "node:crypto";
import { readFile } from "node:fs/promises";
import { webhookSchema } from "../../src/modules/crm/schema";
const load = createRequire(import.meta.url);
const { extractModelAssessment } = load(
  "../../integrations/n8n/model-assessment.cjs",
) as { extractModelAssessment: (response: unknown) => Record<string, unknown> };
const { prepareMappedCrmRequest } = load(
  "../../integrations/n8n/prepare-crm-request.cjs",
) as {
  prepareMappedCrmRequest: (
    source: unknown,
    mapping: unknown,
    secret: string,
  ) => { body: string; headers: Record<string, string> };
};
const assessment = {
  lead_score: 60,
  classification: "WARM",
  priority: "MEDIUM",
  route_to_sales: true,
  main_problem: "Problema de prueba",
  commercial_opportunity: "Oportunidad de prueba",
  recommended_action: "Recomendar llamada; no confirmada",
  response_suggestion: "Sugerencia de precio u horario sin autorización",
  scoring_breakdown: {
    pain_clarity: 16,
    commercial_fit: 12,
    budget_strength: 6,
    urgency: 18,
    business_impact: 8,
  },
};
const envelope = (value: unknown) => [
  {
    output: [
      { content: [{ type: "output_text", text: JSON.stringify(value) }] },
    ],
  },
];
test("Extrae el JSON serializado de la estructura observada sin recalificar", () => {
  assert.deepEqual(extractModelAssessment(envelope(assessment)), assessment);
});
test("Rechaza múltiples prospectos, texto ambiguo, JSON inválido o código ejecutable", () => {
  assert.throws(() =>
    extractModelAssessment([...envelope(assessment), ...envelope(assessment)]),
  );
  assert.throws(() =>
    extractModelAssessment({
      output: [
        {
          content: [
            { type: "output_text", text: "{}" },
            { type: "output_text", text: "{}" },
          ],
        },
      ],
    }),
  );
  assert.throws(() =>
    extractModelAssessment({
      output: [
        {
          content: [
            { type: "output_text", text: "globalThis.executed = true" },
          ],
        },
      ],
    }),
  );
  assert.throws(() =>
    extractModelAssessment({
      output: [
        { content: [{ type: "output_text", text: "```json\n{}\n```" }] },
      ],
    }),
  );
});
test("Valida tipos de IA, no toma contacto, presupuestos ni fechas del modelo", () => {
  assert.throws(() =>
    extractModelAssessment(envelope({ ...assessment, lead_score: 101 })),
  );
  assert.throws(() =>
    extractModelAssessment(envelope({ ...assessment, route_to_sales: "true" })),
  );
  assert.throws(() =>
    extractModelAssessment(
      envelope({ ...assessment, scoring_breakdown: { pain_clarity: "16" } }),
    ),
  );
  const result = extractModelAssessment(
    envelope({
      ...assessment,
      name: "Nombre inventado por IA",
      email: "inventado@example.invalid",
      budget: "999",
      evaluated_at: "2030-01-01T00:00:00Z",
    }),
  );
  for (const key of ["name", "email", "budget", "evaluated_at"])
    assert.equal(result[key], undefined);
});
test("Mapa de respuesta del modelo conserva sus nueve campos y deja contacto e IDs pendientes", async () => {
  const mapping = JSON.parse(
    await readFile(
      "integrations/n8n/field-map.model-response.example.json",
      "utf8",
    ),
  );
  const source = {
    assessment: extractModelAssessment(envelope(assessment)),
    capture: {
      name: "PRUEBA AISLADA",
      id: randomUUID(),
      date: "2026-10-25T12:00:00Z",
    },
  };
  const secret = randomBytes(48).toString("hex");
  assert.throws(() => prepareMappedCrmRequest(source, mapping, secret));
  Object.assign(mapping.paths, {
    "contact.name": "capture.name",
    event_id: "capture.id",
    external_id: "capture.id",
    occurred_at: "capture.date",
    evaluated_at: "capture.date",
  });
  Object.assign(mapping.constants, {
    brand_id: randomUUID(),
    source: "fixture",
  });
  const prepared = prepareMappedCrmRequest(source, mapping, secret);
  const event = webhookSchema.parse(JSON.parse(prepared.body));
  assert.equal(event.score, 60);
  assert.equal(event.classification, "WARM");
  assert.equal(event.priority, "MEDIUM");
  assert.equal(event.route_to_sales, true);
  assert.equal(event.problem, assessment.main_problem);
  assert.equal(event.opportunity, assessment.commercial_opportunity);
  assert.equal(event.recommendation, assessment.recommended_action);
  assert.equal(event.response_suggestion, assessment.response_suggestion);
  assert.deepEqual(event.scoring_breakdown, assessment.scoring_breakdown);
  assert.equal(event.next_action, "");
  assert.equal(event.budget, "");
  assert.equal(event.contact.name, source.capture.name);
  assert.equal(event.is_test, true);
});
