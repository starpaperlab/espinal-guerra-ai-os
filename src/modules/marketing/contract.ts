import { z } from "zod";
export const initialMetaAccount = "act_1906671039972272";
export const metaAccountId = z.string().regex(/^act_[0-9]{5,30}$/);
export const metaErrorCodes = [
  "TOKEN_MISSING",
  "TOKEN_EXPIRED",
  "ACCESS_DENIED",
  "RATE_LIMIT",
  "NETWORK",
  "META_UNAVAILABLE",
  "INVALID_RESPONSE",
  "TOO_MUCH_DATA",
  "SAVE_FAILED",
] as const;
export type MetaErrorCode = (typeof metaErrorCodes)[number];
export const metaMessages: Record<MetaErrorCode, string> = {
  TOKEN_MISSING:
    "Falta META_ACCESS_TOKEN en Vercel Production. Configúrala y vuelve a desplegar.",
  TOKEN_EXPIRED:
    "Meta rechazó el token por vencimiento o invalidez. Renueva la autorización, actualiza META_ACCESS_TOKEN y vuelve a desplegar.",
  ACCESS_DENIED:
    "Meta denegó el acceso. Comprueba ads_read y que el usuario o usuario del sistema tenga acceso a esta cuenta publicitaria.",
  RATE_LIMIT:
    "Meta limitó las consultas. Espera antes de volver a sincronizar.",
  NETWORK:
    "No se pudo comunicar con Meta o se agotó el tiempo. Reintenta más tarde.",
  META_UNAVAILABLE:
    "Meta no pudo completar la consulta. Revisa el estado de Marketing API y reintenta.",
  INVALID_RESPONSE:
    "Meta devolvió datos inesperados. No se guardó una sincronización parcial.",
  TOO_MUCH_DATA:
    "La consulta supera el límite de lectura. Reduce el intervalo o revisa la paginación antes de sincronizar.",
  SAVE_FAILED:
    "No se pudieron guardar los datos. Revisa la migración 007 y los permisos de administrador.",
};
const date = z
  .string()
  .regex(/^\d{4}-\d{2}-\d{2}$/)
  .refine(
    (v) =>
      !Number.isNaN(Date.parse(v)) &&
      new Date(v).toISOString().slice(0, 10) === v,
  );
export const dateRange = z
  .object({ since: date, until: date })
  .refine(
    (v) =>
      v.since <= v.until &&
      (Date.parse(v.until) - Date.parse(v.since)) / 86400000 <= 92 &&
      v.until <= new Date().toISOString().slice(0, 10),
    "Selecciona un intervalo válido de hasta 93 días, sin fechas futuras.",
  );
export function defaultRange() {
  const now = new Date();
  return {
    since: new Date(now.getTime() - 29 * 86400000).toISOString().slice(0, 10),
    until: now.toISOString().slice(0, 10),
  };
}
const numeric = z
  .string()
  .regex(/^\d+(\.\d+)?$/)
  .refine((v) => Number.isFinite(Number(v)));
const action = z.object({ action_type: z.string().max(160), value: numeric });
export const insightSchema = z.object({
  campaign_id: z.string().regex(/^\d+$/).optional(),
  campaign_name: z.string().max(1000).optional(),
  date_start: date,
  date_stop: date,
  spend: numeric.optional(),
  impressions: numeric.optional(),
  reach: numeric.optional(),
  clicks: numeric.optional(),
  cpc: numeric.optional(),
  cpm: numeric.optional(),
  actions: z.array(action).optional(),
  action_values: z.array(action).optional(),
});
export const campaignSchema = z.object({
  id: z.string().regex(/^\d+$/),
  name: z.string().max(1000),
  status: z.string().max(80).optional(),
  effective_status: z.string().max(80).optional(),
  daily_budget: numeric.optional(),
  lifetime_budget: numeric.optional(),
  start_time: z.string().max(100).optional(),
  stop_time: z.string().max(100).optional(),
  objective: z.string().max(100).optional(),
});
export type Insight = z.infer<typeof insightSchema>;
export type Campaign = z.infer<typeof campaignSchema>;
export type MetaSnapshot = {
  account: {
    id: string;
    name: string;
    currency: string;
    timezone_name: string;
    account_status: number;
  };
  permissions: { checked: boolean; granted: string[] };
  campaigns: Campaign[];
  insights: Insight[];
  summary: Insight | null;
};
export type AdAccount = {
  id: string;
  organization_id: string;
  brand_id: string;
  meta_account_id: string;
  name: string | null;
  currency: string | null;
  timezone: string | null;
  last_synced_at: string | null;
};
export type Sync = {
  id: string;
  account_id: string;
  status: "running" | "success" | "error";
  since: string;
  until: string;
  started_at: string;
  finished_at: string | null;
  error_code: MetaErrorCode | null;
  permissions: { checked: boolean; granted: string[] } | null;
  summary: Insight | null;
  campaign_count: number | null;
};
export type CampaignMetric = {
  campaign_id: string;
  campaign: Campaign;
  insight: Insight | null;
};
export type MarketingData = {
  brands: { id: string; slug: string; name: string }[];
  role: string;
  accounts: AdAccount[];
  account?: AdAccount;
  sync?: Sync;
  latestAttempt?: Sync;
  metrics: CampaignMetric[];
  range: { since: string; until: string };
  selectedBrand?: string;
  tokenConfigured: boolean;
  error?: string;
};
