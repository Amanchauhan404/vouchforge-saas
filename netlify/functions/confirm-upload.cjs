const {
  errorResponse,
  isUuid,
  json,
  options,
  parseJson,
  supabaseRequest,
  verifyUploadReceipt,
  writeAuditLog
} = require("./_shared.cjs");

exports.handler = async (event) => {
  if (event.httpMethod === "OPTIONS") return options(event);
  if (event.httpMethod !== "POST") return json(event, 405, { ok: false, error: "Method not allowed." }, { Allow: "POST, OPTIONS" });

  try {
    const { mediaId, path, receipt } = parseJson(event);
    if (!isUuid(mediaId) || typeof path !== "string" || path.length > 512) {
      return json(event, 400, { ok: false, error: "Upload confirmation is invalid." });
    }
    if (!verifyUploadReceipt(receipt, mediaId, path)) {
      return json(event, 403, { ok: false, error: "Upload confirmation has expired." });
    }
    const rows = await supabaseRequest(
      `/rest/v1/submission_media?select=workspace_id,submission_id&id=eq.${encodeURIComponent(mediaId)}&storage_path=eq.${encodeURIComponent(path)}&limit=1`
    );
    if (!Array.isArray(rows) || rows.length !== 1) {
      return json(event, 404, { ok: false, error: "Upload record was not found." });
    }
    await supabaseRequest(`/rest/v1/submission_media?id=eq.${encodeURIComponent(mediaId)}`, {
      method: "PATCH",
      headers: { Prefer: "return=minimal" },
      body: JSON.stringify({ upload_status: "uploaded", uploaded_at: new Date().toISOString() })
    });
    await writeAuditLog(rows[0].workspace_id, "proof_media_uploaded", null, { media_id: mediaId, submission_id: rows[0].submission_id });
    return json(event, 200, { ok: true });
  } catch (error) {
    return errorResponse(event, error);
  }
};
