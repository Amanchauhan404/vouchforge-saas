const crypto = require("node:crypto");
const {
  createSignedUpload,
  createUploadReceipt,
  enforcePublicRateLimit,
  errorResponse,
  getClientIp,
  getPublicCampaign,
  ipHash,
  isSupabaseConfigured,
  json,
  mediaKind,
  options,
  parseJson,
  supabaseRequest,
  validateProofSubmission,
  verifyTurnstile,
  writeAuditLog
} = require("./_shared.cjs");

exports.handler = async (event) => {
  if (event.httpMethod === "OPTIONS") return options(event);
  if (event.httpMethod !== "POST") return json(event, 405, { ok: false, error: "Method not allowed." }, { Allow: "POST, OPTIONS" });

  try {
    enforcePublicRateLimit(event);
    const proof = validateProofSubmission(parseJson(event));
    const turnstile = await verifyTurnstile(proof.turnstileToken, event);

    if (!isSupabaseConfigured()) {
      return json(event, 201, { ok: true, id: `demo-${crypto.randomUUID()}`, mode: "demo" });
    }

    const campaign = await getPublicCampaign(proof.campaignId);
    const submissionId = crypto.randomUUID();
    const submittedAt = new Date().toISOString();
    let media = null;

    if (proof.upload) {
      const mediaId = crypto.randomUUID();
      const path = `${campaign.workspace_id}/${submissionId}/${proof.upload.fileName}`;
      const grant = await createSignedUpload("proof-media", path);
      media = {
        id: mediaId,
        workspace_id: campaign.workspace_id,
        submission_id: submissionId,
        kind: mediaKind(proof.upload.contentType),
        original_file_name: proof.upload.originalName,
        content_type: proof.upload.contentType,
        byte_size: proof.upload.byteSize,
        storage_path: path,
        upload_status: "pending"
      };
      media.upload = {
        bucket: "proof-media",
        path,
        token: grant.token,
        mediaId,
        receipt: createUploadReceipt(mediaId, path)
      };
    }

    await supabaseRequest("/rest/v1/submissions", {
      method: "POST",
      headers: { Prefer: "return=minimal" },
      body: JSON.stringify({
        id: submissionId,
        workspace_id: campaign.workspace_id,
        campaign_id: campaign.id,
        customer_name: proof.customerName,
        customer_email: proof.customerEmail,
        customer_company: proof.customerCompany,
        feedback_text: proof.feedbackText,
        rating: proof.rating,
        source_channel: "public_form",
        status: "received",
        consent_publish: proof.consentPublish,
        consent_ai_processing: proof.consentAiProcessing,
        consent_contact: proof.consentContact,
        consent_recorded_at: submittedAt,
        collection_ip_hash: ipHash(event),
        raw_metadata: {
          user_agent: String(event.headers?.["user-agent"] || "").slice(0, 512),
          turnstile_verified: turnstile.verified,
          submitted_via: "public_collection"
        }
      })
    });

    if (media) {
      const { upload, ...record } = media;
      await supabaseRequest("/rest/v1/submission_media", {
        method: "POST",
        headers: { Prefer: "return=minimal" },
        body: JSON.stringify(record)
      });
    }

    await writeAuditLog(campaign.workspace_id, "customer_proof_submitted", null, {
      submission_id: submissionId,
      campaign_id: campaign.id,
      has_media: Boolean(media)
    });

    return json(event, 201, {
      ok: true,
      id: submissionId,
      mode: "live",
      upload: media?.upload
    });
  } catch (error) {
    return errorResponse(event, error);
  }
};
