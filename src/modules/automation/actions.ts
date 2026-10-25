"use server";
import { captureFormSchema } from "./schema";
import { redirect } from "next/navigation";
import { revalidatePath } from "next/cache";
import { z } from "zod";
import { crmContext } from "@/modules/crm/data";
async function adminContext() {
  const context = await crmContext();
  if (!["owner", "admin"].includes(context.membership.role))
    redirect("/configuracion?resultado=acceso");
  return context;
}
function finish(result: string): never {
  revalidatePath("/configuracion");
  revalidatePath("/dashboard");
  revalidatePath("/marcas");
  redirect("/configuracion?resultado=" + result);
}
export async function reconcileEnterprise() {
  const { client, organizationId } = await adminContext();
  const { error } = await client.rpc("crm_reconcile_enterprise", {
    p_org: organizationId,
  });
  finish(error ? "revisar_auditoria" : "verificado");
}
export async function saveCaptureSource(form: FormData) {
  const { client, organizationId } = await adminContext();
  const parsed = z
    .object({
      source_key: z.string().regex(/^[a-z0-9][a-z0-9_-]{2,99}$/),
      name: z.string().trim().min(1).max(160),
      brand_id: z.uuid(),
      provider: z.enum(["native", "n8n", "signed_backend"]),
    })
    .safeParse(
      Object.fromEntries(
        ["source_key", "name", "brand_id", "provider"].map((k) => [
          k,
          String(form.get(k) || ""),
        ]),
      ),
    );
  if (!parsed.success) finish("validacion");
  let rawSchema: unknown;
  try {
    rawSchema = JSON.parse(String(form.get("form_schema") || '{"fields":[]}'));
  } catch {
    finish("validacion");
  }
  const definition = captureFormSchema.safeParse(rawSchema);
  if (!definition.success) finish("validacion");

  const { error } = await client.from("crm_capture_sources").insert({
    ...parsed.data,
    organization_id: organizationId,
    enabled: false,
    form_schema: definition.data,
  });
  finish(error ? "no_guardado" : "fuente_creada");
}
export async function setCaptureSourceState(form: FormData) {
  const { client, organizationId } = await adminContext();
  const id = z.uuid().safeParse(form.get("id"));
  if (!id.success) finish("validacion");
  const { data, error } = await client
    .from("crm_capture_sources")
    .update({ enabled: form.get("enabled") === "true" })
    .eq("organization_id", organizationId)
    .eq("id", id.data)
    .select("id")
    .maybeSingle();
  finish(error || !data ? "no_guardado" : "actualizado");
}
export async function saveDraftAutomation(form: FormData) {
  const { client, organizationId } = await adminContext();
  const parsed = z
    .object({
      brand_id: z.uuid(),
      name: z.string().trim().min(1).max(160),
      definition_key: z.string().regex(/^[a-z0-9][a-z0-9_-]{2,99}$/),
    })
    .safeParse({
      brand_id: String(form.get("brand_id") || ""),
      name: String(form.get("name") || ""),
      definition_key: String(form.get("definition_key") || ""),
    });
  if (!parsed.success) finish("validacion");
  const { error } = await client.from("native_automation_definitions").insert({
    ...parsed.data,
    organization_id: organizationId,
    status: "draft",
    plan: {
      version: 1,
      conditions: [],
      steps: [],
      execution: "not_implemented",
    },
  });
  finish(error ? "no_guardado" : "borrador_creado");
}
