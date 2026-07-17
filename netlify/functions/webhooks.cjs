const crypto = require("node:crypto");
const { env, errorResponse, isSupabaseConfigured, json, options, supabaseRequest } = require("./_shared.cjs");

function safeEqual(left, right) {
  if (typeof left !== "string" || typeof right !== "string") return false;
  const a = Buffer.from(left);
  const b = Buffer.from(right);
  return a.length === b.length && crypto.timingSafeEqual(a, b);
}

function payloadHash(value) {
  return crypto.createHash("sha256").update(value).digest("hex");
}

async function recordEvent(provider, raw, parsed) {
  if (!isSupabaseConfigured()) return;
  const externalId = String(parsed?.entry?.[0]?.id || parsed?.id || payloadHash(raw)).slice(0, 200);
  await supabaseRequest("/rest/v1/webhook_events?on_conflict=provider,external_event_id", {
    method: "POST",
    headers: { Prefer: "resolution=ignore-duplicates,return=minimal" },
    body: JSON.stringify({
      provider,
      external_event_id: externalId,
      payload_hash: payloadHash(raw),
      signature_valid: true,
      received_at: new Date().toISOString()
    })
  });
}

exports.handler = async (event) => {
  const provider = (event.path.split("/").pop() || event.queryStringParameters?.provider || "").toLowerCase();
  if (provider !== "meta") return json(event, 404, { ok: false, error: "Webhook provider is not configured." });

  if (event.httpMethod === "GET") {
    const mode = event.queryStringParameters?.["hub.mode"];
    const token = event.queryStringParameters?.["hub.verify_token"];
    const challenge = event.queryStringParameters?.["hub.challenge"];
    if (mode === "subscribe" && token && safeEqual(token, env("META_WEBHOOK_VERIFY_TOKEN"))) {
      return { statusCode: 200, headers: { "Content-Type": "text/plain; charset=utf-8", "Cache-Control": "no-store" }, body: String(challenge || "") };
    }
    return json(event, 403, { ok: false, error: "Webhook verification failed." });
  }

  if (event.httpMethod === "OPTIONS") return options(event);
  if (event.httpMethod !== "POST") return json(event, 405, { ok: false, error: "Method not allowed." }, { Allow: "GET, POST, OPTIONS" });

  try {
    const secret = env("META_APP_SECRET");
    if (!secret) return json(event, 503, { ok: false, error: "Meta webhook signing is not configured." });
    const raw = event.body || "";
    const expected = `sha256=${crypto.createHmac("sha256", secret).update(raw).digest("hex")}`;
    const received = event.headers?.["x-hub-signature-256"] || event.headers?.["X-Hub-Signature-256"];
    if (!safeEqual(received, expected)) return json(event, 401, { ok: false, error: "Webhook signature is invalid." });
    const parsed = raw ? JSON.parse(raw) : {};
    await recordEvent(provider, raw, parsed);
    return json(event, 200, { ok: true });
  } catch (error) {
    return errorResponse(event, error);
  }
};
