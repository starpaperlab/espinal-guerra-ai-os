import { webhookConfigurationIssues } from "./configuration-diagnostics";
import "server-only";
import { randomUUID } from "node:crypto";
import { createClient } from "@supabase/supabase-js";
import { z } from "zod";
import { getSupabaseConfig } from "@/lib/supabase/config";
import { receiveLead } from "@/modules/crm/webhook";
export async function signedIngestion(
  request: Request,
  provider: "n8n" | "signed_backend",
  requiredSourceKey?: string,
) {
  const config = getSupabaseConfig();
  const key = process.env.SUPABASE_SERVICE_ROLE_KEY;
  const secret = process.env.CRM_WEBHOOK_SECRET;
  if (!config || !key || !secret || secret.length < 32) {
    const requestId = randomUUID();
    console.warn(
      JSON.stringify({
        event: "crm_webhook",
        request_id: requestId,
        status: 503,
        code: "NOT_CONFIGURED",
        configuration_issues: webhookConfigurationIssues(process.env),
      }),
    );
    return Response.json(
      { error: "Integración CRM no configurada", request_id: requestId },
      {
        status: 503,
        headers: { "Cache-Control": "no-store", "X-CRM-Request-Id": requestId },
      },
    );
  }
  const client = createClient(config.url, key, {
    auth: { persistSession: false, autoRefreshToken: false },
  });
  return receiveLead(request, {
    requiredSourceKey,
    secret,
    ensureReady: async () => {
      const { data, error } = await client.rpc("crm_inbound_contract_version");
      return !error && data === 5;
    },
    report: (entry) =>
      console.warn(JSON.stringify({ event: "crm_webhook", ...entry })),
    ingest: async (event, hash) => {
      const payload = event as {
        brand_id?: string;
        capture_source_key?: string;
        journey?: unknown;
      };
      if (payload.capture_source_key)
        return client.rpc(
          payload.journey
            ? "crm_ingest_commercial_source"
            : "crm_ingest_configured_source",
          {
            p_source_key: payload.capture_source_key,
            p_provider: provider,
            p_event: event,
            p_hash: hash,
          },
        );
      // Compatibility only: the old n8n route still accepts a validated UUID + pinned env org.
      const legacyOrg = process.env.CRM_WEBHOOK_ORGANIZATION_ID;
      if (
        provider !== "n8n" ||
        !payload.brand_id ||
        !z.uuid().safeParse(legacyOrg).success
      )
        return { data: null, error: { code: "SOURCE_REQUIRED" } };
      return client.rpc("crm_ingest_lead", {
        p_organization_id: legacyOrg,
        p_event: event,
        p_hash: hash,
      });
    },
  });
}
