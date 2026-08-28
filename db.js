// Data layer for the Music Club portal.
//
// Two modes, same API:
//   • server mode  — Supabase (Google sign-in restricted to the institute domain)
//   • local mode   — this browser only, for demoing before the project exists
//
// Everything the UI needs goes through load() / save*() below, so the portal
// itself doesn't care which mode is running.

const LOCAL_KEY = "mc-portal-v1";
const cfg = (typeof window !== "undefined" && window.MC_SUPABASE) || {};
export const serverMode = !!(cfg.url && cfg.anonKey);

let sb = null;

async function client() {
  if (!serverMode) return null;
  if (sb) return sb;
  const { createClient } = await import("https://esm.sh/@supabase/supabase-js@2");
  sb = createClient(cfg.url, cfg.anonKey);
  return sb;
}

/* ---------- auth ---------- */

export async function currentUser() {
  if (!serverMode) return null;
  const c = await client();
  const { data } = await c.auth.getSession();
  const s = data.session;
  if (!s) return null;
  const email = s.user.email || "";
  if (cfg.allowedDomain && !email.toLowerCase().endsWith("@" + cfg.allowedDomain)) {
    await c.auth.signOut();
    return null;
  }
  return { email, name: s.user.user_metadata?.full_name || email.split("@")[0], id: s.user.id };
}

export async function signInWithGoogle() {
  const c = await client();
  return c.auth.signInWithOAuth({
    provider: "google",
    options: {
      redirectTo: window.location.href,
      queryParams: { hd: cfg.allowedDomain || "" } // nudges Google to the institute account
    }
  });
}

export async function sendEmailOtp(email) {
  const response = await fetch(new URL("./api/send-otp", window.location.href), {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({ email, redirectTo: window.location.href, supabaseAuth: true })
  });
  const data = await response.json().catch(() => ({}));
  if (!response.ok) return { data: null, error: new Error(data.error || "Failed to send OTP") };
  return { data, error: null };
}

export async function verifyEmailOtp(email, token) {
  const c = await client();
  return c.auth.verifyOtp({ email, token, type: "magiclink" });
}

export async function setPassword(password) {
  const c = await client();
  return c.auth.updateUser({ password });
}

export async function signInWithPassword(email, password) {
  const c = await client();
  return c.auth.signInWithPassword({ email, password });
}

export async function signOut() {
  if (!serverMode) return;
  const c = await client();
  await c.auth.signOut();
}

export function onAuthChange(fn) {
  if (!serverMode) return () => {};
  let off = () => {};
  client().then(c => {
    const { data } = c.auth.onAuthStateChange(() => fn());
    off = () => data.subscription.unsubscribe();
  });
  return () => off();
}

/* ---------- reads ---------- */

function localState() {
  try { return JSON.parse(localStorage.getItem(LOCAL_KEY) || "{}"); } catch (e) { return {}; }
}

// Minutes older than 4 months get permanently deleted.
function minutesCutoff() {
  const d = new Date();
  d.setMonth(d.getMonth() - 4);
  return d.toISOString().slice(0, 10);
}

