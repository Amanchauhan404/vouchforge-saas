const crypto = require("node:crypto");
const {
  ProviderError,
  RequestError,
  env,
  errorResponse,
  isSupabaseConfigured,
  isUuid,
  json,
  options,
  parseJson,
  requireWorkspaceMember,
  restFilter,
  supabaseRequest,
  writeAuditLog
} = require("./_shared.cjs");

const ASSET_TYPES = new Set([
  "testimonial",
  "case-study",
  "linkedin-post",
  "x-post",
  "instagram-caption",
  "google-review",
  "quote-card",
  "website-widget"
]);

function demoAssets(feedback) {
  const excerpt = feedback.replace(/\s+/g, " ").trim().slice(0, 280);
  return [
    {
      type: "testimonial",
      title: "Customer testimonial draft",
      body: excerpt,
      channelHint: "Approval queue"
    },
    {
      type: "case-study",
      title: "Case study outline",
      body: "Problem, approach, outcome, and customer wording are ready for a human reviewer to expand from the submitted feedback.",
      channelHint: "Content studio"
    },
    {
      type: "linkedin-post",
      title: "LinkedIn draft",
      body: "A human-reviewed post can turn the submitted customer outcome into a concise, factual proof point.",
      channelHint: "Social draft"
    }
  ];
}

function validateRequest(body) {
  if (!body || typeof body !== "object") throw new RequestError(400, "A request body is required.");
  const feedback = typeof body.feedback === "string" ? body.feedback.replace(/\s+/g, " ").trim() : "";
  if (feedback.length < 24 || feedback.length > 8000) {
    throw new RequestError(400, "Feedback must be between 24 and 8,000 characters.");
  }
  const workspaceId = typeof body.workspaceId === "string" ? body.workspaceId : "";
  const campaignId = typeof body.campaignId === "string" ? body.campaignId : "";
  const sourceSubmissionIds = Array.isArray(body.sourceSubmissionIds) ? body.sourceSubmissionIds : [];
  if (isSupabaseConfigured()) {
    if (!isUuid(workspaceId) || !isUuid(campaignId)) throw new RequestError(400, "Workspace or campaign is invalid.");
    if (sourceSubmissionIds.length === 0 || sourceSubmissionIds.length > 50 || sourceSubmissionIds.some((id) => !isUuid(id))) {
      throw new RequestError(400, "Choose one to fifty submitted proof records.");
    }
  }
  return { feedback, workspaceId, campaignId, sourceSubmissionIds };
}

function assetSchema() {
  return {
    type: "object",
    properties: {
      assets: {
        type: "array",
        items: {
          type: "object",
          properties: {
            type: { type: "string", enum: [...ASSET_TYPES] },
            title: { type: "string" },
            body: { type: "string" },
            channelHint: { type: "string" }
          },
          required: ["type", "title", "body", "channelHint"]
        }
      }
    },
    required: ["assets"]
  };
}

function normalizeAssets(value) {
  const assets = Array.isArray(value?.assets) ? value.assets : [];
  const normalized = assets
    .filter((asset) => asset && ASSET_TYPES.has(asset.type))
    .map((asset) => ({
      type: asset.type,
      title: String(asset.title || "Customer proof draft").replace(/[\u0000-\u001F]/g, " ").trim().slice(0, 140),
      body: String(asset.body || "").replace(/[\u0000-\u001F]/g, " ").trim().slice(0, 1800),
      channelHint: String(asset.channelHint || "Approval queue").replace(/[\u0000-\u001F]/g, " ").trim().slice(0, 100)
    }))
    .filter((asset) => asset.title.length > 0 && asset.body.length > 0);
  if (normalized.length === 0) throw new ProviderError("Gemini", 502, "The AI response did not contain usable assets.");
  return normalized.slice(0, 8);
}

function delay(milliseconds) {
  return new Promise((resolve) => setTimeout(resolve, milliseconds));
}

