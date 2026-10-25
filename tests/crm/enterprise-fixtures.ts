/** Presentation data only; never imported by application code. */
import type { EnterpriseData } from "../../src/modules/automation/data";
import { crmFixture } from "./fixtures";
export const enterpriseFixture: EnterpriseData = {
  organizationId: "80000000-0000-4000-8000-000000000001",
  organizationName: "PRUEBA AISLADA · Espinal Guerra",
  role: "owner",
  brands: crmFixture.brands,
  memberCount: 1,
  bound: true,
  sources: [
    {
      id: "81000000-0000-4000-8000-000000000001",
      brand_id: crmFixture.brands.find((b) => b.slug === "ceo-rentable-os")!.id,
      source_key: "ceo-rentable-diagnostico",
      name: "Diagnóstico existente CEO Rentable",
      provider: "signed_backend",
      enabled: false,
    },
  ],
  definitions: [
    {
      id: "82000000-0000-4000-8000-000000000001",
      brand_id: crmFixture.brands.find((b) => b.slug === "ceo-rentable-os")!.id,
      name: "Diagnóstico CEO Rentable · borrador",
      status: "draft",
      plan: {
        version: 1,
        steps: [],
        conditions: [],
        execution: "not_implemented",
      },
    },
  ],
  events: [
    {
      id: "83000000-0000-4000-8000-000000000001",
      kind: "lead.captured",
      status: "pending",
      attempts: 0,
      is_test: true,
      created_at: "2026-10-25T12:00:00Z",
    },
  ],
  runs: [],
};
