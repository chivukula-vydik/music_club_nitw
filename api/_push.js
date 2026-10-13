// Phone notifications (web push), sent alongside the emails.
// Env vars: VAPID_PUBLIC_KEY, VAPID_PRIVATE_KEY. Without them push is skipped and emails still go.
// Underscore prefix: Vercel doesn't expose this file as an endpoint.

const webpush = require("web-push");

let ready = null;
function setup() {
  if (ready !== null) return ready;
  const { VAPID_PUBLIC_KEY, VAPID_PRIVATE_KEY } = process.env;
  ready = !!(VAPID_PUBLIC_KEY && VAPID_PRIVATE_KEY);
  if (ready) webpush.setVapidDetails("mailto:musicclub.nitw@gmail.com", VAPID_PUBLIC_KEY, VAPID_PRIVATE_KEY);
  return ready;
}

// payload: { title, body, url?, tag? }. Never throws: a push failure must not stop the email.
async function pushTo(sb, names, payload) {
  try {
    names = [...new Set((names || []).filter(Boolean))];
    if (!setup() || !names.length) return 0;
    const { data } = await sb.from("push_subs").select("endpoint,sub").in("member_name", names);
    let sent = 0;
    await Promise.all((data || []).map(async r => {
      try {
        await webpush.sendNotification(r.sub, JSON.stringify({ url: "/portal", ...payload }), { TTL: 3600 });
        sent++;
      } catch (e) {
        // phone unsubscribed or app removed: forget it
        if (e.statusCode === 404 || e.statusCode === 410) await sb.from("push_subs").delete().eq("endpoint", r.endpoint);
        else console.error("Push error:", e.statusCode, e.message);
      }
    }));
    return sent;
  } catch (e) {
    console.error("Push skipped:", e.message);
    return 0;
  }
}

module.exports = { pushTo };
