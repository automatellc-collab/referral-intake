import "server-only";

import { drizzle } from "drizzle-orm/neon-http";
import { neon } from "@neondatabase/serverless";
import * as schema from "./schema";

const connectionString = process.env.DATABASE_URL;

let db: any = null;

if (connectionString) {
  const sql = neon(connectionString);
  db = drizzle(sql, { schema });
} else {
  console.warn(
    "DATABASE_URL not configured. Database features will be unavailable. Set DATABASE_URL to enable caching, audit logging, and review queue."
  );
  db = createMockDatabase();
}

export { db };

export type Database = typeof db;

function createMockDatabase() {
  return {
    query: {
      auditLog: { findMany: async () => [] },
      extractionFeedback: { findMany: async () => [] },
      reviewQueue: { findMany: async () => [] },
      templates: { findMany: async () => [], findFirst: async () => null },
      templateVersions: { findMany: async () => [], findFirst: async () => null },
      extractionSamples: { findMany: async () => [], findFirst: async () => null },
    },
    insert: () => ({
      values: (data: any) => ({
        returning: async () => [{ id: 'mock-id', ...data, createdAt: new Date(), updatedAt: new Date() }],
      }),
    }),
    update: () => ({
      set: (data: any) => ({
        where: async () => [{ id: 'mock-id', ...data, updatedAt: new Date() }],
      }),
    }),
    delete: () => ({ where: async () => {} }),
  };
}
