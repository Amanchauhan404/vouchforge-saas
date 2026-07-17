const { errorResponse, isSupabaseConfigured, isUuid, json, options, restFilter, supabaseRequest } = require("./_shared.cjs");

exports.handler = async (event) => {
  if (event.httpMethod === "OPTIONS") return options(event);
  if (event.httpMethod !== "GET") return json(event, 405, { ok: false, error: "Method not allowed." }, { Allow: "GET, OPTIONS" });

  try {
    const workspaceId = event.queryStringParameters?.workspaceId || "";
    if (!isUuid(workspaceId)) return json(event, 404, { ok: false, error: "This testimonial page is unavailable." });
    if (!isSupabaseConfigured()) return json(event, 503, { ok: false, error: "Public testimonials are not configured yet." });

    const [workspaces, campaigns, assets] = await Promise.all([
      supabaseRequest(`/rest/v1/workspaces?select=name,brand_name&id=eq.${restFilter(workspaceId)}&limit=1`),
      supabaseRequest(`/rest/v1/campaigns?select=public_slug&workspace_id=eq.${restFilter(workspaceId)}&status=eq.active&public_enabled=eq.true&order=created_at.desc&limit=1`),
      supabaseRequest(`/rest/v1/ai_assets?select=id,title,body,published_at&workspace_id=eq.${restFilter(workspaceId)}&asset_type=eq.testimonial&status=eq.published&is_public=is.true&order=published_at.desc&limit=50`)
    ]);
    const workspace = Array.isArray(workspaces) ? workspaces[0] : null;
    if (!workspace?.brand_name) return json(event, 404, { ok: false, error: "This testimonial page is unavailable." });
    const campaign = Array.isArray(campaigns) ? campaigns[0] : null;

    return json(event, 200, {
      ok: true,
      page: {
        brandName: workspace.brand_name,
        workspaceName: workspace.name,
        publicSlug: campaign?.public_slug || null
      },
      testimonials: Array.isArray(assets)
        ? assets.map((asset) => ({
            id: asset.id,
            title: String(asset.title || "Approved customer"),
            body: String(asset.body || ""),
            publishedAt: asset.published_at || null
          })).filter((asset) => asset.body.length > 0)
        : []
    });
  } catch (error) {
    return errorResponse(event, error);
  }
};
