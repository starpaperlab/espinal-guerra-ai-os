import { test } from "node:test";
import assert from "node:assert/strict";
import {
  readMetaSnapshot,
  safeMetaError,
  MetaReadError,
} from "../../src/modules/marketing/meta-client";
import {
  dateRange,
  initialMetaAccount,
} from "../../src/modules/marketing/contract";
const credential = "unit-test-credential-not-a-real-token";
const range = { since: "2026-01-01", until: "2026-01-15" };
const account = {
  id: initialMetaAccount,
  name: "Cuenta de prueba aislada",
  currency: "USD",
  timezone_name: "America/Santo_Domingo",
  account_status: 1,
};
const calls: { url: URL; init: RequestInit }[] = [];
function transport(handler: (url: URL) => unknown): typeof fetch {
  return (async (input, init) => {
    const url = new URL(String(input));
    calls.push({ url, init: init! });
    const value = handler(url);
    return value instanceof Response ? value : Response.json(value);
  }) as typeof fetch;
}
function happy(url: URL): unknown {
  if (url.pathname.endsWith("/permissions"))
    return {
      data: [
        { permission: "ads_read", status: "granted" },
        { permission: "ads_management", status: "declined" },
        { permission: "email", status: "granted" },
      ],
    };
  if (url.pathname.endsWith("/campaigns"))
    return {
      data: [
        {
          id: "12345",
          name: "Campaña de fixture",
          status: "PAUSED",
          daily_budget: "1000",
        },
      ],
    };
  if (url.pathname.endsWith("/insights"))
    return {
      data: [
        {
          ...range,
          date_start: range.since,
          date_stop: range.until,
          ...(url.searchParams.get("level") === "campaign"
            ? { campaign_id: "12345" }
            : {}),
          spend: "4.25",
          impressions: "100",
          reach: "80",
          clicks: "2",
          cpc: "2.125",
          cpm: "42.5",
          actions: [{ action_type: "link_click", value: "2" }],
        },
      ],
    };
  return account;
}
test("Meta usa solo GET, Authorization servidor, host fijo y métricas originales", async () => {
  calls.length = 0;
  const snapshot = await readMetaSnapshot({
    token: credential,
    accountId: initialMetaAccount,
    ...range,
    transport: transport(happy),
  });
  assert.equal(snapshot.campaigns[0].daily_budget, "1000");
  assert.equal(snapshot.summary?.reach, "80");
  assert.equal(snapshot.insights[0].spend, "4.25");
  assert.deepEqual(snapshot.permissions, {
    checked: true,
    granted: ["ads_read"],
  });
  assert.ok(!JSON.stringify(snapshot).includes(credential));
  assert.equal(calls.length, 5);
  for (const call of calls) {
    assert.equal(call.init.method, "GET");
    assert.equal(call.url.hostname, "graph.facebook.com");
    assert.equal(call.init.redirect, "error");
    assert.equal(call.init.cache, "no-store");
    assert.equal(
      (call.init.headers as Record<string, string>).Authorization,
      `Bearer ${credential}`,
    );
    assert.ok(!call.url.href.includes(credential));
    assert.ok(!call.url.searchParams.has("access_token"));
  }
});
test("Cuenta sin campañas ni actividad conserva vacío y no inventa ceros", async () => {
  const snapshot = await readMetaSnapshot({
    token: credential,
    accountId: initialMetaAccount,
    ...range,
    transport: transport((url) =>
      url.pathname.endsWith(initialMetaAccount) ? account : { data: [] },
    ),
  });
  assert.deepEqual(snapshot.campaigns, []);
  assert.deepEqual(snapshot.insights, []);
  assert.equal(snapshot.summary, null);
});
test("Paginación usa cursor en host fijo y nunca sigue next con token o host ajeno", async () => {
  calls.length = 0;
  const snapshot = await readMetaSnapshot({
    token: credential,
    accountId: initialMetaAccount,
    ...range,
    transport: transport((url) => {
      if (!url.pathname.endsWith("/campaigns")) return happy(url);
      if (!url.searchParams.has("after"))
        return {
          data: [{ id: "12345", name: "Primera", status: "ACTIVE" }],
          paging: {
            next: `https://untrusted.example/?access_token=${credential}`,
            cursors: { after: "cursor2" },
          },
        };
      return { data: [{ id: "67890", name: "Segunda", status: "PAUSED" }] };
    }),
  });
  assert.equal(snapshot.campaigns.length, 2);
  assert.ok(calls.every((c) => c.url.hostname === "graph.facebook.com"));
  assert.ok(calls.some((c) => c.url.searchParams.get("after") === "cursor2"));
});
test("Permisos no enumerables no se presentan como comprobados", async () => {
  const snapshot = await readMetaSnapshot({
    token: credential,
    accountId: initialMetaAccount,
    ...range,
    transport: transport((url) =>
      url.pathname.endsWith("/permissions")
        ? Response.json(
            { error: { code: 100, message: credential } },
            { status: 400 },
          )
        : happy(url),
    ),
  });
  assert.deepEqual(snapshot.permissions, { checked: false, granted: [] });
  assert.equal(snapshot.campaigns.length, 1);
});
test("Campañas históricas conservan nombre de insight sin inventar presupuesto o estado", async () => {
  const snapshot = await readMetaSnapshot({
    token: credential,
    accountId: initialMetaAccount,
    ...range,
    transport: transport((url) =>
      url.pathname.endsWith("/campaigns")
        ? { data: [] }
        : url.pathname.endsWith("/insights") &&
            url.searchParams.get("level") === "campaign"
          ? {
              data: [
                {
                  campaign_id: "999",
                  campaign_name: "Histórica",
                  date_start: range.since,
                  date_stop: range.until,
                  spend: "1",
                },
              ],
            }
          : happy(url),
    ),
  });
  assert.deepEqual(snapshot.campaigns, [{ id: "999", name: "Histórica" }]);
});
for (const [metaCode, expected] of [
  [190, "TOKEN_EXPIRED"],
  [200, "ACCESS_DENIED"],
  [100, "ACCESS_DENIED"],
  [4, "RATE_LIMIT"],
  [2, "META_UNAVAILABLE"],
] as const)
  test(`Error Meta ${metaCode} es seguro: ${expected}`, async () => {
    await assert.rejects(
      () =>
        readMetaSnapshot({
          token: credential,
          accountId: initialMetaAccount,
          ...range,
          transport: transport(() =>
            Response.json(
              { error: { code: metaCode, message: `private ${credential}` } },
              { status: 400 },
            ),
          ),
        }),
      (error) =>
        error instanceof MetaReadError &&
        error.code === expected &&
        !String(error).includes(credential),
    );
  });
