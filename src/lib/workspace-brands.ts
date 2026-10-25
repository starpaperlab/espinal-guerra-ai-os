import "server-only";
import { requireWorkspace } from "./auth";
import { createClient } from "./supabase/server";
import { workspaceBrands } from "@/modules/workspace-brands";
export async function loadWorkspaceBrands() {
  const { membership } = await requireWorkspace();
  const client = await createClient();
  if (!client)
    return { brands: [], error: "No se pudieron consultar las marcas." };
  const { data, error } = await client
    .from("brands")
    .select("id,slug,name")
    .eq("organization_id", membership.organization_id)
    .order("name");
  return {
    brands: workspaceBrands(data || []),
    error: error
      ? "No se pudieron consultar las marcas registradas."
      : undefined,
  };
}
