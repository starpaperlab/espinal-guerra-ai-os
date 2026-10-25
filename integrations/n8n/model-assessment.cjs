/** Parses one observed Message a model result. Never executes text or pairs multiple leads. */
function extractModelAssessment(response) {
  const item = Array.isArray(response)
    ? response.length === 1
      ? response[0]
      : null
    : response;
  if (!item || !Array.isArray(item.output))
    throw new Error("CRM_MODEL_ENVELOPE");
  const texts = item.output.flatMap((message) =>
    Array.isArray(message?.content)
      ? message.content
          .filter(
            (part) =>
              part?.type === "output_text" && typeof part.text === "string",
          )
          .map((part) => part.text)
      : [],
  );
  if (texts.length !== 1) throw new Error("CRM_MODEL_AMBIGUOUS_TEXT");
  if (Buffer.byteLength(texts[0], "utf8") > 16384)
    throw new Error("CRM_MODEL_TEXT_TOO_LARGE");
  let value;
  try {
    value = JSON.parse(texts[0]);
  } catch {
    throw new Error("CRM_MODEL_INVALID_JSON");
  }
  if (!value || typeof value !== "object" || Array.isArray(value))
    throw new Error("CRM_MODEL_INVALID_ASSESSMENT");
  if (
    !Number.isInteger(value.lead_score) ||
    value.lead_score < 0 ||
    value.lead_score > 100 ||
    !["HOT", "WARM", "COLD"].includes(value.classification)
  )
    throw new Error("CRM_MODEL_INVALID_SCORING");
  const result = {
    lead_score: value.lead_score,
    classification: value.classification,
  };
  for (const field of [
    "priority",
    "main_problem",
    "commercial_opportunity",
    "recommended_action",
    "response_suggestion",
  ]) {
    if (value[field] !== undefined) {
      if (
        typeof value[field] !== "string" ||
        value[field].length > (field === "priority" ? 50 : 10000)
      )
        throw new Error(`CRM_MODEL_INVALID_FIELD:${field}`);
      result[field] = value[field];
    }
  }
  if (value.route_to_sales !== undefined) {
    if (typeof value.route_to_sales !== "boolean")
      throw new Error("CRM_MODEL_INVALID_ROUTE_FLAG");
    result.route_to_sales = value.route_to_sales;
  }
  if (value.scoring_breakdown !== undefined) {
    const b = value.scoring_breakdown;
    if (
      !b ||
      typeof b !== "object" ||
      Array.isArray(b) ||
      Object.keys(b).length > 20 ||
      Object.entries(b).some(
        ([k, v]) =>
          !k ||
          k.length > 100 ||
          typeof v !== "number" ||
          !Number.isFinite(v) ||
          v < 0 ||
          v > 100,
      )
    )
      throw new Error("CRM_MODEL_INVALID_BREAKDOWN");
    result.scoring_breakdown = b;
  }
  return result;
}
if (typeof module !== "undefined") module.exports = { extractModelAssessment };
