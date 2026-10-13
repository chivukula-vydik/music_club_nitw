// A day manager messages the people on a jam slot. Sent from the club address in the
// same design as the slot reminder; replies go to the manager.
//
// Env vars: SUPABASE_URL, SUPABASE_SERVICE_ROLE_KEY, SMTP_* / MAIL_FROM (same as notify-events)

const nodemailer = require("nodemailer");
const path = require("path");
const { createClient } = require("@supabase/supabase-js");
const { pushTo } = require("./_push");

const DAY_IDX = { Monday: 0, Tuesday: 1, Wednesday: 2, Thursday: 3, Friday: 4, Saturday: 5, Sunday: 6 };
const esc = s => String(s).replace(/[&<>"]/g, c => ({ "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;" }[c]));

// "6-7" → 6 PM, "9-10*" → 9 PM, "12-1*" → 12 AM; week is the Monday as YYYYMMDD
function slotWhen(week, day, slot) {
  const h0 = parseInt(slot, 10);
  const hour = slot.endsWith("*") ? h0 + 12 : h0 < 9 ? h0 + 12 : h0;
  const w = String(week);
  const d = new Date(Date.UTC(+w.slice(0, 4), +w.slice(4, 6) - 1, +w.slice(6, 8) + DAY_IDX[day], hour));
  const date = d.toLocaleDateString("en-GB", { weekday: "long", day: "numeric", month: "long", timeZone: "UTC" });
  const fmt = h => (h % 12 || 12) + " " + (h % 24 < 12 ? "AM" : "PM");
  return `${date} · ${fmt(hour)}–${fmt(hour + 1)}`;
}

function emailHtml({ manager, day, song, when, who, message }) {
  return `
<!DOCTYPE html>
<html><head><meta charset="utf-8"><meta name="viewport" content="width=device-width,initial-scale=1"></head>
<body style="margin:0;padding:0;background:#121211;font-family:'Segoe UI',Helvetica,Arial,sans-serif">
<table width="100%" cellpadding="0" cellspacing="0" style="background:#121211;padding:40px 20px">
<tr><td align="center">
<table width="420" cellpadding="0" cellspacing="0" style="background:#1a1a19;border-radius:16px;overflow:hidden;border:1px solid rgba(243,241,236,.1)">
  <tr><td style="background:linear-gradient(135deg,#c8372d 0%,#992820 100%);padding:32px 36px;text-align:center">
    <img src="cid:mclogo" alt="Music Club NITW" width="64" height="64" style="width:64px;height:64px;border-radius:50%;border:2px solid rgba(255,255,255,.25);margin-bottom:12px;display:block;margin-left:auto;margin-right:auto">
    <h1 style="margin:0;font-size:22px;font-weight:700;color:#fff;letter-spacing:-.02em">Music Club NITW</h1>
    <p style="margin:6px 0 0;font-size:12px;color:rgba(255,255,255,.7);letter-spacing:.08em;text-transform:uppercase">Message from your slot manager</p>
  </td></tr>
  <tr><td style="padding:36px">
    <h2 style="margin:0 0 20px;font-size:20px;color:#f3f1ec;font-weight:700">${esc(song)}</h2>
    <table width="100%" cellpadding="0" cellspacing="0" style="font-size:14px;color:#f3f1ec">
      <tr><td style="padding:8px 12px 8px 0;color:rgba(243,241,236,.5);white-space:nowrap;vertical-align:top">When</td><td style="padding:8px 0;font-weight:600">${esc(when)}</td></tr>
      <tr><td style="padding:8px 12px 8px 0;color:rgba(243,241,236,.5);white-space:nowrap;vertical-align:top">Who</td><td style="padding:8px 0">${esc(who)}</td></tr>
      <tr><td style="padding:8px 12px 8px 0;color:rgba(243,241,236,.5);white-space:nowrap;vertical-align:top">From</td><td style="padding:8px 0">${esc(manager)} · ${esc(day)} manager</td></tr>
    </table>
    <div style="margin:20px 0 0;padding:16px 18px;background:rgba(200,55,45,.14);border-radius:8px;font-size:15px;line-height:1.55;color:#f3f1ec;white-space:pre-wrap">${esc(message)}</div>
    <p style="margin:18px 0 0;font-size:12.5px;color:rgba(243,241,236,.5);text-align:center">Reply to this email to reach ${esc(manager)}.</p>
  </td></tr>
  <tr><td style="padding:0 36px 28px">
    <hr style="border:none;border-top:1px solid rgba(243,241,236,.08);margin:0 0 18px">
    <p style="margin:0;font-size:11px;color:rgba(243,241,236,.25);text-align:center">Music Club &middot; NIT Warangal &middot; musicclub.nitw@gmail.com</p>
  </td></tr>
</table>
</td></tr>
</table>
</body></html>`;
}

module.exports = async (req, res) => {
  res.setHeader("Access-Control-Allow-Origin", process.env.ALLOWED_ORIGIN || "");
  res.setHeader("Access-Control-Allow-Methods", "POST, OPTIONS");
  res.setHeader("Access-Control-Allow-Headers", "Content-Type, Authorization");
  if (req.method === "OPTIONS") return res.status(200).end();
  if (req.method !== "POST") return res.status(405).json({ error: "POST only" });

  const { SUPABASE_URL, SUPABASE_SERVICE_ROLE_KEY, SMTP_USER, SMTP_PASS } = process.env;
  if (!SUPABASE_SERVICE_ROLE_KEY || !SMTP_USER || !SMTP_PASS) return res.status(500).json({ error: "Email not configured" });

  const token = String(req.headers.authorization || "").replace(/^Bearer\s+/i, "");
  if (!token) return res.status(401).json({ error: "Sign in first" });
  const sb = createClient(SUPABASE_URL, SUPABASE_SERVICE_ROLE_KEY);
  const { data: auth } = await sb.auth.getUser(token);
  const email = auth?.user?.email;
  if (!email) return res.status(401).json({ error: "Sign in first" });
  const { data: me } = await sb.from("members").select("name,email").ilike("email", email).maybeSingle();
  if (!me) return res.status(403).json({ error: "Members only" });

  const body = req.body || {};
  const week = Number(body.week), day = String(body.day || ""), slot = String(body.slot || "");
  const message = String(body.message || "").trim();
  if (!week || !(day in DAY_IDX) || !slot || !message) return res.status(400).json({ error: "Slot and message required" });
  if (message.length > 1000) return res.status(400).json({ error: "Keep the message under 1000 characters" });

  const { data: mgr } = await sb.from("day_managers").select("manager").eq("day", day).maybeSingle();
  if (!mgr || mgr.manager !== me.name) return res.status(403).json({ error: "Only " + day + "'s manager can message this slot" });

  const { data: b } = await sb.from("bookings").select("song,booked_by,players").match({ week, day, slot }).maybeSingle();
  if (!b) return res.status(404).json({ error: "That slot isn't booked any more" });

  const names = [b.booked_by, ...(b.players || [])].filter(n => n && n !== me.name);
  const { data: rows } = await sb.from("members").select("name,email").in("name", names.length ? names : [""]);
  const recipients = (rows || []).map(r => r.email).filter(Boolean);
  if (!recipients.length) return res.status(400).json({ error: "No one on this slot has an email on the roster" });

  const when = slotWhen(week, day, slot);
  const who = [b.booked_by, ...(b.players || [])].filter(Boolean).join(", ");
  const subject = `Music Club: message about your ${day} jam slot`;
  const text = `${me.name} (${day} manager) wrote:\n\n${message}\n\nSong: ${b.song}\nWhen: ${when}\nWho: ${who}\n\nReply to this email to reach ${me.name}.`;

  const port = Number(process.env.SMTP_PORT) || 587;
  const transporter = nodemailer.createTransport({
    host: process.env.SMTP_HOST || "smtp.gmail.com", port, secure: port === 465,
    auth: { user: SMTP_USER, pass: SMTP_PASS }
  });
  try {
    await transporter.sendMail({
      from: process.env.MAIL_FROM || SMTP_USER, bcc: recipients, replyTo: me.email, subject, text,
      html: emailHtml({ manager: me.name, day, song: b.song, when, who, message }),
      attachments: [{ filename: "logo.png", path: path.join(__dirname, "..", "assets", "logo.png"), cid: "mclogo" }]
    });
  } catch (e) {
    console.error("Slot message error:", e.message);
    return res.status(502).json({ error: "Couldn't send the email. Try again in a minute." });
  }
  await pushTo(sb, names, { title: `${me.name} · ${day} manager`, body: message.length > 140 ? message.slice(0, 139) + "…" : message, tag: `msg-${week}-${day}-${slot}` });
  res.status(200).json({ sent: recipients.length });
};

module.exports.emailHtml = emailHtml;
module.exports.slotWhen = slotWhen;
