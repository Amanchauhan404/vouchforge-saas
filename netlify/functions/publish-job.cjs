const {
  RequestError,
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

function validateRequest(body) {
  const assetId = body?.assetId;
  const workspaceId = body?.workspaceId;
  const targetIds = Array.isArray(body?.targetIds) ? [...new Set(body.targetIds)] : [];
  if (!isSupabaseConfigured()) return { assetId, workspaceId, targetIds, demo: true };
  if (!isUuid(assetId) || !isUuid(workspaceId) || targetIds.length === 0 || targetIds.length > 20 || targetIds.some((id) => !isUuid(id))) {
    throw new RequestError(400, "Choose an approved asset and one or more valid publishing targets.");
  }
  return { assetId, workspaceId, targetIds, demo: false };
}

exports.handler = async (event) => {
  if (event.httpMethod === "OPTIONS") return options(event);
  if (event.httpMethod !== "POST") return json(event, 405, { ok: false, error: "Method not allowed." }, { Allow: "POST, OPTIONS" });

  try {
    const request = validateRequest(parseJson(event));
    if (request.demo) {
      return json(event, 200, {
        ok: true,
        mode: "demo",
        published: request.targetIds.filter((id) => String(id).includes("1") || String(id).includes("2")),
        queued: request.targetIds.filter((id) => !String(id).includes("1") && !String(id).includes("2"))
      });
    }
    const { user } = await requireWorkspaceMember(event, request.workspaceId);
    const assets = await supabaseRequest(
      `/rest/v1/ai_assets?select=id,status&workspace_id=eq.${restFilter(request.workspaceId)}&id=eq.${restFilter(request.assetId)}&limit=1`
    );
    if (!Array.isArray(assets) || assets[0]?.status !== "approved") {
      throw new RequestError(409, "Only human-approved assets can be published.");
    }
    const targetFilter = request.targetIds.join(",");
    const targets = await supabaseRequest(
      `/rest/v1/publish_targets?select=id,target_type,status&workspace_id=eq.${restFilter(request.workspaceId)}&id=in.(${targetFilter})&limit=20`
    );
    if (!Array.isArray(targets) || targets.length !== request.targetIds.length) {
      throw new RequestError(404, "One or more publishing targets were not found.");
    }

    const published = [];
    const queued = [];
    for (const target of targets) {
      if (target.target_type === "widget" || target.target_type === "page") {
        await supabaseRequest(`/rest/v1/publish_targets?id=eq.${restFilter(target.id)}`, {
          method: "PATCH",
          headers: { Prefer: "return=minimal" },
          body: JSON.stringify({ status: "published", last_published_at: new Date().toISOString() })
        });
        published.push(target.id);
      } else {
        await supabaseRequest("/rest/v1/publish_jobs?on_conflict=workspace_id,idempotency_key", {
          method: "POST",
          headers: { Prefer: "resolution=ignore-duplicates,return=minimal" },
          body: JSON.stringify({
            workspace_id: request.workspaceId,
            asset_id: request.assetId,
            publish_target_id: target.id,
            status: "queued",
            idempotency_key: `publish:${request.assetId}:${target.id}`,
            requested_by: user.id
          })
        });
        queued.push(target.id);
      }
    }
    const publishedAt = published.length > 0 ? new Date().toISOString() : null;
    await supabaseRequest(`/rest/v1/ai_assets?id=eq.${restFilter(request.assetId)}`, {
      method: "PATCH",
      headers: { Prefer: "return=minimal" },
      body: JSON.stringify({
        status: published.length > 0 ? "published" : "approved",
        is_public: published.length > 0,
        published_at: publishedAt
      })
    });
    await writeAuditLog(request.workspaceId, "publish_requested", user.id, {
      asset_id: request.assetId,
      published_target_ids: published,
      queued_target_ids: queued
    });
    return json(event, 200, { ok: true, published, queued });
  } catch (error) {
    return errorResponse(event, error);
  }
};
