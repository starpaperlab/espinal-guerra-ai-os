/** Execution capabilities are deliberately not advertised as active. */
export const nativeCapabilities = {
  dynamicForms: { state: "schema_only", active: false },
  crmCapture: { state: "session_crm_and_signed_gateway", active: true },
  segmentation: { state: "conditions_schema_only", active: false },
  aiEvaluation: { state: "provider_not_connected", active: false },
  resendEmail: { state: "provider_not_connected", active: false },
  scheduling: { state: "durable_outbox_no_worker", active: false },
  executionHistory: { state: "queue_leases_and_attempts", active: true },
  conversions: { state: "schema_only", active: false },
} as const;
export type NativeExecutionContext = {
  organizationId: string;
  brandId: string;
  leadId: string;
  isTest: boolean;
};
export interface LeadEvaluator {
  evaluate(context: NativeExecutionContext): Promise<{
    score: number;
    classification: "HOT" | "WARM" | "COLD";
    recommendation: string;
  }>;
}
export interface DiagnosticEmailTransport {
  sendApproved(
    context: NativeExecutionContext & {
      approvalId: string;
      consentReference: string;
      templateVersion: string;
    },
  ): Promise<{ providerMessageId: string }>;
}
// No fake evaluator, email sender or commercial worker is installed.
