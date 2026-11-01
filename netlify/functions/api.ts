import type { Config } from "@netlify/functions";
import { asc, eq, sql } from "drizzle-orm";
import { db } from "../../db/index.js";
import { events, registrations } from "../../db/schema.js";

const EVENT_FIELDS = [
  "name",
  "category",
  "description",
  "event_date",
  "event_time",
  "venue",
  "organizer",
] as const;
const REGISTRATION_FIELDS = ["student_name", "email", "department"] as const;

class BadRequest extends Error {}

const json = (data: unknown, status = 200) => Response.json(data, { status });

async function readJson(req: Request): Promise<Record<string, unknown>> {
  const text = await req.text();
  if (text.length > 100_000) throw new BadRequest("Request is too large.");
  try {
    return text ? JSON.parse(text) : {};
  } catch {
    throw new BadRequest("Invalid JSON.");
  }
}

function pick<T extends readonly string[]>(data: Record<string, unknown>, fields: T) {
  const values = Object.fromEntries(
    fields.map((field) => [field, String(data[field] ?? "").trim()]),
  ) as Record<T[number], string>;
  return { values, complete: fields.every((field) => values[field as T[number]]) };
}

function validateEvent(data: Record<string, unknown>) {
  const { values, complete } = pick(data, EVENT_FIELDS);
  if (!complete) throw new BadRequest("Please fill in every event field.");
  const parsed = new Date(`${values.event_date}T00:00:00Z`);
  if (
    !/^\d{4}-\d{2}-\d{2}$/.test(values.event_date) ||
    Number.isNaN(parsed.getTime()) ||
    parsed.toISOString().slice(0, 10) !== values.event_date
  ) {
    throw new BadRequest("Please enter a valid event date.");
  }
  return {
    name: values.name,
    category: values.category,
    description: values.description,
    eventDate: values.event_date,
    eventTime: values.event_time,
    venue: values.venue,
    organizer: values.organizer,
  };
}

function validateRegistration(data: Record<string, unknown>) {
  const { values, complete } = pick(data, REGISTRATION_FIELDS);
  if (!complete) throw new BadRequest("Please fill in every registration field.");
  const domain = values.email.split("@").at(-1) ?? "";
  if (!values.email.includes("@") || !domain.includes(".")) {
    throw new BadRequest("Please enter a valid email address.");
  }
  return {
    studentName: values.student_name,
    email: values.email,
    department: values.department,
  };
}

function isUniqueViolation(error: unknown) {
  let current: any = error;
  while (current) {
    if (current.code === "23505") return true;
    current = current.cause;
  }
  return false;
}

async function eventExists(id: number) {
  const rows = await db.select({ id: events.id }).from(events).where(eq(events.id, id));
  return rows.length > 0;
}

async function listEvents() {
  const rows = await db
    .select({
      id: events.id,
      name: events.name,
      category: events.category,
      description: events.description,
      event_date: events.eventDate,
      event_time: events.eventTime,
      venue: events.venue,
      organizer: events.organizer,
      registration_count: sql<number>`count(${registrations.id})::int`,
    })
    .from(events)
    .leftJoin(registrations, eq(registrations.eventId, events.id))
    .groupBy(events.id)
    .orderBy(asc(events.eventDate), asc(events.eventTime));
  return json(rows);
}

async function listRegistrations(eventId: number) {
  if (!(await eventExists(eventId))) return json({ error: "Event not found." }, 404);
  const rows = await db
    .select({
      student_name: registrations.studentName,
      email: registrations.email,
      department: registrations.department,
    })
    .from(registrations)
    .where(eq(registrations.eventId, eventId))
    .orderBy(asc(registrations.studentName));
  return json(rows);
}

export default async (req: Request) => {
  const path = new URL(req.url).pathname.replace(/\/+$/, "");
  const eventMatch = path.match(/^\/api\/events\/(\d+)$/);
  const registrationsMatch = path.match(/^\/api\/events\/(\d+)\/registrations$/);

  try {
    if (path === "/api/events") {
      if (req.method === "GET") return await listEvents();
      if (req.method === "POST") {
        const event = validateEvent(await readJson(req));
        const [created] = await db.insert(events).values(event).returning({ id: events.id });
        return json({ id: created.id }, 201);
      }
    }

    if (registrationsMatch) {
      const eventId = Number(registrationsMatch[1]);
      if (req.method === "GET") return await listRegistrations(eventId);
      if (req.method === "POST") {
        const registration = validateRegistration(await readJson(req));
        if (!(await eventExists(eventId))) return json({ error: "Event not found." }, 404);
        await db.insert(registrations).values({ eventId, ...registration });
        return json({ message: "Registration successful." }, 201);
      }
    }

    if (eventMatch) {
      const eventId = Number(eventMatch[1]);
      if (req.method === "PUT") {
        const event = validateEvent(await readJson(req));
        const updated = await db
          .update(events)
          .set(event)
          .where(eq(events.id, eventId))
          .returning({ id: events.id });
        if (updated.length === 0) return json({ error: "Event not found." }, 404);
        return json({ message: "Event updated." });
      }
      if (req.method === "DELETE") {
        const deleted = await db
          .delete(events)
          .where(eq(events.id, eventId))
          .returning({ id: events.id });
        if (deleted.length === 0) return json({ error: "Event not found." }, 404);
        return json({ message: "Event deleted." });
      }
    }

    return json({ error: "Not found." }, 404);
  } catch (error) {
    if (error instanceof BadRequest) return json({ error: error.message }, 400);
    if (isUniqueViolation(error)) {
      return json({ error: "You have already registered with this email." }, 409);
    }
    console.error(error);
    return json({ error: "Something went wrong. Please try again." }, 500);
  }
};

export const config: Config = {
  path: ["/api/events", "/api/events/*"],
};
