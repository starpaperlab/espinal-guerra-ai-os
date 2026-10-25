import { ShieldCheck } from "lucide-react";
import Link from "next/link";
export function StatusScreen({
  title,
  children,
}: {
  title: string;
  children: React.ReactNode;
}) {
  return (
    <main className="auth-page">
      <section className="auth-card">
        <div className="logo-mark">
          EG<span>✦</span>
        </div>
        <p className="eyebrow">ESPINAL GUERRA · AI OS</p>
        <ShieldCheck className="status-icon" aria-hidden="true" />
        <h1>{title}</h1>
        <div className="muted">{children}</div>
        <div className="auth-footer">
          Centro de control privado · Acceso restringido
        </div>
      </section>
    </main>
  );
}
export function BackToLogin() {
  return (
    <Link className="button secondary" href="/login">
      Volver al acceso
    </Link>
  );
}
