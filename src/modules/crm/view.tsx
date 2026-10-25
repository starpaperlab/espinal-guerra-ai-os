import Link from "next/link";
import { randomUUID } from "node:crypto";
import type { InputHTMLAttributes, ReactNode } from "react";
import { stages } from "./schema";
import type { CrmData, Lead, Opportunity, Activity } from "./types";
import {
  createLead,
  updateLead,
  createOpportunity,
  moveOpportunity,
  createActivity,
  completeActivity,
  createProposal,
} from "./actions";
export function crmUrl(
  query: Record<string, string>,
  changes: Record<string, string | undefined> = {},
) {
  const q = new URLSearchParams();
  for (const [k, v] of Object.entries({ ...query, ...changes }))
    if (
      v &&
      [
        "marca",
        "vista",
        "q",
        "estado",
        "clase",
        "orden",
        "direccion",
        "pruebas",
        "pagina",
        "lead",
      ].includes(k)
    )
      q.set(k, v);
  return "/ventas?" + q;
}
function date(v: string | null) {
  return v
    ? new Intl.DateTimeFormat("es-DO", {
        dateStyle: "medium",
        timeStyle: "short",
        timeZone: "America/Santo_Domingo",
      }).format(new Date(v))
    : "Sin programar";
}
function localInput(v: string | null) {
  if (!v) return "";
  const p = Object.fromEntries(
    new Intl.DateTimeFormat("en-CA", {
      timeZone: "America/Santo_Domingo",
      year: "numeric",
      month: "2-digit",
      day: "2-digit",
      hour: "2-digit",
      minute: "2-digit",
      hourCycle: "h23",
    })
      .formatToParts(new Date(v))
      .map((p) => [p.type, p.value]),
  );
  return `${p.year}-${p.month}-${p.day}T${p.hour}:${p.minute}`;
}
function money(n: number, c: string) {
  return new Intl.NumberFormat("es-DO", {
    style: "currency",
    currency: c,
  }).format(n);
}
function Field({
  label,
  ...props
}: InputHTMLAttributes<HTMLInputElement> & { label: string }) {
  return (
    <label>
      {label}
      <input {...props} />
    </label>
  );
}
function Text({
  label,
  name,
  value = "",
}: {
  label: string;
  name: string;
  value?: string;
}) {
  return (
    <label>
      {label}
      <textarea name={name} defaultValue={value} maxLength={10000} rows={3} />
    </label>
  );
}
function Context({ data, lead }: { data: CrmData; lead?: string }) {
  return (
    <>
      <input
        type="hidden"
        name="context_brand"
        value={data.selectedBrand?.id || ""}
      />
      <input
        type="hidden"
        name="test_context"
        value={data.query.pruebas || ""}
      />
      {lead && <input type="hidden" name="lead_id" value={lead} />}
    </>
  );
}
function Empty({ children }: { children: ReactNode }) {
  return <p className="crm-empty">{children}</p>;
}
export function CrmBrandFilter({ data }: { data: CrmData }) {
  return (
    <form action="/ventas" className="crm-brand-filter">
      <label>
        Marca del CRM
        <select name="marca" defaultValue={data.selectedBrand?.id || ""}>
          <option value="">Todas las marcas autorizadas</option>
          {data.brands.map((b) => (
            <option value={b.id} key={b.id}>
              {b.name}
            </option>
          ))}
        </select>
      </label>
      <input type="hidden" name="vista" value={data.query.vista || "bandeja"} />
      <button className="button secondary">Aplicar</button>
    </form>
  );
}
export function CrmView({ data }: { data: CrmData }) {
  const { query } = data;
  const view = query.vista || "bandeja";
  const brandName = (id: string) =>
    data.brands.find((b) => b.id === id)?.name || "Marca no disponible";
  const results: Record<string, string> = {
    creado: "Registro guardado en Supabase.",
    actualizado: "Cambios guardados en Supabase.",
    validacion:
      "Revisa los campos, fechas e importes. Para ganar una oportunidad indica el valor cerrado.",
    guardado:
      "No se pudo guardar. Comprueba la migración y los permisos, y vuelve a intentarlo.",
    acceso: "El registro no está disponible en tu organización.",
    conflicto:
      "El registro cambió o no está disponible. Recarga antes de guardar de nuevo.",
  };
  if (!data.summary)
    return (
      <section className="crm">
        <div role="alert" className="card crm-notice">
          <h2>CRM pendiente de habilitar</h2>
          <p>{data.error || "No se pudo consultar Supabase."}</p>
          <p>
            Los datos existentes no se han modificado. No se muestran cifras de
            demostración.
          </p>
        </div>
      </section>
    );
  const values = data.summary;
  return (
    <section className="crm" aria-label="Gestión comercial">
      {data.error && (
        <p role="alert" className="crm-notice">
          {data.error}
        </p>
      )}
      {query.resultado && results[query.resultado] && (
        <p role="status" className="crm-notice">
          {results[query.resultado]}
        </p>
      )}
      {query.pruebas === "si" && (
        <p className="crm-notice">
          Vista de datos de prueba. Los indicadores siguen contando
          exclusivamente registros reales.
        </p>
      )}
      <h2>Resumen comercial real</h2>
      <p className="muted">
        Datos de Supabase ·{" "}
        {data.selectedBrand?.name || "Todas las marcas de tu organización"}. Sin
        registros de prueba.
      </p>
      <div className="crm-metrics">
        {[
          ["Prospectos reales", values.leads],
          ["Nuevos", values.new],
          ["HOT", values.hot],
          ["WARM", values.warm],
          ["COLD", values.cold],
          ["Oportunidades abiertas", values.open],
          ["Seguimientos pendientes", values.follow_ups],
          ["Propuestas enviadas", values.sent],
          ["Ganadas", values.won],
        ].map(([label, value]) => (
          <article className="card crm-metric" key={label}>
            <span>{label}</span>
            <strong>{value}</strong>
          </article>
        ))}
        <article className="card crm-metric">
          <span>Valor ganado por moneda</span>
          {Object.entries(values.won_value).length ? (
            Object.entries(values.won_value).map(([c, n]) => (
              <strong className="crm-money" key={c}>
                {money(n, c)}
              </strong>
            ))
          ) : (
            <strong>0</strong>
          )}
        </article>
      </div>
      <nav className="crm-tabs" aria-label="Áreas del CRM">
        {[
          ["bandeja", "Prospectos"],
          ["pipeline", "Pipeline"],
          ["seguimiento", "Seguimientos"],
        ].map(([id, label]) => (
          <Link
            className="button secondary"
            key={id}
            href={crmUrl(query, { vista: id, lead: undefined })}
            aria-current={view === id ? "page" : undefined}
          >
            {label}
          </Link>
        ))}
      </nav>
      <details className="card crm-disclosure">
        <summary>Registrar prospecto</summary>
        {data.brands.length ? (
          <LeadForm data={data} />
        ) : (
          <Empty>
            No hay marcas autorizadas disponibles. Revisa las marcas existentes
            en Supabase sin crear copias.
          </Empty>
        )}
      </details>
      {data.detail && <LeadDetail data={data} lead={data.detail} />}
      {view === "pipeline" ? (
        <>
          <div className="section-heading">
            <h2>Pipeline comercial</h2>
            <span>
              {data.opportunities.length} de {data.opportunityCount} · filtra
              por marca si supera 200
            </span>
          </div>
          <div className="pipeline-columns">
            {Object.entries(stages).map(([stage, label]) => (
              <section className="pipeline-column" key={stage}>
                <h3>
                  {label}{" "}
                  <span className="tag">
                    {data.opportunities.filter((o) => o.stage === stage).length}
                  </span>
                </h3>
                {data.opportunities
                  .filter((o) => o.stage === stage)
                  .map((o) => (
                    <OpportunityCard key={o.id} data={data} item={o} />
                  ))}
                {!data.opportunities.some((o) => o.stage === stage) && (
                  <Empty>Sin oportunidades en esta etapa.</Empty>
                )}
              </section>
            ))}
          </div>
        </>
      ) : view === "seguimiento" ? (
        <>
          <h2>Seguimientos pendientes</h2>
          <p className="muted">
            Fechas mostradas en horario de República Dominicana (UTC−04:00).
            Ninguna actividad envía mensajes automáticamente.
          </p>
          <div className="crm-activity-list">
            {data.followUpLeads
              .filter(
                (l) =>
                  l.follow_up_at && !["ganado", "perdido"].includes(l.stage),
              )
              .map((l) => (
                <article className="card crm-list-item" key={l.id}>
                  <Link
                    className="text-link"
                    href={crmUrl(query, { lead: l.id })}
                  >
                    {l.contact.name}
                  </Link>
                  <p>{l.next_action || "Seguimiento del prospecto"}</p>
                  <Due now={data.now} value={l.follow_up_at} />
                </article>
              ))}
            {data.activities.map((a) => (
              <ActivityCard key={a.id} data={data} item={a} />
            ))}
            {!data.activities.length && !data.followUpLeads.length && (
              <Empty>No hay seguimientos programados en esta selección.</Empty>
            )}
          </div>
          <p className="muted">
            Actividades: {data.activities.length} de {data.activityCount}.
            Prospectos con seguimiento: {data.followUpLeads.length} de{" "}
            {data.followUpCount}. Se muestran hasta 200 por selección.
          </p>
        </>
      ) : (
        <>
          <form action="/ventas" className="card crm-filters">
            <input
              type="hidden"
              name="marca"
              value={data.selectedBrand?.id || ""}
            />
            <Field
              label="Buscar nombre, empresa o correo"
              name="q"
              defaultValue={query.q}
              maxLength={100}
            />
            <label>
              Estado
              <select name="estado" defaultValue={query.estado || ""}>
                <option value="">Todos</option>
                {Object.entries(stages).map(([s, l]) => (
                  <option key={s} value={s}>
                    {l}
                  </option>
                ))}
              </select>
            </label>
            <label>
              Clasificación
              <select name="clase" defaultValue={query.clase || ""}>
                <option value="">Todas</option>
                {["HOT", "WARM", "COLD"].map((c) => (
                  <option key={c}>{c}</option>
                ))}
              </select>
            </label>
            <label>
              Orden
              <select name="orden" defaultValue={query.orden || "captured_at"}>
                <option value="captured_at">Fecha de entrada</option>
                <option value="score">Lead score</option>
              </select>
            </label>
            <label>
              Dirección
              <select name="direccion" defaultValue={query.direccion || "desc"}>
                <option value="desc">Descendente</option>
                <option value="asc">Ascendente</option>
              </select>
            </label>
            <label>
              Registros
              <select name="pruebas" defaultValue={query.pruebas || ""}>
                <option value="">Reales</option>
                <option value="si">Solo pruebas</option>
              </select>
            </label>
            <button className="button">Buscar y filtrar</button>
          </form>
          <div className="section-heading">
            <h2>Bandeja de prospectos</h2>
            <span>
              {data.leadCount} registros · página {data.page}
            </span>
          </div>
          <div className="crm-table-wrap">
            <table>
              <thead>
                <tr>
                  {[
                    "Nombre / empresa",
                    "Marca",
                    "Servicio / origen",
                    "Score / clase",
                    "Estado",
                    "Entrada",
                    "Próximo seguimiento",
                    "Acciones",
                  ].map((h) => (
                    <th key={h}>{h}</th>
                  ))}
                </tr>
              </thead>
              <tbody>
                {data.leads.map((l) => (
                  <tr key={l.id}>
                    <td>
                      <strong>{l.contact.name}</strong>
                      <p>{l.contact.company || "Sin empresa"}</p>
                    </td>
                    <td>{brandName(l.brand_id)}</td>
                    <td>
                      {l.service || "Sin indicar"}
                      <p>{l.source}</p>
                    </td>
                    <td>
                      {l.score ?? "Sin evaluación"} · {l.classification || "—"}
                    </td>
                    <td>{stages[l.stage]}</td>
                    <td>{date(l.captured_at)}</td>
                    <td>
                      <Due now={data.now} value={l.follow_up_at} />
                    </td>
                    <td>
                      <Link
                        className="text-link"
                        href={crmUrl(query, { lead: l.id })}
                      >
                        Abrir ficha
                      </Link>
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
          <div className="crm-mobile-leads">
            {data.leads.map((l) => (
              <article className="card crm-lead-card" key={l.id}>
                <h3>{l.contact.name}</h3>
                <p>
                  {l.contact.company || "Sin empresa"} · {brandName(l.brand_id)}
                </p>
                <dl>
                  <dt>Servicio / origen</dt>
                  <dd>
                    {l.service || "Sin indicar"} · {l.source}
                  </dd>
                  <dt>Score / clasificación</dt>
                  <dd>
                    {l.score ?? "Sin evaluación"} · {l.classification || "—"}
                  </dd>
                  <dt>Estado</dt>
                  <dd>{stages[l.stage]}</dd>
                  <dt>Entrada</dt>
                  <dd>{date(l.captured_at)}</dd>
                  <dt>Próximo seguimiento</dt>
                  <dd>
                    <Due now={data.now} value={l.follow_up_at} />
                  </dd>
                </dl>
                <Link
                  className="button secondary"
                  href={crmUrl(query, { lead: l.id })}
                >
                  Abrir ficha
                </Link>
              </article>
            ))}
          </div>
          {!data.leads.length && (
            <Empty>
              No hay prospectos que coincidan. Registra el primero o ajusta los
              filtros.
            </Empty>
          )}
          <nav className="crm-pagination" aria-label="Páginas de prospectos">
            {data.page > 1 && (
              <Link
                className="button secondary"
                href={crmUrl(query, {
                  pagina: String(data.page - 1),
                  lead: undefined,
                })}
              >
                Anterior
              </Link>
            )}
            {data.page * 20 < data.leadCount && (
              <Link
                className="button secondary"
                href={crmUrl(query, {
                  pagina: String(data.page + 1),
                  lead: undefined,
                })}
              >
                Siguiente
              </Link>
            )}
          </nav>
        </>
      )}
    </section>
  );
}
function Due({ value, now }: { value: string | null; now: string }) {
  const overdue = value && new Date(value).getTime() < new Date(now).getTime();
  return (
    <span className={overdue ? "crm-overdue" : ""}>
      {overdue ? "Vencido · " : ""}
      {date(value)}
    </span>
  );
}
function LeadForm({ data, lead }: { data: CrmData; lead?: Lead }) {
  return (
    <form className="crm-form" action={lead ? updateLead : createLead}>
      <Context data={data} />
      <input type="hidden" name="request_id" value={randomUUID()} />
      {lead && <input type="hidden" name="id" value={lead.id} />}
      {lead ? (
        <>
          <input type="hidden" name="brand_id" value={lead.brand_id} />
          <p>Marca: {data.brands.find((b) => b.id === lead.brand_id)?.name}</p>
        </>
      ) : (
        <label>
          Marca obligatoria
          <select
            name="brand_id"
            required
            defaultValue={data.selectedBrand?.id || ""}
          >
            <option value="" disabled>
              Selecciona una marca existente
            </option>
            {data.brands.map((b) => (
              <option key={b.id} value={b.id}>
                {b.name}
              </option>
            ))}
          </select>
        </label>
      )}
      <Field
        label="Nombre *"
        name="name"
        required
        maxLength={160}
        defaultValue={lead?.contact.name}
      />
      <Field
        label="Empresa"
        name="company"
        maxLength={200}
        defaultValue={lead?.contact.company}
      />
      <Field
        label="Correo"
        name="email"
        type="email"
        maxLength={254}
        defaultValue={lead?.contact.email}
      />
      <Field
        label="Teléfono"
        name="phone"
        maxLength={60}
        defaultValue={lead?.contact.phone}
      />
      <Field
        label="Fuente / canal *"
        name="source"
        required
        maxLength={100}
        defaultValue={lead?.source || "manual"}
      />
      <Field
        label="Campaña"
        name="campaign"
        maxLength={200}
        defaultValue={lead?.campaign}
      />
      <Field
        label="Servicio de interés"
        name="service"
        maxLength={300}
        defaultValue={lead?.service}
      />
      <Field
        label="Presupuesto declarado (texto original)"
        name="budget"
        maxLength={300}
        defaultValue={lead?.budget}
      />
      <Field
        label="Urgencia"
        name="urgency"
        maxLength={300}
        defaultValue={lead?.urgency}
      />
      <Field
        label="Etiquetas separadas por coma"
        name="tags"
        maxLength={1500}
        defaultValue={lead?.contact.tags.join(", ")}
      />
      <Text label="Necesidad comercial" name="need" value={lead?.need} />
      <Text label="Observaciones" name="notes" value={lead?.contact.notes} />
      <Field
        label="Próxima acción"
        name="next_action"
        maxLength={2000}
        defaultValue={lead?.next_action}
      />
      <Field
        label="Seguimiento (hora de República Dominicana)"
        name="follow_up_at"
        type="datetime-local"
        defaultValue={localInput(lead?.follow_up_at || null)}
      />
      <label>
        Responsable
        <select name="owner_id" defaultValue={lead?.owner_id || ""}>
          <option value="">Sin responsable</option>
          <option value={data.userId}>Mi cuenta</option>
          {lead?.owner_id && lead.owner_id !== data.userId && (
            <option value={lead.owner_id}>Responsable actual</option>
          )}
        </select>
      </label>
      <label>
        Estado comercial
        <select name="stage" defaultValue={lead?.stage || "nuevo"}>
          {Object.entries(stages).map(([s, l]) => (
            <option key={s} value={s}>
              {l}
            </option>
          ))}
        </select>
      </label>
      {!lead && (
        <label className="crm-checkbox">
          <input type="checkbox" name="is_test" />
          Dato de prueba · se excluye de indicadores
        </label>
      )}
      <div className="crm-form-footer">
        <button className="button">
          {lead ? "Guardar cambios" : "Crear prospecto"}
        </button>
        <span>
          Los datos se guardan en Supabase. No se envían comunicaciones.
        </span>
      </div>
    </form>
  );
}
function LeadDetail({ data, lead }: { data: CrmData; lead: Lead }) {
  return (
    <section className="card crm-detail" aria-labelledby="crm-detail-title">
      <div className="section-heading">
        <h2 id="crm-detail-title">Ficha · {lead.contact.name}</h2>
        <Link
          className="text-link"
          href={crmUrl(data.query, { lead: undefined })}
        >
          Cerrar ficha
        </Link>
      </div>
      {lead.is_test && (
        <p className="crm-notice">
          Registro de prueba · excluido de indicadores reales.
        </p>
      )}
      <details open className="crm-disclosure">
        <summary>Contacto e información comercial</summary>
        <LeadForm data={data} lead={lead} />
      </details>
      <section className="crm-ai">
        <h3>Evaluación comercial recibida</h3>
        {lead.evaluated_at ? (
          <dl>
            <dt>Puntuación / clasificación</dt>
            <dd>
              {lead.score ?? "Sin puntuación"} ·{" "}
              {lead.classification || "Sin clasificación"}
            </dd>
            <dt>Problema identificado</dt>
            <dd>{lead.ai_problem || "No recibido"}</dd>
            <dt>Oportunidad comercial</dt>
            <dd>{lead.ai_opportunity || "No recibida"}</dd>
            <dt>Recomendación</dt>
            <dd>{lead.ai_recommendation || "No recibida"}</dd>
            <dt>Fecha de evaluación</dt>
            <dd>{date(lead.evaluated_at)}</dd>
          </dl>
        ) : (
          <Empty>
            Este prospecto no tiene una evaluación recibida. No se ha calculado
            otro scoring.
          </Empty>
        )}
      </section>
      <details className="crm-disclosure">
        <summary>Crear oportunidad</summary>
        <form className="crm-form" action={createOpportunity}>
          <Context data={data} lead={lead.id} />
          <input type="hidden" name="request_id" value={randomUUID()} />
          <Field
            label="Producto o servicio *"
            name="service"
            required
            maxLength={300}
            defaultValue={lead.service}
          />
          <Field
            label="Valor estimado *"
            name="estimated_value"
            type="number"
            min="0"
            max="99999999999999"
            step="0.01"
            required
          />
          <Field
            label="Moneda ISO *"
            name="currency"
            required
            pattern="[A-Z]{3}"
            maxLength={3}
            defaultValue="DOP"
          />
          <Field
            label="Probabilidad (%)"
            name="probability"
            type="number"
            min="0"
            max="100"
            defaultValue={0}
            required
          />
          <Field
            label="Fecha estimada de cierre"
            name="expected_close"
            type="date"
          />
          <Field label="Próxima acción" name="next_action" maxLength={2000} />
          <button className="button">Guardar oportunidad</button>
        </form>
      </details>
      <div className="crm-detail-grid">
        {data.detailOpportunities.map((o) => (
          <OpportunityCard key={o.id} data={data} item={o} />
        ))}
      </div>
      <details className="crm-disclosure">
        <summary>Registrar actividad o programar seguimiento</summary>
        <form className="crm-form" action={createActivity}>
          <Context data={data} lead={lead.id} />
          <input type="hidden" name="request_id" value={randomUUID()} />
          <label>
            Tipo
            <select name="kind">
              {[
                "llamada",
                "correo",
                "whatsapp",
                "mensaje",
                "reunion",
                "tarea",
                "seguimiento",
                "nota",
              ].map((k) => (
                <option key={k}>{k}</option>
              ))}
            </select>
          </label>
          <Field label="Título *" name="title" required maxLength={200} />
          <Field
            label="Fecha (hora de República Dominicana)"
            name="due_at"
            type="datetime-local"
          />
          <Text label="Observaciones" name="notes" />
          <button className="button">Guardar actividad</button>
        </form>
      </details>
      <h3>Actividades</h3>
      <div className="crm-detail-grid">
        {data.detailActivities.map((a) => (
          <ActivityCard key={a.id} data={data} item={a} />
        ))}
      </div>
      {!data.detailActivities.length && (
        <Empty>Sin actividades registradas.</Empty>
      )}
      <details className="crm-disclosure">
        <summary>Registrar propuesta comercial (sin enviar)</summary>
        <form className="crm-form" action={createProposal}>
          <Context data={data} lead={lead.id} />
          <input type="hidden" name="request_id" value={randomUUID()} />
          <Field label="Título *" name="title" required maxLength={200} />
          <Text label="Productos o servicios" name="items" />
          <Field
            label="Importe *"
            name="amount"
            type="number"
            step="0.01"
            min="0"
            max="99999999999999"
            required
          />
          <Field
            label="Moneda ISO *"
            name="currency"
            required
            pattern="[A-Z]{3}"
            defaultValue="DOP"
          />
          <label>
            Estado registrado
            <select name="status">
              <option value="draft">Borrador</option>
              <option value="sent">Enviada por otro canal</option>
              <option value="accepted">Aceptada</option>
              <option value="rejected">Rechazada</option>
              <option value="expired">Vencida</option>
            </select>
          </label>
          <Field label="Fecha de emisión" name="issued_at" type="date" />
          <Field label="Vigencia hasta" name="valid_until" type="date" />
          <button className="button">Registrar propuesta</button>
        </form>
      </details>
      <ul className="crm-proposals">
        {data.proposals.map((p) => (
          <li key={p.id}>
            <strong>{p.title}</strong> · {money(p.amount, p.currency)} ·{" "}
            {
              (
                {
                  draft: "Borrador",
                  sent: "Enviada",
                  accepted: "Aceptada",
                  rejected: "Rechazada",
                  expired: "Vencida",
                } as Record<string, string>
              )[p.status]
            }
          </li>
        ))}
      </ul>
      <h3>Historial de cambios</h3>
      <p className="muted">
        Últimos {data.history.length} de {data.historyCount} eventos. Las
        actualizaciones se registran automáticamente.
      </p>
      <ol className="crm-history">
        {data.history.map((h) => (
          <li key={h.id}>
            <strong>
              {h.action === "INSERT" ? "Creación" : "Actualización"} ·{" "}
              {
                (
                  {
                    crm_leads: "Prospecto",
                    crm_contacts: "Contacto",
                    crm_opportunities: "Oportunidad",
                    crm_activities: "Actividad",
                    crm_proposals: "Propuesta",
                  } as Record<string, string>
                )[h.entity_type]
              }
            </strong>
            <span>
              {date(h.changed_at)} ·{" "}
              {h.actor_id
                ? `Usuario ${h.actor_id.slice(0, 8)}`
                : "Integración del servidor"}
            </span>
            {h.before_data && (
              <span>
                Campos:{" "}
                {Object.keys(h.after_data)
                  .filter(
                    (k) =>
                      k !== "updated_at" &&
                      JSON.stringify(h.after_data[k]) !==
                        JSON.stringify(h.before_data?.[k]),
                  )
                  .join(", ") || "sin cambios de contenido"}
              </span>
            )}
          </li>
        ))}
      </ol>
    </section>
  );
}
function OpportunityCard({ data, item }: { data: CrmData; item: Opportunity }) {
  return (
    <article className="card crm-opportunity">
      <h3>{item.service}</h3>
      <p>{data.brands.find((b) => b.id === item.brand_id)?.name}</p>
      <strong>{money(item.estimated_value, item.currency)}</strong>
      <p>
        Probabilidad: {item.probability}% · Cierre estimado:{" "}
        {item.expected_close || "Sin fecha"}
      </p>
      {item.stage === "ganado" && (
        <p>Valor cerrado: {money(item.closed_value || 0, item.currency)}</p>
      )}
      <p>{item.next_action || "Sin próxima acción"}</p>
      <Link
        className="text-link"
        href={crmUrl(data.query, { lead: item.lead_id })}
      >
        Abrir prospecto
      </Link>
      <form className="crm-form" action={moveOpportunity}>
        <Context data={data} lead={item.lead_id} />
        <input type="hidden" name="id" value={item.id} />
        <input type="hidden" name="version" value={item.updated_at} />
        <label>
          Cambiar etapa
          <select name="stage" defaultValue={item.stage}>
            {Object.entries(stages).map(([s, l]) => (
              <option key={s} value={s}>
                {l}
              </option>
            ))}
          </select>
        </label>
        <Field
          label="Valor cerrado (obligatorio al ganar)"
          name="closed_value"
          type="number"
          min="0"
          max="99999999999999"
          step="0.01"
          defaultValue={item.closed_value ?? ""}
        />
        <button className="button secondary">Guardar etapa</button>
      </form>
    </article>
  );
}
function ActivityCard({ data, item }: { data: CrmData; item: Activity }) {
  return (
    <article className="card crm-list-item">
      <h3>{item.title}</h3>
      <p>
        {item.kind} · {data.brands.find((b) => b.id === item.brand_id)?.name}
      </p>
      <p>{item.notes}</p>
      {item.completed_at ? (
        <p>Completada · {date(item.completed_at)}</p>
      ) : (
        <Due now={data.now} value={item.due_at} />
      )}
      <Link
        className="text-link"
        href={crmUrl(data.query, { lead: item.lead_id })}
      >
        Abrir prospecto
      </Link>
      {!item.completed_at && (
        <form action={completeActivity}>
          <Context data={data} lead={item.lead_id} />
          <input type="hidden" name="id" value={item.id} />
          <button className="button secondary">Marcar completada</button>
        </form>
      )}
    </article>
  );
}
