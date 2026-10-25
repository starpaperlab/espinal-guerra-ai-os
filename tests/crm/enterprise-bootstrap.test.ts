import { test } from "node:test";
import assert from "node:assert/strict";
import { PGlite } from "@electric-sql/pglite";
import { readFile } from "node:fs/promises";
import { randomUUID } from "node:crypto";
test("Crear organización requiere autorización explícita del operador y un administrador existente", async () => {
  const db = new PGlite();
  const admin = randomUUID();
  try {
    await db.exec(
      "create role anon;create role authenticated;create role service_role bypassrls;create schema auth;create table auth.users(id uuid primary key);create function auth.uid() returns uuid language sql stable as $$select nullif(current_setting('request.jwt.claim.sub',true),'')::uuid$$;grant usage on schema public,auth to anon,authenticated,service_role;",
    );
    for (const name of [
      "202610250001_foundation.sql",
      "202610250002_crm.sql",
      "202610250005_n8n_normalized_capture.sql",
      "202610250006_multibrand_native_foundation.sql",
    ])
      await db.exec(await readFile("supabase/migrations/" + name, "utf8"));
    await db.query("insert into auth.users(id) values($1)", [admin]);
    await assert.rejects(() => db.query("select crm_bootstrap_enterprise()"));
    await assert.rejects(() =>
      db.query("select crm_bootstrap_enterprise(null,null,true,false)"),
    );
    assert.equal(
      (await db.query("select * from organizations")).rows.length,
      0,
    );
    const first = (
      await db.query<{
        r: {
          organization_id: string;
          organization_created: boolean;
          brands: unknown[];
        };
      }>("select crm_bootstrap_enterprise(null,$1,true,false) r", [admin])
    ).rows[0].r;
    assert.equal(first.organization_created, true);
    assert.equal(first.brands.length, 5);
    const again = (
      await db.query<{
        r: { organization_id: string; organization_created: boolean };
      }>("select crm_bootstrap_enterprise() r")
    ).rows[0].r;
    assert.equal(again.organization_id, first.organization_id);
    assert.equal(again.organization_created, false);
    assert.equal(
      (await db.query("select * from organizations")).rows.length,
      1,
    );
    assert.equal(
      (await db.query("select * from organization_members")).rows.length,
      1,
    );
  } finally {
    await db.close();
  }
});
