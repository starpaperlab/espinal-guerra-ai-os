import { StatusScreen } from "@/components/status-screen";
import { signOut } from "@/app/login/actions";
export default function Pending() {
  return (
    <StatusScreen title="Acceso pendiente">
      <p>
        Tu cuenta aún no tiene una organización asignada o no se pudo verificar
        su membresía. Solicita acceso al administrador del espacio.
      </p>
      <form action={signOut}>
        <button className="button secondary">Cerrar sesión</button>
      </form>
    </StatusScreen>
  );
}
