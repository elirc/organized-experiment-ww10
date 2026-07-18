/**
 * What this file does: Encapsulates user lookups so session resolution and login flows do not
 * query Prisma directly from routes.
 * What calls it: `src/lib/auth/session.ts` and `src/services/session-service.ts`.
 * What it calls: `src/lib/db/prisma.ts`.
 * One thing a junior engineer would likely get wrong when writing something similar:
 * Querying the user table directly in each auth endpoint, which spreads identity assumptions
 * across the codebase and makes session changes harder to audit.
 */
import { prisma } from "@/lib/db/prisma";

const baseUserSelect = {
  id: true,
  fullName: true,
  email: true,
  role: true,
} as const;

export const userRepository = {
  findById(id: string) {
    return prisma.user.findUnique({
      where: { id },
      select: baseUserSelect,
    });
  },

  listDemoUsers() {
    return prisma.user.findMany({
      orderBy: [{ role: "asc" }, { fullName: "asc" }],
      select: baseUserSelect,
    });
  },
};
