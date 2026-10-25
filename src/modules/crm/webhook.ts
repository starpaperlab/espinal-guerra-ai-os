import {
  createHash,
  createHmac,
  timingSafeEqual,
  randomUUID,
} from "node:crypto";
import { webhookSchema } from "./schema";
export function verifySignature(
  secret: string,
  timestamp: string,
  signature: string,
  body: string,
  now = Date.now(),
) {
  if (
    !/^\d{10}$/.test(timestamp) ||
    Math.abs(now / 1000 - Number(timestamp)) > 300 ||
    !/^sha256=[a-f0-9]{64}$/.test(signature)
  )
    return false;
  const expected = createHmac("sha256", secret)
    .update(timestamp + "." + body)
    .digest();
  return timingSafeEqual(expected, Buffer.from(signature.slice(7), "hex"));
}
type Dependencies = {
  secret: string;
  organizationId?: string;
  requiredSourceKey?: string;
  ingest: (
    event: unknown,
    hash: string,
  ) => Promise<{ data: unknown; error: { code?: string } | null }>;
  now?: number;
  ensureReady?: () => Promise<boolean>;
  report?: (entry: {
    request_id: string;
    status: number;
    code: string;
  }) => void;
};
export async function receiveLead(
  request: Request,
  deps: Dependencies,
): Promise<Response> {
  const requestId = randomUUID();
  const json = (body: Record<string, unknown>, status: number, code = "") => {
    if (status >= 400 && deps.report) {
      try {
        deps.report({
          request_id: requestId,
          status,
          code: code || `HTTP_${status}`,
        });
      } catch {
        /* Diagnostic transport must not change receiver behavior. */
      }
    }
    return Response.json(
      status >= 400 ? { ...body, request_id: requestId } : body,
      {
        status,
        headers: { "Cache-Control": "no-store", "X-CRM-Request-Id": requestId },
      },
    );
  };
  const timestamp = request.headers.get("x-crm-timestamp") || "";
  const signature = request.headers.get("x-crm-signature") || "";
  if (
    request.headers.get("content-type")?.split(";")[0].trim().toLowerCase() !==
    "application/json"
  )
    return json({ error: "Se requiere JSON" }, 415, "CONTENT_TYPE");
  if (
    !/^\d{10}$/.test(timestamp) ||
    Math.abs((deps.now ?? Date.now()) / 1000 - Number(timestamp)) > 300
  )
    return json({ error: "Firma inválida o expirada" }, 401, "AUTH_INVALID");
  const reader = request.body?.getReader();
  if (!reader) return json({ error: "Contenido vacío" }, 400, "EMPTY_BODY");
  let size = 0;
  const chunks: Uint8Array[] = [];
  try {
    while (true) {
      const { done, value } = await reader.read();
      if (done) break;
      size += value.byteLength;
      if (size > 32768) {
        await reader.cancel();
        return json(
          { error: "Contenido demasiado grande" },
          413,
          "BODY_TOO_LARGE",
        );
      }
      chunks.push(value);
    }
  } catch {
    return json({ error: "No se pudo leer el evento" }, 400, "READ_FAILED");
  }
  let body: string;
  try {
    body = new TextDecoder("utf-8", { fatal: true }).decode(
      Buffer.concat(chunks),
    );
  } catch {
    return json({ error: "Codificación inválida" }, 400, "INVALID_UTF8");
  }
  if (!verifySignature(deps.secret, timestamp, signature, body, deps.now))
    return json({ error: "Firma inválida o expirada" }, 401, "AUTH_INVALID");
  let raw: unknown;
  try {
    raw = JSON.parse(body);
  } catch {
    return json({ error: "JSON inválido" }, 400, "INVALID_JSON");
  }
  const parsed = webhookSchema.safeParse(raw);
  if (!parsed.success)
    return json(
      {
        error: "El evento no cumple el contrato CRM",
        fields: parsed.error.issues
          .map((issue) => issue.path.join("."))
          .slice(0, 12),
      },
      400,
      "INVALID_PAYLOAD",
    );
  if (
    deps.requiredSourceKey &&
    parsed.data.capture_source_key !== deps.requiredSourceKey
  )
    return json(
      { error: "La fuente firmada no coincide con el destino autorizado" },
      422,
      "SOURCE_MISMATCH",
    );
  try {
    if (deps.ensureReady && !(await deps.ensureReady()))
      return json(
        {
          error:
            "No se pudo verificar el contrato de recepción; revisa la migración y credenciales del servidor",
        },
        503,
        "CONTRACT_NOT_READY",
      );
    const result = await deps.ingest(
      parsed.data,
      createHash("sha256").update(body).digest("hex"),
    );
    if (result.error)
      return json(
        {
          error:
            result.error.code === "23505"
              ? "Identificador reutilizado con otro contenido"
              : "No se pudo registrar el evento",
        },
        result.error.code === "23505"
          ? 409
          : result.error.code === "23503"
            ? 422
            : 503,
        /^[A-Z0-9_]{1,16}$/.test(result.error.code || "")
          ? `DB_${result.error.code}`
          : "DB_UNAVAILABLE",
      );
    return json(result.data as Record<string, unknown>, 200);
  } catch {
    return json(
      { error: "Servicio temporalmente no disponible" },
      503,
      "INGEST_UNAVAILABLE",
    );
  }
}
