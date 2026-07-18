/**
 * What this file does: Defines the request schemas for login/session management endpoints.
 * What calls it: `src/app/api/session/login/route.ts`.
 * What it calls: `zod`.
 * One thing a junior engineer would likely get wrong when writing something similar:
 * Accepting any arbitrary string as a demo-user target and assuming the database lookup will
 * catch it later, which makes the endpoint harder to reason about and harder to document.
 */
import { z } from "zod";

export const loginSchema = z.object({
  userId: z.string().min(1),
});
