/** Contratos para futuras implementaciones. No ejecutan solicitudes ni automatizaciones. */
export type IntegrationProvider =
  "n8n" | "google-sheets" | "github" | "commercial-system";
export interface IntegrationContext {
  organizationId: string;
  brandId: string;
  requestedBy: string;
}
export interface IntegrationAdapter {
  provider: IntegrationProvider;
  status: "not-configured" | "connected";
}
export const plannedIntegrations: IntegrationAdapter[] = [
  "n8n",
  "google-sheets",
  "github",
  "commercial-system",
].map((provider) => ({
  provider: provider as IntegrationProvider,
  status: "not-configured",
}));
