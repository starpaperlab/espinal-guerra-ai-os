import { z } from "zod";
export const captureFormSchema = z
  .object({
    fields: z
      .array(
        z
          .object({
            name: z.enum([
              "name",
              "email",
              "phone",
              "company",
              "service_interest",
              "message",
              "monthly_leads",
              "budget",
              "urgency",
            ]),
            label: z.string().trim().min(1).max(100),
            type: z.enum(["text", "email", "tel", "textarea", "number"]),
            required: z.boolean(),
          })
          .strict(),
      )
      .max(20),
    reference: z.string().max(200).optional(),
    renderer: z.literal("not_implemented").default("not_implemented"),
  })
  .strict()
  .refine(
    (v) => new Set(v.fields.map((f) => f.name)).size === v.fields.length,
    "No duplicar campos",
  );
export const automationPlanSchema = z
  .object({
    version: z.literal(1),
    conditions: z
      .array(
        z
          .object({
            fact: z.enum([
              "score",
              "classification",
              "stage",
              "source",
              "campaign",
              "is_test",
            ]),
            operator: z.enum(["eq", "gte", "lte", "in"]),
            value: z.union([
              z.string().max(200),
              z.number().finite(),
              z.boolean(),
              z.array(z.string().max(100)).max(20),
            ]),
          })
          .strict(),
      )
      .max(20),
    steps: z
      .array(
        z
          .object({
            kind: z.enum([
              "capture",
              "evaluation",
              "diagnostic_email",
              "trial_invitation",
              "followup",
              "subscription_conversion",
            ]),
            requires_approval: z.boolean().optional(),
            days: z.number().int().min(0).max(365).optional(),
          })
          .strict(),
      )
      .max(12),
    execution: z.literal("not_implemented"),
  })
  .strict()
  .refine(
    (plan) =>
      plan.steps.every(
        (step) =>
          !["diagnostic_email", "trial_invitation", "followup"].includes(
            step.kind,
          ) || step.requires_approval === true,
      ),
    "Las comunicaciones requieren aprobación explícita futura",
  );