test("Errores de transporte, JSON inválido, token ausente y cuenta manipulada no filtran secretos", async () => {
  assert.equal(safeMetaError(new Error(credential)), "META_UNAVAILABLE");
  await assert.rejects(
    () =>
      readMetaSnapshot({
        token: credential,
        accountId: initialMetaAccount,
        ...range,
        transport: (async () => {
          throw new Error(credential);
        }) as typeof fetch,
      }),
    { code: "NETWORK" },
  );
  await assert.rejects(
    () =>
      readMetaSnapshot({
        token: credential,
        accountId: initialMetaAccount,
        ...range,
        transport: transport(() => new Response("not-json")),
      }),
    { code: "INVALID_RESPONSE" },
  );
  await assert.rejects(
    () =>
      readMetaSnapshot({ token: "", accountId: initialMetaAccount, ...range }),
    { code: "TOKEN_MISSING" },
  );
  await assert.rejects(
    () => readMetaSnapshot({ token: credential, accountId: "../me", ...range }),
    { code: "INVALID_RESPONSE" },
  );
});
test("Fechas imposibles, futuras, invertidas e intervalos excesivos se rechazan", () => {
  for (const range of [
    { since: "2026-02-30", until: "2026-03-02" },
    { since: "2026-03-02", until: "2026-03-01" },
    { since: "2099-01-01", until: "2099-01-02" },
    { since: "2025-01-01", until: "2026-01-01" },
  ])
    assert.equal(dateRange.safeParse(range).success, false);
  assert.equal(
    dateRange.safeParse({ since: "2026-01-01", until: "2026-01-15" }).success,
    true,
  );
});