async function generateWithGemini(sourceFeedback) {
  const apiKey = env("GEMINI_API_KEY");
  if (!apiKey) return null;
  const prompt = [
    "You are VouchForge AI, a customer-proof drafting assistant.",
    "Transform only the supplied customer feedback into factual marketing drafts.",
    "Never invent statistics, customers, product features, claims, outcomes, quotes, or permissions.",
    "Keep uncertain details generic. Every draft is for mandatory human approval before publication.",
    "Return three to six concise assets that faithfully paraphrase or quote the supplied material.",
    "SUPPLIED CUSTOMER FEEDBACK:",
    sourceFeedback
  ].join("\n\n");
  const body = {
    model: env("GEMINI_MODEL") || "gemini-3.5-flash",
    input: prompt,
    response_format: {
      type: "text",
      mime_type: "application/json",
      schema: assetSchema()
    }
  };

  let lastError;
  for (let attempt = 0; attempt < 2; attempt += 1) {
    const response = await fetch("https://generativelanguage.googleapis.com/v1beta/interactions", {
      method: "POST",
      headers: { "Content-Type": "application/json", "x-goog-api-key": apiKey },
      body: JSON.stringify(body),
      signal: AbortSignal.timeout(20000)
    });
    const raw = await response.text();
    let data = null;
    try {
      data = raw ? JSON.parse(raw) : null;
    } catch {
      data = null;
    }
    if (response.ok) {
      const text = data?.output_text || data?.outputs?.find((output) => output?.type === "text")?.text;
      if (typeof text !== "string") throw new ProviderError("Gemini", 502, "The AI response did not include text output.");
      try {
        return normalizeAssets(JSON.parse(text));
      } catch (error) {
        if (error instanceof ProviderError) throw error;
        throw new ProviderError("Gemini", 502, "The AI response was not valid structured data.");
      }
    }
    lastError = new ProviderError("Gemini", response.status, data?.error?.message || "Generation failed.");
    if (attempt === 0 && (response.status === 429 || response.status >= 500)) {
      const retryAfter = Number(response.headers.get("retry-after"));
      await delay(Number.isFinite(retryAfter) ? Math.min(retryAfter * 1000, 1000) : 400);
      continue;
    }
    throw lastError;
  }
  throw lastError || new ProviderError("Gemini", 502, "Generation failed.");
}

async function trustedFeedback(workspaceId, campaignId, sourceSubmissionIds) {
  const ids = sourceSubmissionIds.join(",");
  const rows = await supabaseRequest(
    `/rest/v1/submissions?select=id,customer_name,feedback_text,rating&workspace_id=eq.${restFilter(workspaceId)}&campaign_id=eq.${restFilter(campaignId)}&id=in.(${ids})&consent_ai_processing=is.true&limit=50`
  );
  if (!Array.isArray(rows) || rows.length === 0) {
    throw new RequestError(400, "No AI-consented proof records were found.");
  }
  return rows.map((row) => `Customer feedback ${row.id}:\n${row.feedback_text}`).join("\n\n");
}

exports.handler = async (event) => {
  if (event.httpMethod === "OPTIONS") return options(event);
  if (event.httpMethod !== "POST") return json(event, 405, { ok: false, error: "Method not allowed." }, { Allow: "POST, OPTIONS" });

  try {
    const request = validateRequest(parseJson(event));
    if (!isSupabaseConfigured()) {
      const assets = (await generateWithGemini(request.feedback)) || demoAssets(request.feedback);
      return json(event, 200, { ok: true, mode: env("GEMINI_API_KEY") ? "ai" : "demo", assets });
    }

    const { user } = await requireWorkspaceMember(event, request.workspaceId);
    const sourceFeedback = await trustedFeedback(request.workspaceId, request.campaignId, request.sourceSubmissionIds);
    const assets = (await generateWithGemini(sourceFeedback)) || demoAssets(sourceFeedback);
    const generatedAt = new Date().toISOString();
    const records = assets.map((asset) => ({
      id: crypto.randomUUID(),
      workspace_id: request.workspaceId,
      campaign_id: request.campaignId,
      asset_type: asset.type,
      title: asset.title,
      body: asset.body,
      channel_hint: asset.channelHint,
      status: "draft",
      generated_by: env("GEMINI_API_KEY") ? "gemini" : "template",
      provenance: { source_submission_ids: request.sourceSubmissionIds, generated_at: generatedAt }
    }));
    await supabaseRequest("/rest/v1/ai_assets", {
      method: "POST",
      headers: { Prefer: "return=minimal" },
      body: JSON.stringify(records)
    });
    await writeAuditLog(request.workspaceId, "ai_assets_generated", user.id, {
      campaign_id: request.campaignId,
      source_submission_ids: request.sourceSubmissionIds,
      asset_count: assets.length,
      provider: env("GEMINI_API_KEY") ? "gemini" : "template"
    });
    return json(event, 200, {
      ok: true,
      mode: env("GEMINI_API_KEY") ? "ai" : "template",
      assets: assets.map((asset, index) => ({ ...asset, id: records[index].id }))
    });
  } catch (error) {
    if (error instanceof ProviderError) {
      return json(event, error.status === 429 ? 429 : 502, {
        ok: false,
        error: "AI generation is temporarily unavailable. Your original feedback is safe; try again shortly."
      });
    }
    return errorResponse(event, error);
  }
};
