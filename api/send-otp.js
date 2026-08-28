const nodemailer = require("nodemailer");
const crypto = require("crypto");
const path = require("path");

const SECRET = process.env.OTP_SECRET || "mc-nitw-otp-fallback";
const SMTP_HOST = process.env.SMTP_HOST || "smtp.gmail.com";
const SMTP_PORT = Number(process.env.SMTP_PORT) || 587;
const SMTP_USER = process.env.SMTP_USER;
const SMTP_PASS = process.env.SMTP_PASS;
const MAIL_FROM = process.env.MAIL_FROM || SMTP_USER;
const SUPABASE_URL = process.env.SUPABASE_URL || "https://xejvrshbsyuxvdllazpn.supabase.co";
const SUPABASE_SERVICE_ROLE_KEY = process.env.SUPABASE_SERVICE_ROLE_KEY;
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

  const missingEmailEnv = [
    !SMTP_USER && "SMTP_USER",
    !SMTP_PASS && "SMTP_PASS",
    !MAIL_FROM && "MAIL_FROM",
  ].filter(Boolean);
  if (missingEmailEnv.length) {
    return res.status(500).json({ error: `Email service not configured: missing ${missingEmailEnv.join(", ")}` });
  }

  const redirectTo = String((req.body || {}).redirectTo || "").trim();
  const supabaseAuth = !!(req.body || {}).supabaseAuth;
  const isReset = String((req.body || {}).reason || "").trim() === "reset";
  let otp = "";
  let legacyToken = "";

  const transporter = nodemailer.createTransport({
    host: SMTP_HOST,
    port: SMTP_PORT,
    secure: SMTP_PORT === 465,
    auth: { user: SMTP_USER, pass: SMTP_PASS },
  });

  try {
    if (supabaseAuth) {
      if (!SUPABASE_SERVICE_ROLE_KEY) {
        throw new Error("Supabase service role key not configured");
      }

      const linkResponse = await fetch(`${SUPABASE_URL}/auth/v1/admin/generate_link`, {
        method: "POST",
        headers: {
          "Content-Type": "application/json",
          apikey: SUPABASE_SERVICE_ROLE_KEY,
          Authorization: `Bearer ${SUPABASE_SERVICE_ROLE_KEY}`,
        },
        body: JSON.stringify({
          type: "magiclink",
          email,
          ...(redirectTo ? { redirect_to: redirectTo } : {}),
        }),
      });
      const linkData = await linkResponse.json().catch(() => ({}));
      if (!linkResponse.ok) {
        throw new Error(linkData.msg || linkData.message || linkData.error || "Failed to generate Supabase OTP");
      }

      otp = String(linkData.email_otp || (linkData.properties && linkData.properties.email_otp) || "");
      if (!/^\d{6,8}$/.test(otp)) {
        throw new Error("Supabase did not return a valid email OTP");
      }
    } else {
      otp = String(crypto.randomInt(100000, 1000000));
      const expires = Date.now() + OTP_EXPIRY;
      legacyToken = `${expires}.${sign(email, otp, expires)}`;
    }

    const subjectLabel = isReset ? "Password Reset" : "First Login";
    const headerLabel = isReset ? "Password Reset" : "First Login";
    const greeting = isReset
      ? "You requested a password reset. Here’s your verification code:"
      : "Hey! Here’s your one-time verification code:";
    const footerNote = isReset
      ? "Enter this code on the Music Club member portal to set your new password."
      : "Enter this code on the Music Club member portal to finish setting your password.";

    await transporter.sendMail({
      from: MAIL_FROM,
      to: email,
      subject: `Music Club NITW — ${subjectLabel} OTP`,
      text: `Music Club NITW\n\n${greeting}\n\nYour OTP is: ${otp}\n\nValid for 10 minutes. If you didn't request this, ignore it.`,
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
    <p style="margin:6px 0 0;font-size:12px;color:rgba(255,255,255,.7);letter-spacing:.08em;text-transform:uppercase">${headerLabel}</p>
  </td></tr>
  <tr><td style="padding:36px">
    <p style="margin:0 0 8px;font-size:15px;color:rgba(243,241,236,.65);line-height:1.5">${greeting}</p>
    <div style="margin:20px 0;padding:20px;background:#121211;border-radius:12px;text-align:center;border:1px solid rgba(243,241,236,.08)">
      <span style="font-size:36px;font-weight:700;letter-spacing:12px;color:#f3f1ec;font-family:'Courier New',monospace">${otp}</span>
    </div>
    <table width="100%" cellpadding="0" cellspacing="0" style="margin:20px 0">
      <tr>
        <td style="padding:10px 14px;background:rgba(209,104,46,.08);border-radius:8px">
          <span style="font-size:13px;color:rgba(243,241,236,.5)">Valid for <strong style="color:rgba(243,241,236,.7)">10 minutes</strong></span>
        </td>
      </tr>
    </table>
    <p style="margin:0;font-size:13px;color:rgba(243,241,236,.35);line-height:1.5">${footerNote}</p>
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
    res.status(200).json(supabaseAuth ? { sent: true } : { token: legacyToken });
  } catch (e) {
    console.error("Mail error:", e.message);
    res.status(500).json({ error: e.message || "Failed to send email" });
  }
};
