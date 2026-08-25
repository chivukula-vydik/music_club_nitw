// Env vars needed on Vercel:
//   GOOGLE_SERVICE_ACCOUNT_EMAIL  — service account email
//   GOOGLE_PRIVATE_KEY            — PEM private key (with \n newlines)
//   GOOGLE_CALENDAR_ID            — calendar ID (usually the service account email, or a shared calendar ID)

const SA_EMAIL = process.env.GOOGLE_SERVICE_ACCOUNT_EMAIL;
const PRIVATE_KEY = (process.env.GOOGLE_PRIVATE_KEY || "").replace(/\\n/g, "\n");
const CALENDAR_ID = process.env.GOOGLE_CALENDAR_ID || SA_EMAIL;
let googlePromise;

async function loadGoogle() {
  googlePromise = googlePromise || import("googleapis").then((mod) => mod.google);
  return googlePromise;
}

async function getCalendar() {
  const google = await loadGoogle();
  const auth = new google.auth.JWT(SA_EMAIL, null, PRIVATE_KEY, [
    "https://www.googleapis.com/auth/calendar",
  ]);
  return google.calendar({ version: "v3", auth });
}

function validDate(date) {
  if (!/^\d{4}-\d{2}-\d{2}$/.test(date)) return false;
  const [year, month, day] = date.split("-").map(Number);
  const parsed = new Date(Date.UTC(year, month - 1, day));
  return parsed.getUTCFullYear() === year &&
    parsed.getUTCMonth() === month - 1 &&
    parsed.getUTCDate() === day;
}

function addDays(date, days) {
  const [year, month, day] = date.split("-").map(Number);
  const parsed = new Date(Date.UTC(year, month - 1, day + days));
  return parsed.toISOString().slice(0, 10);
}

function addOneHour(date, time) {
  const [year, month, day] = date.split("-").map(Number);
  const [hour, minute] = time.split(":").map(Number);
  const parsed = new Date(Date.UTC(year, month - 1, day, hour + 1, minute));
  return parsed.toISOString().slice(0, 16) + ":00";
}

module.exports = async (req, res) => {
  res.setHeader("Access-Control-Allow-Origin", "*");
  res.setHeader("Access-Control-Allow-Methods", "POST, OPTIONS");
  res.setHeader("Access-Control-Allow-Headers", "Content-Type");
  if (req.method === "OPTIONS") return res.status(200).end();
  if (req.method !== "POST") return res.status(405).json({ error: "POST only" });

  const body = req.body || {};
  const title = String(body.title || "").trim();
  const date = String(body.date || "").trim();
  const time = String(body.time || "").trim();
  const description = String(body.description || "");
  const attendees = Array.isArray(body.attendees) ? body.attendees : [];
  if (!title || !date) return res.status(400).json({ error: "title and date required" });
  if (!validDate(date)) return res.status(400).json({ error: "Invalid date" });

  const hasTime = time && /^\d{2}:\d{2}$/.test(time);
  let start, end;
  if (hasTime) {
    const [h, m] = time.split(":").map(Number);
    if (h > 23 || m > 59) return res.status(400).json({ error: "Invalid time" });
    start = { dateTime: `${date}T${time}:00`, timeZone: "Asia/Kolkata" };
    end = { dateTime: addOneHour(date, time), timeZone: "Asia/Kolkata" };
  } else {
    start = { date };
    end = { date: addDays(date, 1) };
  }

  const event = {
    summary: title,
    description,
    start,
    end,
    reminders: {
      useDefault: false,
      overrides: [
        { method: "popup", minutes: 1440 },
        { method: "popup", minutes: 15 },
      ],
    },
  };

  const cleanAttendees = attendees
    .map((email) => String(email || "").trim().toLowerCase())
    .filter((email) => /^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(email));
  if (cleanAttendees.length) {
    event.attendees = cleanAttendees.map((email) => ({ email }));
    event.guestsCanModify = false;
    event.guestsCanSeeOtherGuests = true;
  }

  if (!SA_EMAIL || !PRIVATE_KEY) {
    return res.status(500).json({ error: "Google Calendar not configured" });
  }

  try {
    const cal = await getCalendar();
    const result = await cal.events.insert({
      calendarId: CALENDAR_ID,
      resource: event,
      sendUpdates: "all",
    });
    res.status(200).json({ id: result.data.id, link: result.data.htmlLink });
  } catch (e) {
    console.error("Calendar API error:", e.message);
    res.status(500).json({ error: "Failed to create calendar event: " + e.message });
  }
};
