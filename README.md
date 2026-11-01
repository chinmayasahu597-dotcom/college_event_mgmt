# Campus Events

A small college event app made with Python's built-in HTTP server, SQLite, and plain HTML, CSS, and JavaScript.

## Run it

1. Make sure Python 3 is installed.
2. Open a terminal in this folder and run `python app.py`.
3. Visit [http://127.0.0.1:8000](http://127.0.0.1:8000).

The app creates `college_events.db` the first time it starts and adds a few sample events. Event and registration data stays in that SQLite database.

Students can search and filter events, then register with their name, email, and department. Organizers can use the Organizer tab to add, edit, and delete events, and view each event's registered students. This is a basic class-project app; the organizer page does not have a login.

## Deploying on Netlify

On Netlify, the files in `public/` are served as a static site. The `/api/...` routes run as a Netlify Function (`netlify/functions/api.ts`), and event and registration data lives in Netlify Database (Postgres). The database schema is in `db/schema.ts`. Migrations in `netlify/database/migrations/` are applied automatically on each deploy, and they add the same sample events on the first one. `app.py` is still available for running the app locally with SQLite.
