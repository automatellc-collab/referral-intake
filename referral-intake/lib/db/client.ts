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
    },
    insert: () => ({ values: async () => {} }),
    update: () => ({ set: () => ({ where: async () => {} }) }),
    delete: () => ({ where: async () => {} }),
  };
}
