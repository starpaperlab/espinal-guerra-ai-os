"use server";
import { redirect } from "next/navigation";
import { createClient } from "@/lib/supabase/server";
export async function signIn(form: FormData) {
  const client = await createClient();
  if (!client) redirect("/configuracion-pendiente");
  const email = String(form.get("email") || "").trim();
  const password = String(form.get("password") || "");
  if (!email || !password || email.length > 254 || password.length > 1024)
    redirect("/login?error=credentials");
  const { error } = await client.auth.signInWithPassword({ email, password });
  if (error) redirect("/login?error=credentials");
  redirect("/dashboard");
}
export async function signOut() {
  const client = await createClient();
  if (client) await client.auth.signOut();
  redirect("/login");
}
