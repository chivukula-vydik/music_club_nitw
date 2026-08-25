const nodemailer = require("nodemailer");
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

    const subject = `Music Club: "${ev.title}" is ${label}`;
    const text = `${ev.title}\n${ev.description || ""}\nDate: ${ev.event_date} at ${ev.event_time}\n\nThis event is ${label}!`;
    const html = `
<div style="font-family:sans-serif;max-width:480px;margin:0 auto;padding:24px;background:#1a1a1a;color:#f3f1ec;border-radius:12px">
  <h2 style="margin:0 0 8px;color:#d1682e">${ev.title}</h2>
  ${ev.description ? `<p style="margin:0 0 12px;color:rgba(243,241,236,.7)">${ev.description}</p>` : ""}
  <p style="margin:0 0 4px"><strong>When:</strong> ${ev.event_date} at ${ev.event_time}</p>
  <p style="margin:16px 0 0;padding:12px;background:rgba(209,104,46,.15);border-radius:8px;text-align:center;font-weight:600;color:#d1682e">
    This event is ${label}!
  </p>
</div>`;

    try {
      await transporter.sendMail({ from: MAIL_FROM, bcc: recipients, subject, text, html });
      await sb.from("events").update({ [flagCol]: true }).eq("id", ev.id);
      sent++;
    } catch (e) { console.error("Notify error:", ev.id, e.message); }
  }

  res.status(200).json({ checked: (events || []).length, sent });
};
