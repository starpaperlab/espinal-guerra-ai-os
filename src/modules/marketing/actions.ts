"use server";
import "server-only";
import { redirect } from "next/navigation";
import { revalidatePath } from "next/cache";
import { z } from "zod";
import { crmContext } from "@/modules/crm/data";
import { dateRange, initialMetaAccount, type MetaErrorCode } from "./contract";
import { readMetaSnapshot, safeMetaError } from "./meta-client";
async function adminContext() {
  const context = await crmContext();
  if (!["owner", "admin"].includes(context.membership.role))
    redirect("/marketing?resultado=acceso");
  return context;
}
function finish(
  result: string,
  range?: { since: string; until: string },
  account?: string,
): never {
  revalidatePath("/marketing");
  const q = new URLSearchParams({ resultado: result });
  if (range) {
    q.set("desde", range.since);
    q.set("hasta", range.until);
  }
  if (account) q.set("cuenta", account);
  redirect("/marketing?" + q);
}
export async function bindCeoMetaAccount() {
  const { client, organizationId } = await adminContext();
  const brands = await client
    .from("brands")
    .select("id,slug,name")
    .eq("organization_id", organizationId);
  if (brands.error) finish("marca");
  const matches = (brands.data || []).filter(
    (b) =>
      ["ceo-rentable-os", "ceo-rentable"].includes(b.slug) ||
      b.name.trim().toLowerCase() === "ceo rentable os",
  );
  if (matches.length !== 1) finish("marca");
  const { error } = await client.rpc("marketing_bind_meta_account", {
    p_organization_id: organizationId,
    p_brand_id: matches[0].id,
    p_meta_account_id: initialMetaAccount,
  });
  finish(error ? "vinculacion_error" : "vinculada");
}
export async function syncMetaAccount(form: FormData) {
  const { client, organizationId } = await adminContext();
  const id = z.uuid().safeParse(form.get("account_id"));
  const range = dateRange.safeParse({
    since: form.get("desde"),
    until: form.get("hasta"),
  });
  if (!id.success || !range.success) finish("fechas");
  const { data: account, error } = await client
    .from("marketing_ad_accounts")
    .select("id,meta_account_id")
    .eq("organization_id", organizationId)
    .eq("id", id.data)
    .maybeSingle();
  if (error || !account) finish("acceso");
  const start = await client.rpc("marketing_start_meta_sync", {
    p_account_id: account.id,
    p_since: range.data.since,
    p_until: range.data.until,
  });
  if (start.error || !start.data)
    finish(
      start.error?.code === "55P03" ? "esperar" : "SAVE_FAILED",
      range.data,
      account.id,
    );
  let code: MetaErrorCode | undefined;
  try {
    const snapshot = await readMetaSnapshot({
      token: process.env.META_ACCESS_TOKEN?.trim() || "",
      accountId: account.meta_account_id,
      ...range.data,
      version: process.env.META_GRAPH_API_VERSION || "v23.0",
    });
    const saved = await client.rpc("marketing_finish_meta_sync", {
      p_sync_id: start.data,
      p_snapshot: snapshot,
    });
    if (saved.error) code = "SAVE_FAILED";
  } catch (error) {
    code = safeMetaError(error);
  }
  if (code) {
    await client.rpc("marketing_finish_meta_sync", {
      p_sync_id: start.data,
      p_error_code: code,
    });
    finish(code, range.data, account.id);
  }
  finish("sincronizada", range.data, account.id);
}
