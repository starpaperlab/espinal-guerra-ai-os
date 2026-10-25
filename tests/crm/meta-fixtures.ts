// Isolated presentation data. Never imported by application routes or used as live metrics.
import type { MarketingData } from "../../src/modules/marketing/contract";
const brand = "10000000-0000-4000-8000-000000000001",
  org = "20000000-0000-4000-8000-000000000001",
  id = "30000000-0000-4000-8000-000000000001";
export const marketingFixture: MarketingData = {
  brands: [{ id: brand, slug: "ceo-rentable-os", name: "CEO Rentable OS" }],
  role: "owner",
  accounts: [],
  metrics: [],
  range: { since: "2026-01-01", until: "2026-01-15" },
  tokenConfigured: true,
};
export const marketingSuccessFixture: MarketingData = {
  ...marketingFixture,
  accounts: [
    {
      id,
      organization_id: org,
      brand_id: brand,
      meta_account_id: "act_1906671039972272",
      name: "Cuenta de prueba de presentación",
      currency: "USD",
      timezone: "America/Santo_Domingo",
      last_synced_at: "2026-01-16T12:00:00Z",
    },
  ],
  sync: {
    id: "40000000-0000-4000-8000-000000000001",
    account_id: id,
    status: "success",
    since: "2026-01-01",
    until: "2026-01-15",
    started_at: "2026-01-16T12:00:00Z",
    finished_at: "2026-01-16T12:00:05Z",
    error_code: null,
    permissions: { checked: true, granted: ["ads_read"] },
    summary: {
      date_start: "2026-01-01",
      date_stop: "2026-01-15",
      spend: "15.5",
      impressions: "1500",
      reach: "1000",
      clicks: "15",
      cpc: "1.03",
      cpm: "10.33",
    },
    campaign_count: 1,
  },
  metrics: [
    {
      campaign_id: "123456",
      campaign: {
        id: "123456",
        name: "Campaña aislada para comprobar legibilidad en todos los tamaños de pantalla",
        status: "PAUSED",
        daily_budget: "1000",
      },
      insight: {
        campaign_id: "123456",
        date_start: "2026-01-01",
        date_stop: "2026-01-15",
        spend: "15.5",
        impressions: "1500",
        reach: "1000",
        clicks: "15",
        cpc: "1.03",
        cpm: "10.33",
        actions: [
          {
            action_type: "onsite_conversion.messaging_conversation_started_7d",
            value: "3",
          },
        ],
      },
    },
  ],
};
marketingSuccessFixture.account = marketingSuccessFixture.accounts[0];
marketingSuccessFixture.latestAttempt = marketingSuccessFixture.sync;
