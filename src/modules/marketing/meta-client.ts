// Transport has no environment access. Only the server-only integration supplies its credential.
import { z } from "zod";
import {
  campaignSchema,
  insightSchema,
  metaAccountId,
  dateRange,
  type MetaErrorCode,
  type MetaSnapshot,
} from "./contract";
export class MetaReadError extends Error {
  constructor(public readonly code: MetaErrorCode) {
    super(code);
    this.name = "MetaReadError";
  }
}
export function safeMetaError(error: unknown): MetaErrorCode {
  return error instanceof MetaReadError ? error.code : "META_UNAVAILABLE";
}
function rejection(status: number, body: unknown): never {
  const code = z
    .object({ error: z.object({ code: z.number().optional() }) })
    .safeParse(body);
  const n = code.success ? code.data.error.code : undefined;
  if (n === 190 || status === 401) throw new MetaReadError("TOKEN_EXPIRED");
  if ([4, 17, 32, 613, 80004].includes(n || 0) || status === 429)
    throw new MetaReadError("RATE_LIMIT");
  if ([10, 100, 200, 294].includes(n || 0) || status === 403)
    throw new MetaReadError("ACCESS_DENIED");
  throw new MetaReadError("META_UNAVAILABLE");
}
export async function readMetaSnapshot({
  token,
  accountId,
  since,
  until,
  version = "v23.0",
  transport = fetch,
}: {
  token: string;
  accountId: string;
  since: string;
  until: string;
  version?: string;
  transport?: typeof fetch;
}): Promise<MetaSnapshot> {
  if (!token) throw new MetaReadError("TOKEN_MISSING");
  if (
    !dateRange.safeParse({ since, until }).success ||
    !metaAccountId.safeParse(accountId).success ||
    !/^v\d{2}\.0$/.test(version)
  )
    throw new MetaReadError("INVALID_RESPONSE");
  const deadline = Date.now() + 45000;
  async function get(path: string, params: Record<string, string> = {}) {
    if (Date.now() >= deadline) throw new MetaReadError("NETWORK");
    const url = new URL(`https://graph.facebook.com/${version}/${path}`);
    for (const [k, v] of Object.entries(params)) url.searchParams.set(k, v);
    let response: Response;
    try {
      response = await transport(url, {
        method: "GET",
        headers: { Authorization: `Bearer ${token}` },
        cache: "no-store",
        redirect: "error",
        signal: AbortSignal.timeout(Math.min(10000, deadline - Date.now())),
      });
    } catch {
      throw new MetaReadError("NETWORK");
    }
    let body: unknown;
    try {
      const raw = await response.text();
      if (raw.length > 5_000_000) throw new Error();
      body = JSON.parse(raw);
    } catch {
      throw new MetaReadError("INVALID_RESPONSE");
    }
    if (!response.ok || (typeof body === "object" && body && "error" in body))
      rejection(response.status, body);
    return body;
  }
  async function list(path: string, params: Record<string, string>) {
    const rows: unknown[] = [];
    let after: string | undefined;
    const visited = new Set<string>();
    for (let page = 0; page < 20; page++) {
      const result = z
        .object({
          data: z.array(z.unknown()),
          paging: z
            .object({
              next: z.string().optional(),
              cursors: z
                .object({ after: z.string().max(4096).optional() })
                .optional(),
            })
            .optional(),
        })
        .safeParse(
          await get(path, {
            ...params,
            limit: "100",
            ...(after ? { after } : {}),
          }),
        );
      if (!result.success) throw new MetaReadError("INVALID_RESPONSE");
      rows.push(...result.data.data);
      if (rows.length > 2000) throw new MetaReadError("TOO_MUCH_DATA");
      if (!result.data.paging?.next) return rows;
      // Never follow paging.next: it can contain credentials or an unexpected host.
      after = result.data.paging.cursors?.after;
      if (!after || visited.has(after))
        throw new MetaReadError("INVALID_RESPONSE");
      visited.add(after);
    }
    throw new MetaReadError("TOO_MUCH_DATA");
  }
  const accountResult = z
    .object({
      id: z.string(),
      name: z.string().max(1000),
      currency: z.string().regex(/^[A-Z]{3}$/),
      timezone_name: z.string().max(100),
      account_status: z.number(),
    })
    .safeParse(
      await get(accountId, {
        fields: "id,name,currency,timezone_name,account_status",
      }),
    );
  if (!accountResult.success || accountResult.data.id !== accountId)
    throw new MetaReadError("INVALID_RESPONSE");
  // Some system-user tokens do not support /me/permissions. Account/insights access remains the effective read check.
  let permissions: MetaSnapshot["permissions"] = {
    checked: false,
    granted: [],
  };
  try {
    const result = z
      .array(z.object({ permission: z.string(), status: z.string() }))
      .safeParse(await list("me/permissions", {}));
    if (result.success)
      permissions = {
        checked: true,
        granted: result.data
          .filter(
            (v) =>
              v.status === "granted" &&
              ["ads_read", "ads_management"].includes(v.permission),
          )
          .map((v) => v.permission),
      };
  } catch (error) {
    if (error instanceof MetaReadError && error.code === "TOKEN_EXPIRED")
      throw error;
  }
  const campaigns = campaignSchema.array().safeParse(
    await list(`${accountId}/campaigns`, {
      fields:
        "id,name,status,effective_status,daily_budget,lifetime_budget,start_time,stop_time,objective",
    }),
  );
  const fields =
    "campaign_id,campaign_name,date_start,date_stop,spend,impressions,reach,clicks,cpc,cpm,actions,action_values";
  const common = { time_range: JSON.stringify({ since, until }), fields };
  const insights = insightSchema
    .array()
    .safeParse(
      await list(`${accountId}/insights`, { ...common, level: "campaign" }),
    );
  const summary = insightSchema.array().safeParse(
    await list(`${accountId}/insights`, {
      ...common,
      fields: fields.replace("campaign_id,campaign_name,", ""),
      level: "account",
    }),
  );
  if (
    !campaigns.success ||
    !insights.success ||
    !summary.success ||
    summary.data.length > 1
  )
    throw new MetaReadError("INVALID_RESPONSE");
  for (const insight of insights.data) {
    if (!insight.campaign_id) throw new MetaReadError("INVALID_RESPONSE");
    if (!campaigns.data.some((c) => c.id === insight.campaign_id)) {
      if (!insight.campaign_name) throw new MetaReadError("INVALID_RESPONSE");
      campaigns.data.push({
        id: insight.campaign_id,
        name: insight.campaign_name,
      });
    }
  }
  return {
    account: accountResult.data,
    permissions,
    campaigns: campaigns.data,
    insights: insights.data,
    summary: summary.data[0] || null,
  };
}