// Returns { members, bookings, profiles, minutes } in the shape the portal uses.
export async function load() {
  if (!serverMode) {
    const s = localState();
    const cut = minutesCutoff();
    const kept = (s.moms || []).filter(m => m.date >= cut);
    if (kept.length !== (s.moms || []).length) saveLocal({ moms: kept });
    return {
      members: null, // portal falls back to its built-in roster
      bookings: s.bookings || {},
      profiles: s.profiles || {},
      minutes: kept
    };
  }

  const c = await client();
  const cut = minutesCutoff();
  const [members, bookings, profiles, minutes] = await Promise.all([
    c.from("members").select("name,branch,year,team,major_skill,minor_skill,vibe,email").order("name"),
    c.from("bookings").select("week,day,slot,song,booked_by,players"),
    c.from("profiles").select("member_name,major_skill,minor_skill,vibe"),
    c.from("minutes").select("id,meeting_date,title,audience,author,body").gte("meeting_date", cut).order("meeting_date", { ascending: false })
  ]);

  const err = [members, bookings, profiles, minutes].find(r => r.error);
  if (err) throw err.error;

  const bookingMap = {};
  for (const b of bookings.data) {
    const key = (b.week ? "w" + b.week + "|" : "") + b.day + "|" + b.slot;
    bookingMap[key] = { song: b.song, by: b.booked_by, with: b.players || [] };
  }

  const profileMap = {};
  for (const p of profiles.data) {
    profileMap[p.member_name] = { major: p.major_skill, minor: p.minor_skill, vibe: p.vibe };
  }

  return {
    members: members.data.map(m => [m.name, m.branch, String(m.year), m.team, m.major_skill || "", m.minor_skill || "", m.vibe || "", m.email || ""]),
    bookings: bookingMap,
    profiles: profileMap,
    minutes: minutes.data.map(m => ({ id: String(m.id), date: m.meeting_date, title: m.title, audience: m.audience, author: m.author, body: m.body }))
  };
}

/* ---------- writes ---------- */

function saveLocal(patch) {
  const s = localState();
  const next = { ...s, ...patch };
  try { localStorage.setItem(LOCAL_KEY, JSON.stringify(next)); } catch (e) {}
}

function parseKey(key) {
  const parts = key.split("|");
  return parts.length === 3
    ? { week: Number(parts[0].slice(1)), day: parts[1], slot: parts[2] }
    : { week: 0, day: parts[0], slot: parts[1] };
}

export async function saveBooking(key, rec) {
  if (!serverMode) return saveLocal({ bookings: { ...localState().bookings, [key]: rec } });
  const c = await client();
  const { week, day, slot } = parseKey(key);
  if (rec === null) {
    const { error } = await c.from("bookings").delete().match({ week, day, slot });
    if (error) throw error;
  } else {
    const { error } = await c.from("bookings")
      .upsert({ week, day, slot, song: rec.song, booked_by: rec.by, players: rec.with || [] },
              { onConflict: "week,day,slot" });
    if (error) throw error;
  }
}

export async function saveProfile(name, p) {
  if (!serverMode) return saveLocal({ profiles: { ...localState().profiles, [name]: p } });
  const c = await client();
  const { error } = await c.from("profiles")
    .upsert({ member_name: name, major_skill: p.major, minor_skill: p.minor, vibe: p.vibe },
            { onConflict: "member_name" });
  if (error) throw error;
}

export async function addMinutes(entry) {
  if (!serverMode) return saveLocal({ moms: (localState().moms || []).concat([entry]) });
  const c = await client();
  const { error } = await c.from("minutes").insert({
    meeting_date: entry.date, title: entry.title, audience: entry.audience, author: entry.author, body: entry.body
  });
  if (error) throw error;
}

/* ---------- events ---------- */

export async function loadEvents() {
  if (!serverMode) return [];
  const c = await client();
  const { data, error } = await c.from("events").select("*").order("event_date").order("event_time");
  if (error) throw error;
  return data || [];
}

export async function addEvent(ev) {
  if (!serverMode) return;
  const c = await client();
  const { error } = await c.from("events").insert(ev);
  if (error) throw error;
}

export async function deleteEvent(id) {
  if (!serverMode) return;
  const c = await client();
  const { error } = await c.from("events").delete().eq("id", id);
  if (error) throw error;
}

// Live updates so a booking made on one phone shows up on everyone else's.
export async function subscribe(onChange) {
  if (!serverMode) return () => {};
  const c = await client();
  const ch = c.channel("mc-portal")
    .on("postgres_changes", { event: "*", schema: "public", table: "bookings" }, onChange)
    .on("postgres_changes", { event: "*", schema: "public", table: "profiles" }, onChange)
    .on("postgres_changes", { event: "*", schema: "public", table: "minutes" }, onChange)
    .on("postgres_changes", { event: "*", schema: "public", table: "events" }, onChange)
    .subscribe();
  return () => c.removeChannel(ch);
}
