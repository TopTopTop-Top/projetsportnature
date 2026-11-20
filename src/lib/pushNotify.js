/**
 * Envoi de notifications push via l'API Expo.
 * https://docs.expo.dev/push-notifications/sending-notifications/
 */
const EXPO_PUSH_URL = "https://exp.host/--/api/v2/push/send";

function isExpoPushToken(token) {
  return /^(Exponent|Expo)PushToken\[[^\]]+\]$/.test(String(token || "").trim());
}

/**
 * Envoie un push Expo. Ne jette jamais (retourne { ok:false } en cas d'échec).
 * @returns {Promise<{ok:boolean, skipped?:string, error?:string, tickets?:any}>}
 */
async function sendExpoPush({ token, title, body, data } = {}) {
  const to = String(token || "").trim();
  if (!isExpoPushToken(to)) return { ok: false, skipped: "invalid_token" };
  if (typeof fetch !== "function") return { ok: false, skipped: "no_fetch" };
  try {
    const headers = {
      Accept: "application/json",
      "Content-Type": "application/json",
    };
    if (process.env.EXPO_ACCESS_TOKEN) {
      headers.Authorization = `Bearer ${process.env.EXPO_ACCESS_TOKEN}`;
    }
    const res = await fetch(EXPO_PUSH_URL, {
      method: "POST",
      headers,
      body: JSON.stringify({
        to,
        sound: "default",
        title: title || "RavitoBox",
        body: body || undefined,
        data: data || {},
      }),
    });
    const json = await res.json().catch(() => null);
    if (!res.ok) {
      return { ok: false, error: `Expo push HTTP ${res.status}` };
    }
    return { ok: true, tickets: json?.data };
  } catch (e) {
    return { ok: false, error: e.message };
  }
}

/** Fire-and-forget : lance l'envoi et logge les erreurs sans bloquer l'appelant. */
function sendExpoPushAsync(payload) {
  sendExpoPush(payload)
    .then((r) => {
      if (!r.ok && r.error) console.error("Expo push failed:", r.error);
    })
    .catch((e) => console.error("Expo push failed:", e.message));
}

module.exports = { sendExpoPush, sendExpoPushAsync, isExpoPushToken };
