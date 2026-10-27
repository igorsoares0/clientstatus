import { PrismaPg } from "@prisma/adapter-pg";
import { PrismaClient } from "@/lib/generated/prisma/client";
import { env } from "@/lib/env";

export function createPrismaClient(connectionString = env().DATABASE_URL) {
  return new PrismaClient({ adapter: new PrismaPg({ connectionString }) });
}

// Reuse one client across hot reloads in development.
const globalForPrisma = globalThis as unknown as { prisma?: PrismaClient };

export const db: PrismaClient = globalForPrisma.prisma ?? createPrismaClient();

if (process.env.NODE_ENV !== "production") globalForPrisma.prisma = db;
