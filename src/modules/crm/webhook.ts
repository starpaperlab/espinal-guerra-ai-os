import { createHash, createHmac, timingSafeEqual } from "node:crypto";
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
  organizationId: string;
  ingest: (
    event: unknown,
    hash: string,
  ) => Promise<{ data: unknown; error: { code?: string } | null }>;
  now?: number;
};
export async function receiveLead(
  request: Request,
  deps: Dependencies,
): Promise<Response> {
  const json = (body: unknown, status: number) =>
    Response.json(body, { status, headers: { "Cache-Control": "no-store" } });
  const timestamp = request.headers.get("x-crm-timestamp") || "";
  const signature = request.headers.get("x-crm-signature") || "";
  if (
    !request.headers
      .get("content-type")
      ?.toLowerCase()
      .startsWith("application/json")
  )
    return json({ error: "Se requiere JSON" }, 415);
  if (
    !/^\d{10}$/.test(timestamp) ||
    Math.abs((deps.now ?? Date.now()) / 1000 - Number(timestamp)) > 300
  )
    return json({ error: "Firma inválida o expirada" }, 401);
  const reader = request.body?.getReader();
  if (!reader) return json({ error: "Contenido vacío" }, 400);
  let size = 0;
  const chunks: Uint8Array[] = [];
  try {
    while (true) {
      const { done, value } = await reader.read();
      if (done) break;
      size += value.byteLength;
      if (size > 32768) {
        await reader.cancel();
        return json({ error: "Contenido demasiado grande" }, 413);
      }
      chunks.push(value);
    }
  } catch {
    return json({ error: "No se pudo leer el evento" }, 400);
  }
  let body: string;
  try {
    body = new TextDecoder("utf-8", { fatal: true }).decode(
      Buffer.concat(chunks),
    );
  } catch {
    return json({ error: "Codificación inválida" }, 400);
  }
  if (!verifySignature(deps.secret, timestamp, signature, body, deps.now))
    return json({ error: "Firma inválida o expirada" }, 401);
  let raw: unknown;
  try {
    raw = JSON.parse(body);
  } catch {
    return json({ error: "JSON inválido" }, 400);
  }
  const parsed = webhookSchema.safeParse(raw);
  if (!parsed.success)
    return json({ error: "El evento no cumple el contrato CRM" }, 400);
  try {
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
      );
    return json(result.data, 200);
  } catch {
    return json({ error: "Servicio temporalmente no disponible" }, 503);
  }
}
