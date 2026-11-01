import json
import os
import re
import sqlite3
from contextlib import contextmanager
from datetime import date, timedelta
from http.server import BaseHTTPRequestHandler, HTTPServer
from pathlib import Path
from urllib.parse import urlparse


ROOT = Path(__file__).parent
DATABASE = Path(os.environ.get("EVENTS_DATABASE", ROOT / "college_events.db"))


@contextmanager
def connect_database():
    connection = sqlite3.connect(DATABASE)
    connection.row_factory = sqlite3.Row
    connection.execute("PRAGMA foreign_keys = ON")
    try:
        with connection:
            yield connection
    finally:
        connection.close()


def initialize_database():
    with connect_database() as connection:
        connection.executescript(
            """
            CREATE TABLE IF NOT EXISTS events (
                id INTEGER PRIMARY KEY AUTOINCREMENT,
                name TEXT NOT NULL,
                category TEXT NOT NULL,
                description TEXT NOT NULL,
                event_date TEXT NOT NULL,
                event_time TEXT NOT NULL,
                venue TEXT NOT NULL,
                organizer TEXT NOT NULL
            );
            CREATE TABLE IF NOT EXISTS registrations (
                id INTEGER PRIMARY KEY AUTOINCREMENT,
                event_id INTEGER NOT NULL REFERENCES events(id) ON DELETE CASCADE,
                student_name TEXT NOT NULL,
                email TEXT NOT NULL,
                department TEXT NOT NULL,
                UNIQUE(event_id, email)
            );
            """
        )
        if connection.execute("SELECT COUNT(*) FROM events").fetchone()[0] == 0:
            today = date.today()
            sample_events = [
                (
                    "Build Your First Website",
                    "Workshop",
                    "A beginner-friendly session to make a simple website using HTML and CSS.",
                    (today + timedelta(days=3)).isoformat(),
                    "10:00",
                    "Computer Lab 2",
                    "Coding Club",
                ),
                (
                    "Campus Music Evening",
                    "Cultural",
                    "Bring your friends and enjoy live performances by students.",
                    (today + timedelta(days=7)).isoformat(),
                    "17:00",
                    "Main Auditorium",
                    "Arts Club",
                ),
                (
                    "Inter-Department Football",
                    "Sports",
                    "A friendly football tournament. Teams from every department are welcome.",
                    (today + timedelta(days=11)).isoformat(),
                    "15:30",
                    "College Ground",
                    "Sports Committee",
                ),
                (
                    "Intro to Robotics",
                    "Technical",
                    "See basic sensors and motors in action, with a small hands-on activity.",
                    (today + timedelta(days=15)).isoformat(),
                    "11:00",
                    "Innovation Lab",
                    "Robotics Club",
                ),
            ]
            connection.executemany(
                """
                INSERT INTO events
                    (name, category, description, event_date, event_time, venue, organizer)
                VALUES (?, ?, ?, ?, ?, ?, ?)
                """,
                sample_events,
            )


