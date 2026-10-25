import { test } from "node:test";
import assert from "node:assert/strict";
import { PGlite } from "@electric-sql/pglite";
import { readFile } from "node:fs/promises";
import { randomUUID, randomBytes, createHmac } from "node:crypto";
import {
  captureFormSchema,
  automationPlanSchema,
} from "../../src/modules/automation/schema";
import { receiveLead } from "../../src/modules/crm/webhook";

test("Multimarca y automatización nativa: estado real persistido, permisos y outbox", async (t) => {
  const db = new PGlite();
  const org = randomUUID(),
    otherOrg = randomUUID(),
    owner = randomUUID(),
    otherOwner = randomUUID(),
    member = randomUUID();
  const ids = [randomUUID(), randomUUID(), randomUUID(), randomUUID()];
  const otherBrand = randomUUID();
  let corporate = "";
  let lead = "";
  try {
    await db.exec(
      "create role anon;create role authenticated;create role service_role bypassrls;create schema auth;create table auth.users(id uuid primary key);create function auth.uid() returns uuid language sql stable as $$select nullif(current_setting('request.jwt.claim.sub',true),'')::uuid$$;grant usage on schema public,auth to anon,authenticated,service_role;",
    );
    for (const file of [
      "202610250001_foundation.sql",
      "202610250002_crm.sql",
      "202610250005_n8n_normalized_capture.sql",
      "202610250006_multibrand_native_foundation.sql",
    ])
      await db.exec(await readFile("supabase/migrations/" + file, "utf8"));
    for (const id of [owner, otherOwner, member])
      await db.query("insert into auth.users(id) values($1)", [id]);
    await db.query(
      "insert into organizations(id,name) values($1,'Espinal Guerra'),($2,'Organización ajena aislada')",
      [org, otherOrg],
    );
    await db.query(
      "insert into organization_members(organization_id,user_id,role) values($1,$2,'owner'),($3,$4,'owner'),($1,$5,'member')",
      [org, owner, otherOrg, otherOwner, member],
    );
    const rows = [
      ["ceo-rentable-os", "CEO Rentable OS"],
      ["plannerlab", "PlannerLab"],
      ["star-paper-lab", "Star Paper Lab"],
      ["emprendedora-digital-con-ia", "Emprendedora Digital con IA"],
    ];
    for (let i = 0; i < 4; i++)
      await db.query(
        "insert into brands(id,organization_id,slug,name) values($1,$2,$3,$4)",
        [ids[i], org, ...rows[i]],
      );
    await db.query(
      "insert into brands(id,organization_id,slug,name) values($1,$2,'other','Otra marca')",
      [otherBrand, otherOrg],
    );
    async function asUser<T>(id: string, fn: () => Promise<T>) {
      await db.exec("set role authenticated");
      await db.query("select set_config('request.jwt.claim.sub',$1,false)", [
        id,
      ]);
      try {
        return await fn();
      } finally {
        await db.exec("reset role");
        await db.query("select set_config('request.jwt.claim.sub','',false)");
      }
    }
    await t.test(
      "La migración no crea organizaciones, marcas ni membresías por sí sola",
      async () => {
        assert.equal(
          (
            await db.query<{ n: number }>(
              "select count(*)::integer n from organizations",
            )
          ).rows[0].n,
          2,
        );
        assert.equal(
          (
            await db.query<{ n: number }>(
              "select count(*)::integer n from brands where organization_id=$1",
              [org],
            )
          ).rows[0].n,
          4,
        );
        assert.equal(
          (await db.query("select * from crm_enterprise_settings")).rows.length,
          0,
        );
      },
    );
    await t.test(
      "Solo el operador puede vincular la empresa; no existe primera reclamación pública",
      async () => {
        await asUser(owner, async () => {
          await assert.rejects(() =>
            db.query("select crm_bootstrap_enterprise()"),
          );
          await assert.rejects(() =>
            db.query("select crm_reconcile_enterprise($1)", [org]),
          );
        });
      },
    );
    await t.test(
      "Reutiliza organización y cuatro UUID, agrega solo Espinal Guerra y es repetible",
      async () => {
        const result = (
          await db.query<{
            report: {
              organization_id: string;
              organization_created: boolean;
              corporate_brand_created: boolean;
              brands: { id: string; name: string }[];
            };
          }>("select crm_bootstrap_enterprise() report")
        ).rows[0].report;
        assert.equal(result.organization_id, org);
        assert.equal(result.organization_created, false);
        assert.equal(result.corporate_brand_created, true);
        assert.equal(result.brands.length, 5);
        for (const id of ids) assert.ok(result.brands.some((b) => b.id === id));
        corporate = result.brands.find((b) => b.name === "Espinal Guerra")!.id;
        const next = (
          await db.query<{ report: { corporate_brand_created: boolean } }>(
            "select crm_bootstrap_enterprise() report",
          )
        ).rows[0].report;
        assert.equal(next.corporate_brand_created, false);
        assert.equal(
          (await db.query("select * from organizations")).rows.length,
          2,
        );
        assert.equal(
          (await db.query("select * from crm_capture_sources")).rows.length,
          1,
        );
        assert.equal(
          (await db.query("select * from native_automation_definitions")).rows
            .length,
          1,
        );
      },
    );
    await t.test(
      "No mueve marcas de otras organizaciones ni crea copias ambiguas",
      async () => {
        await db.query(
          "insert into brands(organization_id,slug,name) values($1,'another-ceo','CEO Rentable OS')",
          [otherOrg],
        );
        await assert.rejects(() =>
          db.query("select crm_bootstrap_enterprise()"),
        );
        await db.query(
          "delete from brands where organization_id=$1 and slug='another-ceo'",
          [otherOrg],
        );
        await db.query(
          "insert into brands(organization_id,slug,name) values($1,'duplicate-ceo','CEO Rentable OS')",
          [org],
        );
        await assert.rejects(() =>
          db.query("select crm_bootstrap_enterprise()"),
        );
        await db.query(
          "delete from brands where organization_id=$1 and slug='duplicate-ceo'",
          [org],
        );
        assert.equal(
          (
            await db.query("select * from brands where organization_id=$1", [
              org,
            ])
          ).rows.length,
          5,
        );
      },
    );
    await t.test(
      "Miembro no puede elevar permisos y administrador solo reconcilia su empresa vinculada",
      async () => {
        await asUser(member, async () => {
          await assert.rejects(() =>
            db.query("select crm_reconcile_enterprise($1)", [org]),
          );
          await assert.rejects(() =>
            db.query(
              "insert into crm_enterprise_settings(organization_id,configured_by) values($1,$2)",
              [otherOrg, member],
            ),
          );
        });
        await asUser(owner, async () => {
          await db.query("select crm_reconcile_enterprise($1)", [org]);
          await assert.rejects(() =>
            db.query("select crm_reconcile_enterprise($1)", [otherOrg]),
          );
        });
      },
    );
    await t.test(
      "Fuente por marca requiere administrador y no puede cambiar su destino",
      async () => {
        await asUser(owner, async () => {
          await db.query(
            "insert into crm_capture_sources(organization_id,brand_id,source_key,name,provider,enabled) values($1,$2,'corporate-web','Web corporativa','signed_backend',true)",
            [org, corporate],
          );
          await db.query(
            "update crm_capture_sources set enabled=true where source_key='ceo-rentable-diagnostico'",
          );
          await assert.rejects(() =>
            db.query(
              "update crm_capture_sources set brand_id=$1 where source_key='corporate-web'",
              [ids[0]],
            ),
          );
          await assert.rejects(() =>
            db.query(
              "insert into crm_capture_sources(organization_id,brand_id,source_key,name,provider) values($1,$2,'cross-org','No permitido','signed_backend')",
              [org, otherBrand],
            ),
          );
        });
        await asUser(member, async () => {
          await assert.rejects(() =>
            db.query(
              "insert into crm_capture_sources(organization_id,brand_id,source_key,name,provider) values($1,$2,'member-source','No','native')",
              [org, corporate],
            ),
          );
        });
        await asUser(otherOwner, async () => {
          await assert.rejects(() =>
            db.query(
              "insert into crm_capture_sources(organization_id,brand_id,source_key,name,provider,enabled) values($1,$2,'other-org','No','signed_backend',true)",
              [otherOrg, otherBrand],
            ),
          );
        });
      },
    );
    const secret = randomBytes(48).toString("hex");
    const event = {
      type: "lead.created",
      event_id: randomUUID(),
      external_id: randomUUID(),
      capture_source_key: "ceo-rentable-diagnostico",
      contact: { name: "PRUEBA AISLADA · fuente autorizada" },
      source: "diagnóstico aislado",
      score: null,
      classification: null,
      evaluated_at: null,
      occurred_at: new Date().toISOString(),
      is_test: true,
    };
    function request(payload: unknown) {
      const body = JSON.stringify(payload),
        timestamp = String(Math.floor(Date.now() / 1000));
      return new Request("https://example.invalid", {
        method: "POST",
        headers: {
          "content-type": "application/json",
          "x-crm-timestamp": timestamp,
          "x-crm-signature":
            "sha256=" +
            createHmac("sha256", secret)
              .update(timestamp + "." + body)
              .digest("hex"),
        },
        body,
      });
    }
    const deps = {
      secret,
      requiredSourceKey: "ceo-rentable-diagnostico",
      ingest: async (value: unknown, hash: string) => {
        await db.exec("set role service_role");
        try {
          const result = await db.query<{ r: unknown }>(
            "select crm_ingest_configured_source($1,$2,$3::jsonb,$4) r",
            [
              "ceo-rentable-diagnostico",
              "signed_backend",
              JSON.stringify(value),
              hash,
            ],
          );
          return { data: result.rows[0].r, error: null };
        } catch (e) {
          return { data: null, error: { code: (e as { code?: string }).code } };
        } finally {
          await db.exec("reset role");
        }
      },
    };
    await t.test(
      "El servidor resuelve organización y marca sin env org ni Brand ID del cliente",
      async () => {
        const response = await receiveLead(request(event), deps);
        assert.equal(response.status, 200);
        lead = (await response.json()).lead_id;
        const row = (
          await db.query<{
            organization_id: string;
            brand_id: string;
            source_system: string;
            is_test: boolean;
          }>(
            "select organization_id,brand_id,source_system,is_test from crm_leads where id=$1",
            [lead],
          )
        ).rows[0];
        assert.equal(row.organization_id, org);
        assert.equal(row.brand_id, ids[0]);
        assert.equal(row.source_system, "signed_backend");
        assert.equal(row.is_test, true);
        const again = await receiveLead(request(event), deps);
        assert.equal((await again.json()).duplicate, true);
        assert.equal(
          (
            await db.query(
              "select * from native_automation_events where lead_id=$1",
              [lead],
            )
          ).rows.length,
          1,
        );
      },
    );
    await t.test(
      "Rechaza fuente ajena, marca adulterada, proveedor distinto y organización en payload",
      async () => {
        assert.equal(
          (
            await receiveLead(
              request({
                ...event,
                event_id: randomUUID(),
                brand_id: corporate,
              }),
              deps,
            )
          ).status,
          422,
        );
        assert.equal(
          (
            await receiveLead(
              request({ ...event, capture_source_key: "corporate-web" }),
              deps,
            )
          ).status,
          422,
        );
        assert.equal(
          (
            await receiveLead(
              request({ ...event, organization_id: otherOrg }),
              deps,
            )
          ).status,
          400,
        );
        await assert.rejects(() =>
          db.query("select crm_ingest_configured_source($1,$2,$3::jsonb,$4)", [
            "ceo-rentable-diagnostico",
            "n8n",
            JSON.stringify(event),
            "hash",
          ]),
        );
        await db.query(
          "insert into crm_capture_sources(organization_id,brand_id,source_key,name,provider,enabled) values($1,$2,'unbound-source','No autorizada','signed_backend',true)",
          [otherOrg, otherBrand],
        );
        await assert.rejects(() =>
          db.query("select crm_ingest_configured_source($1,$2,$3::jsonb,$4)", [
            "unbound-source",
            "signed_backend",
            JSON.stringify({ ...event, capture_source_key: "unbound-source" }),
            "hash",
          ]),
        );
      },
    );
    await t.test(
      "Outbox nativo es transaccional; no activa acciones externas ni permite falsificar éxito",
      async () => {
        assert.equal(
          (
            await db.query(
              "select * from native_automation_events where lead_id=$1 and status='pending'",
              [lead],
            )
          ).rows.length,
          1,
        );
        assert.equal(
          (await db.query("select * from native_automation_runs")).rows.length,
          0,
        );
        assert.equal(
          (
            await db.query(
              "select * from native_automation_definitions where status<>'draft'",
            )
          ).rows.length,
          0,
        );
        await asUser(owner, async () => {
          await assert.rejects(() =>
            db.query("update native_automation_events set status='completed'"),
          );
          await assert.rejects(() =>
            db.query("select native_claim_event($1,true)", [org]),
          );
          await assert.rejects(() =>
            db.query(
              "update native_automation_definitions set status='active'",
            ),
          );
        });
      },
    );
    await t.test(
      "Leases excluyen pruebas por defecto, registran intentos y rechazan tokens obsoletos",
      async () => {
        assert.equal(
          (
            await db.query<{ v: unknown }>(
              "select native_claim_event($1,false) v",
              [org],
            )
          ).rows[0].v,
          null,
        );
        const item = (
          await db.query<{ v: { id: string; lease_token: string } }>(
            "select native_claim_event($1,true) v",
            [org],
          )
        ).rows[0].v;
        assert.ok(item.id);
        assert.equal(
          (
            await db.query<{ v: boolean }>(
              "select native_finish_event($1,$2,$3,true,null) v",
              [org, item.id, randomUUID()],
            )
          ).rows[0].v,
          false,
        );
        assert.equal(
          (
            await db.query<{ v: boolean }>(
              "select native_finish_event($1,$2,$3,false,$4) v",
              [org, item.id, item.lease_token, "HANDLER_NOT_CONFIGURED"],
            )
          ).rows[0].v,
          true,
        );
        await db.query(
          "update native_automation_events set available_at=now()-interval '1 second' where id=$1",
          [item.id],
        );
        const next = (
          await db.query<{ v: { id: string; lease_token: string } }>(
            "select native_claim_event($1,true) v",
            [org],
          )
        ).rows[0].v;
        assert.notEqual(next.lease_token, item.lease_token);
        assert.equal(
          (
            await db.query<{ v: boolean }>(
              "select native_finish_event($1,$2,$3,true,null) v",
              [org, item.id, item.lease_token],
            )
          ).rows[0].v,
          false,
        );
        assert.equal(
          (
            await db.query<{ v: boolean }>(
              "select native_finish_event($1,$2,$3,true,null) v",
              [org, next.id, next.lease_token],
            )
          ).rows[0].v,
          true,
        );
        assert.equal(
          (await db.query("select * from native_automation_runs")).rows.length,
          2,
        );
      },
    );
    await t.test(
      "Programación, máximo de intentos y rechazo de errores sensibles",
      async () => {
        await asUser(owner, async () => {
          await db.query("select crm_create_lead($1,$2::jsonb,$3)", [
            org,
            JSON.stringify({
              brand_id: corporate,
              name: "PRUEBA AISLADA · cola",
              is_test: true,
            }),
            randomUUID(),
          ]);
        });
        const id = (
          await db.query<{ id: string }>(
            "select id from native_automation_events where status='pending' limit 1",
          )
        ).rows[0].id;
        await db.query(
          "update native_automation_events set available_at=now()+interval '1 day' where id=$1",
          [id],
        );
        assert.equal(
          (
            await db.query<{ v: unknown }>(
              "select native_claim_event($1,true) v",
              [org],
            )
          ).rows[0].v,
          null,
        );
        for (let attempt = 1; attempt <= 3; attempt++) {
          await db.query(
            "update native_automation_events set available_at=now()-interval '1 second' where id=$1",
            [id],
          );
          const item = (
            await db.query<{
              v: { id: string; lease_token: string; attempts: number };
            }>("select native_claim_event($1,true) v", [org])
          ).rows[0].v;
          assert.equal(item.attempts, attempt);
          await assert.rejects(() =>
            db.query("select native_finish_event($1,$2,$3,false,$4)", [
              org,
              id,
              item.lease_token,
              "correo privado / token",
            ]),
          );
          await db.query("select native_finish_event($1,$2,$3,false,$4)", [
            org,
            id,
            item.lease_token,
            "NO_HANDLER",
          ]);
        }
        assert.equal(
          (
            await db.query<{ v: unknown }>(
              "select native_claim_event($1,true) v",
              [org],
            )
          ).rows[0].v,
          null,
        );
        assert.equal(
          (
            await db.query<{ status: string }>(
              "select status from native_automation_events where id=$1",
              [id],
            )
          ).rows[0].status,
          "failed",
        );
      },
    );
    await t.test(
      "Conversiones futuras respetan la marca y no convierten pruebas en ventas reales",
      async () => {
        await db.query(
          "insert into crm_conversions(organization_id,brand_id,lead_id,conversion_key,kind,occurred_at) values($1,$2,$3,'isolated-conversion','trial_started',now())",
          [org, ids[0], lead],
        );
        assert.equal(
          (
            await db.query<{ is_test: boolean }>(
              "select is_test from crm_conversions where conversion_key='isolated-conversion'",
            )
          ).rows[0].is_test,
          true,
        );
        await assert.rejects(() =>
          db.query(
            "insert into crm_conversions(organization_id,brand_id,lead_id,conversion_key,kind,occurred_at) values($1,$2,$3,'invalid-conversion','subscription',now())",
            [org, corporate, lead],
          ),
        );
        await asUser(owner, async () => {
          await assert.rejects(() =>
            db.query(
              "insert into crm_conversions(organization_id,brand_id,lead_id,conversion_key,kind,occurred_at) values($1,$2,$3,'browser-subscription','subscription',now())",
              [org, ids[0], lead],
            ),
          );
        });
      },
    );
    await t.test(
      "Las definiciones y esquemas son datos limitados, nunca código ejecutable ni un email activo",
      async () => {
        const plan = (
          await db.query<{ plan: unknown }>(
            "select plan from native_automation_definitions limit 1",
          )
        ).rows[0].plan;
        assert.equal(automationPlanSchema.safeParse(plan).success, true);
        assert.equal(
          captureFormSchema.safeParse({
            fields: [
              { name: "email", label: "Correo", type: "email", required: true },
            ],
          }).success,
          true,
        );
        assert.equal(
          captureFormSchema.safeParse({
            fields: [
              {
                name: "service_role",
                label: "Secreto",
                type: "text",
                required: true,
              },
            ],
          }).success,
          false,
        );
        assert.equal(
          automationPlanSchema.safeParse({
            version: 1,
            conditions: [],
            steps: [{ kind: "diagnostic_email" }],
            execution: "not_implemented",
          }).success,
          false,
        );
        await asUser(owner, async () => {
          await assert.rejects(() =>
            db.query(
              "insert into crm_capture_sources(organization_id,brand_id,source_key,name,provider,enabled) values($1,$2,'native-public','No publicado','native',true)",
              [org, corporate],
            ),
          );
        });
      },
    );
    await t.test(
      "n8n por fuente y el receptor UUID legado siguen siendo compatibles",
      async () => {
        await asUser(owner, async () => {
          await db.query(
            "insert into crm_capture_sources(organization_id,brand_id,source_key,name,provider,enabled) values($1,$2,'n8n-campaign','n8n opcional','n8n',true)",
            [org, corporate],
          );
        });
        const configured = {
          ...event,
          event_id: randomUUID(),
          external_id: randomUUID(),
          capture_source_key: "n8n-campaign",
        };
        const first = (
          await db.query<{ r: { lead_id: string } }>(
            "select crm_ingest_configured_source($1,$2,$3::jsonb,$4) r",
            [
              "n8n-campaign",
              "n8n",
              JSON.stringify(configured),
              "configured-test",
            ],
          )
        ).rows[0].r;
        assert.equal(
          (
            await db.query<{ brand_id: string }>(
              "select brand_id from crm_leads where id=$1",
              [first.lead_id],
            )
          ).rows[0].brand_id,
          corporate,
        );
        const legacy = {
          ...event,
          event_id: randomUUID(),
          external_id: randomUUID(),
          capture_source_key: undefined,
          brand_id: ids[0],
        };
        const old = (
          await db.query<{ r: { lead_id: string } }>(
            "select crm_ingest_lead($1,$2::jsonb,$3) r",
            [org, JSON.stringify(legacy), "legacy-test"],
          )
        ).rows[0].r;
        const row = (
          await db.query<{
            organization_id: string;
            brand_id: string;
            source_system: string;
          }>(
            "select organization_id,brand_id,source_system from crm_leads where id=$1",
            [old.lead_id],
          )
        ).rows[0];
        assert.equal(row.organization_id, org);
        assert.equal(row.brand_id, ids[0]);
        assert.equal(row.source_system, "n8n");
      },
    );
    await t.test(
      "RLS de la infraestructura no expone datos entre organizaciones",
      async () => {
        await asUser(otherOwner, async () => {
          for (const table of [
            "crm_enterprise_settings",
            "crm_capture_sources",
            "native_automation_definitions",
            "native_automation_events",
            "native_automation_runs",
          ])
            assert.equal(
              (
                await db.query(
                  `select * from ${table} where organization_id=$1`,
                  [org],
                )
              ).rows.length,
              0,
            );
        });
      },
    );
  } finally {
    await db.close();
  }
});
