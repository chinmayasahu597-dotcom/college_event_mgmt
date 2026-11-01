const eventsGrid = document.querySelector("#events-grid");
const dashboardList = document.querySelector("#dashboard-list");
const eventForm = document.querySelector("#event-form");
const registrationDialog = document.querySelector("#registration-dialog");
let events = [];
let toastTimer;

async function request(url, options = {}) {
  const response = await fetch(url, {
    ...options,
    headers: { "Content-Type": "application/json", ...(options.headers || {}) }
  });
  const data = await response.json().catch(() => {
    throw new Error("The server returned an unexpected response. Please try again.");
  });
  if (!response.ok) throw new Error(data.error || "Something went wrong.");
  return data;
}

function escapeHtml(value) {
  return String(value).replace(/[&<>"']/g, (character) => ({
    "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;", "'": "&#39;"
  })[character]);
}

function prettyDate(dateString) {
  return new Date(`${dateString}T00:00:00`).toLocaleDateString(undefined, {
    month: "short", day: "numeric", year: "numeric"
  });
}

function showToast(message) {
  const toast = document.querySelector("#toast");
  toast.textContent = message;
  toast.classList.add("visible");
  clearTimeout(toastTimer);
  toastTimer = setTimeout(() => toast.classList.remove("visible"), 2600);
}

async function loadEvents() {
  try {
    events = await request("/api/events");
    renderEvents();
    renderDashboard();
  } catch (error) {
    showToast(error.message);
  }
}

function renderEvents() {
  const query = document.querySelector("#search-input").value.trim().toLowerCase();
  const category = document.querySelector("#category-filter").value;
  const now = new Date();
  const today = [
    now.getFullYear(),
    String(now.getMonth() + 1).padStart(2, "0"),
    String(now.getDate()).padStart(2, "0")
  ].join("-");
  const filtered = events.filter((event) => {
    const matchesText = `${event.name} ${event.description} ${event.venue} ${event.organizer}`
      .toLowerCase().includes(query);
    return event.event_date >= today && matchesText &&
      (category === "All" || event.category === category);
  });

  document.querySelector("#event-total").textContent =
    `${filtered.length} ${filtered.length === 1 ? "event" : "events"}`;
  document.querySelector("#empty-events").hidden = filtered.length !== 0;
  eventsGrid.innerHTML = filtered.map((event) => `
    <article class="event-card">
      <div class="card-top">
        <span class="category-tag">${escapeHtml(event.category)}</span>
        <span class="event-date">${prettyDate(event.event_date)}</span>
      </div>
      <h3>${escapeHtml(event.name)}</h3>
      <p class="event-description">${escapeHtml(event.description)}</p>
      <div class="event-meta">
        <span>◷ ${escapeHtml(event.event_time)}</span>
        <span>⌖ ${escapeHtml(event.venue)}</span>
      </div>
      <div class="card-bottom">
        <span class="organizer-name">By ${escapeHtml(event.organizer)} · ${event.registration_count} registered</span>
        <button class="register-button" data-register="${event.id}">Register</button>
      </div>
    </article>
  `).join("");
}

function renderDashboard() {
  document.querySelector("#empty-dashboard").hidden = events.length !== 0;
  dashboardList.innerHTML = events.map((event) => `
    <article class="dashboard-row" data-dashboard-event="${event.id}">
      <div class="dashboard-main">
        <div class="dashboard-event">
          <h3>${escapeHtml(event.name)}</h3>
          <p>${prettyDate(event.event_date)} at ${escapeHtml(event.event_time)} · ${escapeHtml(event.venue)}</p>
        </div>
        <div class="dashboard-actions">
          <span class="participant-count">${event.registration_count} registered</span>
          <button class="small-button" data-participants="${event.id}">Participants</button>
          <button class="small-button" data-edit="${event.id}">Edit</button>
          <button class="small-button delete" data-delete="${event.id}">Delete</button>
        </div>
      </div>
      <div class="participant-list" data-participant-list hidden></div>
    </article>
  `).join("");
}

function openRegistration(eventId) {
  const event = events.find((item) => item.id === eventId);
  if (!event) return;
  document.querySelector("#registration-form").reset();
  document.querySelector("#registration-event-id").value = event.id;
  document.querySelector("#registration-title").textContent = event.name;
  document.querySelector("#registration-message").textContent = "";
  registrationDialog.showModal();
}

