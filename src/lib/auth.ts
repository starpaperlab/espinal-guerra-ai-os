import "server-only";
import { cache } from "react";
import { redirect } from "next/navigation";
import { createClient } from "./supabase/server";
export const requireWorkspace = cache(async () => {
  const supabase = await createClient();
  if (!supabase) redirect("/configuracion-pendiente");
  const {
    data: { user },
    error,
  } = await supabase.auth.getUser();
  if (error || !user) redirect("/login");
  const { data, error: membershipError } = await supabase
    .from("organization_members")
    .select("organization_id, role, organizations(name)")
    .eq("user_id", user.id)
    .limit(1)
    .maybeSingle();
  if (membershipError || !data) redirect("/acceso-pendiente");
  return { user, membership: data };
});
