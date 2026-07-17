const crypto = require("node:crypto");

const MAX_JSON_BYTES = 128 * 1024;
const MAX_UPLOAD_BYTES = 6 * 1024 * 1024;
const PUBLIC_RATE_WINDOW_MS = 10 * 60 * 1000;
const PUBLIC_RATE_LIMIT = 12;
const publicRateBuckets = new Map();

class RequestError extends Error {
  constructor(status, message) {
    super(message);
    this.status = status;
  }
}

class ProviderError extends Error {
  constructor(service, status, message) {
    super(message);
    this.service = service;
    this.status = status;
  }
}

function env(name) {
  return process.env[name]?.trim() || "";
}

function configuredOrigins() {
  return env("APP_ORIGIN")
    .split(",")
    .map((origin) => origin.trim().replace(/\/$/, ""))
    .filter(Boolean);
}

function baseHeaders(event, options = {}) {
  const headers = {
    "Content-Type": options.contentType ?? "application/json; charset=utf-8",
    "Cache-Control": options.cacheControl ?? "no-store",
    "X-Content-Type-Options": "nosniff",
    "Referrer-Policy": "no-referrer",
    "Permissions-Policy": "camera=(), microphone=(), geolocation=()"
  };
  const origin = event?.headers?.origin || event?.headers?.Origin;
  if (origin && configuredOrigins().includes(origin.replace(/\/$/, ""))) {
    headers["Access-Control-Allow-Origin"] = origin;
    headers.Vary = "Origin";
  }
  return headers;
}

function json(event, status, payload, extraHeaders = {}) {
  return {
    statusCode: status,
    headers: { ...baseHeaders(event), ...extraHeaders },
    body: JSON.stringify(payload)
  };
}

function text(event, status, body, extraHeaders = {}) {
  return {
    statusCode: status,
    headers: { ...baseHeaders(event, { contentType: "text/plain; charset=utf-8" }), ...extraHeaders },
    body
  };
}

function options(event) {
  return {
    statusCode: 204,
    headers: {
      ...baseHeaders(event),
      "Access-Control-Allow-Methods": "POST, OPTIONS",
      "Access-Control-Allow-Headers": "Content-Type, Authorization, X-Request-ID",
      "Access-Control-Max-Age": "600"
    },
    body: ""
  };
}

function parseJson(event) {
  const body = event.body || "";
  if (Buffer.byteLength(body, "utf8") > MAX_JSON_BYTES) {
    throw new RequestError(413, "Request is too large.");
  }
  if (!body) throw new RequestError(400, "A JSON request body is required.");
  try {
    return JSON.parse(body);
  } catch {
    throw new RequestError(400, "Request body must be valid JSON.");
  }
}

function string(value, field, min, max) {
  if (typeof value !== "string") throw new RequestError(400, `${field} is required.`);
  const normalized = value.replace(/[\u0000-\u001F\u007F]/g, " ").replace(/\s+/g, " ").trim();
  if (normalized.length < min || normalized.length > max) {
    throw new RequestError(400, `${field} must be between ${min} and ${max} characters.`);
  }
  return normalized;
}

function optionalString(value, max) {
  if (value === undefined || value === null || value === "") return "";
  return string(value, "Value", 1, max);
}

