CREATE TABLE "events" (
	"id" serial PRIMARY KEY,
	"name" text NOT NULL,
	"category" text NOT NULL,
	"description" text NOT NULL,
	"event_date" text NOT NULL,
	"event_time" text NOT NULL,
	"venue" text NOT NULL,
	"organizer" text NOT NULL
);
--> statement-breakpoint
CREATE TABLE "registrations" (
	"id" serial PRIMARY KEY,
	"event_id" integer NOT NULL,
	"student_name" text NOT NULL,
	"email" text NOT NULL,
	"department" text NOT NULL,
	CONSTRAINT "registrations_event_id_email_unique" UNIQUE("event_id","email")
);
--> statement-breakpoint
ALTER TABLE "registrations" ADD CONSTRAINT "registrations_event_id_events_id_fkey" FOREIGN KEY ("event_id") REFERENCES "events"("id") ON DELETE CASCADE;