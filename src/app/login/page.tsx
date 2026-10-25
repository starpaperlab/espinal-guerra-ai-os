import { redirect } from "next/navigation";
import { getSupabaseConfig } from "@/lib/supabase/config";
import { StatusScreen } from "@/components/status-screen";
import { signIn } from "./actions";
export const dynamic = "force-dynamic";

export default async function Login({
  searchParams,
}: {
  searchParams: Promise<{ error?: string }>;
}) {
  if (!getSupabaseConfig()) redirect("/configuracion-pendiente");
  const { error } = await searchParams;
  return (
    <StatusScreen title="Bienvenida a tu centro de control">
      <p>Accede con tu cuenta corporativa autorizada.</p>
      <form action={signIn} className="login-form">
        <label htmlFor="email">Correo electrónico</label>
        <input
          id="email"
          name="email"
          type="email"
          autoComplete="username"
          required
          maxLength={254}
        />
        <label htmlFor="password">Contraseña</label>
        <input
          id="password"
          name="password"
          type="password"
          autoComplete="current-password"
          required
          maxLength={1024}
        />
        {error && (
          <p role="alert" className="error">
            No pudimos iniciar sesión. Verifica tus credenciales e inténtalo de
            nuevo.
          </p>
        )}
        <button className="button">Iniciar sesión</button>
      </form>
    </StatusScreen>
  );
}
