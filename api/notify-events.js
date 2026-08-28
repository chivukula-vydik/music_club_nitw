const nodemailer = require("nodemailer");
const path = require("path");
const { createClient } = require("@supabase/supabase-js");

const SUPABASE_URL = process.env.SUPABASE_URL || "https://xejvrshbsyuxvdllazpn.supabase.co";
const SUPABASE_SERVICE_ROLE_KEY = process.env.SUPABASE_SERVICE_ROLE_KEY;
const SMTP_HOST = process.env.SMTP_HOST || "smtp.gmail.com";
const SMTP_PORT = Number(process.env.SMTP_PORT) || 587;
const SMTP_USER = process.env.SMTP_USER;
const SMTP_PASS = process.env.SMTP_PASS;
const MAIL_FROM = process.env.MAIL_FROM || SMTP_USER;

module.exports = async (req, res) => {
  if (!SUPABASE_SERVICE_ROLE_KEY) return res.status(500).json({ error: "Missing service role key" });

  const sb = createClient(SUPABASE_URL, SUPABASE_SERVICE_ROLE_KEY);
  const now = new Date();
  const in15m = new Date(now.getTime() + 15 * 60 * 1000);
  const in1d = new Date(now.getTime() + 24 * 60 * 60 * 1000);

  const { data: events, error } = await sb.from("events").select("*").gte("event_date", now.toISOString().slice(0, 10));
  if (error) return res.status(500).json({ error: error.message });

  const transporter = nodemailer.createTransport({
    host: SMTP_HOST, port: SMTP_PORT, secure: SMTP_PORT === 465,
    auth: { user: SMTP_USER, pass: SMTP_PASS }
  });

  const { data: members } = await sb.from("members").select("name,email");
  const memberEmails = (members || []).reduce((m, r) => { if (r.email) m[r.name] = r.email; return m; }, {});
  const allEmails = Object.values(memberEmails).filter(Boolean);

  let sent = 0;
  for (const ev of events || []) {
    const evDateTime = new Date(`${ev.event_date}T${ev.event_time}`);
    const diffMs = evDateTime - now;
    const diffMin = diffMs / 60000;
    const diffHrs = diffMs / 3600000;

    let label = "";
    let flagCol = "";
    if (!ev.notified_1d && diffHrs > 0 && diffHrs <= 24) { label = "tomorrow"; flagCol = "notified_1d"; }
    else if (!ev.notified_15m && diffMin > 0 && diffMin <= 15) { label = "in 15 minutes"; flagCol = "notified_15m"; }
    if (!label) continue;

    const recipients = ev.all_members ? allEmails : (ev.participants || []).filter(Boolean);
    if (!recipients.length) continue;

    const leadName = (ev.created_by && members ? (members.find(m => m.email && m.email.toLowerCase() === ev.created_by.toLowerCase()) || {}).name : null) || ev.created_by || "—";
    const timeStr = ev.event_time ? ev.event_time.slice(0, 5) : "";
    const dateObj = new Date(ev.event_date + "T00:00");
    const dateFmt = dateObj.toLocaleDateString("en-GB", { weekday: "long", day: "numeric", month: "long", year: "numeric" });

    const whoList = ev.all_members ? "All members" : (ev.participants || []).map(p => { const m = members ? members.find(x => x.email && x.email.toLowerCase() === p.toLowerCase()) : null; return m ? m.name : p; }).join(", ") || "—";

    const subject = `Music Club: "${ev.title}" is ${label}`;
    const text = `${ev.title}\n\n${ev.description || "(no description)"}\n\nLead: ${leadName}\nWhen: ${dateFmt} at ${timeStr}\nWho: ${ev.all_members ? "All members" : (ev.participants || []).join(", ")}\n\nThis event is ${label}!`;
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
    <p style="margin:6px 0 0;font-size:12px;color:rgba(255,255,255,.7);letter-spacing:.08em;text-transform:uppercase">Event Reminder</p>
  </td></tr>
  <tr><td style="padding:36px">
    <h2 style="margin:0 0 6px;font-size:20px;color:#f3f1ec;font-weight:700">${ev.title}</h2>
    ${ev.description ? `<p style="margin:0 0 20px;font-size:14px;line-height:1.55;color:rgba(243,241,236,.65)">${ev.description}</p>` : `<div style="margin:0 0 20px"></div>`}
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
    <div style="margin:20px 0 0;padding:14px;background:rgba(209,104,46,.15);border-radius:8px;text-align:center;font-weight:600;font-size:15px;color:#d1682e">
      This event is ${label}!
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

    try {
      await transporter.sendMail({
        from: MAIL_FROM, bcc: recipients, subject, text, html,
        attachments: [{ filename: "logo.png", path: path.join(__dirname, "..", "assets", "logo.png"), cid: "mclogo" }]
      });
      await sb.from("events").update({ [flagCol]: true }).eq("id", ev.id);
      sent++;
    } catch (e) { console.error("Notify error:", ev.id, e.message); }
  }

  // permanently delete minutes older than 4 months
  const cutoff = new Date();
  cutoff.setMonth(cutoff.getMonth() - 4);
  const cutoffDate = cutoff.toISOString().slice(0, 10);
  let purged = 0;
  try {
    const { data } = await sb.from("minutes").delete().lt("meeting_date", cutoffDate).select("id");
    purged = (data || []).length;
  } catch (e) { console.error("Minutes purge error:", e.message); }

  res.status(200).json({ checked: (events || []).length, sent, purged });
};
