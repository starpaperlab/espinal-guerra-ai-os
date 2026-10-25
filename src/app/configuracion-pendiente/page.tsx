import { StatusScreen } from "@/components/status-screen";
export default function Pending() {
  return (
    <StatusScreen title="Configuración pendiente">
      <p>
        El espacio privado todavía no está conectado a Supabase. El panel
        ejecutivo permanecerá protegido hasta completar la configuración.
      </p>
      <ol>
        <li>Crea un proyecto Supabase de desarrollo.</li>
        <li>
          Configura las variables indicadas en <code>.env.example</code>.
        </li>
        <li>Aplica la migración y asigna los accesos según el README.</li>
      </ol>
      <p>No se ha conectado ninguna base de producción.</p>
    </StatusScreen>
  );
}
