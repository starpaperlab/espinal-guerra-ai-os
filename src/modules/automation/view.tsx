import type { EnterpriseData } from "./data";
import {
  reconcileEnterprise,
  saveCaptureSource,
  setCaptureSourceState,
  saveDraftAutomation,
} from "./actions";
export function EnterpriseView({
  data,
  result,
}: {
  data: EnterpriseData;
  result?: string;
}) {
  const isAdmin = ["owner", "admin"].includes(data.role);
  const messages: Record<string, string> = {
    verificado:
      "Estructura comprobada en Supabase; marcas existentes reutilizadas.",
    revisar_auditoria:
      "No se pudo reconciliar. Revisa la auditoría y la vinculación del operador; no se han movido registros entre organizaciones.",
    fuente_creada: "Fuente creada, deshabilitada por defecto.",
    actualizado: "Configuración guardada.",
    borrador_creado: "Borrador guardado; no ejecuta acciones.",
    validacion: "Revisa los campos obligatorios.",
    no_guardado:
      "No se pudo guardar. Revisa permisos, migración y claves duplicadas.",
    acceso: "Esta operación requiere rol administrador.",
  };
  return (
    <section
      className="crm"
      aria-label="Organización y automatizaciones nativas"
    >
      {messages[result || ""] && (
        <p role="status" className="crm-notice">
          {messages[result!]}
        </p>
      )}
      {data.error && (
        <p role="alert" className="crm-notice">
          {data.error}
        </p>
      )}
      <section className="card crm-detail">
        <h2>Organización autorizada</h2>
        <p>{data.organizationName}</p>
        <p className="muted">ID: {data.organizationId}</p>
        <p>
          Rol: {data.role} · Membresías visibles para tu sesión:{" "}
          {data.memberCount}
        </p>
        <p>
          Captación empresarial:{" "}
          {data.bound
            ? "Vinculada en Supabase"
            : "Pendiente de vinculación por el operador SQL"}
        </p>
        <h3>Marcas registradas en Supabase</h3>
        <ul>
          {data.brands.map((b) => (
            <li key={b.id}>
              <strong>{b.name}</strong> · {b.slug}
              <p className="muted">{b.id}</p>
            </li>
          ))}
        </ul>
        {!data.brands.length && (
          <p>No se pudieron confirmar marcas registradas.</p>
        )}
        {isAdmin && (
          <form action={reconcileEnterprise}>
            <button
              className="button secondary"
              disabled={!data.bound || Boolean(data.error)}
            >
              Verificar y completar marca corporativa
            </button>
            <p className="muted">
              Reutiliza IDs existentes. Solo agrega la marca corporativa si
              falta, dentro de la organización vinculada; no crea otra
              organización.
            </p>
          </form>
        )}
      </section>
      {!data.error && (
        <>
          <section className="card crm-detail">
            <h2>Fuentes de captación por marca</h2>
            <p>
              La clave de fuente identifica el formulario, campaña o
              integración. El servidor resuelve su organización y marca desde
              Supabase; no necesitas un Brand ID fijo en Vercel.
            </p>
            {data.sources.map((s) => (
              <article className="crm-list-item" key={s.id}>
                <h3>{s.name}</h3>
                <p>
                  {s.source_key} ·{" "}
                  {data.brands.find((b) => b.id === s.brand_id)?.name} ·{" "}
                  {(
                    {
                      native: "Nativo (formulario pendiente)",
                      n8n: "n8n opcional",
                      signed_backend: "Backend firmado",
                    } as Record<string, string>
                  )[s.provider] || s.provider}
                </p>
                <p>
                  {s.enabled
                    ? "Recepción autorizada para este backend"
                    : "Deshabilitada"}
                </p>
                {isAdmin && s.provider !== "native" && (
                  <form action={setCaptureSourceState}>
                    <input type="hidden" name="id" value={s.id} />
                    <input
                      type="hidden"
                      name="enabled"
                      value={s.enabled ? "false" : "true"}
                    />
                    <button className="button secondary">
                      {s.enabled
                        ? "Deshabilitar fuente"
                        : "Autorizar recepción firmada"}
                    </button>
                  </form>
                )}
              </article>
            ))}
            {isAdmin && data.bound && (
              <details className="crm-disclosure">
                <summary>Registrar fuente autorizada</summary>
                <form action={saveCaptureSource} className="crm-form">
                  <label>
                    Clave única
                    <input
                      name="source_key"
                      required
                      pattern="[a-z0-9][a-z0-9_-]{2,99}"
                      maxLength={100}
                    />
                  </label>
                  <label>
                    Nombre
                    <input name="name" required maxLength={160} />
                  </label>
                  <label>
                    Marca existente
                    <select name="brand_id" required>
                      {data.brands.map((b) => (
                        <option key={b.id} value={b.id}>
                          {b.name}
                        </option>
                      ))}
                    </select>
                  </label>
                  <label>
                    Proveedor
                    <select name="provider">
                      <option value="signed_backend">
                        Backend firmado (diagnóstico existente)
                      </option>
                      <option value="native">
                        Nativo · configuración futura de formulario
                      </option>
                      <option value="n8n">n8n opcional</option>
                    </select>
                  </label>
                  <label>
                    Esquema de formulario (configuración, no publicación)
                    <textarea
                      name="form_schema"
                      rows={4}
                      maxLength={10000}
                      defaultValue={'{"fields":[]}'}
                    />
                  </label>
                  <button className="button">Guardar deshabilitada</button>
                </form>
              </details>
            )}
          </section>
          <section className="card crm-detail">
            <h2>Automatizaciones nativas · infraestructura</h2>
            <p className="crm-notice">
              Los eventos y borradores se guardan en Supabase. No hay worker
              comercial activo, proveedor IA conectado ni envíos Resend. Las
              definiciones no pueden activarse en esta fase.
            </p>
            {data.definitions.map((d) => (
              <article className="crm-list-item" key={d.id}>
                <h3>{d.name}</h3>
                <p>
                  {data.brands.find((b) => b.id === d.brand_id)?.name} ·{" "}
                  {d.status === "draft" ? "Borrador sin ejecución" : "Pausada"}
                </p>
              </article>
            ))}
            {isAdmin && data.bound && (
              <details className="crm-disclosure">
                <summary>Guardar definición en borrador</summary>
                <form action={saveDraftAutomation} className="crm-form">
                  <label>
                    Clave
                    <input
                      name="definition_key"
                      required
                      pattern="[a-z0-9][a-z0-9_-]{2,99}"
                    />
                  </label>
                  <label>
                    Nombre
                    <input name="name" required maxLength={160} />
                  </label>
                  <label>
                    Marca
                    <select name="brand_id" required>
                      {data.brands.map((b) => (
                        <option key={b.id} value={b.id}>
                          {b.name}
                        </option>
                      ))}
                    </select>
                  </label>
                  <button className="button">
                    Guardar borrador sin acciones
                  </button>
                </form>
              </details>
            )}
            <h3>Últimos eventos internos</h3>
            <ul>
              {data.events.map((e) => (
                <li key={e.id}>
                  {e.kind} · {e.status} · intentos {e.attempts} ·{" "}
                  {e.is_test ? "Prueba" : "Registro real"}
                </li>
              ))}
            </ul>
            {!data.events.length && (
              <p>
                Sin eventos registrados. No se generaron eventos retroactivos ni
                datos de demostración.
              </p>
            )}
            <h3>Historial de intentos del motor</h3>
            <ul>
              {data.runs.map((r) => (
                <li key={r.id}>
                  {r.status} {r.error_code ? `· ${r.error_code}` : ""}
                </li>
              ))}
            </ul>
            {!data.runs.length && (
              <p>
                No hay ejecuciones de worker. No se presentan acciones como
                completadas.
              </p>
            )}
          </section>
        </>
      )}
    </section>
  );
}
