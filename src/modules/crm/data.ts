import "server-only";
import { requireWorkspace } from "@/lib/auth";
import { createClient } from "@/lib/supabase/server";
import type {
  CrmData,
  Brand,
  Lead,
  Opportunity,
  Activity,
  History,
  Summary,
  Proposal,
} from "./types";
import { stageSchema } from "./schema";
import { z } from "zod";
export async function crmContext() {
  const workspace = await requireWorkspace();
  const client = await createClient();
  if (!client) throw new Error("Supabase no está disponible");
  return {
    ...workspace,
    client,
    organizationId: workspace.membership.organization_id as string,
  };
}
export async function loadCrm(query: Record<string, string>): Promise<CrmData> {
  const { client, organizationId, user } = await crmContext();
  const page = Math.min(
    10000,
    Math.max(1, Number.parseInt(query.pagina || "1", 10) || 1),
  );
  const data: CrmData = {
    now: new Date().toISOString(),
    brands: [],
    summary: null,
    leads: [],
    leadCount: 0,
    opportunities: [],
    opportunityCount: 0,
    activities: [],
    followUpLeads: [],
    followUpCount: 0,
    activityCount: 0,
    detail: null,
    detailActivities: [],
    detailOpportunities: [],
    proposals: [],
    history: [],
    historyCount: 0,
    page,
    query,
    userId: user.id,
  };
  const brandsResult = await client
    .from("brands")
    .select("id,slug,name")
    .eq("organization_id", organizationId)
    .order("name")
    .returns<Brand[]>();
  if (brandsResult.error)
    return {
      ...data,
      error: "No se pudieron consultar las marcas autorizadas.",
    };
  data.brands = brandsResult.data || [];
  data.selectedBrand = data.brands.find(
    (b) => b.id === query.marca || b.slug === query.marca,
  );
  if (query.marca && !data.selectedBrand)
    return {
      ...data,
      error: "La marca solicitada no está disponible en tu organización.",
    };
  let leads = client
    .from("crm_leads")
    .select("*,contact:crm_contacts!crm_leads_contact_fk!inner(*)", {
      count: "exact",
    })
    .eq("organization_id", organizationId)
    .eq("is_test", query.pruebas === "si");
  let opportunities = client
    .from("crm_opportunities")
    .select("*", { count: "exact" })
    .eq("organization_id", organizationId)
    .eq("is_test", query.pruebas === "si");
  let activities = client
    .from("crm_activities")
    .select("*", { count: "exact" })
    .eq("organization_id", organizationId)
    .eq("is_test", query.pruebas === "si");
  let followUps = client
    .from("crm_leads")
    .select("*,contact:crm_contacts!crm_leads_contact_fk!inner(*)", {
      count: "exact",
    })
    .eq("organization_id", organizationId)
    .eq("is_test", query.pruebas === "si")
    .not("follow_up_at", "is", null)
    .not("stage", "in", "(ganado,perdido)");
  if (data.selectedBrand) {
    followUps = followUps.eq("brand_id", data.selectedBrand.id);
    leads = leads.eq("brand_id", data.selectedBrand.id);
    opportunities = opportunities.eq("brand_id", data.selectedBrand.id);
    activities = activities.eq("brand_id", data.selectedBrand.id);
  }
  const search = (query.q || "")
    .replace(/[^\p{L}\p{N}@ ._+-]/gu, "")
    .slice(0, 100);
  if (search)
    leads = leads.or(
      `name.ilike.%${search}%,company.ilike.%${search}%,email.ilike.%${search}%`,
      { referencedTable: "contact" },
    );
  const stage = stageSchema.safeParse(query.estado);
  if (stage.success) leads = leads.eq("stage", stage.data);
  if (["HOT", "WARM", "COLD"].includes(query.clase))
    leads = leads.eq("classification", query.clase);
  const order = query.orden === "score" ? "score" : "captured_at";
  const results = await Promise.all([
    client.rpc("crm_summary", {
      p_organization_id: organizationId,
      p_brand_id: data.selectedBrand?.id || null,
    }),
    leads
      .order(order, { ascending: query.direccion === "asc", nullsFirst: false })
      .order("id")
      .range((page - 1) * 20, page * 20 - 1)
      .returns<Lead[]>(),
    opportunities
      .order("created_at", { ascending: false })
      .range(0, 199)
      .returns<Opportunity[]>(),
    activities
      .is("completed_at", null)
      .order("due_at", { ascending: true, nullsFirst: false })
      .range(0, 199)
      .returns<Activity[]>(),
    followUps
      .order("follow_up_at", { ascending: true })
      .range(0, 199)
      .returns<Lead[]>(),
  ]);
  if (results.some((r) => r.error))
    return {
      ...data,
      error:
        "CRM no disponible. Comprueba que la migración 202610250002_crm.sql esté aplicada y sus permisos estén vigentes. No se han sustituido datos por demostraciones.",
    };
  data.summary = results[0].data as Summary;
  data.leads = results[1].data || [];
  data.leadCount = results[1].count || 0;
  data.opportunities = results[2].data || [];
  data.opportunityCount = results[2].count || 0;
  data.activities = results[3].data || [];
  data.followUpLeads = results[4].data || [];
  data.followUpCount = results[4].count || 0;
  data.activityCount = results[3].count || 0;
  if (query.lead) {
    if (!z.uuid().safeParse(query.lead).success)
      return { ...data, error: "Identificador de prospecto inválido." };
    let detail = client
      .from("crm_leads")
      .select("*,contact:crm_contacts!crm_leads_contact_fk(*)")
      .eq("organization_id", organizationId)
      .eq("id", query.lead);
    if (data.selectedBrand)
      detail = detail.eq("brand_id", data.selectedBrand.id);
    const result = await detail.maybeSingle<Lead>();
    if (result.error || !result.data)
      return {
        ...data,
        error: "El prospecto no existe o no tienes acceso a su marca.",
      };
    data.detail = result.data;
    const related = await Promise.all([
      client
        .from("crm_activities")
        .select("*")
        .eq("organization_id", organizationId)
        .eq("lead_id", query.lead)
        .order("created_at", { ascending: false })
        .limit(100)
        .returns<Activity[]>(),
      client
        .from("crm_opportunities")
        .select("*")
        .eq("organization_id", organizationId)
        .eq("lead_id", query.lead)
        .order("created_at", { ascending: false })
        .limit(100)
        .returns<Opportunity[]>(),
      client
        .from("crm_history")
        .select("*", { count: "exact" })
        .eq("organization_id", organizationId)
        .or(
          `lead_id.eq.${query.lead},and(entity_type.eq.crm_contacts,entity_id.eq.${data.detail.contact_id})`,
        )
        .order("changed_at", { ascending: false })
        .limit(100)
        .returns<History[]>(),
      client
        .from("crm_proposals")
        .select("*")
        .eq("organization_id", organizationId)
        .eq("lead_id", query.lead)
        .order("created_at", { ascending: false })
        .limit(100)
        .returns<Proposal[]>(),
    ]);
    if (related.some((r) => r.error))
      data.error = "No se pudo cargar toda la ficha; recarga antes de editar.";
    data.detailActivities = related[0].data || [];
    data.detailOpportunities = related[1].data || [];
    data.history = related[2].data || [];
    data.historyCount = related[2].count || 0;
    data.proposals = related[3].data || [];
  }
  return data;
}