class EventHandler(BaseHTTPRequestHandler):
    def send_json(self, data, status=200):
        body = json.dumps(data).encode("utf-8")
        self.send_response(status)
        self.send_header("Content-Type", "application/json; charset=utf-8")
        self.send_header("Content-Length", str(len(body)))
        self.end_headers()
        self.wfile.write(body)

    def read_json(self):
        length = int(self.headers.get("Content-Length", "0"))
        if length > 100_000:
            raise ValueError("Request is too large.")
        return json.loads(self.rfile.read(length) or b"{}")

    def do_GET(self):
        path = urlparse(self.path).path
        if path == "/api/events":
            with connect_database() as connection:
                events = connection.execute(
                    """
                    SELECT e.*, COUNT(r.id) AS registration_count
                    FROM events e
                    LEFT JOIN registrations r ON r.event_id = e.id
                    GROUP BY e.id
                    ORDER BY e.event_date, e.event_time
                    """
                ).fetchall()
            return self.send_json([dict(event) for event in events])

        match = re.fullmatch(r"/api/events/(\d+)/registrations", path)
        if match:
            event_id = int(match.group(1))
            with connect_database() as connection:
                event = connection.execute(
                    "SELECT id FROM events WHERE id = ?", (event_id,)
                ).fetchone()
                if event is None:
                    return self.send_json({"error": "Event not found."}, 404)
                registrations = connection.execute(
                    """
                    SELECT student_name, email, department
                    FROM registrations WHERE event_id = ?
                    ORDER BY student_name
                    """,
                    (event_id,),
                ).fetchall()
            return self.send_json([dict(row) for row in registrations])

        files = {
            "/": ("index.html", "text/html; charset=utf-8"),
            "/styles.css": ("styles.css", "text/css; charset=utf-8"),
            "/app.js": ("app.js", "text/javascript; charset=utf-8"),
        }
        if path in files:
            filename, content_type = files[path]
            body = (ROOT / filename).read_bytes()
            self.send_response(200)
            self.send_header("Content-Type", content_type)
            self.send_header("Content-Length", str(len(body)))
            self.end_headers()
            return self.wfile.write(body)

        self.send_json({"error": "Not found."}, 404)

    def do_POST(self):
        path = urlparse(self.path).path
        try:
            data = self.read_json()
            if path == "/api/events":
                event = self.validate_event(data)
                with connect_database() as connection:
                    cursor = connection.execute(
                        """
                        INSERT INTO events
                            (name, category, description, event_date, event_time, venue, organizer)
                        VALUES (?, ?, ?, ?, ?, ?, ?)
                        """,
                        event,
                    )
                return self.send_json({"id": cursor.lastrowid}, 201)

            match = re.fullmatch(r"/api/events/(\d+)/registrations", path)
            if match:
                event_id = int(match.group(1))
                registration = self.validate_registration(data)
                with connect_database() as connection:
                    if connection.execute(
                        "SELECT id FROM events WHERE id = ?", (event_id,)
                    ).fetchone() is None:
                        return self.send_json({"error": "Event not found."}, 404)
                    connection.execute(
                        """
                        INSERT INTO registrations
                            (event_id, student_name, email, department)
                        VALUES (?, ?, ?, ?)
                        """,
                        (event_id, *registration),
                    )
                return self.send_json({"message": "Registration successful."}, 201)
        except sqlite3.IntegrityError:
            return self.send_json(
                {"error": "You have already registered with this email."}, 409
            )
        except (ValueError, json.JSONDecodeError) as error:
            return self.send_json({"error": str(error)}, 400)
        self.send_json({"error": "Not found."}, 404)

    def do_PUT(self):
        match = re.fullmatch(r"/api/events/(\d+)", urlparse(self.path).path)
        if not match:
            return self.send_json({"error": "Not found."}, 404)
        try:
            event = self.validate_event(self.read_json())
            with connect_database() as connection:
                cursor = connection.execute(
                    """
                    UPDATE events SET
                        name = ?, category = ?, description = ?, event_date = ?,
                        event_time = ?, venue = ?, organizer = ?
                    WHERE id = ?
                    """,
                    (*event, int(match.group(1))),
                )
            if cursor.rowcount == 0:
                return self.send_json({"error": "Event not found."}, 404)
            self.send_json({"message": "Event updated."})
        except (ValueError, json.JSONDecodeError) as error:
            self.send_json({"error": str(error)}, 400)

    def do_DELETE(self):
        match = re.fullmatch(r"/api/events/(\d+)", urlparse(self.path).path)
        if not match:
            return self.send_json({"error": "Not found."}, 404)
        with connect_database() as connection:
            cursor = connection.execute(
                "DELETE FROM events WHERE id = ?", (int(match.group(1)),)
            )
        if cursor.rowcount == 0:
            return self.send_json({"error": "Event not found."}, 404)
        self.send_json({"message": "Event deleted."})

    @staticmethod
    def validate_event(data):
        fields = (
            "name",
            "category",
            "description",
            "event_date",
            "event_time",
            "venue",
            "organizer",
        )
        values = tuple(str(data.get(field, "")).strip() for field in fields)
        if not all(values):
            raise ValueError("Please fill in every event field.")
        try:
            date.fromisoformat(values[3])
        except ValueError:
            raise ValueError("Please enter a valid event date.")
        return values

    @staticmethod
    def validate_registration(data):
        fields = ("student_name", "email", "department")
        values = tuple(str(data.get(field, "")).strip() for field in fields)
        if not all(values):
            raise ValueError("Please fill in every registration field.")
        if "@" not in values[1] or "." not in values[1].split("@")[-1]:
            raise ValueError("Please enter a valid email address.")
        return values

    def log_message(self, format_string, *args):
        print(f"[event-app] {format_string % args}")


if __name__ == "__main__":
    initialize_database()
    server = HTTPServer(("127.0.0.1", 8000), EventHandler)
    print("College Event Management Platform running at http://127.0.0.1:8000")
    try:
        server.serve_forever()
    except KeyboardInterrupt:
        print("\nServer stopped.")
    finally:
        server.server_close()
