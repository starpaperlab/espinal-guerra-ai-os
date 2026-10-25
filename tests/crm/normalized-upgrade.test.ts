import { test } from "node:test";
import assert from "node:assert/strict";
import { PGlite } from "@electric-sql/pglite";
import { readFile } from "node:fs/promises";
test("La actualización 005 puede aplicarse directamente sobre la fundación CRM 002 sin crear organizaciones ni marcas", async () => {
  const db = new PGlite();
  try {
    await db.exec(
      "create role anon; create role authenticated; create role service_role bypassrls; create schema auth; create table auth.users(id uuid primary key); create function auth.uid() returns uuid language sql stable as $$ select nullif(current_setting('request.jwt.claim.sub',true),'')::uuid $$; grant usage on schema public,auth to anon,authenticated,service_role;",
    );
    for (const name of [
      "202610250001_foundation.sql",
      "202610250002_crm.sql",
      "202610250005_n8n_normalized_capture.sql",
    ])
      await db.exec(await readFile("supabase/migrations/" + name, "utf8"));
    assert.equal(
      (await db.query<{ v: number }>("select crm_inbound_contract_version() v"))
        .rows[0].v,
      4,
    );
    assert.equal(
      (
        await db.query<{ n: number }>(
          "select count(*)::integer n from organizations",
        )
      ).rows[0].n,
      0,
    );
    assert.equal(
      (await db.query<{ n: number }>("select count(*)::integer n from brands"))
        .rows[0].n,
      0,
    );
    const columns = (
      await db.query<{ column_name: string }>(
        "select column_name from information_schema.columns where table_schema='public' and table_name='crm_leads' and column_name in ('ai_metadata','capture_metadata')",
      )
    ).rows;
    assert.equal(columns.length, 2);
  } finally {
    await db.close();
  }
});
