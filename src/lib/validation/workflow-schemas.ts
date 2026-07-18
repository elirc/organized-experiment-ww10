/**
 * What this file does: Defines validation boundaries for workflow commands such as verification
 * requests, external results, decisions, and condition updates.
 * What calls it: Workflow route handlers in `src/app/api/applications/**` and
 * `src/app/api/conditions/**`.
 * What it calls: `zod`.
 * One thing a junior engineer would likely get wrong when writing something similar:
 * Treating provider webhooks and human workflow actions as "trusted" and skipping validation,
 * which is how stale or malformed events start moving the state machine unexpectedly.
 */
import {
  ConditionStatus,
  DecisionOutcome,
  ExternalEventType,
  VerificationStatus,
  VerificationType,
} from "@prisma/client";
import { z } from "zod";

export const requestVerificationSchema = z.object({
  type: z.enum(VerificationType),
  providerReference: z.string().min(3).max(40).optional(),
});

export const externalEventSchema = z.object({
  type: z.enum(VerificationType),
  eventType: z.enum(ExternalEventType),
  status: z.enum(VerificationStatus),
  providerSequence: z.number().int().min(1),
  providerReference: z.string().min(3).max(40).optional(),
  summary: z.string().min(8).max(200),
  occurredAt: z.iso.datetime(),
  payload: z.record(z.string(), z.unknown()).default({}),
});

export const decisionSchema = z.object({
  outcome: z.enum(DecisionOutcome).exclude(["PENDING"]),
  reason: z.string().min(10).max(280),
});

export const createConditionSchema = z.object({
  title: z.string().min(5).max(100),
  description: z.string().min(10).max(280),
  dueAt: z.iso.datetime().optional(),
});

export const resolveConditionSchema = z.object({
  status: z.enum(ConditionStatus).exclude(["OPEN"]),
  resolutionNote: z.string().min(8).max(240),
});
