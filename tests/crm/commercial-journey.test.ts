import { test } from "node:test";
import assert from "node:assert/strict";
import { randomUUID, createHmac } from "node:crypto";
import { readFile } from "node:fs/promises";
import { PGlite } from "@electric-sql/pglite";
import { receiveLead } from "../../src/modules/crm/webhook";
const diagnostic = {
  success: true,
  fallback: false,
  method: "ceo_score_rules_v1",
  score: 5,
  classification: "Crítico",
  diagnosis: "Resultado basado en respuestas de fixture.",
  profitability: "Sin afirmar ingresos.",
  cashflow: "Sin cifras inventadas.",
  recommendations: ["Revisar costos reales."],
};
const secret = "integration-test-secret-not-for-production-32chars";
test("Contrato comercial firmado: CRM, organización, pruebas, atribución y pagos confirmados", async (t) => {
  const db = new PGlite(),
    org = randomUUID(),
    other = randomUUID(),
    owner = randomUUID(),
    outsider = randomUUID(),
    capture = randomUUID();
  let brand: string;
  let leadId: string;
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
      "202610260008_commercial_journey.sql",
    ])
      await db.exec(await readFile("supabase/migrations/" + name, "utf8"));
    await db.query("insert into auth.users values($1),($2)", [owner, outsider]);
    await db.query(
      "insert into organizations(id,name) values($1,'Espinal Guerra'),($2,'Otro grupo')",
      [org, other],
    );
    await db.query(
      "insert into organization_members values($1,$2,'owner'),($3,$4,'owner')",
      [org, owner, other, outsider],
    );
    for (const [slug, name] of [
      ["ceo-rentable-os", "CEO Rentable OS"],
      ["plannerlab", "PlannerLab"],
      ["star-paper-lab", "Star Paper Lab"],
      ["emprendedora-digital-ia", "Emprendedora Digital con IA"],
    ])
      await db.query(
        "insert into brands(organization_id,slug,name) values($1,$2,$3)",
        [org, slug, name],
      );
    await db.query("select crm_bootstrap_enterprise()");
    await db.query(
      "update crm_capture_sources set enabled=true where source_key='ceo-rentable-diagnostico'",
    );
    brand = (
      await db.query<{ brand_id: string }>(
        "select brand_id from crm_capture_sources where source_key='ceo-rentable-diagnostico'",
      )
    ).rows[0].brand_id;
    const at = new Date().toISOString();
    const base = {
      type: "lead.created",
      event_id: "diagnostic:" + capture,
      external_id: capture,
      capture_source_key: "ceo-rentable-diagnostico",
      contact: {
        name: "Prueba de integración",
        email: "fixture@example.invalid",
        phone: "",
        company: "",
      },
      source: "ceo_diagnostico",
      campaign: "fixture-campaign",
      occurred_at: at,
      is_test: true,
      score: null,
      classification: null,
      evaluated_at: null,
      journey: {
        kind: "diagnostic.completed",
        form: "ceo-diagnostico-v1",
        capture_id: capture,
        attribution: {
          utm_source: "facebook",
          utm_medium: "paid_social",
          utm_campaign: "fixture-campaign",
          advertising_consent: false,
        },
        diagnostic,
        answers: { business_type: "servicios" },
        promotional_consent: false,
        data: { form: "ceo-diagnostico-v1" },
      },
    };
    async function send(event: unknown, sig = true) {
      const body = JSON.stringify(event),
        timestamp = String(Math.floor(Date.now() / 1000));
      return receiveLead(
        new Request(
          "https://fixture.invalid/api/integrations/capture/ceo-rentable-diagnostico",
          {
            method: "POST",
            headers: {
              "Content-Type": "application/json",
              "X-CRM-Timestamp": timestamp,
              "X-CRM-Signature": sig
                ? "sha256=" +
                  createHmac("sha256", secret)
                    .update(timestamp + "." + body)
                    .digest("hex")
                : "sha256=" + "0".repeat(64),
            },
            body,
          },
        ),
        {
          secret,
          requiredSourceKey: "ceo-rentable-diagnostico",
          ingest: async (parsed, hash) => {
            try {
              const r = await db.query<{ v: unknown }>(
                "select crm_ingest_commercial_source($1,$2,$3,$4) v",
                ["ceo-rentable-diagnostico", "signed_backend", parsed, hash],
              );
              return { data: r.rows[0].v, error: null };
            } catch (error) {
              return {
                data: null,
                error: { code: (error as { code: string }).code },
              };
            }
          },
        },
      );
    }
    await t.test(
      "Firma inválida, identificadores de cliente e IDs sin consentimiento se rechazan",
      async () => {
        assert.equal((await send(base, false)).status, 401);
        assert.equal(
          (await send({ ...base, organization_id: other })).status,
          400,
        );
        assert.equal(
          (await send({ ...base, brand_id: randomUUID() })).status,
          422,
        );
        assert.equal(
          (
            await send({
              ...base,
              journey: {
                ...base.journey,
                attribution: {
                  ...base.journey.attribution,
                  fbclid: "unauthorized",
                },
              },
            })
          ).status,
          400,
        );
        assert.equal(
          (await db.query("select * from crm_contacts")).rows.length,
          0,
        );
      },
    );
    await t.test(
      "Diagnóstico conserva campaña y marca, sin convertir CEO Score en clasificación de ventas",
      async () => {
        const response = await send(base);
        assert.equal(response.status, 200);
        leadId = (await response.json()).lead_id;
        const l = (
          await db.query<{
            brand_id: string;
            score: null;
            classification: null;
            capture_metadata: { attribution: { utm_campaign: string } };
          }>("select * from crm_leads where id=$1", [leadId])
        ).rows[0];
        assert.equal(l.brand_id, brand);
        assert.equal(l.score, null);
        assert.equal(l.classification, null);
        assert.equal(
          l.capture_metadata.attribution.utm_campaign,
          "fixture-campaign",
        );
        assert.equal((await send(base)).status, 200);
        assert.equal(
          (await db.query("select * from crm_contacts")).rows.length,
          1,
        );
        assert.equal(
          (await db.query("select * from crm_commercial_events")).rows.length,
          1,
        );
        assert.equal(
          (
            await send({
              ...base,
              contact: { ...base.contact, name: "Changed event" },
            })
          ).status,
          409,
        );
      },
    );
    await t.test(
      "Nueva captura con mismo email reutiliza contacto dentro de la misma marca y procedencia",
      async () => {
        const id = randomUUID();
        assert.equal(
          (
            await send({
              ...base,
              event_id: "diagnostic:" + id,
              external_id: id,
              journey: { ...base.journey, capture_id: id },
            })
          ).status,
          200,
        );
        assert.equal(
          (await db.query("select * from crm_contacts")).rows.length,
          1,
        );
        assert.equal(
          (await db.query("select * from crm_leads")).rows.length,
          2,
        );
      },
    );
    await t.test(
      "Prueba gratuita no suma ingresos; pago necesita importe e identidad reales",
      async () => {
        const ends = new Date(Date.now() + 10 * 86400000).toISOString();
        const trial = {
          ...base,
          event_id: "StartTrial:paypal:FIXTURE",
          journey: {
            ...base.journey,
            kind: "trial.started",
            data: { subscription_id: "FIXTURE", ends_at: ends },
          },
        };
        assert.equal((await send(trial)).status, 200);
        assert.equal(
          (
            await db.query(
              "select * from crm_conversions where amount is not null",
            )
          ).rows.length,
          0,
        );
        const pay = {
          ...base,
          event_id: "Purchase:paypal:FIXTURE",
          journey: {
            ...base.journey,
            kind: "subscription.paid",
            data: {
              provider: "paypal",
              payment_id: "FIXTURE",
              amount: 17.99,
              currency: "USD",
            },
          },
        };
        assert.equal((await send(pay)).status, 200);
        assert.equal((await send(pay)).status, 200);
        assert.equal(
          (
            await db.query<{ stage: string }>(
              "select stage from crm_leads where id=$1",
              [leadId],
            )
          ).rows[0].stage,
          "ganado",
        );
        assert.equal(
          (
            await db.query(
              "select * from crm_conversions where kind='subscription'",
            )
          ).rows.length,
          1,
        );
        assert.equal(
          (
            await send({
              ...pay,
              event_id: "bad-pay",
              journey: {
                ...pay.journey,
                data: { ...pay.journey.data, amount: 0 },
              },
            })
          ).status,
          400,
        );
      },
    );
    await t.test(
      "RLS y métricas excluyen las pruebas; una conversión documentada real sí cuenta",
      async () => {
        await db.query("select set_config('request.jwt.claim.sub',$1,false)", [
          owner,
        ]);
        await db.exec("set role authenticated");
        let report = (
          await db.query<{
            r: {
              leads: number;
            diagnostics: number;
              paid_customers: number;
              revenue: unknown[];
            };
          }>("select crm_commercial_report($1) r", [org])
        ).rows[0].r;
        assert.equal(report.diagnostics, 0);
        assert.equal(report.paid_customers, 0);
        assert.deepEqual(report.revenue, []);
        await assert.rejects(() =>
          db.query(
            "select crm_ingest_commercial_source('ceo-rentable-diagnostico','signed_backend','{}','x')",
          ),
        );
        await db.exec("reset role");
        const id = randomUUID();
        const real = {
          ...base,
          is_test: false,
          event_id: "diagnostic:" + id,
          external_id: id,
          journey: { ...base.journey, capture_id: id },
        };
        assert.equal((await send(real)).status, 200);
        assert.equal(
          (
            await send({
              ...real,
              event_id: "Purchase:paypal:REAL-FIXTURE",
              journey: {
                ...real.journey,
                kind: "subscription.paid",
                data: {
                  provider: "paypal",
                  payment_id: "REAL-FIXTURE",
                  amount: 17.99,
                  currency: "USD",
                },
              },
            })
          ).status,
          200,
        );
        await db.exec("set role authenticated");
        report = (
          await db.query<{ r: typeof report }>(
            "select crm_commercial_report($1) r",
            [org],
          )
        ).rows[0].r;
        const secondReal=randomUUID();
        await db.exec('reset role');
        assert.equal((await send({...real,event_id:'diagnostic:'+secondReal,external_id:secondReal,journey:{...real.journey,capture_id:secondReal}})).status,200);
        await db.exec('set role authenticated');
        report=(await db.query<{r:typeof report}>('select crm_commercial_report($1) r',[org])).rows[0].r;
        assert.equal(report.leads,1);
        assert.equal(report.diagnostics, 2);
        assert.equal(report.paid_customers, 1);
        assert.equal(report.revenue.length, 1);
        await db.exec("reset role");
        await db.query("select set_config('request.jwt.claim.sub',$1,false)", [
          outsider,
        ]);
        await db.exec("set role authenticated");
        assert.equal(
          (await db.query("select * from crm_commercial_events")).rows.length,
          0,
        );
        await assert.rejects(() =>
          db.query("select crm_commercial_report($1)", [org]),
        );
        await db.exec("reset role");
      },
    );
    await t.test(
      "Reaplicar la migración no duplica ni elimina hechos",
      async () => {
        const n = (
          await db.query<{n:number}>("select count(*) n from crm_commercial_events")
        ).rows[0].n;
        await db.exec(
          await readFile(
            "supabase/migrations/202610260008_commercial_journey.sql",
            "utf8",
          ),
        );
        assert.equal(
          (await db.query<{n:number}>("select count(*) n from crm_commercial_events"))
            .rows[0].n,
          n,
        );
      },
    );
  } finally {
    await db.close();
  }
});
