import Link from "next/link";
import { StatusScreen } from "@/components/status-screen";
export default function NotFound() {
  return (
    <StatusScreen title="Página no encontrada">
      <p>La dirección solicitada no existe en este espacio.</p>
      <Link className="button" href="/dashboard">
        Ir al panel
      </Link>
    </StatusScreen>
  );
}
