INSERT INTO "events" ("name", "category", "description", "event_date", "event_time", "venue", "organizer") VALUES
  ('Build Your First Website', 'Workshop', 'A beginner-friendly session to make a simple website using HTML and CSS.', to_char(CURRENT_DATE + 3, 'YYYY-MM-DD'), '10:00', 'Computer Lab 2', 'Coding Club'),
  ('Campus Music Evening', 'Cultural', 'Bring your friends and enjoy live performances by students.', to_char(CURRENT_DATE + 7, 'YYYY-MM-DD'), '17:00', 'Main Auditorium', 'Arts Club'),
  ('Inter-Department Football', 'Sports', 'A friendly football tournament. Teams from every department are welcome.', to_char(CURRENT_DATE + 11, 'YYYY-MM-DD'), '15:30', 'College Ground', 'Sports Committee'),
  ('Intro to Robotics', 'Technical', 'See basic sensors and motors in action, with a small hands-on activity.', to_char(CURRENT_DATE + 15, 'YYYY-MM-DD'), '11:00', 'Innovation Lab', 'Robotics Club');
