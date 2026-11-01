import { pgTable, serial, text, integer, unique } from "drizzle-orm/pg-core";

export const events = pgTable("events", {
  id: serial().primaryKey(),
  name: text().notNull(),
  category: text().notNull(),
  description: text().notNull(),
  eventDate: text("event_date").notNull(),
  eventTime: text("event_time").notNull(),
  venue: text().notNull(),
  organizer: text().notNull(),
});

export const registrations = pgTable(
  "registrations",
  {
    id: serial().primaryKey(),
    eventId: integer("event_id")
      .notNull()
      .references(() => events.id, { onDelete: "cascade" }),
    studentName: text("student_name").notNull(),
    email: text().notNull(),
    department: text().notNull(),
  },
  (table) => [unique().on(table.eventId, table.email)],
);
