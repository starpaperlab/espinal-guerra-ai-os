import assert from "node:assert/strict";
import { PGlite } from "@electric-sql/pglite";
import { resolve } from "node:path";
import { pathToFileURL } from "node:url";
const ceoRoot = resolve(process.env.CEO_REPO_PATH || "../ceo-rentable-vsc");
import { readFile } from "node:fs/promises";
import { randomUUID } from "node:crypto";
const { captureDiagnostic } = await import(
  pathToFileURL(ceoRoot + "/server/commercialJourney.js")
);
const { runCommercialDeliveryBatch } = await import(
  pathToFileURL(ceoRoot + "/server/commercialDelivery.js")
);
import { receiveLead } from "../src/modules/crm/webhook.ts";
const ceo = new PGlite(),
  crm = new PGlite(),
  org = randomUUID(),
  owner = randomUUID();
const root = process.cwd();
try {
  await ceo.exec(
    "create role anon;create role authenticated;create role service_role bypassrls;create schema auth;create table auth.users(id uuid primary key,email text,email_confirmed_at timestamptz,created_at timestamptz default now());create table public.leads(id uuid primary key default gen_random_uuid(),name text not null,email text not null,source text,status text,ceo_score numeric,monthly_sales text,knows_margin boolean,controls_costs boolean,knows_best_product boolean,created_at timestamptz default now(),updated_at timestamptz default now());grant usage on schema public,auth to anon,authenticated,service_role;grant all on public.leads to service_role;grant insert on public.leads to anon,authenticated;",
  );
  await ceo.exec(
    await readFile(
      ceoRoot + "/supabase/migrations/202610260001_commercial_journey.sql",
      "utf8",
    ),
  );
  await crm.exec(
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
    await crm.exec(
      await readFile(root + "/supabase/migrations/" + name, "utf8"),
    );
  await crm.query("insert into auth.users values($1)", [owner]);
  await crm.query(
    "insert into organizations(id,name) values($1,'Espinal Guerra')",
    [org],
  );
  await crm.query("insert into organization_members values($1,$2,'owner')", [
    org,
    owner,
  ]);
  for (const [slug, name] of [
    ["ceo-rentable-os", "CEO Rentable OS"],
    ["plannerlab", "PlannerLab"],
    ["star-paper-lab", "Star Paper Lab"],
    ["emprendedora-digital-ia", "Emprendedora Digital con IA"],
  ])
    await crm.query(
      "insert into brands(organization_id,slug,name) values($1,$2,$3)",
      [org, slug, name],
    );
  await crm.query("select crm_bootstrap_enterprise()");
  await crm.query(
    "update crm_capture_sources set enabled=true where source_key='ceo-rentable-diagnostico'",
  );
  const client = {
    rpc: async (name, args) => {
      try {
        const r = await ceo.query(
          `select ${name}(${Object.keys(args)
            .map((k, i) => k + "=> $" + (i + 1))
            .join(",")}) r`,
          Object.values(args),
        );
        return { data: r.rows[0].r, error: null };
      } catch (e) {
        return { data: null, error: { code: e.code } };
      }
    },
  };
  const env = {
    COMMERCIAL_JOURNEY_ENABLED: "true",
    COMMERCIAL_DELIVERY_ENABLED: "true",
    VERCEL_ENV: "production",
    AI_OS_CRM_WEBHOOK_SECRET: "isolated-joint-secret-at-least-32-characters",
    DIAGNOSTIC_EMAIL_ENABLED: "true",
    RESEND_API_KEY: "isolated-resend-fixture-not-real",
  };
  let emailCalls = 0;
  const fetchImpl = async (url, init) => {
    if (String(url) === "https://api.resend.com/emails") {
      emailCalls++;
      assert.ok(init.headers["Idempotency-Key"]);
      return Response.json({ id: "isolated-resend-provider-id" });
    }
    return receiveLead(new Request(String(url), init), {
      secret: env.AI_OS_CRM_WEBHOOK_SECRET,
      requiredSourceKey: "ceo-rentable-diagnostico",
      ingest: async (event, hash) => {
        try {
          const r = await crm.query(
            "select crm_ingest_commercial_source($1,$2,$3,$4) v",
            ["ceo-rentable-diagnostico", "signed_backend", event, hash],
          );
          return { data: r.rows[0].v, error: null };
        } catch (e) {
          return { data: null, error: { code: e.code } };
        }
      },
    });
  };
  const capture = randomUUID();
  const body = {
    capture_id: capture,
    name: "Fixture integración conjunta",
    email: "joint@example.invalid",
    answers: {
      business_type: "servicios",
      monthly_sales: "under_30k",
      client_volume: "under_10",
      knows_margin: false,
      controls_costs: false,
      knows_best_product: false,
      management_method: "cuaderno",
      main_problem: "rentabilidad",
    },
    attribution: {
      utm_source: "facebook",
      utm_medium: "paid_social",
      utm_campaign: "isolated-joint-campaign",
      advertising_consent: false,
    },
    email_requested: true,
    promotional_consent: false,
    is_test: false,
  };
  assert.equal(
    (await captureDiagnostic(body, { client, env, ip: "fixture-ip" })).status,
    200,
  );
  for (let i = 0; i < 3; i++)
    await runCommercialDeliveryBatch({ client, env, fetchImpl });
  assert.equal(emailCalls, 1);
  assert.equal((await crm.query("select * from crm_contacts")).rows.length, 1);
  assert.equal((await crm.query("select * from crm_leads")).rows.length, 1);
  assert.equal(
    (
      await crm.query(
        "select * from crm_commercial_events where kind='email.accepted'",
      )
    ).rows.length,
    1,
  );
  const user = randomUUID();
  await ceo.query(
    "insert into auth.users(id,email,email_confirmed_at) values($1,$2,now())",
    [user, body.email],
  );
  await ceo.query("select ceo_link_diagnostic_user($1,$2,$3)", [
    capture,
    user,
    body.email,
  ]);
  const at = new Date().toISOString(),
    ends = new Date(Date.now() + 864000000).toISOString();
  await ceo.query(
    "select ceo_record_commercial_event($1,'trial-joint','trial.started',$2,$3)",
    [user, at, { subscription_id: "JOINT", ends_at: ends }],
  );
  const paid = {
    provider: "paypal",
    payment_id: "JOINT",
    amount: 17.99,
    currency: "USD",
  };
  await ceo.query(
    "select ceo_record_commercial_event($1,'payment-joint','subscription.paid',$2,$3)",
    [user, at, paid],
  );
  for (let i = 0; i < 3; i++)
    await runCommercialDeliveryBatch({ client, env, fetchImpl });
  assert.equal(
    (await crm.query("select * from crm_conversions where kind='subscription'"))
      .rows.length,
    1,
  );
  assert.equal(
    (await crm.query("select count(*) n from crm_contacts")).rows[0].n,
    1,
  );
  await crm.query("select set_config('request.jwt.claim.sub',$1,false)", [
    owner,
  ]);
  await crm.exec("set role authenticated");
  const report = (await crm.query("select crm_commercial_report($1) r", [org]))
    .rows[0].r;
  assert.equal(report.diagnostics, 1);
  assert.equal(report.emails_accepted, 1);
  assert.equal(report.trials_started, 1);
  assert.equal(report.paid_customers, 1);
  assert.equal(report.revenue[0].amount, 17.99);
  assert.equal(report.campaigns[0].campaign, "isolated-joint-campaign");
  console.log(
    "PASS: two isolated PostgreSQL databases + real sender/HMAC receiver + persisted diagnostic + one Resend transport fixture + CRM brand + campaign + registration + trial + paid conversion + own report. No external calls or real payment/email.",
  );
} finally {
  await ceo.close();
  await crm.close();
}
