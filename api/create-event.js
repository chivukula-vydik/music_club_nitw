// Creates an event on the club's Google Calendar with a Google Meet link and
// returns the link. Members add it to their own calendars manually.
//
// Env vars needed on Vercel (setup steps in supabase-setup.md):
//   GOOGLE_CLIENT_ID, GOOGLE_CLIENT_SECRET — OAuth client from Google Cloud
//   GOOGLE_REFRESH_TOKEN                   — club Gmail's refresh token (calendar.events scope)
//   SUPABASE_URL, SUPABASE_SERVICE_ROLE_KEY — to check the caller is a signed-in member

const { createClient } = require("@supabase/supabase-js");

let googlePromise;
function loadGoogle() {
  googlePromise = googlePromise || import("googleapis").then((mod) => mod.google);
  return googlePromise;
}

function validDate(date) {
  if (!/^\d{4}-\d{2}-\d{2}$/.test(date)) return false;
  const [year, month, day] = date.split("-").map(Number);
  const parsed = new Date(Date.UTC(year, month - 1, day));
  return parsed.getUTCFullYear() === year &&
    parsed.getUTCMonth() === month - 1 &&
    parsed.getUTCDate() === day;
}

function addOneHour(date, time) {
  const [year, month, day] = date.split("-").map(Number);
  const [hour, minute] = time.split(":").map(Number);
  const parsed = new Date(Date.UTC(year, month - 1, day, hour + 1, minute));
  return parsed.toISOString().slice(0, 16) + ":00";
}

module.exports = async (req, res) => {
  res.setHeader("Access-Control-Allow-Origin", process.env.ALLOWED_ORIGIN || "");
  res.setHeader("Access-Control-Allow-Methods", "POST, OPTIONS");
  res.setHeader("Access-Control-Allow-Headers", "Content-Type, Authorization");
  if (req.method === "OPTIONS") return res.status(200).end();
  if (req.method !== "POST") return res.status(405).json({ error: "POST only" });

  const { GOOGLE_CLIENT_ID, GOOGLE_CLIENT_SECRET, GOOGLE_REFRESH_TOKEN, SUPABASE_URL, SUPABASE_SERVICE_ROLE_KEY } = process.env;
  if (!GOOGLE_CLIENT_ID || !GOOGLE_CLIENT_SECRET || !GOOGLE_REFRESH_TOKEN || !SUPABASE_SERVICE_ROLE_KEY)
    return res.status(500).json({ error: "Google Meet not configured" });

  // only signed-in club members may create events on the club calendar
  const token = String(req.headers.authorization || "").replace(/^Bearer\s+/i, "");
  if (!token) return res.status(401).json({ error: "Sign in first" });
  const sb = createClient(SUPABASE_URL, SUPABASE_SERVICE_ROLE_KEY);
  const { data: auth } = await sb.auth.getUser(token);
  const email = auth?.user?.email;
  if (!email) return res.status(401).json({ error: "Sign in first" });
  const { data: member } = await sb.from("members").select("name").ilike("email", email).maybeSingle();
  if (!member) return res.status(403).json({ error: "Members only" });

  const body = req.body || {};
  const title = String(body.title || "").trim();
  const date = String(body.date || "").trim();
  const time = String(body.time || "").trim();
  if (!title || !validDate(date) || !/^([01]\d|2[0-3]):[0-5]\d$/.test(time))
    return res.status(400).json({ error: "Title, date and time required" });

  try {
    const google = await loadGoogle();
    const auth2 = new google.auth.OAuth2(GOOGLE_CLIENT_ID, GOOGLE_CLIENT_SECRET);
    auth2.setCredentials({ refresh_token: GOOGLE_REFRESH_TOKEN });
    const cal = google.calendar({ version: "v3", auth: auth2 });
    const result = await cal.events.insert({
      calendarId: "primary",
      conferenceDataVersion: 1,
      requestBody: {
        summary: title,
        description: String(body.description || ""),
        start: { dateTime: `${date}T${time}:00`, timeZone: "Asia/Kolkata" },
        end: { dateTime: addOneHour(date, time), timeZone: "Asia/Kolkata" },
        conferenceData: {
          createRequest: { requestId: `mc-${Date.now()}-${Math.random().toString(36).slice(2)}`, conferenceSolutionKey: { type: "hangoutsMeet" } },
        },
      },
    });
    if (!result.data.hangoutLink) return res.status(502).json({ error: "Google didn't return a Meet link" });
    res.status(200).json({ meet_link: result.data.hangoutLink });
  } catch (e) {
    console.error("Create Meet error:", e.message);
    res.status(500).json({ error: "Failed to create Meet link: " + e.message });
  }
};
