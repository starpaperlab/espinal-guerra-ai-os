import type { ReactNode } from "react";
import { BrandPortfolio } from "./brand-portfolio";
import { CorporateIdentity } from "./corporate-identity";
import Link from "next/link";
import {
  LayoutDashboard,
  Layers3,
  UsersRound,
  Megaphone,
  Workflow,
  Wallet,
  Code2,
  Settings2,
  ArrowUpRight,
  ArrowRight,
  ShieldCheck,
  LogOut,
  Menu,
  CircleHelp,
  Sparkles,
} from "lucide-react";
import { modules, brands, type Module, selectedBrand } from "@/modules/catalog";
import { BrandSelector } from "./brand-selector";
import { signOut } from "@/app/login/actions";
const icons = {
  dashboard: LayoutDashboard,
  brands: Layers3,
  sales: UsersRound,
  marketing: Megaphone,
  operations: Workflow,
  finance: Wallet,
  technology: Code2,
  settings: Settings2,
};
export function Workspace({
  module,
  brandId,
  email,
  children,
  headerControl,
}: {
  module: Module;
  brandId?: string;
  email?: string;
  children?: ReactNode;
  headerControl?: ReactNode;
}) {
  const brand = selectedBrand(brandId);
  const suffix = brand ? `?marca=${brand.id}` : "";
  const navigation = (
    <>
      <CorporateIdentity variant="dark" />
      <p className="nav-label">ESPACIO DE TRABAJO</p>
      <nav aria-label="Navegación principal">
        {modules.map((m) => {
          const Icon = icons[m.icon];
          return (
            <Link
              key={m.slug}
              href={`/${m.slug}${suffix}`}
              className={`nav-link ${m.slug === module.slug ? "active" : ""}`}
              aria-current={m.slug === module.slug ? "page" : undefined}
            >
              <Icon size={19} />
              {m.name}
              {m.slug === module.slug && <span className="active-dot" />}
            </Link>
          );
        })}
      </nav>
      <div className="sidebar-note">
        <ShieldCheck size={20} />
        <strong>Tu organización, conectada.</strong>
        <p>Un espacio privado para construir lo que sigue.</p>
        <span>FASE 1 · FUNDACIÓN</span>
      </div>
      <div className="sidebar-bottom">
        <span className="avatar">EG</span>
        <div>
          Espinal Guerra<small>Espacio corporativo</small>
        </div>
      </div>
    </>
  );
  return (
    <div className="app-shell">
      <a className="skip-link" href="#contenido-principal">
        Saltar al contenido
      </a>
      <aside className="sidebar">{navigation}</aside>
      <div className="main-shell">
        <header className="topbar">
          <span className="breadcrumb">
            Grupo Empresarial Espinal Guerra <span>/</span>{" "}
            <strong>{module.name}</strong>
          </span>
          <div className="header-right">
            <span className="private-badge">
              <span />
              Espacio privado
            </span>
            <form action={signOut}>
              <button
                className="icon-button"
                aria-label="Cerrar sesión"
                title={email ? `Cerrar sesión: ${email}` : "Cerrar sesión"}
              >
                <LogOut size={18} />
              </button>
            </form>
            <span className="avatar small">EG</span>
          </div>
        </header>
        <details className="mobile-nav">
          <summary>
            <Menu size={18} /> Menú de navegación
          </summary>
          {navigation}
        </details>
        <main className="content" id="contenido-principal">
          <div className="page-heading">
            <div>
              <p className="eyebrow">CENTRO DE CONTROL</p>
              <h1>{module.name}</h1>
              <p className="muted">{module.description}</p>
            </div>
            {headerControl ?? <BrandSelector value={brand?.id} />}
          </div>
          {module.slug === "dashboard" ? (
            <>
              <p className="personal-welcome">
                Bienvenida a tu centro de dirección
                {email ? (
                  <>
                    {" "}
                    · <span>{email}</span>
                  </>
                ) : (
                  "."
                )}
              </p>
              <section className="welcome-banner">
                <div>
                  <span className="banner-label">
                    <Sparkles size={14} /> TU VISIÓN, EN UN SOLO LUGAR
                  </span>
                  <h2>
                    El siguiente capítulo de
                    <br />
                    Espinal Guerra empieza aquí.
                  </h2>
                  <p>
                    Conecta la visión de tus marcas con las decisiones de cada
                    día.
                  </p>
                  <Link href={`/marcas${suffix}`} className="banner-link">
                    Explorar mis marcas <ArrowRight size={16} />
                  </Link>
                </div>
                <div className="banner-art" aria-hidden="true">
                  <div className="orbit orbit-one" />
                  <div className="orbit orbit-two" />
                  <div className="art-center">
                    <Layers3 size={48} />
                  </div>
                  <span className="art-label">
                    VISIÓN. ESTRATEGIA. CRECIMIENTO.
                  </span>
                </div>
              </section>
              <div className="section-heading">
                <h2>Panorama del grupo</h2>
                <span>Sin fuentes de datos conectadas</span>
              </div>
              <section className="metrics" aria-label="Indicadores ejecutivos">
                {[
                  {
                    label: "Marcas en catálogo",
                    value: String(brand ? 1 : brands.length),
                    note: "Catálogo inicial",
                    icon: Layers3,
                  },
                  {
                    label: "Ventas",
                    value: "—",
                    note: "Sin datos conectados",
                    icon: Wallet,
                  },
                  {
                    label: "Prospectos",
                    value: "—",
                    note: "CRM pendiente de configurar",
                    icon: UsersRound,
                  },
                  {
                    label: "Operaciones",
                    value: "—",
                    note: "Sin procesos registrados",
                    icon: Workflow,
                  },
                ].map((item) => (
                  <article className="metric card" key={item.label}>
                    <div>
                      <span>{item.label}</span>
                      <item.icon size={18} />
                    </div>
                    <strong>{item.value}</strong>
                    <small>{item.note}</small>
                  </article>
                ))}
              </section>
              <section className="quick-access" aria-label="Accesos rápidos">
                <h2>Accesos rápidos</h2>
                <div className="quick-access-links">
                  {modules
                    .filter((m) =>
                      [
                        "ventas",
                        "marketing",
                        "operaciones",
                        "finanzas",
                      ].includes(m.slug),
                    )
                    .map((m) => {
                      const Icon = icons[m.icon];
                      return (
                        <Link
                          className="button secondary"
                          href={`/${m.slug}${suffix}`}
                          key={m.slug}
                        >
                          <Icon size={20} />
                          {m.name}
                          <ArrowUpRight size={16} />
                        </Link>
                      );
                    })}
                </div>
              </section>
              <section
                className="business-summary"
                aria-label="Resumen empresarial"
              >
                <article className="card summary-card">
                  <span className="soft-icon">
                    <UsersRound size={24} />
                  </span>
                  <h2>Resumen comercial</h2>
                  <p>
                    No hay ventas ni prospectos conectados. El resumen estará
                    disponible cuando se incorporen fuentes autorizadas.
                  </p>
                  <Link className="text-link" href={`/ventas${suffix}`}>
                    Ir a Ventas y CRM <ArrowRight size={18} />
                  </Link>
                </article>
                <article className="card summary-card">
                  <span className="soft-icon">
                    <Workflow size={24} />
                  </span>
                  <h2>Estado de operaciones</h2>
                  <p>
                    Sin procesos registrados. Este espacio mostrará el estado
                    operativo cuando existan datos reales.
                  </p>
                  <Link className="text-link" href={`/operaciones${suffix}`}>
                    Ir a Operaciones <ArrowRight size={18} />
                  </Link>
                </article>
              </section>
              <BrandPortfolio brandId={brand?.id} title="Nuestras marcas" />
              <section className="lower-grid">
                <div className="card empty-card">
                  <div className="section-heading">
                    <h2>Actividad reciente</h2>
                    <span className="tag">Sin actividad</span>
                  </div>
                  <div className="empty-content">
                    <Workflow size={26} />
                    <h3>Aquí comenzará la historia</h3>
                    <p>
                      Cuando registres actividad en tus módulos,
                      <br />
                      podrás consultarla desde este espacio.
                    </p>
                  </div>
                </div>
                <div className="card foundation">
                  <span className="soft-icon">
                    <ShieldCheck size={23} />
                  </span>
                  <h2>Una base para crecer</h2>
                  <p>
                    Tu espacio de trabajo está en su primera fase. Los módulos
                    están preparados para evolucionar contigo.
                  </p>
                  <Link href="/tecnologia">
                    Ver estado del sistema <ArrowRight size={16} />
                  </Link>
                  <div className="foundation-status">
                    <span />
                    Integraciones sin conectar
                  </div>
                </div>
              </section>
            </>
          ) : module.slug === "marcas" ? (
            <BrandPortfolio brandId={brand?.id} />
          ) : children ? (
            children
          ) : (
            <section className="card module-empty">
              <span className="soft-icon">
                {(() => {
                  const Icon = icons[module.icon];
                  return <Icon size={28} />;
                })()}
              </span>
              <span className="tag">
                {module.slug === "configuracion"
                  ? "Administración inicial"
                  : "Módulo en preparación"}
              </span>
              <h2>
                {module.slug === "tecnologia"
                  ? "Integraciones futuras, una base segura"
                  : module.slug === "configuracion"
                    ? "Tu espacio empresarial"
                    : `Tu espacio de ${module.name.toLowerCase()}`}
              </h2>
              <p>
                {module.slug === "tecnologia"
                  ? "Arquitectura preparada para n8n, Google Sheets, GitHub y sistemas comerciales. Ningún servicio está conectado y no hay automatizaciones activas."
                  : module.slug === "configuracion"
                    ? "La autenticación y la membresía se verifican en el servidor. La gestión de usuarios y permisos se administra en Supabase durante esta fase."
                    : "Este módulo todavía no registra información. Sus funciones se incorporarán en las próximas fases, con datos y procesos autorizados."}
              </p>
              <div className="empty-context">
                {brand?.name ?? "Todas las marcas"} · Sin datos operativos
              </div>
              <Link className="button secondary" href={`/dashboard${suffix}`}>
                Volver al panel <ArrowRight size={16} />
              </Link>
            </section>
          )}
          <footer className="footer">
            <span>© {new Date().getFullYear()} Espinal Guerra · AI OS</span>
            <span>
              <CircleHelp size={14} /> Fase 1 · Fundación técnica
            </span>
          </footer>
        </main>
      </div>
    </div>
  );
}
