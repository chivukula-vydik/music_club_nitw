const nodemailer = require("nodemailer");
const path = require("path");
const { createClient } = require("@supabase/supabase-js");

const SUPABASE_URL = process.env.SUPABASE_URL;
const SUPABASE_SERVICE_ROLE_KEY = process.env.SUPABASE_SERVICE_ROLE_KEY;
const SMTP_HOST = process.env.SMTP_HOST || "smtp.gmail.com";
const SMTP_PORT = Number(process.env.SMTP_PORT) || 587;
const SMTP_USER = process.env.SMTP_USER;
const SMTP_PASS = process.env.SMTP_PASS;
const MAIL_FROM = process.env.MAIL_FROM || SMTP_USER;

module.exports = async (req, res) => {
  res.setHeader("Access-Control-Allow-Origin", process.env.ALLOWED_ORIGIN || "");
  res.setHeader("Access-Control-Allow-Methods", "POST, OPTIONS");
  res.setHeader("Access-Control-Allow-Headers", "Content-Type");
  if (req.method === "OPTIONS") return res.status(200).end();
  if (req.method !== "POST") return res.status(405).json({ error: "POST only" });

  if (!SUPABASE_SERVICE_ROLE_KEY || !SMTP_USER || !SMTP_PASS)
    return res.status(500).json({ error: "Email service not configured" });

  const { title, description, event_date, event_time, created_by, all_members, participants } = req.body || {};
  if (!title || !event_date) return res.status(400).json({ error: "title and event_date required" });

  const sb = createClient(SUPABASE_URL, SUPABASE_SERVICE_ROLE_KEY);
  const { data: members } = await sb.from("members").select("name,email");
  const allEmails = (members || []).map(m => m.email).filter(Boolean);

  const recipients = all_members ? allEmails : (participants || []).filter(Boolean);
  if (!recipients.length) return res.status(200).json({ sent: 0 });

  const leadName = (created_by && members
    ? (members.find(m => m.email && m.email.toLowerCase() === created_by.toLowerCase()) || {}).name
    : null) || created_by || "—";
  const timeStr = event_time ? event_time.slice(0, 5) : "";
  const dateObj = new Date(event_date + "T00:00");
  const dateFmt = dateObj.toLocaleDateString("en-GB", { weekday: "long", day: "numeric", month: "long", year: "numeric" });
  const whoList = all_members ? "All members" : (participants || []).map(p => {
    const m = members ? members.find(x => x.email && x.email.toLowerCase() === p.toLowerCase()) : null;
    return m ? m.name : p;
  }).join(", ") || "—";

  const gcalDate = event_date.replace(/-/g, "");
  let gcalDates;
  if (timeStr) {
    const t = timeStr.replace(":", "") + "00";
    const [h, m] = timeStr.split(":").map(Number);
    const et = String(h + 1).padStart(2, "0") + String(m).padStart(2, "0") + "00";
    gcalDates = gcalDate + "T" + t + "/" + gcalDate + "T" + et;
  } else {
    gcalDates = gcalDate + "/" + gcalDate;
  }
  const gcalUrl = "https://calendar.google.com/calendar/render?action=TEMPLATE&text=" + encodeURIComponent(title) + "&dates=" + gcalDates + "&details=" + encodeURIComponent(description || "") + "&ctz=Asia/Kolkata";

  const subject = `Music Club: New Event — "${title}"`;
  const text = `${title}\n\n${description || "(no description)"}\n\nLead: ${leadName}\nWhen: ${dateFmt} at ${timeStr}\nWho: ${all_members ? "All members" : (participants || []).join(", ")}\n\nAdd to Google Calendar: ${gcalUrl}`;
  const html = `
<!DOCTYPE html>
<html><head><meta charset="utf-8"><meta name="viewport" content="width=device-width,initial-scale=1"></head>
<body style="margin:0;padding:0;background:#121211;font-family:'Segoe UI',Helvetica,Arial,sans-serif">
<table width="100%" cellpadding="0" cellspacing="0" style="background:#121211;padding:40px 20px">
<tr><td align="center">
<table width="420" cellpadding="0" cellspacing="0" style="background:#1a1a19;border-radius:16px;overflow:hidden;border:1px solid rgba(243,241,236,.1)">
  <tr><td style="background:linear-gradient(135deg,#d1682e 0%,#b8522a 100%);padding:32px 36px;text-align:center">
    <img src="cid:mclogo" alt="Music Club NITW" width="64" height="64" style="width:64px;height:64px;border-radius:50%;border:2px solid rgba(255,255,255,.25);margin-bottom:12px;display:block;margin-left:auto;margin-right:auto">
    <h1 style="margin:0;font-size:22px;font-weight:700;color:#fff;letter-spacing:-.02em">Music Club NITW</h1>
    <p style="margin:6px 0 0;font-size:12px;color:rgba(255,255,255,.7);letter-spacing:.08em;text-transform:uppercase">New Event</p>
  </td></tr>
  <tr><td style="padding:36px">
    <h2 style="margin:0 0 6px;font-size:20px;color:#f3f1ec;font-weight:700">${title}</h2>
    ${description ? `<p style="margin:0 0 20px;font-size:14px;line-height:1.55;color:rgba(243,241,236,.65)">${description}</p>` : `<div style="margin:0 0 20px"></div>`}
    <table width="100%" cellpadding="0" cellspacing="0" style="font-size:14px;color:#f3f1ec">
      <tr>
        <td style="padding:8px 12px 8px 0;color:rgba(243,241,236,.5);white-space:nowrap;vertical-align:top">When</td>
        <td style="padding:8px 0;font-weight:600">${dateFmt}${timeStr ? " · " + timeStr : ""}</td>
      </tr>
      <tr>
        <td style="padding:8px 12px 8px 0;color:rgba(243,241,236,.5);white-space:nowrap;vertical-align:top">Lead</td>
        <td style="padding:8px 0;font-weight:600">${leadName}</td>
      </tr>
      <tr>
        <td style="padding:8px 12px 8px 0;color:rgba(243,241,236,.5);white-space:nowrap;vertical-align:top">Who</td>
        <td style="padding:8px 0">${whoList}</td>
      </tr>
    </table>
    <div style="margin:20px 0 0;text-align:center">
      <a href="${gcalUrl}" target="_blank" style="display:inline-block;padding:12px 28px;background:#d1682e;color:#fff;font-size:14px;font-weight:600;text-decoration:none;border-radius:999px">Add to Google Calendar</a>
    </div>
  </td></tr>
  <tr><td style="padding:0 36px 28px">
    <hr style="border:none;border-top:1px solid rgba(243,241,236,.08);margin:0 0 18px">
    <p style="margin:0;font-size:11px;color:rgba(243,241,236,.25);text-align:center">Music Club &middot; NIT Warangal &middot; musicclub.nitw@gmail.com</p>
  </td></tr>
</table>
</td></tr>
</table>
</body></html>`;

  const transporter = nodemailer.createTransport({
    host: SMTP_HOST, port: SMTP_PORT, secure: SMTP_PORT === 465,
    auth: { user: SMTP_USER, pass: SMTP_PASS }
  });

  try {
    await transporter.sendMail({
      from: MAIL_FROM, bcc: recipients, subject, text, html,
      attachments: [{ filename: "logo.png", path: path.join(__dirname, "..", "assets", "logo.png"), cid: "mclogo" }]
    });
    res.status(200).json({ sent: recipients.length });
  } catch (e) {
    console.error("Notify new event error:", e.message);
    res.status(500).json({ error: "Failed to send notification" });
  }
};
