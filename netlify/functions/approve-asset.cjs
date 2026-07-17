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

function sourceIdsFromProvenance(provenance) {
  const ids = provenance?.source_submission_ids;
  return Array.isArray(ids) && ids.every(isUuid) ? [...new Set(ids)] : [];
}

exports.handler = async (event) => {
  if (event.httpMethod === "OPTIONS") return options(event);
  if (event.httpMethod !== "POST") return json(event, 405, { ok: false, error: "Method not allowed." }, { Allow: "POST, OPTIONS" });

  try {
    const { assetId, workspaceId } = parseJson(event);
    if (!isSupabaseConfigured()) return json(event, 200, { ok: true, approved: true, mode: "demo" });
    if (!isUuid(assetId) || !isUuid(workspaceId)) {
      throw new RequestError(400, "Asset or workspace is invalid.");
    }
    const { user } = await requireWorkspaceMember(event, workspaceId);
    const assets = await supabaseRequest(
      `/rest/v1/ai_assets?select=id,status,provenance&workspace_id=eq.${restFilter(workspaceId)}&id=eq.${restFilter(assetId)}&limit=1`
    );
    const asset = Array.isArray(assets) ? assets[0] : null;
    if (!asset || asset.status === "rejected") throw new RequestError(404, "Asset is not available for approval.");
    if (asset.status === "published") return json(event, 200, { ok: true, approved: true, alreadyPublished: true });

    const sourceIds = sourceIdsFromProvenance(asset.provenance);
    if (sourceIds.length === 0) {
      throw new RequestError(409, "This asset is missing customer-proof provenance and cannot be approved.");
    }
    const consented = await supabaseRequest(
      `/rest/v1/submissions?select=id&workspace_id=eq.${restFilter(workspaceId)}&id=in.(${sourceIds.join(",")})&consent_publish=is.true&status=neq.deleted&limit=50`
    );
    if (!Array.isArray(consented) || consented.length !== sourceIds.length) {
      throw new RequestError(409, "Every source submission must have recorded publishing consent.");
    }

    const decidedAt = new Date().toISOString();
    await supabaseRequest(`/rest/v1/ai_assets?id=eq.${restFilter(assetId)}`, {
      method: "PATCH",
      headers: { Prefer: "return=minimal" },
      body: JSON.stringify({ status: "approved", approved_by: user.id, approved_at: decidedAt })
    });
    await supabaseRequest("/rest/v1/approvals?on_conflict=asset_id,step", {
      method: "POST",
      headers: { Prefer: "resolution=merge-duplicates,return=minimal" },
      body: JSON.stringify({
        workspace_id: workspaceId,
        asset_id: assetId,
        step: "publish",
        status: "approved",
        reviewer_id: user.id,
        notes: "Final human approval recorded before publishing.",
        decided_at: decidedAt
      })
    });
    await writeAuditLog(workspaceId, "asset_approved", user.id, { asset_id: assetId, source_submission_ids: sourceIds });
    return json(event, 200, { ok: true, approved: true });
  } catch (error) {
    return errorResponse(event, error);
  }
};
