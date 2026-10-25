/** Adapter for a canonical mapped event, not an export of the existing workflow.
 * No credentials or live record IDs belong in this file.
 * Paste into an authorized n8n Code node only after mapping the actual output.
 */
// eslint-disable-next-line @typescript-eslint/no-require-imports -- n8n Code nodes use CommonJS.
const { createHmac } = require("crypto");
function prepareCrmRequest(input, secret, now = Date.now()) {
  if (typeof secret !== "string" || secret.length < 32)
    throw new Error("CRM_SECRET_MISSING");
  if (!input || typeof input !== "object" || Array.isArray(input))
    throw new Error("CRM_EVENT_REQUIRED");
  if (input.organization_id !== undefined)
    throw new Error("ORGANIZATION_IS_SERVER_CONFIGURED");
  for (const key of [
    "event_id",
    "external_id",
    "brand_id",
    "source",
    "occurred_at",
  ]) {
    if (typeof input[key] !== "string" || !input[key].trim())
      throw new Error(`CRM_FIELD_REQUIRED:${key}`);
  }
  if (input.event_id.length > 160 || input.external_id.length > 160)
    throw new Error("CRM_ID_TOO_LONG");
  if (typeof input.is_test !== "boolean")
    throw new Error("CRM_TEST_FLAG_REQUIRED");
  if (
    !input.contact ||
    typeof input.contact.name !== "string" ||
    !input.contact.name.trim()
  )
    throw new Error("CRM_CONTACT_REQUIRED");
  let score = input.score ?? null;
  if (typeof score === "string" && /^\d{1,3}$/.test(score.trim()))
    score = Number(score.trim());
  const classification =
    input.classification == null
      ? null
      : String(input.classification).trim().toUpperCase();
  const evaluatedAt = input.evaluated_at ?? null;
  if (
    !(score === null && classification === null && evaluatedAt === null) &&
    !(
      Number.isInteger(score) &&
      score >= 0 &&
      score <= 100 &&
      ["HOT", "WARM", "COLD"].includes(classification) &&
      typeof evaluatedAt === "string"
    )
  )
    throw new Error("CRM_EVALUATION_INCOMPLETE");
  const text = (key) => (input[key] == null ? "" : String(input[key]));
  const event = {
    type: "lead.created",
    event_id: input.event_id,
    external_id: input.external_id,
    brand_id: input.brand_id,
    contact: {
      name: input.contact.name,
      company: input.contact.company ?? "",
      email: input.contact.email ?? "",
      phone: input.contact.phone ?? "",
    },
    source: input.source,
    campaign: text("campaign"),
    message: text("message"),
    budget: text("budget"),
    urgency: text("urgency"),
    service: text("service"),
    need: text("need"),
    score,
    classification,
    problem: text("problem"),
    opportunity: text("opportunity"),
    recommendation: text("recommendation"),
    next_action: text("next_action"),
    occurred_at: input.occurred_at,
    evaluated_at: evaluatedAt,
    is_test: input.is_test,
  };
  const body = JSON.stringify(event);
  if (Buffer.byteLength(body, "utf8") > 32768)
    throw new Error("CRM_EVENT_TOO_LARGE");
  const timestamp = String(Math.floor(now / 1000));
  const signature = createHmac("sha256", secret)
    .update(timestamp + "." + body)
    .digest("hex");
  return {
    body,
    headers: {
      "Content-Type": "application/json",
      "X-CRM-Timestamp": timestamp,
      "X-CRM-Signature": "sha256=" + signature,
    },
  };
}
if (typeof module !== "undefined") module.exports = { prepareCrmRequest };

/** Dot paths are explicit configuration; never eval model output or guess field names. */
function prepareMappedCrmRequest(source, mapping, secret, now = Date.now()) {
  const fields = [
    "event_id",
    "external_id",
    "brand_id",
    "source",
    "campaign",
    "message",
    "budget",
    "urgency",
    "service",
    "need",
    "score",
    "classification",
    "problem",
    "opportunity",
    "recommendation",
    "next_action",
    "occurred_at",
    "evaluated_at",
    "is_test",
    "contact.name",
    "contact.company",
    "contact.email",
    "contact.phone",
  ];
  if (!mapping || mapping.version !== 1) throw new Error("CRM_MAPPING_VERSION");
  const paths = mapping.paths || {};
  const constants = mapping.constants || {};
  for (const field of [...Object.keys(paths), ...Object.keys(constants)])
    if (!fields.includes(field)) throw new Error("CRM_UNKNOWN_MAPPING_FIELD");
  const event = { contact: {} };
  for (const field of fields) {
    let value;
    if (Object.hasOwn(constants, field) && constants[field] !== null)
      value = constants[field];
    else if (paths[field] != null) {
      if (typeof paths[field] !== "string" || !paths[field])
        throw new Error("CRM_INVALID_FIELD_PATH");
      value = source;
      for (const part of paths[field].split(".")) {
        if (["__proto__", "prototype", "constructor"].includes(part))
          throw new Error("CRM_UNSAFE_FIELD_PATH");
        value =
          value && typeof value === "object" && Object.hasOwn(value, part)
            ? value[part]
            : undefined;
      }
    }
    if (value !== undefined) {
      if (field.startsWith("contact.")) event.contact[field.slice(8)] = value;
      else event[field] = value;
    }
  }
  return prepareCrmRequest(event, secret, now);
}
if (typeof module !== "undefined")
  module.exports.prepareMappedCrmRequest = prepareMappedCrmRequest;
