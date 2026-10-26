import { z } from "zod";
const text = z.string().max(200);
export const attributionSchema = z
  .object({
    utm_source: text.optional(),
    utm_medium: text.optional(),
    utm_campaign: text.optional(),
    utm_content: text.optional(),
    utm_term: text.optional(),
    advertising_consent: z.boolean(),
    fbclid: z.string().max(300).optional(),
    fbp: z.string().max(300).optional(),
    fbc: z.string().max(300).optional(),
  })
  .strict()
  .refine(
    (v) => v.advertising_consent || !(v.fbclid || v.fbp || v.fbc),
    "Los identificadores publicitarios requieren consentimiento",
  );
export const journeySchema = z
  .object({
    kind: z.enum([
      "consent.updated",
      "page.viewed",
      "checkout.started",
      "diagnostic.completed",
      "registration.completed",
      "trial.started",
      "trial.ended",
      "subscription.cancelled",
      "subscription.paid",
      "email.accepted",
      "email.failed",
    ]),
    form: z.literal("ceo-diagnostico-v1"),
    capture_id: z.uuid(),
    attribution: attributionSchema,
    diagnostic: z
      .object({
        success: z.literal(true),
        fallback: z.boolean(),
        method: z.literal("ceo_score_rules_v1"),
        score: z.number().int().min(0).max(100),
        classification: z.enum(["Crítico", "Inestable", "Saludable"]),
        diagnosis: z.string().max(3000),
        profitability: z.string().max(3000),
        cashflow: z.string().max(3000),
        recommendations: z.array(z.string().max(1000)).max(3),
      })
      .strict(),
    answers: z
      .record(z.string().max(100), z.union([z.string().max(200), z.boolean()]))
      .refine((v) => Object.keys(v).length <= 8),
    promotional_consent: z.boolean(),
    data: z
      .record(z.string().max(100), z.unknown())
      .refine((v) => JSON.stringify(v).length <= 10000),
  })
  .strict()
  .superRefine((v, c) => {
    if (
      v.kind === "subscription.paid" &&
      (!(typeof v.data.amount === "number") ||
        !Number.isFinite(v.data.amount) ||
        v.data.amount <= 0 ||
        !/^[A-Z]{3}$/.test(String(v.data.currency || "")) ||
        !v.data.payment_id ||
        !["paypal", "stripe"].includes(String(v.data.provider)))
    )
      c.addIssue({
        code: "custom",
        message: "El pago requiere identificador, importe y moneda confirmados",
      });
    if (
      v.kind === "trial.started" &&
      (!v.data.subscription_id ||
        !z.iso.datetime({ offset: true }).safeParse(v.data.ends_at).success)
    )
      c.addIssue({
        code: "custom",
        message: "La prueba requiere suscripción y finalización verificadas",
      });
  });
