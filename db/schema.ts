import { sql } from "drizzle-orm";
import { integer, sqliteTable, text } from "drizzle-orm/sqlite-core";

export const cloudBackups = sqliteTable("cloud_backups", {
  userId: text("user_id").primaryKey(),
  ciphertext: text("ciphertext").notNull(),
  initializationVector: text("initialization_vector").notNull(),
  checksum: text("checksum").notNull(),
  schemaVersion: integer("schema_version").notNull(),
  revision: integer("revision").notNull().default(1),
  clientUpdatedAt: text("client_updated_at").notNull(),
  createdAt: text("created_at").notNull().default(sql`CURRENT_TIMESTAMP`),
  updatedAt: text("updated_at").notNull().default(sql`CURRENT_TIMESTAMP`),
});