function resetEventForm() {
  eventForm.reset();
  document.querySelector("#event-id").value = "";
  document.querySelector("#form-title").textContent = "Create an event";
  eventForm.hidden = true;
}

document.querySelectorAll(".nav-link").forEach((button) => {
  button.addEventListener("click", () => {
    document.querySelectorAll(".nav-link").forEach((item) => item.classList.remove("active"));
    button.classList.add("active");
    document.querySelector("#discover-page").hidden = button.dataset.page !== "discover";
    document.querySelector("#organizer-page").hidden = button.dataset.page !== "organizer";
    window.scrollTo({ top: 0, behavior: "smooth" });
  });
});

document.querySelector("#search-input").addEventListener("input", renderEvents);
document.querySelector("#category-filter").addEventListener("change", renderEvents);
eventsGrid.addEventListener("click", (event) => {
  const button = event.target.closest("[data-register]");
  if (button) openRegistration(Number(button.dataset.register));
});

document.querySelector("#new-event-button").addEventListener("click", () => {
  resetEventForm();
  eventForm.hidden = false;
  eventForm.scrollIntoView({ behavior: "smooth", block: "center" });
});
document.querySelector("#cancel-edit").addEventListener("click", resetEventForm);

eventForm.addEventListener("submit", async (event) => {
  event.preventDefault();
  const formData = new FormData(eventForm);
  const payload = Object.fromEntries(formData.entries());
  const eventId = document.querySelector("#event-id").value;
  try {
    await request(eventId ? `/api/events/${eventId}` : "/api/events", {
      method: eventId ? "PUT" : "POST",
      body: JSON.stringify(payload)
    });
    resetEventForm();
    await loadEvents();
    showToast(eventId ? "Event updated." : "Event created.");
  } catch (error) {
    showToast(error.message);
  }
});

dashboardList.addEventListener("click", async (event) => {
  const button = event.target.closest("button");
  if (!button) return;
  const eventId = Number(button.dataset.participants || button.dataset.edit || button.dataset.delete);
  if (button.dataset.participants) {
    const list = button.closest(".dashboard-row").querySelector("[data-participant-list]");
    if (!list.hidden) {
      list.hidden = true;
      return;
    }
    try {
      const participants = await request(`/api/events/${eventId}/registrations`);
      list.innerHTML = participants.length
        ? `<h4>Registered students (${participants.length})</h4><ul>${participants.map((student) =>
          `<li>${escapeHtml(student.student_name)} · ${escapeHtml(student.department)} · ${escapeHtml(student.email)}</li>`
        ).join("")}</ul>`
        : "<h4>No registrations yet.</h4>";
      list.hidden = false;
    } catch (error) {
      showToast(error.message);
    }
  } else if (button.dataset.edit) {
    const selected = events.find((item) => item.id === eventId);
    if (!selected) return;
    for (const [key, value] of Object.entries(selected)) {
      const field = eventForm.elements.namedItem(key);
      if (field) field.value = value;
    }
    document.querySelector("#event-id").value = selected.id;
    document.querySelector("#form-title").textContent = "Edit event";
    eventForm.hidden = false;
    eventForm.scrollIntoView({ behavior: "smooth", block: "center" });
  } else if (button.dataset.delete) {
    const selected = events.find((item) => item.id === eventId);
    if (!selected || !window.confirm(`Delete "${selected.name}" and its registrations?`)) return;
    try {
      await request(`/api/events/${eventId}`, { method: "DELETE" });
      await loadEvents();
      showToast("Event deleted.");
    } catch (error) {
      showToast(error.message);
    }
  }
});

document.querySelector("#registration-form").addEventListener("submit", async (event) => {
  event.preventDefault();
  const form = event.currentTarget;
  const payload = Object.fromEntries(new FormData(form).entries());
  const eventId = document.querySelector("#registration-event-id").value;
  try {
    await request(`/api/events/${eventId}/registrations`, {
      method: "POST",
      body: JSON.stringify(payload)
    });
    registrationDialog.close();
    await loadEvents();
    showToast("You're registered. See you there!");
  } catch (error) {
    document.querySelector("#registration-message").textContent = error.message;
  }
});

document.querySelector("#close-registration").addEventListener("click", () => registrationDialog.close());
registrationDialog.addEventListener("click", (event) => {
  if (event.target === registrationDialog) registrationDialog.close();
});

loadEvents();
