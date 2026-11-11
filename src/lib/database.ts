import "server-only";
import { PrismaPg } from "@prisma/adapter-pg";
import { PrismaClient } from "@/generated/prisma/client";
import { readFileSync } from "node:fs";
import { databaseSettings } from "./profile";

const globalDatabase = globalThis as unknown as { database?: PrismaClient };
export function getDatabase(): PrismaClient {
  const settings = databaseSettings(process.env);
  if (!globalDatabase.database) {
    globalDatabase.database = new PrismaClient({
      adapter: new PrismaPg(
        {
          connectionString: settings.connectionString,
          connectionTimeoutMillis: 3000,
          max: 5,
          ...(settings.tls
            ? {
                ssl: {
                  rejectUnauthorized: true,
                  ...(process.env.SUPABASE_DB_CA_FILE
                    ? {
                        ca: readFileSync(
                          process.env.SUPABASE_DB_CA_FILE,
                          "utf8",
                        ),
                      }
                    : {}),
                },
              }
            : {}),
        },
        { schema: settings.schema },
      ),
    });
  }
  return globalDatabase.database;
}
