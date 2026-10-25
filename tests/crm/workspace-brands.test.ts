import { test } from "node:test";
import assert from "node:assert/strict";
import { randomUUID } from "node:crypto";
import { workspaceBrands } from "../../src/modules/workspace-brands";
test("El catálogo decorativo no inventa una marca registrada que aún no existe en Supabase", () => {
  const rows = [
    { id: randomUUID(), slug: "ceo-rentable-os", name: "CEO Rentable OS" },
    { id: randomUUID(), slug: "plannerlab", name: "PlannerLab" },
    { id: randomUUID(), slug: "star-paper-lab", name: "Star Paper Lab" },
    {
      id: randomUUID(),
      slug: "emprendedora-digital-con-ia",
      name: "Emprendedora Digital con IA",
    },
  ];
  const result = workspaceBrands(rows);
  assert.equal(result.length, 4);
  assert.ok(!result.some((b) => b.name === "Espinal Guerra"));
  assert.deepEqual(
    result.map((b) => b.id),
    rows.map((b) => b.id),
  );
  assert.ok(result.every((b) => b.status === "Registrada"));
  const corporate = {
    id: randomUUID(),
    slug: "espinal-guerra",
    name: "Espinal Guerra",
  };
  const next = workspaceBrands([...rows, corporate]);
  assert.equal(next.length, 5);
  assert.equal(next.find((b) => b.name === "Espinal Guerra")?.id, corporate.id);
});
test("Nuevas marcas conservan UUID y contexto sin depender de nombres como claves de relación", () => {
  const actual = { id: randomUUID(), slug: "marca-nueva", name: "Marca Nueva" };
  const result = workspaceBrands([actual])[0];
  assert.equal(result.id, actual.id);
  assert.equal(result.href, "/dashboard?marca=marca-nueva");
  assert.equal(result.logo, null);
  assert.equal(result.initials, "MN");
});
