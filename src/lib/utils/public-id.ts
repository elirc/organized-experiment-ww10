/**
 * What this file does: Generates stable-looking public identifiers for loan applications.
 * What calls it: `src/services/application-command-service.ts`.
 * What it calls: Node's `crypto` module.
 * One thing a junior engineer would likely get wrong when writing something similar:
 * Exposing raw database IDs externally, which leaks implementation details and makes future
 * migrations or cross-system references harder to manage.
 */
import { randomInt } from "node:crypto";

export function createApplicationPublicId() {
  return `APP-${randomInt(1000, 9999)}`;
}
