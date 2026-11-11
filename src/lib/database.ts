import "server-only";
import { PrismaPg } from "@prisma/adapter-pg";
import { PrismaClient } from "@/generated/prisma/client";

const globalDatabase = globalThis as unknown as { database?: PrismaClient };
export function getDatabase(): PrismaClient {
  if (!process.env.DATABASE_URL)
    throw new Error("Database configuration missing.");
  if (!globalDatabase.database) {
    globalDatabase.database = new PrismaClient({
      adapter: new PrismaPg({
        connectionString: process.env.DATABASE_URL,
        connectionTimeoutMillis: 3000,
      }),
    });
  }
  return globalDatabase.database;
}
