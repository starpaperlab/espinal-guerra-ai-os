/** Confirmed flat Code in JavaScript output + explicit n8n transport context.
 * No model parsing, invented contact data or identity based on email/name.
 */
function normalizeN8nLead(lead, context) {
  if (!lead || typeof lead !== "object" || Array.isArray(lead))
    throw new Error("CRM_FLAT_LEAD_REQUIRED");
  if (!context || typeof context !== "object")
    throw new Error("CRM_CONTEXT_REQUIRED");
  for (const key of ["workflow_id", "execution_id", "observed_at"]) {
    if (typeof context[key] !== "string" || !context[key].trim())
      throw new Error(`CRM_CONTEXT_REQUIRED:${key}`);
  }
  if (
    !context.capture_source_key &&
    (typeof context.brand_id !== "string" || !context.brand_id.trim())
  )
    throw new Error("CRM_DESTINATION_REQUIRED");
  if (!Number.isSafeInteger(context.item_index) || context.item_index < 0)
    throw new Error("CRM_ITEM_INDEX_REQUIRED");
  if (typeof context.is_test !== "boolean")
    throw new Error("CRM_TEST_FLAG_REQUIRED");
  if (lead.is_test !== undefined && typeof lead.is_test !== "boolean")
    throw new Error("CRM_SOURCE_TEST_FLAG_INVALID");
  const date = (value) =>
    typeof value === "string" &&
    /^\d{4}-\d{2}-\d{2}T.*(?:Z|[+-]\d{2}:\d{2})$/.test(value) &&
    Number.isFinite(Date.parse(value));
  for (const key of ["observed_at", "captured_at", "evaluated_at"])
    if (context[key] != null && !date(context[key]))
      throw new Error(`CRM_CONTEXT_DATE:${key}`);
  if (
    context.source_event_id != null &&
    (typeof context.source_event_id !== "string" ||
      !context.source_event_id.trim() ||
      context.source_event_id.length > 500)
  )
    throw new Error("CRM_SOURCE_ID_INVALID");
  // eslint-disable-next-line @typescript-eslint/no-require-imports -- n8n Code nodes use CommonJS.
  const { createHash } = require("crypto");
  const digest = (value) =>
    createHash("sha256").update(JSON.stringify(value)).digest("hex");
  const executionKey = digest([
    context.workflow_id,
    context.execution_id,
    context.item_index,
  ]);
  const sourceKey = context.source_event_id
    ? digest([lead.source, context.source_event_id])
    : null;
  const optionalText = (key) => {
    const value = lead[key];
    if (value == null) return "";
    if (typeof value === "string") return value;
    if (key === "budget" && typeof value === "number" && Number.isFinite(value))
      return String(value);
    throw new Error(`CRM_FLAT_TEXT:${key}`);
  };
  const monthly = lead.monthly_leads ?? null;
  if (
    monthly !== null &&
    !(typeof monthly === "string" && monthly.length <= 300) &&
    !(
      typeof monthly === "number" &&
      Number.isSafeInteger(monthly) &&
      monthly >= 0
    )
  )
    throw new Error("CRM_MONTHLY_LEADS_INVALID");
  const hasEvaluation = lead.lead_score != null || lead.classification != null;
  return {
    type: "lead.created",
    event_id: "n8n-execution:" + executionKey,
    external_id: sourceKey
      ? "source-event:" + sourceKey
      : "n8n-execution:" + executionKey,
    brand_id: context.brand_id,
    capture_source_key: context.capture_source_key,
    contact: {
      name: lead.name,
      email: optionalText("email"),
      phone: optionalText("phone"),
      company: optionalText("company"),
    },
    source: lead.source,
    service: optionalText("service_interest"),
    message: optionalText("message"),
    monthly_leads: monthly,
    budget: optionalText("budget"),
    urgency: optionalText("urgency"),
    score: lead.lead_score ?? null,
    classification: lead.classification ?? null,
    priority: lead.priority ?? null,
    route_to_sales: lead.route_to_sales ?? null,
    problem: optionalText("main_problem"),
    opportunity: optionalText("commercial_opportunity"),
    recommendation: optionalText("recommended_action"),
    response_suggestion: optionalText("response_suggestion"),
    scoring_breakdown: lead.scoring_breakdown ?? {},
    next_action: "",
    occurred_at: context.captured_at || context.observed_at,
    evaluated_at: hasEvaluation
      ? context.evaluated_at || context.observed_at
      : null,
    capture_context: {
      identity_scope: sourceKey ? "source_event" : "n8n_execution",
      capture_time_source: context.captured_at ? "source" : "n8n_observed",
      evaluation_time_source: hasEvaluation
        ? context.evaluated_at
          ? "source"
          : "n8n_observed"
        : null,
    },
    is_test:
      context.is_test ||
      lead.is_test === true ||
      (context.execution_mode != null &&
        context.execution_mode !== "production"),
  };
}
if (typeof module !== "undefined") module.exports = { normalizeN8nLead };
