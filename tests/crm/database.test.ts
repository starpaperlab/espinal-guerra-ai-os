import { test } from "node:test";
import assert from "node:assert/strict";
import { readFile } from "node:fs/promises";
import { randomUUID, randomBytes, createHmac } from "node:crypto";
import { createRequire } from "node:module";
import { PGlite } from "@electric-sql/pglite";
import { leadSchema, webhookSchema } from "../../src/modules/crm/schema";
import { receiveLead } from "../../src/modules/crm/webhook";

const load = createRequire(import.meta.url);
const { prepareCrmRequest } = load(
  "../../integrations/n8n/prepare-crm-request.cjs",
) as {
  prepareCrmRequest: (
    input: Record<string, unknown>,
    secret: string,
  ) => { body: string; headers: Record<string, string> };
};
test("CRM sobre PostgreSQL aislado: persistencia, RLS y receptor n8n", async (t) => {
  const db = new PGlite();
  const org = randomUUID(),
    otherOrg = randomUUID(),
    user = randomUUID(),
    otherUser = randomUUID(),
    outsider = randomUUID(),
    brand = randomUUID(),
    brand2 = randomUUID(),
    otherBrand = randomUUID();
  const requestId = randomUUID();
  let leadId = "";
  let opportunityId = "";
  try {
    await db.exec(
      `create role anon; create role authenticated; create role service_role bypassrls; create schema auth; create table auth.users(id uuid primary key); create function auth.uid() returns uuid language sql stable as $$ select nullif(current_setting('request.jwt.claim.sub',true),'')::uuid $$; grant usage on schema public,auth to anon,authenticated,service_role;`,
    );
    await db.exec(
      await readFile("supabase/migrations/202610250001_foundation.sql", "utf8"),
    );
    await db.exec(
      await readFile("supabase/migrations/202610250002_crm.sql", "utf8"),
    );
    for (const id of [user, otherUser, outsider])
      await db.query("insert into auth.users(id) values($1)", [id]);
    for (const id of [org, otherOrg])
      await db.query("insert into organizations(id,name) values($1,$2)", [
        id,
        "PRUEBA AISLADA",
      ]);
    await db.query(
      "insert into organization_members(organization_id,user_id,role) values($1,$2,'owner'),($3,$4,'owner')",
      [org, user, otherOrg, otherUser],
    );
    for (const [id, organization] of [
      [brand, org],
      [brand2, org],
      [otherBrand, otherOrg],
    ])
      await db.query(
        "insert into brands(id,organization_id,slug,name) values($1,$2,$3,$4)",
        [id, organization, id, "Marca de prueba aislada"],
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
    const input = leadSchema.parse({
      brand_id: brand,
      name: "PRUEBA AISLADA · Prospecto",
      email: "fixture@example.invalid",
      service: "Servicio de prueba",
      source: "manual",
    });
    async function create(
      inputValue = input,
      req = randomUUID(),
      organization = org,
    ) {
      const r = await db.query<{ id: string }>(
        "select crm_create_lead($1,$2::jsonb,$3) id",
        [organization, JSON.stringify(inputValue), req],
      );
      return r.rows[0].id;
    }
    await t.test("Todas las tablas nuevas activan RLS", async () => {
      const r = await db.query<{ relname: string; relrowsecurity: boolean }>(
        "select relname,relrowsecurity from pg_class join pg_namespace n on n.oid=relnamespace where n.nspname='public' and relname in ('crm_contacts','crm_leads','crm_opportunities','crm_activities','crm_proposals','crm_history','crm_inbound_events')",
      );
      assert.equal(r.rows.length, 7);
      assert.ok(r.rows.every((r) => r.relrowsecurity));
    });
    await t.test("Anónimo no consulta ni crea registros", async () => {
      await db.exec("set role anon");
      try {
        await assert.rejects(() => db.query("select * from crm_leads"));
        await assert.rejects(() => create(input, requestId));
      } finally {
        await db.exec("reset role");
      }
    });
    await t.test("Usuario sin membresía no crea prospectos", async () => {
      await asUser(outsider, async () => {
        assert.equal(
          (await db.query("select * from crm_leads")).rows.length,
          0,
        );
        await assert.rejects(() => create(input, requestId));
      });
    });
    await t.test(
      "Miembro crea contacto y prospecto de forma atómica e idempotente",
      async () => {
        await asUser(user, async () => {
          leadId = await create(input, requestId);
          assert.equal(await create(input, requestId), leadId);
          assert.equal(
            (await db.query("select * from crm_contacts")).rows.length,
            1,
          );
          assert.equal(
            (await db.query("select * from crm_leads")).rows.length,
            1,
          );
        });
      },
    );
    await t.test(
      "Lecturas posteriores conservan los registros sin depender de memoria de UI",
      async () => {
        await asUser(user, async () => {
          const r = await db.query<{ name: string }>(
            "select c.name from crm_leads l join crm_contacts c on c.id=l.contact_id where l.id=$1",
            [leadId],
          );
          assert.equal(r.rows[0].name, input.name);
        });
      },
    );
    await t.test(
      "Otra organización no lee, actualiza ni referencia el prospecto",
      async () => {
        await asUser(otherUser, async () => {
          assert.equal(
            (await db.query("select * from crm_leads where id=$1", [leadId]))
              .rows.length,
            0,
          );
          assert.equal(
            (
              await db.query(
                "update crm_leads set service='intrusión' where id=$1 returning id",
                [leadId],
              )
            ).rows.length,
            0,
          );
          await assert.rejects(() =>
            db.query(
              "insert into crm_opportunities(organization_id,brand_id,lead_id,service,request_id) values($1,$2,$3,'intrusión',$4)",
              [otherOrg, otherBrand, leadId, randomUUID()],
            ),
          );
        });
      },
    );
    await t.test(
      "Se rechazan relaciones entre marcas y reasignaciones de organización",
      async () => {
        await asUser(user, async () => {
          await assert.rejects(() =>
            create({ ...input, brand_id: otherBrand }),
          );
          await assert.rejects(() =>
            db.query(
              "insert into crm_opportunities(organization_id,brand_id,lead_id,service,request_id) values($1,$2,$3,'mezcla',$4)",
              [org, brand2, leadId, randomUUID()],
            ),
          );
          await assert.rejects(() =>
            db.query("update crm_leads set organization_id=$1 where id=$2", [
              otherOrg,
              leadId,
            ]),
          );
        });
      },
    );
    await t.test(
      "Edición real actualiza contacto y ficha; responsable ajeno se rechaza",
      async () => {
        await asUser(user, async () => {
          await db.query("select crm_update_lead($1,$2,$3::jsonb)", [
            org,
            leadId,
            JSON.stringify({
              ...input,
              name: "PRUEBA AISLADA · Editado",
              stage: "contactado",
              follow_up_at: "2030-01-01T14:00:00Z",
              owner_id: user,
            }),
          ]);
          assert.equal(
            (
              await db.query<{ stage: string }>(
                "select stage from crm_leads where id=$1",
                [leadId],
              )
            ).rows[0].stage,
            "contactado",
          );
          await assert.rejects(() =>
            db.query("update crm_leads set owner_id=$1 where id=$2", [
              otherUser,
              leadId,
            ]),
          );
        });
      },
    );
    await t.test(
      "Oportunidad se mueve sin duplicarse; ganar exige un valor cerrado",
      async () => {
        await asUser(user, async () => {
          const r = await db.query<{ id: string }>(
            "insert into crm_opportunities(organization_id,brand_id,lead_id,service,estimated_value,currency,request_id) values($1,$2,$3,'Servicio',100,'DOP',$4) returning id",
            [org, brand, leadId, randomUUID()],
          );
          opportunityId = r.rows[0].id;
          await db.query(
            "update crm_opportunities set stage='negociacion' where id=$1",
            [opportunityId],
          );
          await assert.rejects(() =>
            db.query(
              "update crm_opportunities set stage='ganado' where id=$1",
              [opportunityId],
            ),
          );
          await db.query(
            "update crm_opportunities set stage='ganado',closed_value=90 where id=$1",
            [opportunityId],
          );
          assert.equal(
            (await db.query("select * from crm_opportunities")).rows.length,
            1,
          );
        });
      },
    );
    await t.test(
      "Actividades, fechas y completado persisten y tienen historial",
      async () => {
        await asUser(user, async () => {
          const r = await db.query<{ id: string }>(
            "insert into crm_activities(organization_id,brand_id,lead_id,kind,title,due_at,request_id) values($1,$2,$3,'seguimiento','Tarea aislada','2030-01-01T14:00:00Z',$4) returning id",
            [org, brand, leadId, randomUUID()],
          );
          await db.query(
            "update crm_activities set completed_at=now() where id=$1",
            [r.rows[0].id],
          );
          assert.ok(
            (
              await db.query<{ completed_at: string }>(
                "select completed_at from crm_activities where id=$1",
                [r.rows[0].id],
              )
            ).rows[0].completed_at,
          );
          assert.ok(
            (
              await db.query("select * from crm_history where lead_id=$1", [
                leadId,
              ])
            ).rows.length >= 5,
          );
          await assert.rejects(() =>
            db.query("update crm_history set action='borrado'"),
          );
        });
      },
    );
    await t.test(
      "Datos de prueba se propagan y quedan fuera de métricas; monedas no se suman",
      async () => {
        await asUser(user, async () => {
          const testLead = await create({ ...input, is_test: true });
          await db.query(
            "insert into crm_opportunities(organization_id,brand_id,lead_id,service,stage,closed_value,estimated_value,currency,request_id) values($1,$2,$3,'PRUEBA','ganado',99999,99999,'USD',$4)",
            [org, brand, testLead, randomUUID()],
          );
          await assert.rejects(() =>
            db.query("update crm_leads set is_test=false where id=$1", [
              testLead,
            ]),
          );
          const summary = (
            await db.query<{
              summary: {
                leads: number;
                won: number;
                won_value: Record<string, number>;
              };
            }>("select crm_summary($1,null) summary", [org])
          ).rows[0].summary;
          assert.equal(summary.leads, 1);
          assert.equal(summary.won, 1);
          assert.deepEqual(summary.won_value, { DOP: 90 });
          const filtered = (
            await db.query<{ s: { leads: number } }>(
              "select crm_summary($1,$2) s",
              [org, brand2],
            )
          ).rows[0].s;
          assert.equal(filtered.leads, 0);
        });
      },
    );
    await t.test(
      "No se fusionan personas distintas por compartir correo",
      async () => {
        await asUser(user, async () => {
          await create({ ...input, name: "Otra persona de prueba" });
          assert.equal(
            (
              await db.query("select * from crm_contacts where email=$1", [
                input.email,
              ])
            ).rows.length,
            3,
          );
        });
      },
    );
    await t.test(
      "Rango de score y clasificación son restricciones de PostgreSQL",
      async () => {
        await asUser(user, async () => {
          await assert.rejects(() =>
            db.query("update crm_leads set score=101 where id=$1", [leadId]),
          );
          await db.query(
            "update crm_leads set score=88,classification='HOT',evaluated_at=now() where id=$1",
            [leadId],
          );
          assert.ok(
            (
              await db.query(
                "select * from crm_history where lead_id=$1 and after_data->>'score'='88'",
                [leadId],
              )
            ).rows.length,
          );
        });
      },
    );
    await t.test(
      "Propuestas registradas, cierres perdidos y filtros por marca persisten",
      async () => {
        await asUser(user, async () => {
          await db.query(
            "insert into crm_proposals(organization_id,brand_id,lead_id,title,amount,currency,status,request_id) values($1,$2,$3,'Propuesta aislada',80,'USD','sent',$4)",
            [org, brand, leadId, randomUUID()],
          );
          const summary = (
            await db.query<{ s: { sent: number } }>(
              "select crm_summary($1,$2) s",
              [org, brand],
            )
          ).rows[0].s;
          assert.equal(summary.sent, 1);
          await db.query(
            "update crm_opportunities set stage='perdido',closed_value=null where id=$1",
            [opportunityId],
          );
          assert.equal(
            (
              await db.query<{ outcome: string }>(
                "select outcome from crm_opportunities where id=$1",
                [opportunityId],
              )
            ).rows[0].outcome,
            "lost",
          );
          await assert.rejects(() =>
            db.query("select crm_create_lead($1,$2::jsonb,null)", [
              org,
              JSON.stringify(input),
            ]),
          );
          await assert.rejects(() =>
            db.query(
              "update crm_leads set score=10,classification=null where id=$1",
              [leadId],
            ),
          );
        });
      },
    );
    await t.test(
      "Migración de captación conserva registros y requiere permisos de servidor",
      async () => {
        const before = await db.query(
          "select id,is_test from crm_leads order by id",
        );
        await db.exec(
          await readFile(
            "supabase/migrations/202610250003_n8n_capture_fields.sql",
            "utf8",
          ),
        );
        assert.deepEqual(
          (await db.query("select id,is_test from crm_leads order by id")).rows,
          before.rows,
        );
        await db.exec("set role service_role");
        try {
          assert.equal(
            (
              await db.query<{ v: number }>(
                "select crm_inbound_contract_version() v",
              )
            ).rows[0].v,
            2,
          );
        } finally {
          await db.exec("reset role");
        }
        await asUser(user, async () => {
          await assert.rejects(() =>
            db.query("select crm_inbound_contract_version()"),
          );
        });
      },
    );
    const secret = randomBytes(48).toString("hex");
    const event = {
      event_id: randomUUID(),
      external_id: randomUUID(),
      type: "lead.created",
      brand_id: brand,
      contact: {
        name: "EVENTO DE PRUEBA AISLADA",
        email: "event@example.invalid",
      },
      source: "n8n-test",
      service: "Servicio",
      score: 75,
      classification: "WARM",
      occurred_at: new Date().toISOString(),
      evaluated_at: new Date().toISOString(),
      is_test: true,
    };
    function request(
      payload: unknown,
      sign = true,
      timestamp = String(Math.floor(Date.now() / 1000)),
    ) {
      const body = JSON.stringify(payload);
      const signature = createHmac("sha256", secret)
        .update(timestamp + "." + body)
        .digest("hex");
      return new Request("https://example.invalid/api/integrations/n8n/leads", {
        method: "POST",
        headers: {
          "content-type": "application/json",
          "x-crm-timestamp": timestamp,
          "x-crm-signature": "sha256=" + (sign ? signature : "0".repeat(64)),
        },
        body,
      });
    }
    async function ingest(event: unknown, hash: string) {
      await db.exec("set role service_role");
      try {
        const r = await db.query<{ result: unknown }>(
          "select crm_ingest_lead($1,$2::jsonb,$3) result",
          [org, JSON.stringify(event), hash],
        );
        return { data: r.rows[0].result, error: null };
      } catch (e) {
        return { data: null, error: { code: (e as { code?: string }).code } };
      } finally {
        await db.exec("reset role");
      }
    }
    const deps = { secret, organizationId: org, ingest };
    await t.test(
      "Webhook rechaza firma inválida, caducidad y payload defectuoso",
      async () => {
        assert.equal(
          (await receiveLead(request(event, false), deps)).status,
          401,
        );
        assert.equal(
          (await receiveLead(request(event, true, "1000000000"), deps)).status,
          401,
        );
        assert.equal(
          (await receiveLead(request({ ...event, score: 101 }), deps)).status,
          400,
        );
        assert.equal(
          webhookSchema.safeParse({ ...event, organization_id: otherOrg })
            .success,
          false,
        );
      },
    );
    await t.test(
      "Webhook limita tamaño y rechaza datos inesperados",
      async () => {
        assert.equal(
          (
            await receiveLead(
              request({ ...event, need: "x".repeat(40000) }),
              deps,
            )
          ).status,
          413,
        );
        assert.equal(
          (await receiveLead(request({ ...event, unexpected: "field" }), deps))
            .status,
          400,
        );
      },
    );
    await t.test(
      "Webhook persiste con idempotencia sin depender de Google Sheets",
      async () => {
        const first = await receiveLead(request(event), deps);
        assert.equal(first.status, 200);
        const a = await first.json();
        const second = await receiveLead(request(event), deps);
        const b = await second.json();
        assert.equal(a.lead_id, b.lead_id);
        assert.equal(b.duplicate, true);
        assert.equal(
          (await db.query("select * from crm_inbound_events")).rows.length,
          1,
        );
        assert.equal(
          (
            await db.query("select * from crm_leads where external_id=$1", [
              event.external_id,
            ])
          ).rows.length,
          1,
        );
        assert.equal(
          (
            await receiveLead(
              request({ ...event, service: "contenido distinto" }),
              deps,
            )
          ).status,
          409,
        );
      },
    );
    await t.test(
      "Adaptador → receptor → PostgreSQL conserva el contrato comercial completo y excluye las pruebas",
      async () => {
        const input = {
          ...event,
          event_id: randomUUID(),
          external_id: randomUUID(),
          campaign: "Campaña de prueba",
          message: "Mensaje de captación",
          budget: "RD$ 100",
          urgency: "30 días",
          score: "90",
          classification: "hot",
          problem: "Problema de prueba",
          recommendation: "Seguimiento de prueba",
        };
        const prepared = prepareCrmRequest(input, secret);
        const response = await receiveLead(
          new Request("https://example.invalid/api/integrations/n8n/leads", {
            method: "POST",
            headers: prepared.headers,
            body: prepared.body,
          }),
          deps,
        );
        assert.equal(response.status, 200);
        const result = await response.json();
        const row = (
          await db.query<{
            campaign: string;
            budget: string;
            urgency: string;
            score: number;
            classification: string;
            is_test: boolean;
            notes: string;
            ai_recommendation: string;
          }>(
            "select l.*,c.notes from crm_leads l join crm_contacts c on l.contact_id=c.id where l.id=$1",
            [result.lead_id],
          )
        ).rows[0];
        assert.equal(row.campaign, input.campaign);
        assert.equal(row.budget, input.budget);
        assert.equal(row.urgency, input.urgency);
        assert.equal(row.notes, input.message);
        assert.equal(row.score, 90);
        assert.equal(row.classification, "HOT");
        assert.equal(row.ai_recommendation, input.recommendation);
        assert.equal(row.is_test, true);
        const replay = await receiveLead(
          new Request("https://example.invalid/api/integrations/n8n/leads", {
            method: "POST",
            headers: prepared.headers,
            body: prepared.body,
          }),
          deps,
        );
        assert.equal((await replay.json()).duplicate, true);
        const sameLead = prepareCrmRequest(
          { ...input, event_id: randomUUID() },
          secret,
        );
        const repeated = await receiveLead(
          new Request("https://example.invalid/api/integrations/n8n/leads", {
            method: "POST",
            headers: sameLead.headers,
            body: sameLead.body,
          }),
          deps,
        );
        assert.equal((await repeated.json()).lead_id, result.lead_id);
        assert.equal(
          (
            await db.query("select * from crm_leads where external_id=$1", [
              input.external_id,
            ])
          ).rows.length,
          1,
        );
        await asUser(user, async () => {
          const summary = (
            await db.query<{ s: { hot: number } }>(
              "select crm_summary($1,null) s",
              [org],
            )
          ).rows[0].s;
          assert.equal(summary.hot, 1);
        });
      },
    );
    await t.test(
      "HOT, WARM y COLD se conservan sin recalificar ni promover pruebas a reales",
      async () => {
        for (const classification of ["HOT", "WARM", "COLD"]) {
          const input = {
            ...event,
            event_id: randomUUID(),
            external_id: randomUUID(),
            classification,
          };
          const first = await receiveLead(request(input), deps);
          assert.equal(first.status, 200);
          const result = await first.json();
          const row = (
            await db.query<{ classification: string; is_test: boolean }>(
              "select classification,is_test from crm_leads where id=$1",
              [result.lead_id],
            )
          ).rows[0];
          assert.equal(row.classification, classification);
          assert.equal(row.is_test, true);
          const retry = await receiveLead(
            request({ ...input, event_id: randomUUID(), is_test: false }),
            deps,
          );
          assert.equal((await retry.json()).lead_id, result.lead_id);
          assert.equal(
            (
              await db.query<{ is_test: boolean }>(
                "select is_test from crm_leads where id=$1",
                [result.lead_id],
              )
            ).rows[0].is_test,
            true,
          );
        }
      },
    );
    await t.test(
      "Webhook rechaza marca de otra organización y no es ejecutable por un usuario",
      async () => {
        assert.equal(
          (
            await receiveLead(
              request({
                ...event,
                event_id: randomUUID(),
                external_id: randomUUID(),
                brand_id: otherBrand,
              }),
              deps,
            )
          ).status,
          422,
        );
        await asUser(user, async () => {
          await assert.rejects(() =>
            db.query("select crm_ingest_lead($1,$2::jsonb,$3)", [
              org,
              JSON.stringify(event),
              "hash",
            ]),
          );
        });
      },
    );
  } finally {
    await db.close();
  }
});
