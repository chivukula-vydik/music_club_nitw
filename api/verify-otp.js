const crypto = require("crypto");

const SECRET = process.env.OTP_SECRET || "mc-nitw-otp-fallback";

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
  const otp = String((req.body || {}).otp || "").trim();
  const token = String((req.body || {}).token || "");
  if (!/^[^\s@]+@student\.nitw\.ac\.in$/.test(email) || !/^\d{6}$/.test(otp) || !token) return res.status(400).json({ error: "Invalid OTP request" });

  const parts = token.split(".");
  if (parts.length !== 2) return res.status(400).json({ error: "OTP expired or invalid" });
  const [expiresStr, hmac] = parts;
  const expires = Number(expiresStr);

  if (!/^\d+$/.test(expiresStr) || !Number.isSafeInteger(expires) || !/^[a-f0-9]{64}$/.test(hmac) || Date.now() > expires) return res.status(400).json({ error: "OTP expired or invalid" });

  const expected = sign(email, otp, expires);
  if (!crypto.timingSafeEqual(Buffer.from(hmac, "hex"), Buffer.from(expected, "hex"))) {
    return res.status(400).json({ error: "Invalid OTP" });
  }

  res.status(200).json({ verified: true });
};
