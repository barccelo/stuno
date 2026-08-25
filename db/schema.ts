import { integer, sqliteTable, text } from "drizzle-orm/sqlite-core";
export const rooms = sqliteTable("rooms", { code:text("code").primaryKey(), state:text("state").notNull(), updatedAt:text("updated_at").notNull() });

export const categoryCards = sqliteTable("category_cards", {
  id: integer("id").primaryKey({ autoIncrement: true }),
  easy: text("easy").notNull(),
  medium: text("medium").notNull(),
  expert: text("expert").notNull(),
  normalEnabled: integer("normal_enabled").notNull().default(1),
  sortOrder: integer("sort_order").notNull(),
  updatedAt: text("updated_at").notNull(),
});

export const categorySetMemberships = sqliteTable("category_set_memberships", {
  id: integer("id").primaryKey({ autoIncrement: true }),
  setName: text("set_name").notNull(),
  fingerprint: text("fingerprint").notNull(),
  updatedAt: text("updated_at").notNull(),
});
