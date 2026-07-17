const { errorResponse, isSupabaseConfigured, json, options, restFilter, supabaseRequest } = require("./_shared.cjs");

function validSlug(value) {
  return typeof value === "string" && /^[a-z0-9]+(-[a-z0-9]+)*$/i.test(value) && value.length <= 80;
}

exports.handler = async (event) => {
  if (event.httpMethod === "OPTIONS") return options(event);
  if (event.httpMethod !== "GET") return json(event, 405, { ok: false, error: "Method not allowed." }, { Allow: "GET, OPTIONS" });

  try {
    const campaignId = event.queryStringParameters?.campaignId || "";
    if (!validSlug(campaignId)) return json(event, 404, { ok: false, error: "This collection link is unavailable." });
    if (!isSupabaseConfigured()) return json(event, 503, { ok: false, error: "Public collection is not configured yet." });

    const campaigns = await supabaseRequest(
      `/rest/v1/campaigns?select=id,workspace_id,public_slug,name&public_slug=eq.${restFilter(campaignId)}&status=eq.active&public_enabled=eq.true&limit=1`
    );
    const campaign = Array.isArray(campaigns) ? campaigns[0] : null;
    if (!campaign?.workspace_id) return json(event, 404, { ok: false, error: "This collection link is unavailable." });

    const workspaces = await supabaseRequest(
      `/rest/v1/workspaces?select=name,brand_name&id=eq.${restFilter(campaign.workspace_id)}&limit=1`
    );
    const workspace = Array.isArray(workspaces) ? workspaces[0] : null;
    if (!workspace?.brand_name) return json(event, 404, { ok: false, error: "This collection link is unavailable." });

    return json(event, 200, {
      ok: true,
      campaign: {
        publicSlug: campaign.public_slug,
        name: campaign.name,
        workspaceId: campaign.workspace_id,
        brandName: workspace.brand_name,
        workspaceName: workspace.name
      }
    });
  } catch (error) {
    return errorResponse(event, error);
  }
};
