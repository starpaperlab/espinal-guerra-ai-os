import { test } from "node:test";
import assert from "node:assert/strict";
import { PGlite } from "@electric-sql/pglite";
import { readFile } from "node:fs/promises";
import { randomUUID } from "node:crypto";
test("Marketing: relación existente, RLS, sincronización atómica e idempotencia", async (t) => {
  const db = new PGlite();
  const admin = randomUUID(),
    member = randomUUID(),
    outsider = randomUUID(),
    org = randomUUID(),
    other = randomUUID(),
    brand = randomUUID(),
    otherBrand = randomUUID();
  let account: string;
  let sync: string;
  try {
    await db.exec(
      "create role anon;create role authenticated;create role service_role bypassrls;create schema auth;create table auth.users(id uuid primary key);create function auth.uid() returns uuid language sql stable as $$select nullif(current_setting('request.jwt.claim.sub',true),'')::uuid$$;grant usage on schema public,auth to anon,authenticated,service_role;",
    );
    for (const name of [
      "202610250001_foundation.sql",
      "202610250002_crm.sql",
      "202610250003_n8n_capture_fields.sql",
      "202610250004_n8n_ai_assessment.sql",
      "202610250005_n8n_normalized_capture.sql",
      "202610250006_multibrand_native_foundation.sql",
      "202610250007_meta_ads_readonly.sql",
    ])
      await db.exec(await readFile("supabase/migrations/" + name, "utf8"));
    await db.query("insert into auth.users values($1),($2),($3)", [
      admin,
      member,
      outsider,
    ]);
    await db.query(
      "insert into organizations(id,name) values($1,'Empresa fixture'),($2,'Otra fixture')",
      [org, other],
    );
    await db.query(
      "insert into organization_members values($1,$2,'owner'),($1,$3,'member'),($4,$5,'owner')",
      [org, admin, member, other, outsider],
    );
    await db.query(
      "insert into brands(id,organization_id,slug,name) values($1,$2,'ceo-rentable-os','CEO Rentable OS'),($3,$4,'otra','Otra')",
      [brand, org, otherBrand, other],
    );
    async function as(user: string) {
      await db.exec("reset role");
      await db.query("select set_config('request.jwt.claim.sub',$1,false)", [
        user,
      ]);
      await db.exec("set role authenticated");
    }
    await as(admin);
    await t.test(
      "Vinculación repetible conserva organización y marca; rechaza destinos ajenos",
      async () => {
        account = (
          await db.query<{ id: string }>(
            "select marketing_bind_meta_account($1,$2,'act_1906671039972272') id",
            [org, brand],
          )
        ).rows[0].id;
        assert.equal(
          (
            await db.query<{ id: string }>(
              "select marketing_bind_meta_account($1,$2,'act_1906671039972272') id",
              [org, brand],
            )
          ).rows[0].id,
          account,
        );
        await assert.rejects(() =>
          db.query(
            "select marketing_bind_meta_account($1,$2,'act_1906671039972272')",
            [org, otherBrand],
          ),
        );
        assert.equal((await db.query("select * from brands")).rows.length, 1);
        assert.equal(
          (await db.query("select * from organizations")).rows.length,
          1,
        );
      },
    );
    await t.test(
      "Solo administrador inicia lectura; no hay escrituras directas ni lectura anónima",
      async () => {
        await as(member);
        await assert.rejects(() =>
          db.query(
            "select marketing_start_meta_sync($1,'2026-01-01','2026-01-15')",
            [account],
          ),
        );
        await assert.rejects(() =>
          db.query("update marketing_ad_accounts set name='fake'"),
        );
        await as(outsider);
        assert.equal(
          (await db.query("select * from marketing_ad_accounts")).rows.length,
          0,
        );
        await assert.rejects(() =>
          db.query(
            "select marketing_start_meta_sync($1,'2026-01-01','2026-01-15')",
            [account],
          ),
        );
        await db.exec("reset role;set role anon");
        await assert.rejects(() =>
          db.query("select * from marketing_ad_accounts"),
        );
        await as(admin);
      },
    );
    await t.test("Fechas y bloqueo simultáneo se validan en SQL", async () => {
      await assert.rejects(() =>
        db.query(
          "select marketing_start_meta_sync($1,'2026-01-15','2026-01-01')",
          [account],
        ),
      );
      sync = (
        await db.query<{ id: string }>(
          "select marketing_start_meta_sync($1,'2026-01-01','2026-01-15') id",
          [account],
        )
      ).rows[0].id;
      await assert.rejects(() =>
        db.query(
          "select marketing_start_meta_sync($1,'2026-01-01','2026-01-15')",
          [account],
        ),
      );
    });
    const snapshot = {
      account: {
        id: "act_1906671039972272",
        name: "Fixture",
        currency: "USD",
        timezone_name: "America/Santo_Domingo",
        account_status: 1,
      },
      permissions: { checked: true, granted: ["ads_read"] },
      campaigns: [
        { id: "123", name: "Fixture", status: "PAUSED", daily_budget: "1000" },
      ],
      insights: [
        {
          campaign_id: "123",
          date_start: "2026-01-01",
          date_stop: "2026-01-15",
          spend: "2.50",
        },
      ],
      summary: {
        date_start: "2026-01-01",
        date_stop: "2026-01-15",
        spend: "2.50",
        reach: "10",
      },
    };
    await t.test(
      "Snapshot inválido revierte todo; no guarda informes parciales",
      async () => {
        await assert.rejects(() =>
          db.query("select marketing_finish_meta_sync($1,$2)", [
            sync,
            {
              ...snapshot,
              account: { ...snapshot.account, id: "act_999999999" },
            },
          ]),
        );
        await assert.rejects(() =>
          db.query("select marketing_finish_meta_sync($1,$2)", [
            sync,
            {
              ...snapshot,
              campaigns: [...snapshot.campaigns, ...snapshot.campaigns],
            },
          ]),
        );
        assert.equal(
          (await db.query("select * from marketing_meta_campaign_metrics")).rows
            .length,
          0,
        );
        assert.equal(
          (
            await db.query<{ status: string }>(
              "select status from marketing_meta_syncs",
            )
          ).rows[0].status,
          "running",
        );
      },
    );
    await t.test(
      "Guarda métricas reales del fixture por cuenta e intervalo sin duplicar al finalizar",
      async () => {
        await db.query("select marketing_finish_meta_sync($1,$2)", [
          sync,
          snapshot,
        ]);
        assert.equal(
          (
            await db.query<{ status: string }>(
              "select status from marketing_meta_syncs",
            )
          ).rows[0].status,
          "success",
        );
        assert.equal(
          (
            await db.query<{ insight: { spend: string } }>(
              "select insight from marketing_meta_campaign_metrics",
            )
          ).rows[0].insight.spend,
          "2.50",
        );
        await assert.rejects(() =>
          db.query("select marketing_finish_meta_sync($1,$2)", [
            sync,
            snapshot,
          ]),
        );
        await as(member);
        assert.equal(
          (await db.query("select * from marketing_meta_campaign_metrics")).rows
            .length,
          1,
        );
        await as(outsider);
        assert.equal(
          (await db.query("select * from marketing_meta_campaign_metrics")).rows
            .length,
          0,
        );
        await as(admin);
      },
    );
    await t.test(
      "Un error posterior conserva última lectura correcta; solo códigos seguros",
      async () => {
        await db.exec("reset role");
        await db.query(
          "update marketing_meta_syncs set started_at=now()-interval '2 minutes'",
        );
        await as(admin);
        const failed = (
          await db.query<{ id: string }>(
            "select marketing_start_meta_sync($1,'2026-01-01','2026-01-15') id",
            [account],
          )
        ).rows[0].id;
        await assert.rejects(() =>
          db.query("select marketing_finish_meta_sync($1,null,'raw_secret')", [
            failed,
          ]),
        );
        await db.query(
          "select marketing_finish_meta_sync($1,null,'TOKEN_EXPIRED')",
          [failed],
        );
        assert.equal(
          (
            await db.query(
              "select * from marketing_meta_syncs where status='success'",
            )
          ).rows.length,
          1,
        );
        assert.equal(
          (await db.query("select * from marketing_meta_campaign_metrics")).rows
            .length,
          1,
        );
      },
    );
  } finally {
    await db.close();
  }
});
