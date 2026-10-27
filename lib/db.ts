import { PrismaPg } from "@prisma/adapter-pg";
import { PrismaClient } from "@/lib/generated/prisma/client";
import { env } from "@/lib/env";

/** `poolSize` defaults to pg's 10; the worker sizes it to its concurrency, since every check holds a connection. */
export function createPrismaClient(connectionString = env().DATABASE_URL, poolSize?: number) {
  return new PrismaClient({ adapter: new PrismaPg({ connectionString, ...(poolSize ? { max: poolSize } : {}) }) });
}

// Reuse one client across hot reloads in development.
const globalForPrisma = globalThis as unknown as { prisma?: PrismaClient };

export const db: PrismaClient = globalForPrisma.prisma ?? createPrismaClient();

if (process.env.NODE_ENV !== "production") globalForPrisma.prisma = db;
