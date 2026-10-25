import { createClient } from "@supabase/supabase-js";
import { z } from "zod";
import { getSupabaseConfig } from "@/lib/supabase/config";
import { receiveLead } from "@/modules/crm/webhook";
export const runtime = "nodejs";
export async function POST(request: Request) {
  const config = getSupabaseConfig();
  const key = process.env.SUPABASE_SERVICE_ROLE_KEY;
  const secret = process.env.CRM_WEBHOOK_SECRET;
  const organizationId = process.env.CRM_WEBHOOK_ORGANIZATION_ID;
  if (
    !config ||
    !key ||
    !secret ||
    secret.length < 32 ||
    !z.uuid().safeParse(organizationId).success
  )
    return Response.json(
      { error: "Integración CRM no configurada" },
      { status: 503, headers: { "Cache-Control": "no-store" } },
    );
  const client = createClient(config.url, key, {
    auth: { persistSession: false, autoRefreshToken: false },
  });
  return receiveLead(request, {
    secret,
    organizationId: organizationId!,
    ingest: async (event, hash) =>
      client.rpc("crm_ingest_lead", {
        p_organization_id: organizationId,
        p_event: event,
        p_hash: hash,
      }),
  });
}
