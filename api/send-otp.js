const nodemailer = require("nodemailer");
const crypto = require("crypto");
const path = require("path");

const SECRET = process.env.OTP_SECRET || "mc-nitw-otp-fallback";
const SMTP_HOST = process.env.SMTP_HOST || "smtp.gmail.com";
const SMTP_PORT = Number(process.env.SMTP_PORT) || 587;
const SMTP_USER = process.env.SMTP_USER;
const SMTP_PASS = process.env.SMTP_PASS;
const MAIL_FROM = process.env.MAIL_FROM || SMTP_USER;
const OTP_EXPIRY = 10 * 60 * 1000;

function sign(email, otp, expires) {
  return crypto.createHmac("sha256", SECRET).update(`${email}:${otp}:${expires}`).digest("hex");
}

module.exports = async (req, res) => {
  res.setHeader("Access-Control-Allow-Origin", "*");
  res.setHeader("Access-Control-Allow-Methods", "POST, OPTIONS");
  res.setHeader("Access-Control-Allow-Headers", "Content-Type");
  if (req.method === "OPTIONS") return res.status(200).end();
  if (req.method !== "POST") return res.status(405).json({ error: "POST only" });

  const email = String((req.body || {}).email || "").trim().toLowerCase();
  if (!/^[^\s@]+@student\.nitw\.ac\.in$/.test(email)) {
    return res.status(400).json({ error: "Invalid email" });
  }

  if (!SMTP_USER || !SMTP_PASS || !MAIL_FROM) {
    return res.status(500).json({ error: "Email service not configured" });
  }

  const otp = String(crypto.randomInt(100000, 1000000));
  const expires = Date.now() + OTP_EXPIRY;
  const token = `${expires}.${sign(email, otp, expires)}`;

  const transporter = nodemailer.createTransport({
    host: SMTP_HOST,
    port: SMTP_PORT,
    secure: SMTP_PORT === 465,
    auth: { user: SMTP_USER, pass: SMTP_PASS },
  });

  try {
    await transporter.sendMail({
      from: MAIL_FROM,
      to: email,
      subject: "Music Club NITW — First Login OTP",
      text: `Music Club NITW\n\nYour first login OTP is: ${otp}\n\nValid for 10 minutes. If you didn't request this, ignore it.`,
      attachments: [{
        filename: "logo.png",
        path: path.join(__dirname, "..", "assets", "logo.png"),
        cid: "mclogo"
      }],
      html: `
<!DOCTYPE html>
<html><head><meta charset="utf-8"><meta name="viewport" content="width=device-width,initial-scale=1"></head>
<body style="margin:0;padding:0;background:#121211;font-family:'Segoe UI',Helvetica,Arial,sans-serif">
<table width="100%" cellpadding="0" cellspacing="0" style="background:#121211;padding:40px 20px">
<tr><td align="center">
<table width="420" cellpadding="0" cellspacing="0" style="background:#1a1a19;border-radius:16px;overflow:hidden;border:1px solid rgba(243,241,236,.1)">
  <tr><td style="background:linear-gradient(135deg,#d1682e 0%,#b8522a 100%);padding:32px 36px;text-align:center">
    <img src="cid:mclogo" alt="Music Club NITW" width="64" height="64" style="width:64px;height:64px;border-radius:50%;border:2px solid rgba(255,255,255,.25);margin-bottom:12px;display:block;margin-left:auto;margin-right:auto">
    <h1 style="margin:0;font-size:22px;font-weight:700;color:#fff;letter-spacing:-.02em">Music Club NITW</h1>
    <p style="margin:6px 0 0;font-size:12px;color:rgba(255,255,255,.7);letter-spacing:.08em;text-transform:uppercase">First Login</p>
  </td></tr>
  <tr><td style="padding:36px">
    <p style="margin:0 0 8px;font-size:15px;color:rgba(243,241,236,.65);line-height:1.5">Hey! Here's your one-time verification code:</p>
    <div style="margin:20px 0;padding:20px;background:#121211;border-radius:12px;text-align:center;border:1px solid rgba(243,241,236,.08)">
      <span style="font-size:36px;font-weight:700;letter-spacing:12px;color:#f3f1ec;font-family:'Courier New',monospace">${otp}</span>
    </div>
    <table width="100%" cellpadding="0" cellspacing="0" style="margin:20px 0">
      <tr>
        <td style="padding:10px 14px;background:rgba(209,104,46,.08);border-radius:8px">
          <span style="font-size:12px;color:#d1682e">&#9200;</span>
          <span style="font-size:13px;color:rgba(243,241,236,.5);margin-left:6px">Valid for <strong style="color:rgba(243,241,236,.7)">10 minutes</strong></span>
        </td>
      </tr>
    </table>
    <p style="margin:0;font-size:13px;color:rgba(243,241,236,.35);line-height:1.5">Enter this code on the Music Club member portal to finish setting your password.</p>
  </td></tr>
  <tr><td style="padding:0 36px 28px">
    <hr style="border:none;border-top:1px solid rgba(243,241,236,.08);margin:0 0 18px">
    <p style="margin:0;font-size:11px;color:rgba(243,241,236,.25);text-align:center">Music Club &middot; NIT Warangal &middot; musicclub.nitw@gmail.com</p>
  </td></tr>
</table>
</td></tr>
</table>
</body></html>`,
    });
    res.status(200).json({ token });
  } catch (e) {
    console.error("Mail error:", e.message);
    res.status(500).json({ error: "Failed to send email" });
  }
};
