"use server";
import { redirect } from "next/navigation";
import { revalidatePath } from "next/cache";
import { z } from "zod";
import { crmContext } from "./data";
import {
  leadSchema,
  opportunitySchema,
  activitySchema,
  proposalSchema,
  stageSchema,
} from "./schema";
const value = (f: FormData, k: string) => String(f.get(k) || "");
const date = (f: FormData, k: string) => {
  const v = value(f, k);
  if (!v) return null;
  const d = new Date(v + "-04:00");
  return Number.isNaN(d.getTime()) ? "invalid" : d.toISOString();
};
function finish(f: FormData, result: string, lead?: string): never {
  revalidatePath("/ventas");
  const q = new URLSearchParams({ resultado: result });
  const brand = value(f, "context_brand");
  if (/^[a-z0-9-]{1,100}$/.test(brand)) q.set("marca", brand);
  if (lead && z.uuid().safeParse(lead).success) q.set("lead", lead);
  if (value(f, "test_context") === "si") q.set("pruebas", "si");
  redirect("/ventas?" + q);
}
function leadValues(f: FormData) {
  return {
    brand_id: value(f, "brand_id"),
    name: value(f, "name"),
    company: value(f, "company"),
    email: value(f, "email"),
    phone: value(f, "phone"),
    source: value(f, "source") || "manual",
    campaign: value(f, "campaign"),
    service: value(f, "service"),
    need: value(f, "need"),
    budget: value(f, "budget"),
    urgency: value(f, "urgency"),
    notes: value(f, "notes"),
    tags: value(f, "tags")
      .split(",")
      .map((t) => t.trim())
      .filter(Boolean),
    next_action: value(f, "next_action"),
    follow_up_at: date(f, "follow_up_at"),
    owner_id: value(f, "owner_id") || null,
    stage: value(f, "stage") || "nuevo",
    is_test: value(f, "is_test") === "on",
  };
}
export async function createLead(f: FormData) {
  const { client, organizationId } = await crmContext();
  const parsed = leadSchema.safeParse(leadValues(f));
  const request = z.uuid().safeParse(value(f, "request_id"));
  if (!parsed.success || !request.success) finish(f, "validacion");
  const { data, error } = await client.rpc("crm_create_lead", {
    p_organization_id: organizationId,
    p_input: parsed.data,
    p_request_id: request.data,
  });
  if (error) finish(f, "guardado");
  finish(f, "creado", data as string);
}
export async function updateLead(f: FormData) {
  const { client, organizationId } = await crmContext();
  const parsed = leadSchema.safeParse(leadValues(f));
  const id = z.uuid().safeParse(value(f, "id"));
  if (!parsed.success || !id.success) finish(f, "validacion");
  const existing = await client
    .from("crm_leads")
    .select("brand_id")
    .eq("organization_id", organizationId)
    .eq("id", id.data)
    .maybeSingle();
  if (
    existing.error ||
    !existing.data ||
    existing.data.brand_id !== parsed.data.brand_id
  )
    finish(f, "acceso");
  const { error } = await client.rpc("crm_update_lead", {
    p_organization_id: organizationId,
    p_id: id.data,
    p_input: parsed.data,
  });
  if (error) finish(f, "guardado", id.data);
  finish(f, "actualizado", id.data);
}
async function authorizedLead(id: string) {
  const context = await crmContext();
  if (!z.uuid().safeParse(id).success) return null;
  const { data, error } = await context.client
    .from("crm_leads")
    .select("id,brand_id")
    .eq("organization_id", context.organizationId)
    .eq("id", id)
    .maybeSingle();
  return !error && data ? { ...context, lead: data } : null;
}
export async function createOpportunity(f: FormData) {
  const context = await authorizedLead(value(f, "lead_id"));
  if (!context) finish(f, "acceso");
  const parsed = opportunitySchema.safeParse({
    lead_id: value(f, "lead_id"),
    service: value(f, "service"),
    estimated_value: Number(value(f, "estimated_value")),
    currency: value(f, "currency").toUpperCase(),
    probability: Number(value(f, "probability")),
    expected_close: value(f, "expected_close") || null,
    next_action: value(f, "next_action"),
    request_id: value(f, "request_id"),
  });
  if (!parsed.success) finish(f, "validacion", context.lead.id);
  const { error } = await context.client.from("crm_opportunities").upsert(
    {
      ...parsed.data,
      organization_id: context.organizationId,
      brand_id: context.lead.brand_id,
    },
    { onConflict: "organization_id,request_id", ignoreDuplicates: true },
  );
  finish(f, error ? "guardado" : "creado", context.lead.id);
}
export async function moveOpportunity(f: FormData) {
  const { client, organizationId } = await crmContext();
  const parsed = z
    .object({
      id: z.uuid(),
      stage: stageSchema,
      version: z.iso.datetime({ offset: true }),
      closed_value: z.number().finite().min(0).max(99999999999999).nullable(),
    })
    .safeParse({
      id: value(f, "id"),
      stage: value(f, "stage"),
      version: value(f, "version"),
      closed_value:
        value(f, "closed_value") === ""
          ? null
          : Number(value(f, "closed_value")),
    });
  if (
    !parsed.success ||
    (parsed.data.stage === "ganado" && parsed.data.closed_value === null)
  )
    finish(f, "validacion");
  const { id, stage, version, closed_value } = parsed.data;
  const { data, error } = await client
    .from("crm_opportunities")
    .update({ stage, closed_value: stage === "ganado" ? closed_value : null })
    .eq("organization_id", organizationId)
    .eq("id", id)
    .eq("updated_at", version)
    .select("id")
    .maybeSingle();
  finish(f, error || !data ? "conflicto" : "actualizado", value(f, "lead_id"));
}
export async function createActivity(f: FormData) {
  const context = await authorizedLead(value(f, "lead_id"));
  if (!context) finish(f, "acceso");
  const parsed = activitySchema.safeParse({
    lead_id: context.lead.id,
    kind: value(f, "kind"),
    title: value(f, "title"),
    notes: value(f, "notes"),
    due_at: date(f, "due_at"),
    request_id: value(f, "request_id"),
  });
  if (!parsed.success) finish(f, "validacion", context.lead.id);
  const { error } = await context.client.from("crm_activities").upsert(
    {
      ...parsed.data,
      organization_id: context.organizationId,
      brand_id: context.lead.brand_id,
    },
    { onConflict: "organization_id,request_id", ignoreDuplicates: true },
  );
  finish(f, error ? "guardado" : "creado", context.lead.id);
}
export async function completeActivity(f: FormData) {
  const { client, organizationId } = await crmContext();
  const id = z.uuid().safeParse(value(f, "id"));
  if (!id.success) finish(f, "validacion");
  const { data, error } = await client
    .from("crm_activities")
    .update({ completed_at: new Date().toISOString() })
    .eq("organization_id", organizationId)
    .eq("id", id.data)
    .is("completed_at", null)
    .select("id")
    .maybeSingle();
  finish(f, error || !data ? "conflicto" : "actualizado", value(f, "lead_id"));
}
export async function createProposal(f: FormData) {
  const context = await authorizedLead(value(f, "lead_id"));
  if (!context) finish(f, "acceso");
  const parsed = proposalSchema.safeParse({
    lead_id: context.lead.id,
    title: value(f, "title"),
    items: value(f, "items"),
    amount: Number(value(f, "amount")),
    currency: value(f, "currency").toUpperCase(),
    status: value(f, "status"),
    issued_at: value(f, "issued_at") || null,
    valid_until: value(f, "valid_until") || null,
    request_id: value(f, "request_id"),
  });
  if (!parsed.success) finish(f, "validacion", context.lead.id);
  const { error } = await context.client.from("crm_proposals").upsert(
    {
      ...parsed.data,
      organization_id: context.organizationId,
      brand_id: context.lead.brand_id,
    },
    { onConflict: "organization_id,request_id", ignoreDuplicates: true },
  );
  finish(f, error ? "guardado" : "creado", context.lead.id);
}
