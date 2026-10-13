// Sends a test phone notification to the signed-in member only.
const { createClient } = require("@supabase/supabase-js");
const { pushTo } = require("./_push");

module.exports = async (req, res) => {
  res.setHeader("Access-Control-Allow-Origin", process.env.ALLOWED_ORIGIN || "");
  res.setHeader("Access-Control-Allow-Methods", "POST, OPTIONS");
  res.setHeader("Access-Control-Allow-Headers", "Content-Type, Authorization");
  if (req.method === "OPTIONS") return res.status(200).end();
  if (req.method !== "POST") return res.status(405).json({ error: "POST only" });

  const { SUPABASE_URL, SUPABASE_SERVICE_ROLE_KEY, VAPID_PUBLIC_KEY, VAPID_PRIVATE_KEY } = process.env;
  if (!SUPABASE_SERVICE_ROLE_KEY) return res.status(500).json({ error: "Server not configured" });
  if (!VAPID_PUBLIC_KEY || !VAPID_PRIVATE_KEY) return res.status(500).json({ error: "Add VAPID_PUBLIC_KEY and VAPID_PRIVATE_KEY on Vercel, then redeploy" });

  const token = String(req.headers.authorization || "").replace(/^Bearer\s+/i, "");
  if (!token) return res.status(401).json({ error: "Sign in first" });
  const sb = createClient(SUPABASE_URL, SUPABASE_SERVICE_ROLE_KEY);
  const { data: auth } = await sb.auth.getUser(token);
  const email = auth?.user?.email;
  if (!email) return res.status(401).json({ error: "Sign in first" });
  const { data: me } = await sb.from("members").select("name").ilike("email", email).maybeSingle();
  if (!me) return res.status(403).json({ error: "Members only" });

  const first = me.name.split(" ")[0];
  const sent = await pushTo(sb, [me.name], { title: `Hey ${first}, notifications work 🎸`, body: "This is a test from the Music Club portal.", tag: "test" });
  if (!sent) return res.status(404).json({ error: "No phone registered for you yet. Tap Turn on first" });
  res.status(200).json({ sent });
};
