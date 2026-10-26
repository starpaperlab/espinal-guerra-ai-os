import "server-only";
import { crmContext } from "@/modules/crm/data";
type Report = {
  leads: number;
  diagnostics: number;
  emails_accepted: number;
  trials_started: number;
  trials_active: number;
  trials_finished: number;
  paid_customers: number;
  paid_subscriptions: number;
  revenue: { currency: string; amount: number }[];
  campaigns: {
    campaign: string;
    diagnostics: number;
    trials: number;
    paid: number;
  }[];
};
export async function CommercialReport({ brandId }: { brandId?: string }) {
  const { client, organizationId } = await crmContext();
  const { data, error } = await client.rpc("crm_commercial_report", {
    p_org: organizationId,
    p_brand: brandId || null,
  });
  if (error)
    return (
      <section className="card crm-detail">
        <h2>Recorrido comercial CEO Rentable</h2>
        <p role="status">
          Informe pendiente: aplica la migración comercial 008 y valida la
          recepción de eventos.
        </p>
      </section>
    );
  const report = data as Report;
  return (
    <section className="crm card crm-detail">
      <h2>Recorrido comercial</h2>
      <p>
        Acumulado de datos propios desde la activación; el filtro de fechas de
        Meta Ads no modifica este informe. Las pruebas están excluidas. Los
        correos aceptados por Resend no equivalen a entrega en la bandeja. Solo
        incluye capturas vinculadas a este recorrido; no reconstruye cobros
        históricos ni pagos sin contacto verificado.
      </p>
      <div className="crm-metrics">
        {[
          ["Prospectos captados", report.leads],
          ["Diagnósticos completados", report.diagnostics],
          ["Correos aceptados", report.emails_accepted],
          ["Pruebas iniciadas", report.trials_started],
          ["Pruebas activas según eventos", report.trials_active],
          ["Pruebas finalizadas por fecha", report.trials_finished],
          ["Clientas con pago confirmado", report.paid_customers],
          ["Suscripciones con cobro confirmado", report.paid_subscriptions],
        ].map(([label, value]) => (
          <div className="crm-metric" key={label}>
            <span>{label}</span>
            <strong>{value}</strong>
          </div>
        ))}
      </div>
      <h3>Cobros confirmados por moneda</h3>
      {report.revenue.length ? (
        report.revenue.map((r) => (
          <p key={r.currency}>
            {new Intl.NumberFormat("es-DO", {
              style: "currency",
              currency: r.currency,
            }).format(r.amount)}
          </p>
        ))
      ) : (
        <p>Sin cobros confirmados recibidos.</p>
      )}
      <h3>Campañas documentadas por UTM</h3>
      <p className="muted">
        La atribución de URL se conserva como evidencia declarada. No se infiere
        atribución de Meta ni se mezclan estos resultados con sus estadísticas.
      </p>
      {report.campaigns.map((r, i) => (
        <p key={i}>
          <strong>{r.campaign}</strong>: {r.diagnostics} diagnósticos ·{" "}
          {r.trials} pruebas · {r.paid} clientas con pago
        </p>
      ))}
      {!report.campaigns.length && <p>Sin eventos de campaña recibidos.</p>}
    </section>
  );
}
