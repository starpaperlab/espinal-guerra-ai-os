import { z } from "zod";
export const stages = {
  nuevo: "Nuevo",
  contactado: "Contactado",
  interesado: "Interesado",
  propuesta_enviada: "Propuesta enviada",
  negociacion: "Negociación",
  ganado: "Ganado",
  perdido: "Perdido",
} as const;
export const stageSchema = z.enum(
  Object.keys(stages) as [keyof typeof stages, ...(keyof typeof stages)[]],
);
const text = (max: number) => z.string().trim().max(max).default("");
const nullableDate = z
  .string()
  .datetime({ offset: true })
  .nullable()
  .default(null);
const email = z.union([z.email().max(254), z.literal("")]).default("");
export const leadSchema = z
  .object({
    brand_id: z.uuid(),
    name: z.string().trim().min(1).max(160),
    company: text(200),
    email,
    phone: text(60),
    source: z.string().trim().min(1).max(100).default("manual"),
    campaign: text(200),
    service: text(300),
    need: text(10000),
    budget: text(300),
    urgency: text(300),
    notes: text(10000),
    tags: z.array(z.string().trim().min(1).max(50)).max(30).default([]),
    next_action: text(2000),
    follow_up_at: nullableDate,
    owner_id: z.uuid().nullable().default(null),
    stage: stageSchema.default("nuevo"),
    is_test: z.boolean().default(false),
  })
  .strict();
export const opportunitySchema = z
  .object({
    lead_id: z.uuid(),
    service: z.string().trim().min(1).max(300),
    estimated_value: z.number().finite().min(0).max(99999999999999),
    currency: z.string().regex(/^[A-Z]{3}$/),
    probability: z.number().int().min(0).max(100),
    expected_close: z.iso.date().nullable(),
    next_action: text(2000),
    request_id: z.uuid(),
  })
  .strict();
export const activitySchema = z
  .object({
    lead_id: z.uuid(),
    kind: z.enum([
      "llamada",
      "correo",
      "whatsapp",
      "mensaje",
      "reunion",
      "tarea",
      "seguimiento",
      "nota",
    ]),
    title: z.string().trim().min(1).max(200),
    notes: text(10000),
    due_at: nullableDate,
    request_id: z.uuid(),
  })
  .strict();
export const proposalSchema = z
  .object({
    lead_id: z.uuid(),
    title: z.string().trim().min(1).max(200),
    items: text(10000),
    amount: z.number().finite().min(0).max(99999999999999),
    currency: z.string().regex(/^[A-Z]{3}$/),
    status: z.enum(["draft", "sent", "accepted", "rejected", "expired"]),
    issued_at: z.iso.date().nullable(),
    valid_until: z.iso.date().nullable(),
    request_id: z.uuid(),
  })
  .strict()
  .refine(
    (v) => !v.valid_until || !v.issued_at || v.valid_until >= v.issued_at,
    "La vigencia no puede ser anterior a la emisión",
  );
export const webhookSchema = z
  .object({
    event_id: z.string().min(1).max(160),
    external_id: z.string().min(1).max(160),
    type: z.literal("lead.created"),
    brand_id: z.uuid(),
    contact: z
      .object({
        name: z.string().trim().min(1).max(160),
        company: text(200),
        email,
        phone: text(60),
      })
      .strict(),
    source: z.string().trim().min(1).max(100),
    campaign: text(200),
    message: text(10000),
    budget: text(300),
    urgency: text(300),
    service: text(300),
    need: text(10000),
    score: z.number().int().min(0).max(100).nullable(),
    classification: z.enum(["HOT", "WARM", "COLD"]).nullable(),
    priority: z.string().trim().max(50).nullable().default(null),
    route_to_sales: z.boolean().nullable().default(null),
    response_suggestion: text(10000),
    scoring_breakdown: z
      .record(z.string().min(1).max(100), z.number().finite().min(0).max(100))
      .refine((v) => Object.keys(v).length <= 20)
      .default({}),
    problem: text(10000),
    opportunity: text(10000),
    recommendation: text(10000),
    next_action: text(2000),
    occurred_at: z.iso.datetime({ offset: true }),
    evaluated_at: z.iso.datetime({ offset: true }).nullable(),
    is_test: z.boolean(),
  })
  .strict()
  .refine(
    (v) =>
      (v.score === null &&
        v.classification === null &&
        v.evaluated_at === null) ||
      (v.score !== null &&
        v.classification !== null &&
        v.evaluated_at !== null),
    "La evaluación debe recibirse completa o quedar vacía",
  );
export type LeadInput = z.infer<typeof leadSchema>;