function isUuid(value) {
  return typeof value === "string" &&
    /^[0-9a-f]{8}-[0-9a-f]{4}-[1-5][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i.test(value);
}

function validateUpload(upload) {
  if (!upload || typeof upload !== "object") return null;
  const fileName = string(upload.fileName, "File name", 1, 180);
  const contentType = string(upload.contentType, "File type", 3, 100).toLowerCase();
  const byteSize = Number(upload.byteSize);
  const allowed = new Set([
    "image/jpeg",
    "image/png",
    "image/webp",
    "audio/mpeg",
    "audio/wav",
    "audio/webm",
    "video/mp4",
    "video/webm"
  ]);
  if (!allowed.has(contentType)) throw new RequestError(400, "That file type is not supported.");
  if (!Number.isInteger(byteSize) || byteSize < 1 || byteSize > MAX_UPLOAD_BYTES) {
    throw new RequestError(400, "Files must be no larger than 6 MB.");
  }
  const extension = fileName.split(".").pop()?.toLowerCase() || "bin";
  const safeName = `proof-${crypto.randomUUID()}.${extension.replace(/[^a-z0-9]/g, "") || "bin"}`;
  return { fileName: safeName, originalName: fileName, contentType, byteSize };
}

function validateProofSubmission(body) {
  const campaignId = string(body.campaignId, "Campaign", 3, 80);
  if (!/^[a-z0-9]+(?:-[a-z0-9]+)*$/i.test(campaignId)) {
    throw new RequestError(400, "Campaign link is invalid.");
  }
  const customerName = string(body.customerName, "Name", 2, 120);
  const customerEmail = string(body.customerEmail, "Email", 5, 254).toLowerCase();
  if (!/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(customerEmail)) {
    throw new RequestError(400, "Email address is invalid.");
  }
  const customerCompany = optionalString(body.customerCompany, 160);
  const feedbackText = string(body.feedbackText, "Feedback", 24, 5000);
  const rating = Number(body.rating);
  if (!Number.isInteger(rating) || rating < 1 || rating > 5) {
    throw new RequestError(400, "Rating must be between 1 and 5.");
  }

  return {
    campaignId,
    customerName,
    customerEmail,
    customerCompany,
    feedbackText,
    rating,
    consentPublish: true,
    consentAiProcessing: true,
    consentContact: body.consentContact === true,
    turnstileToken: optionalString(body.turnstileToken, 4096),

    upload: validateUpload(body.upload)
  };
}

function getClientIp(event) {
  const forwarded = event.headers?.["x-forwarded-for"] || event.headers?.["X-Forwarded-For"] || "";
  return forwarded.split(",")[0].trim() || "unknown";
}

function hash(value) {
  return crypto.createHash("sha256").update(value).digest("hex");
}

function ipHash(event) {
  const pepper = env("IP_HASH_PEPPER") || env("SUPABASE_SERVICE_ROLE_KEY") || "local-development-pepper";
  return hash(`${pepper}:${getClientIp(event)}`);
}

function enforcePublicRateLimit(event) {
  const key = ipHash(event);
  const now = Date.now();
  const existing = publicRateBuckets.get(key) || { count: 0, resetAt: now + PUBLIC_RATE_WINDOW_MS };
  if (existing.resetAt < now) {
    existing.count = 0;
    existing.resetAt = now + PUBLIC_RATE_WINDOW_MS;
  }
  existing.count += 1;
  publicRateBuckets.set(key, existing);
  if (existing.count > PUBLIC_RATE_LIMIT) {
    throw new RequestError(429, "Too many submissions. Please try again later.");
  }
}

async function verifyTurnstile(token, event) {
  const secret = env("TURNSTILE_SECRET_KEY");
  if (!secret) {
    if (isSupabaseConfigured()) {
      throw new RequestError(503, "Spam protection must be configured before public collection is enabled.");
    }
    return { verified: false, demo: true };
  }
  if (!token) throw new RequestError(400, "Please complete the spam protection check.");
  const form = new URLSearchParams({ secret, response: token, remoteip: getClientIp(event) });
  const response = await fetch("https://challenges.cloudflare.com/turnstile/v0/siteverify", {
    method: "POST",
    headers: { "Content-Type": "application/x-www-form-urlencoded" },
    body: form.toString(),
    signal: AbortSignal.timeout(8000)
  });
  const result = await response.json().catch(() => null);
  if (!response.ok || !result?.success) {
    throw new RequestError(400, "Spam protection could not verify this submission. Please retry.");
  }
  return { verified: true, demo: false };
}

function isSupabaseConfigured() {
  return Boolean(env("SUPABASE_URL") && env("SUPABASE_SERVICE_ROLE_KEY"));
}

function requireSupabaseConfig() {
  if (!isSupabaseConfigured()) throw new RequestError(503, "Storage is not connected yet.");
}

async function supabaseRequest(path, init = {}) {
  requireSupabaseConfig();
  const response = await fetch(`${env("SUPABASE_URL").replace(/\/$/, "")}${path}`, {
    ...init,
    headers: {
      apikey: env("SUPABASE_SERVICE_ROLE_KEY"),
      Authorization: `Bearer ${env("SUPABASE_SERVICE_ROLE_KEY")}`,
      "Content-Type": "application/json",
      ...(init.headers || {})
    },
    signal: init.signal || AbortSignal.timeout(10000)
  });
  const raw = await response.text();
  let data = null;
  if (raw) {
    try {
      data = JSON.parse(raw);
    } catch {
      data = raw;
    }
  }
  if (!response.ok) {
    throw new ProviderError("Supabase", response.status, typeof data === "string" ? data : data?.message || "Request failed.");
  }
  return data;
}

function restFilter(value) {
  return encodeURIComponent(value);
}

async function getPublicCampaign(publicSlug) {
  const rows = await supabaseRequest(
    `/rest/v1/campaigns?select=id,workspace_id,public_slug,status,public_enabled&public_slug=eq.${restFilter(publicSlug)}&status=eq.active&public_enabled=eq.true&limit=1`
  );
  if (!Array.isArray(rows) || rows.length !== 1) {
    throw new RequestError(404, "This collection link is unavailable.");
  }
  return rows[0];
}

async function authenticatedUser(event) {
  const authorization = event.headers?.authorization || event.headers?.Authorization || "";
  if (!authorization.startsWith("Bearer ")) return null;
  requireSupabaseConfig();
  const response = await fetch(`${env("SUPABASE_URL").replace(/\/$/, "")}/auth/v1/user`, {
    headers: {
      apikey: env("SUPABASE_SERVICE_ROLE_KEY"),
      Authorization: authorization
    },
    signal: AbortSignal.timeout(8000)
  });
  if (!response.ok) return null;
  return response.json();
}

async function requireWorkspaceMember(event, workspaceId, roles = ["owner", "admin", "editor"]) {
  if (!isUuid(workspaceId)) throw new RequestError(400, "Workspace is invalid.");
  const user = await authenticatedUser(event);
  if (!user?.id) throw new RequestError(401, "Sign in to continue.");
  const rows = await supabaseRequest(
    `/rest/v1/members?select=role&workspace_id=eq.${restFilter(workspaceId)}&user_id=eq.${restFilter(user.id)}&limit=1`
  );
  const role = Array.isArray(rows) ? rows[0]?.role : null;
  if (!role || !roles.includes(role)) throw new RequestError(403, "You do not have access to this workspace.");
  return { user, role };
}

async function writeAuditLog(workspaceId, eventName, actorId, metadata = {}) {
  if (!isSupabaseConfigured()) return;
  try {
    await supabaseRequest("/rest/v1/audit_logs", {
      method: "POST",
      headers: { Prefer: "return=minimal" },
      body: JSON.stringify({
        workspace_id: workspaceId,
        event: eventName,
        actor_id: actorId || null,
        actor_type: actorId ? "member" : "system",
        metadata
      })
    });
  } catch {
    // Audit delivery must not turn a completed customer action into a failure.
  }
}

function signedPath(bucket, path) {
  const encodedPath = path.split("/").map(encodeURIComponent).join("/");
  return `/storage/v1/object/upload/sign/${encodeURIComponent(bucket)}/${encodedPath}`;
}

async function createSignedUpload(bucket, path) {
  const data = await supabaseRequest(signedPath(bucket, path), {
    method: "POST",
    headers: { "x-upsert": "false" },
    body: "{}"
  });
  if (!data?.token) throw new ProviderError("Supabase Storage", 502, "Could not create a signed upload URL.");
  return data;
}

function hmac(value) {
  const key = env("IP_HASH_PEPPER") || env("SUPABASE_SERVICE_ROLE_KEY") || "local-development-key";
  return crypto.createHmac("sha256", key).update(value).digest("base64url");
}

function createUploadReceipt(mediaId, path) {
  const issuedAt = Date.now();
  return `${mediaId}.${issuedAt}.${hmac(`${mediaId}:${path}:${issuedAt}`)}`;
}

function verifyUploadReceipt(receipt, mediaId, path) {
  if (typeof receipt !== "string") return false;
  const parts = receipt.split(".");
  if (parts.length !== 3 || parts[0] !== mediaId) return false;
  const issuedAt = Number(parts[1]);
  if (!Number.isFinite(issuedAt) || Date.now() - issuedAt > 10 * 60 * 1000) return false;
  const expected = hmac(`${mediaId}:${path}:${issuedAt}`);
  const actualBuffer = Buffer.from(parts[2]);
  const expectedBuffer = Buffer.from(expected);
  return actualBuffer.length === expectedBuffer.length && crypto.timingSafeEqual(actualBuffer, expectedBuffer);
}

function mediaKind(contentType) {
  if (contentType.startsWith("image/")) return "image";
  if (contentType.startsWith("video/")) return "video";
  return "audio";
}

function requestId(event) {
  return event.headers?.["x-request-id"] || event.headers?.["x-nf-request-id"] || crypto.randomUUID();
}

function errorResponse(event, error) {
  if (error instanceof RequestError) return json(event, error.status, { ok: false, error: error.message });
  const id = requestId(event);
  console.error(JSON.stringify({ event: "function_error", requestId: id, message: error?.message, service: error?.service }));
  return json(event, 500, { ok: false, error: "Something went wrong. Please try again.", requestId: id });
}

module.exports = {
  MAX_UPLOAD_BYTES,
  ProviderError,
  RequestError,
  baseHeaders,
  createSignedUpload,
  createUploadReceipt,
  enforcePublicRateLimit,
  env,
  errorResponse,
  getClientIp,
  getPublicCampaign,
  isSupabaseConfigured,
  isUuid,
  ipHash,
  json,
  mediaKind,
  options,
  parseJson,
  requireWorkspaceMember,
  restFilter,
  supabaseRequest,
  text,
  validateProofSubmission,
  verifyTurnstile,
  verifyUploadReceipt,
  writeAuditLog
};
