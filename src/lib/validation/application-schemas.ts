/**
 * What this file does: Owns the Zod input contracts for application CRUD endpoints so validation
 * happens before business logic reaches the service layer.
 * What calls it: Application API routes under `src/app/api/applications/**`.
 * What it calls: `zod`.
 * One thing a junior engineer would likely get wrong when writing something similar:
 * Hiding validation inside Prisma writes or UI forms, which leaves API consumers and tests with
 * inconsistent behavior once the frontend changes or another client is added.
 */
import { LoanProductType } from "@prisma/client";
import { z } from "zod";

const partySchema = z.object({
  firstName: z.string().min(2),
  lastName: z.string().min(2),
  email: z.email(),
  annualIncome: z.number().positive(),
  userId: z.string().min(1).optional(),
});

export const createApplicationSchema = z.object({
  productType: z.enum(LoanProductType),
  purpose: z.string().min(10).max(140),
  requestedAmount: z.number().positive(),
  primaryApplicant: partySchema,
  coApplicant: partySchema.optional(),
});

export const submitApplicationSchema = z.object({
  confirmReady: z.literal(true),
});
