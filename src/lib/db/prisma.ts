/**
 * What this file does: Creates the singleton Prisma client used by repositories and services.
 * What calls it: Repository modules such as `src/repositories/application-repository.ts`.
 * What it calls: `@prisma/client`, `@prisma/adapter-pg`, and `pg`.
 * One thing a junior engineer would likely get wrong when writing something similar:
 * Instantiating `PrismaClient` in every repository file, which creates connection churn and
 * turns local development hot reloads into a pile of leaked database clients.
 */
import { PrismaPg } from "@prisma/adapter-pg";
import { PrismaClient } from "@prisma/client";
import { Pool } from "pg";

declare global {
  var prisma: PrismaClient | undefined;
  var prismaPool: Pool | undefined;
}

const connectionString =
  process.env.DATABASE_URL ?? "postgresql://postgres:postgres@localhost:5432/loan_origination";

const pool =
  globalThis.prismaPool ??
  new Pool({
    connectionString,
  });

export const prisma =
  globalThis.prisma ??
  new PrismaClient({
    adapter: new PrismaPg(pool),
    log: process.env.NODE_ENV === "development" ? ["warn", "error"] : ["error"],
  });

if (process.env.NODE_ENV !== "production") {
  globalThis.prisma = prisma;
  globalThis.prismaPool = pool;
}
