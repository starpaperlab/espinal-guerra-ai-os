import "server-only";
import { crmContext } from "@/modules/crm/data";
import {
  dateRange,
  defaultRange,
  type MarketingData,
  type AdAccount,
  type Sync,
  type CampaignMetric,
} from "./contract";
export async function loadMarketing(
  query: Record<string, string>,
): Promise<MarketingData> {
  const { client, organizationId, membership } = await crmContext();
  const parsed = dateRange.safeParse({
    since: query.desde,
    until: query.hasta,
  });
  const data: MarketingData = {
    brands: [],
    role: membership.role,
    accounts: [],
    metrics: [],
    range: parsed.success ? parsed.data : defaultRange(),
    tokenConfigured: Boolean(process.env.META_ACCESS_TOKEN?.trim()),
  };
  if ((query.desde || query.hasta) && !parsed.success)
    data.error =
      "Revisa las fechas: intervalo máximo de 93 días y sin fechas futuras.";
  const brands = await client
    .from("brands")
    .select("id,slug,name")
    .eq("organization_id", organizationId)
    .order("name");
  if (brands.error)
    return {
      ...data,
      error: "No se pudieron consultar las marcas autorizadas.",
    };
  data.brands = brands.data || [];
  const brand = data.brands.find(
    (b) => b.id === query.marca || b.slug === query.marca,
  );
  if (query.marca && !brand)
    return {
      ...data,
      error: "La marca no está disponible en tu organización.",
    };
  data.selectedBrand = brand?.slug;
  let accounts = client
    .from("marketing_ad_accounts")
    .select("*")
    .eq("organization_id", organizationId)
    .order("created_at");
  if (brand) accounts = accounts.eq("brand_id", brand.id);
  const result = await accounts.returns<AdAccount[]>();
  if (result.error)
    return {
      ...data,
      error:
        "Marketing Meta pendiente: aplica la migración 202610250007_meta_ads_readonly.sql en el proyecto Supabase existente.",
    };
  data.accounts = result.data || [];
  data.account = query.cuenta
    ? data.accounts.find((a) => a.id === query.cuenta)
    : data.accounts[0];
  if (query.cuenta && !data.account)
    return {
      ...data,
      error:
        "La cuenta no está disponible para la marca y organización seleccionadas.",
    };
  if (!data.account) return data;
  const base = () =>
    client
      .from("marketing_meta_syncs")
      .select("*")
      .eq("organization_id", organizationId)
      .eq("account_id", data.account!.id)
      .eq("since", data.range.since)
      .eq("until", data.range.until)
      .order("started_at", { ascending: false })
      .limit(1);
  const [latest, success] = await Promise.all([
    base().maybeSingle<Sync>(),
    base().eq("status", "success").maybeSingle<Sync>(),
  ]);
  if (latest.error || success.error)
    return {
      ...data,
      error: "No se pudo consultar el historial de sincronización.",
    };
  data.latestAttempt = latest.data || undefined;
  data.sync = success.data || undefined;
  if (data.sync) {
    const metrics = await client
      .from("marketing_meta_campaign_metrics")
      .select("campaign_id,campaign,insight")
      .eq("organization_id", organizationId)
      .eq("account_id", data.account.id)
      .eq("sync_id", data.sync.id)
      .order("campaign_id")
      .limit(2000)
      .returns<CampaignMetric[]>();
    if (metrics.error)
      return {
        ...data,
        error: "No se pudieron cargar las campañas sincronizadas.",
      };
    data.metrics = metrics.data || [];
  }
  return data;
}
