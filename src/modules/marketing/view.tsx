import { bindCeoMetaAccount, syncMetaAccount } from "./actions";
import { SyncSubmit } from "./sync-submit";
import {
  initialMetaAccount,
  metaMessages,
  type MarketingData,
  type MetaErrorCode,
  type Insight,
} from "./contract";
function metric(value: string | undefined, currency?: string) {
  if (value === undefined) return "—";
  return new Intl.NumberFormat(
    "es-DO",
    currency ? { style: "currency", currency } : { maximumFractionDigits: 2 },
  ).format(Number(value));
}
function budget(value: string | undefined, currency?: string) {
  if (value === undefined || !currency) return "—";
  const precision =
    new Intl.NumberFormat("es-DO", {
      style: "currency",
      currency,
    }).resolvedOptions().maximumFractionDigits ?? 2;
  return metric(String(Number(value) / 10 ** precision), currency);
}
function ReportedResults({ insight }: { insight: Insight | null }) {
  return insight?.actions?.length ? (
    <ul className="meta-results">
      {insight.actions.map((a, i) => (
        <li key={`${a.action_type}-${i}`}>
          <span>{a.action_type}</span>: {metric(a.value)}
        </li>
      ))}
    </ul>
  ) : (
    <span className="muted">Sin resultados reportados</span>
  );
}
export function MarketingView({
  data,
  result,
}: {
  data: MarketingData;
  result?: string;
}) {
  const admin = ["owner", "admin"].includes(data.role);
  const notices: Record<string, string> = {
    vinculada:
      "Cuenta vinculada a la marca existente. Pendiente de comprobar acceso a Meta.",
    sincronizada: "Sincronización completada y guardada en Supabase.",
    marca:
      "No se encontró una única marca CEO Rentable OS autorizada. Revisa las marcas existentes; no se creó ninguna.",
    vinculacion_error:
      "No se pudo vincular la cuenta. Revisa la migración 007, permisos y si ya tiene otro destino.",
    acceso: "Esta acción requiere una cuenta y un administrador autorizados.",
    fechas: "Selecciona fechas válidas de hasta 93 días.",
    esperar:
      "Ya hay una sincronización en curso o acaba de realizarse. Espera al menos un minuto.",
  };
  const message = result
    ? Object.hasOwn(notices, result)
      ? notices[result]
      : Object.hasOwn(metaMessages, result)
        ? metaMessages[result as MetaErrorCode]
        : undefined
    : undefined;
  const lastError =
    data.latestAttempt?.status === "error"
      ? data.latestAttempt.error_code
      : null;
  const a = data.account;
  const s = data.sync;
  const summary = s?.summary;
  const selectedBrand = data.brands.find((b) => b.slug === data.selectedBrand);
  const initialBound = data.accounts.some(
    (a) => a.meta_account_id === initialMetaAccount,
  );
  return (
    <section className="crm meta-hub" aria-label="Marketing Hub · Meta Ads">
      <section className="card crm-detail">
        <h2>Meta Ads</h2>
        <p>
          Datos publicitarios de Meta Marketing API. Integración de lectura.
        </p>
        <p className="crm-notice">
          Los resultados atribuidos por Meta no son contactos ni ventas
          verificadas del CRM. La atribución requiere conectar formularios y
          eventos de conversión.
        </p>
        {message && (
          <p role="status" className="crm-notice">
            {message}
          </p>
        )}
        {data.error && (
          <p role="alert" className="crm-notice">
            {data.error}
          </p>
        )}
        {!data.tokenConfigured && (
          <p role="alert" className="crm-notice">
            {metaMessages.TOKEN_MISSING}
          </p>
        )}
        <form
          action="/marketing"
          method="get"
          className="crm-filters"
          aria-label="Filtros de publicidad"
        >
          <label>
            Marca
            <select name="marca" defaultValue={data.selectedBrand || ""}>
              <option value="">Todas las marcas</option>
              {data.brands.map((b) => (
                <option value={b.slug} key={b.id}>
                  {b.name}
                </option>
              ))}
            </select>
          </label>
          <label>
            Desde
            <input
              type="date"
              name="desde"
              defaultValue={data.range.since}
              required
            />
          </label>
          <label>
            Hasta
            <input
              type="date"
              name="hasta"
              defaultValue={data.range.until}
              required
            />
          </label>
          <div className="crm-form-footer">
            <button className="button secondary">Aplicar filtros</button>
          </div>
        </form>
        {admin &&
          !initialBound &&
          !data.error &&
          (!selectedBrand ||
            ["ceo-rentable-os", "ceo-rentable"].includes(selectedBrand.slug) ||
            selectedBrand.name.toLowerCase() === "ceo rentable os") && (
            <form action={bindCeoMetaAccount}>
              <button className="button secondary">
                Vincular cuenta CEO Rentable OS
              </button>
              <p className="muted">
                {initialMetaAccount}. Reutiliza la marca existente; no crea
                organizaciones ni marcas. Vincular no confirma acceso a Meta.
              </p>
            </form>
          )}
      </section>
      {!a ? (
        <p className="crm-empty">
          No hay una cuenta publicitaria vinculada disponible para esta
          selección.
        </p>
      ) : (
        <>
          <section className="card crm-detail">
            <h2>Cuenta publicitaria</h2>
            {data.accounts.length > 1 && (
              <nav className="crm-tabs" aria-label="Cuentas publicitarias">
                {data.accounts.map((account) => (
                  <a
                    className="button secondary"
                    key={account.id}
                    href={`/marketing?${new URLSearchParams({ cuenta: account.id, desde: data.range.since, hasta: data.range.until, ...(data.selectedBrand ? { marca: data.selectedBrand } : {}) })}`}
                  >
                    {account.name || account.meta_account_id}
                  </a>
                ))}
              </nav>
            )}
            <h3>{a.name || a.meta_account_id}</h3>
            <p>
              {a.meta_account_id} ·{" "}
              {data.brands.find((b) => b.id === a.brand_id)?.name ||
                "Marca autorizada"}
            </p>
            <p>
              Estado:{" "}
              {data.latestAttempt?.status === "running"
                ? "Sincronización en curso"
                : lastError
                  ? "Error en el último intento"
                  : a.last_synced_at
                    ? "Acceso comprobado en la última sincronización"
                    : "Vinculada, acceso pendiente de comprobar"}
            </p>
            <p>
              Última lectura correcta:{" "}
              {a.last_synced_at
                ? new Date(a.last_synced_at).toLocaleString("es-DO", {
                    timeZone: "America/Santo_Domingo",
                  })
                : "Todavía no realizada"}
            </p>
            <p>
              Moneda: {a.currency || "Pendiente"} · Zona horaria de la cuenta:{" "}
              {a.timezone || "Pendiente"}
            </p>
            <p>
              Permisos:{" "}
              {data.latestAttempt?.permissions?.checked
                ? data.latestAttempt.permissions.granted.join(", ") ||
                  "Ninguno de ads_read / ads_management declarado por /me/permissions"
                : s?.permissions?.checked
                  ? s.permissions.granted.join(", ") ||
                    "Sin permisos declarados"
                  : "No enumerados. Una lectura correcta de campañas e insights comprueba el acceso efectivo de lectura."}
            </p>
            <p className="muted">
              La caducidad y el tipo del token no se han verificado.
              ads_management no se utiliza para realizar cambios.
            </p>
            {lastError && (
              <p role="alert" className="crm-notice">
                {metaMessages[lastError]}
              </p>
            )}
            {admin ? (
              <form action={syncMetaAccount}>
                <input type="hidden" name="account_id" value={a.id} />
                <input type="hidden" name="desde" value={data.range.since} />
                <input type="hidden" name="hasta" value={data.range.until} />
                <SyncSubmit
                  disabled={!data.tokenConfigured || Boolean(data.error)}
                />
                <p className="muted">
                  Consulta Meta y guarda este intervalo. No modifica anuncios ni
                  presupuestos.
                </p>
              </form>
            ) : (
              <p className="muted">
                Un administrador puede sincronizar. Tu sesión tiene acceso de
                consulta.
              </p>
            )}
          </section>
          <section className="card crm-detail">
            <h2>Estadísticas del intervalo</h2>
            <p>
              {data.range.since} — {data.range.until}. Fechas según la zona
              horaria publicitaria.
            </p>
            {!s ? (
              <p className="crm-empty">
                Este intervalo todavía no tiene una sincronización correcta.
              </p>
            ) : (
              <>
                <p className="muted">
                  Datos guardados el{" "}
                  {new Date(s.finished_at!).toLocaleString("es-DO", {
                    timeZone: "America/Santo_Domingo",
                  })}
                  . Vuelve a sincronizar para actualizarlos.
                </p>
                {summary ? (
                  <>
                    <div className="crm-metrics">
                      {[
                        [
                          "Importe gastado",
                          metric(summary.spend, a.currency || undefined),
                        ],
                        ["Impresiones", metric(summary.impressions)],
                        ["Alcance de la cuenta", metric(summary.reach)],
                        ["Clics", metric(summary.clicks)],
                        ["CPC", metric(summary.cpc, a.currency || undefined)],
                        ["CPM", metric(summary.cpm, a.currency || undefined)],
                      ].map(([label, value]) => (
                        <div className="crm-metric" key={label}>
                          <span>{label}</span>
                          <strong className="crm-money">{value}</strong>
                        </div>
                      ))}
                    </div>
                    <h3>Eventos reportados por Meta</h3>
                    <ReportedResults insight={summary} />
                  </>
                ) : (
                  <p className="crm-empty">
                    Meta no reportó actividad publicitaria para estas fechas.
                  </p>
                )}
                <h3>Campañas ({data.metrics.length})</h3>
                <p className="muted">
                  El estado y presupuesto son actuales al sincronizar; las
                  métricas corresponden al intervalo. Las campañas sin actividad
                  pueden no tener estadísticas. No se suman alcances entre
                  campañas.
                </p>
                {!data.metrics.length ? (
                  <p className="crm-empty">
                    Meta no devolvió campañas para esta cuenta.
                  </p>
                ) : (
                  <div className="meta-campaigns">
                    {data.metrics.map(({ campaign: c, insight: i }) => (
                      <article className="meta-campaign" key={c.id}>
                        <h3>{c.name}</h3>
                        <p>
                          Estado configurado: {c.status || "No disponible"} ·
                          Efectivo: {c.effective_status || "No disponible"}
                        </p>
                        <p className="muted">
                          ID: {c.id} · Objetivo: {c.objective || "No reportado"}
                        </p>
                        <p>
                          Inicio: {c.start_time || "No reportado"} · Fin:{" "}
                          {c.stop_time || "No reportado"}
                        </p>
                        <p>
                          Presupuesto diario:{" "}
                          {budget(c.daily_budget, a.currency || undefined)} ·
                          Total de campaña:{" "}
                          {budget(c.lifetime_budget, a.currency || undefined)}
                        </p>
                        <p className="muted">
                          Si el presupuesto está en conjuntos de anuncios, no se
                          informa aquí un presupuesto de campaña.
                        </p>
                        {i ? (
                          <>
                            <dl className="meta-stat-grid">
                              {[
                                [
                                  "Importe gastado",
                                  metric(i.spend, a.currency || undefined),
                                ],
                                ["Impresiones", metric(i.impressions)],
                                ["Alcance", metric(i.reach)],
                                ["Clics", metric(i.clicks)],
                                ["CPC", metric(i.cpc, a.currency || undefined)],
                                ["CPM", metric(i.cpm, a.currency || undefined)],
                              ].map(([key, value]) => (
                                <div key={key}>
                                  <dt>{key}</dt>
                                  <dd>{value}</dd>
                                </div>
                              ))}
                            </dl>
                            <ReportedResults insight={i} />
                          </>
                        ) : (
                          <p>Sin estadísticas reportadas para el intervalo.</p>
                        )}
                      </article>
                    ))}
                  </div>
                )}
              </>
            )}
          </section>
        </>
      )}
    </section>
  );
}
