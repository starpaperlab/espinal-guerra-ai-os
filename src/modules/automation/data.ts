import "server-only";
import { crmContext } from "@/modules/crm/data";
export type CaptureSource = {
  id: string;
  brand_id: string;
  source_key: string;
  name: string;
  provider: string;
  enabled: boolean;
};
export type AutomationDefinition = {
  id: string;
  brand_id: string;
  name: string;
  status: string;
  plan: Record<string, unknown>;
};
export type NativeEvent = {
  id: string;
  kind: string;
  status: string;
  attempts: number;
  is_test: boolean;
  created_at: string;
};
export type NativeRun = {
  id: string;
  status: string;
  error_code: string | null;
  started_at: string;
};
export type EnterpriseData = {
  organizationId: string;
  organizationName: string;
  role: string;
  brands: { id: string; slug: string; name: string }[];
  memberCount: number;
  bound: boolean;
  sources: CaptureSource[];
  definitions: AutomationDefinition[];
  events: NativeEvent[];
  runs: NativeRun[];
  error?: string;
};
export async function loadEnterprise(): Promise<EnterpriseData> {
  const { client, organizationId, membership } = await crmContext();
  const base: EnterpriseData = {
    organizationId,
    organizationName: "Organización autorizada",
    role: membership.role as string,
    brands: [],
    memberCount: 0,
    bound: false,
    sources: [],
    definitions: [],
    events: [],
    runs: [],
  };
  const results = await Promise.all([
    client
      .from("organizations")
      .select("name")
      .eq("id", organizationId)
      .single(),
    client
      .from("brands")
      .select("id,slug,name")
      .eq("organization_id", organizationId)
      .order("name"),
    client
      .from("organization_members")
      .select("user_id", { count: "exact", head: true })
      .eq("organization_id", organizationId),
    client
      .from("crm_enterprise_settings")
      .select("organization_id")
      .eq("organization_id", organizationId)
      .maybeSingle(),
    client
      .from("crm_capture_sources")
      .select("id,brand_id,source_key,name,provider,enabled")
      .eq("organization_id", organizationId)
      .order("created_at"),
    client
      .from("native_automation_definitions")
      .select("id,brand_id,name,status,plan")
      .eq("organization_id", organizationId)
      .order("created_at"),
    client
      .from("native_automation_events")
      .select("id,kind,status,attempts,is_test,created_at")
      .eq("organization_id", organizationId)
      .order("created_at", { ascending: false })
      .limit(20),
    client
      .from("native_automation_runs")
      .select("id,status,error_code,started_at")
      .eq("organization_id", organizationId)
      .order("started_at", { ascending: false })
      .limit(20),
  ]);
  base.organizationName = results[0].data?.name || base.organizationName;
  base.brands = results[1].data || [];
  base.memberCount = results[2].count || 0;
  base.bound = Boolean(results[3].data);
  base.sources = results[4].data || [];
  base.definitions = (results[5].data || []) as AutomationDefinition[];
  base.events = (results[6].data || []) as NativeEvent[];
  base.runs = (results[7].data || []) as NativeRun[];
  if (results.some((r) => r.error))
    base.error =
      "La infraestructura todavía no está disponible. Revisa la migración 006 y la auditoría de Supabase; no se han mostrado datos de demostración.";
  return base;
}
