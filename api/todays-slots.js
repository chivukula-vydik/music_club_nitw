// Morning digest: every member gets one personal email listing today's jam slots (or saying they have none).
// Triggered once a day by the Vercel cron in vercel.json (Vercel sends "Authorization: Bearer $CRON_SECRET").
const nodemailer = require("nodemailer");
const path = require("path");
const { createClient } = require("@supabase/supabase-js");

const SMTP_PORT = Number(process.env.SMTP_PORT) || 587;
const DAYS = ["Monday", "Tuesday", "Wednesday", "Thursday", "Friday", "Saturday", "Sunday"];
const esc = s => String(s).replace(/[&<>"]/g, c => ({ "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;" }[c]));

// slot "6-7" → 18, "9-10*" → 21, "12-1*" → 24 (same rules as notify-events.js)
const slotHour = s => { const h = parseInt(s, 10); return s.endsWith("*") ? h + 12 : h < 9 ? h + 12 : h; };
const ampm = h => `${h % 12 || 12} ${h % 24 < 12 ? "AM" : "PM"}`;

module.exports = async (req, res) => {
  // no secret = anyone could re-trigger and spam members, so refuse
  if (!process.env.CRON_SECRET || req.headers.authorization !== `Bearer ${process.env.CRON_SECRET}`)
    return res.status(401).json({ error: "Unauthorized" });

  const sb = createClient(process.env.SUPABASE_URL, process.env.SUPABASE_SERVICE_ROLE_KEY);

  // today in IST, and the Monday (YYYYMMDD) of its week — bookings are keyed that way
  const ist = new Date(Date.now() + 330 * 60000);
  const dayIdx = (ist.getUTCDay() + 6) % 7;
  const mon = new Date(Date.UTC(ist.getUTCFullYear(), ist.getUTCMonth(), ist.getUTCDate() - dayIdx));
  const week = mon.getUTCFullYear() * 10000 + (mon.getUTCMonth() + 1) * 100 + mon.getUTCDate();
  const day = DAYS[dayIdx];

  const [{ data: slots, error }, { data: members }] = await Promise.all([
    sb.from("bookings").select("slot,song,booked_by,players").eq("week", week).eq("day", day),
    sb.from("members").select("name,email")
  ]);
  if (error) return res.status(500).json({ error: error.message });
  const emailOf = Object.fromEntries((members || []).filter(m => m.email).map(m => [m.name, m.email]));

  // person → their slots today
  const byPerson = {};
  for (const b of slots || []) {
    const names = [b.booked_by, ...(b.players || [])].filter(Boolean);
    for (const n of new Set(names)) (byPerson[n] = byPerson[n] || []).push({ ...b, hour: slotHour(b.slot), others: names.filter(x => x !== n) });
  }

  const transporter = nodemailer.createTransport({
    host: process.env.SMTP_HOST || "smtp.gmail.com", port: SMTP_PORT, secure: SMTP_PORT === 465,
    auth: { user: process.env.SMTP_USER, pass: process.env.SMTP_PASS }
  });
  const dateFmt = ist.toLocaleDateString("en-GB", { weekday: "long", day: "numeric", month: "long", timeZone: "UTC" });

  let sent = 0;
  // every member gets one: their slots, or a "nothing today" note
  for (const [name, to] of Object.entries(emailOf)) {
    const mine = (byPerson[name] || []).sort((a, b) => a.hour - b.hour);
    const first = name.split(" ")[0];
    const count = mine.length === 1 ? "1 slot" : `${mine.length} slots`;
    const text = mine.length
      ? `Hi ${first},\n\nYou have ${count} in the jam room today (${dateFmt}):\n\n` +
        mine.map(s => `${ampm(s.hour)}–${ampm(s.hour + 1)}  ${s.song}  (${s.others.length ? "with " + s.others.join(", ") : "solo"})`).join("\n") +
        `\n\nSee you there!`
      : `Hi ${first},\n\nYou don't have any jam slots today (${dateFmt}).\n\nWant to play? Book one on the portal.`;
    const rows = !mine.length ? `
      <tr><td style="padding:14px;background:rgba(243,241,236,.05);border-radius:8px;text-align:center;color:rgba(243,241,236,.6)">You don't have any slots today. Want to play? Book one on the portal.</td></tr>` : mine.map(s => `
      <tr>
        <td style="padding:12px 14px 12px 0;border-top:1px solid rgba(243,241,236,.08);white-space:nowrap;vertical-align:top;font-weight:700;color:#7cb8db">${ampm(s.hour)}</td>
        <td style="padding:12px 0;border-top:1px solid rgba(243,241,236,.08)">
          <div style="font-weight:600;color:#f3f1ec">${esc(s.song)}</div>
          <div style="margin-top:3px;font-size:12px;color:rgba(243,241,236,.5)">${s.others.length ? "with " + esc(s.others.join(", ")) : "solo"}</div>
        </td>
      </tr>`).join("");
    const html = `
<!DOCTYPE html>
<html><head><meta charset="utf-8"><meta name="viewport" content="width=device-width,initial-scale=1"></head>
<body style="margin:0;padding:0;background:#121211;font-family:'Segoe UI',Helvetica,Arial,sans-serif">
<table width="100%" cellpadding="0" cellspacing="0" style="background:#121211;padding:40px 20px">
<tr><td align="center">
<table width="420" cellpadding="0" cellspacing="0" style="background:#1a1a19;border-radius:16px;overflow:hidden;border:1px solid rgba(243,241,236,.1)">
  <tr><td style="background:linear-gradient(135deg,#3d8dbd 0%,#2a6a94 100%);padding:32px 36px;text-align:center">
    <img src="cid:mclogo" alt="Music Club NITW" width="64" height="64" style="width:64px;height:64px;border-radius:50%;border:2px solid rgba(255,255,255,.25);margin-bottom:12px;display:block;margin-left:auto;margin-right:auto">
    <h1 style="margin:0;font-size:22px;font-weight:700;color:#fff;letter-spacing:-.02em">Music Club NITW</h1>
    <p style="margin:6px 0 0;font-size:12px;color:rgba(255,255,255,.7);letter-spacing:.08em;text-transform:uppercase">Today's Slots</p>
  </td></tr>
  <tr><td style="padding:36px">
    <h2 style="margin:0 0 6px;font-size:20px;color:#f3f1ec;font-weight:700">Hi ${esc(first)}, ${mine.length ? `you have ${count} today` : "no slots today"}</h2>
    <p style="margin:0 0 20px;font-size:13px;color:rgba(243,241,236,.5)">${dateFmt}</p>
    <table width="100%" cellpadding="0" cellspacing="0" style="font-size:14px;color:#f3f1ec">${rows}
    </table>
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
        from: process.env.MAIL_FROM || process.env.SMTP_USER, to,
        subject: mine.length ? `Music Club: your ${count} today` : "Music Club: no slots for you today", text, html,
        attachments: [{ filename: "logo.png", path: path.join(__dirname, "..", "assets", "logo.png"), cid: "mclogo" }]
      });
      sent++;
    } catch (e) { console.error("Digest error:", name, e.message); }
  }

  res.status(200).json({ day, week, withSlots: Object.keys(byPerson).length, sent });
};
