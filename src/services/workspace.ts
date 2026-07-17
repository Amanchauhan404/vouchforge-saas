import { initialState } from "../data/seed";
import { supabase } from "../lib/supabase";
import type {
  AiAsset,
  AppState,
  AssetStatus,
  AssetType,
  Campaign,
  Contact,
  PublishStatus,
  PublishTarget,
  Submission,
  Workspace
} from "../types";

type WorkspaceRow = {
  id: string;
  name: string;
  brand_name: string;
  industry: string;
  plan: Workspace["plan"];
  free_mode: boolean;
  trust_score: number;
};

type CampaignRow = {
  id: string;
  public_slug: string;
  name: string;
  status: Campaign["status"];
  launched_at: string | null;
  ends_at: string | null;
};

const assetTypes = new Set<AssetType>([
  "testimonial",
  "case-study",
  "linkedin-post",
  "x-post",
  "instagram-caption",
  "google-review",
  "quote-card",
  "website-widget"
]);

const assetStatuses = new Set<AssetStatus>(["draft", "ready", "approved", "published"]);
const publishStatuses = new Set<PublishStatus>(["draft", "published", "scheduled", "queued", "blocked"]);

function client() {
  if (!supabase) throw new Error("Connect Supabase before creating a live workspace.");
  return supabase;
}

function formatDate(value: string | null | undefined) {
  if (!value) return "Not scheduled";
  const date = new Date(value);
  return Number.isNaN(date.getTime())
    ? "Not scheduled"
    : date.toLocaleDateString("en", { month: "short", day: "numeric", year: "numeric" });
}

function shortDate(value: string | null | undefined) {
  if (!value) return "Recently";
  const date = new Date(value);
  return Number.isNaN(date.getTime()) ? "Recently" : formatDate(value);
}

function slugify(value: string) {
  const base = value
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, "-")
    .replace(/^-+|-+$/g, "")
    .slice(0, 42);
  return `${base || "customer-proof"}-${Math.random().toString(36).slice(2, 8)}`;
}

function errorMessage(error: { message?: string } | null) {
  return error?.message || "The workspace could not be loaded.";
}

function asWorkspace(value: unknown): WorkspaceRow | null {
  if (!value || typeof value !== "object") return null;
  const row = value as Partial<WorkspaceRow>;
  return typeof row.id === "string" && typeof row.name === "string" && typeof row.brand_name === "string"
    ? {
        id: row.id,
        name: row.name,
        brand_name: row.brand_name,
        industry: row.industry ?? "",
        plan: row.plan === "pro" || row.plan === "enterprise" ? row.plan : "free",
        free_mode: Boolean(row.free_mode),
        trust_score: typeof row.trust_score === "number" ? row.trust_score : 0
      }
    : null;
}

export async function getCurrentWorkspace() {
  const { data, error } = await client()
    .from("members")
    .select("workspace_id, role, workspaces(id, name, brand_name, industry, plan, free_mode, trust_score)")
    .order("created_at", { ascending: true })
    .limit(1);
  if (error) throw new Error(errorMessage(error));
  const membership = data?.[0] as { workspaces?: WorkspaceRow | WorkspaceRow[] | null } | undefined;
  const related = Array.isArray(membership?.workspaces) ? membership?.workspaces[0] : membership?.workspaces;
  return asWorkspace(related);
}

export async function bootstrapWorkspace(input: { name: string; brandName: string; industry: string; userId: string }) {
  const api = client();
  const name = input.name.trim();
  const brandName = input.brandName.trim();
  const industry = input.industry.trim();
  if (name.length < 2 || brandName.length < 2) {
    throw new Error("Workspace and brand names need at least two characters.");
  }

  const { data: workspace, error: workspaceError } = await api
    .from("workspaces")
    .insert({ name, brand_name: brandName, industry, created_by: input.userId })
    .select("id, name, brand_name, industry, plan, free_mode, trust_score")
    .single();
  if (workspaceError || !workspace) throw new Error(errorMessage(workspaceError));

  const now = new Date().toISOString();
  const { data: campaign, error: campaignError } = await api
    .from("campaigns")
    .insert({
      workspace_id: workspace.id,
      public_slug: slugify(name),
      name: "First customer-proof campaign",
      status: "active",
      public_enabled: true,
      launched_at: now
    })
    .select("id, public_slug, name, status, launched_at, ends_at")
    .single();
  if (campaignError || !campaign) throw new Error(errorMessage(campaignError));

  const { error: targetsError } = await api.from("publish_targets").insert([
    {
      workspace_id: workspace.id,
      campaign_id: campaign.id,
      name: "Website widget",
      target_type: "widget",
      location: "Your website",
      status: "draft",
      free_mode_note: "Free Netlify widget"
    },
    {
      workspace_id: workspace.id,
      campaign_id: campaign.id,
      name: "Testimonial page",
      target_type: "page",
      location: `/testimonials/${workspace.id}`,
      status: "draft",
      free_mode_note: "Free public page"
    }
  ]);
  if (targetsError) throw new Error(errorMessage(targetsError));
  return { workspace: workspace as WorkspaceRow, campaign: campaign as CampaignRow };
}

export async function createLiveCampaign(workspaceId: string) {
  const api = client();
  const now = new Date();
  const { data, error } = await api
    .from("campaigns")
    .insert({
      workspace_id: workspaceId,
      public_slug: slugify(`proof-${now.toISOString().slice(0, 10)}`),
      name: `Customer-proof campaign ${now.toLocaleDateString("en", { month: "short", day: "numeric" })}`,
      status: "active",
      public_enabled: true,
      launched_at: now.toISOString()
    })
    .select("id, public_slug, name, status, launched_at, ends_at")
    .single();
  if (error || !data) throw new Error(errorMessage(error));
  return data as CampaignRow;
}

export async function loadLiveDashboard(): Promise<AppState | null> {
  const api = client();
  const workspace = await getCurrentWorkspace();
  if (!workspace) return null;

  const [campaignResponse, submissionResponse, assetResponse, contactResponse, targetResponse, requestResponse, auditResponse] =
    await Promise.all([
      api.from("campaigns").select("id, public_slug, name, status, launched_at, ends_at").eq("workspace_id", workspace.id).order("created_at", { ascending: false }).limit(1),
      api.from("submissions").select("id, customer_name, customer_company, feedback_text, rating, sentiment, created_at, consent_publish, consent_ai_processing").eq("workspace_id", workspace.id).neq("status", "deleted").order("created_at", { ascending: false }).limit(50),
      api.from("ai_assets").select("id, asset_type, title, body, status, created_at, channel_hint, generated_by").eq("workspace_id", workspace.id).neq("status", "rejected").order("created_at", { ascending: false }).limit(50),
      api.from("contacts").select("id, name, email, company, created_at").eq("workspace_id", workspace.id).order("created_at", { ascending: false }).limit(20),
      api.from("publish_targets").select("id, name, target_type, location, status, free_mode_note, last_published_at").eq("workspace_id", workspace.id).order("created_at", { ascending: true }).limit(30),
      api.from("review_requests").select("id", { count: "exact", head: true }).eq("workspace_id", workspace.id),
      api.from("audit_logs").select("id, event, actor_type, created_at").eq("workspace_id", workspace.id).order("created_at", { ascending: false }).limit(20)
    ]);

  const responses = [campaignResponse, submissionResponse, assetResponse, contactResponse, targetResponse, requestResponse, auditResponse];
  const failed = responses.find((response) => response.error);
  if (failed?.error) throw new Error(errorMessage(failed.error));
  const campaign = (campaignResponse.data?.[0] ?? null) as CampaignRow | null;
  if (!campaign) return null;

  const submissions: Submission[] = (submissionResponse.data ?? []).map((row) => ({
    id: row.id,
    customerName: row.customer_name,
    company: row.customer_company || "Customer",
    channel: "text",
    quote: row.feedback_text,
    rating: row.rating,
    sentiment: row.sentiment === "negative" || row.sentiment === "neutral" ? row.sentiment : "positive",
    receivedAt: shortDate(row.created_at),
    consentPublish: Boolean(row.consent_publish),
    consentAiProcessing: Boolean(row.consent_ai_processing)
  }));

  const assets: AiAsset[] = (assetResponse.data ?? [])
    .filter((row) => assetTypes.has(row.asset_type as AssetType))
    .map((row) => ({
      id: row.id,
      type: row.asset_type as AssetType,
      title: row.title,
      source: row.generated_by === "gemini" ? "Gemini draft" : "Reviewable draft",
      body: row.body,
      status: assetStatuses.has(row.status as AssetStatus) ? (row.status as AssetStatus) : "draft",
      createdAt: shortDate(row.created_at),
      channelHint: row.channel_hint || "Approval queue"
    }));

  const contacts: Contact[] = (contactResponse.data ?? []).map((row) => ({
    id: row.id,
    name: row.name,
    email: row.email,
    company: row.company || "",
    channel: "email",
    status: "queued",
    age: shortDate(row.created_at)
  }));

  const publishTargets: PublishTarget[] = (targetResponse.data ?? [])
    .filter((row) => typeof row.target_type === "string")
    .map((row) => ({
      id: row.id,
      name: row.name,
      type: row.target_type as PublishTarget["type"],
      location: row.location || "Not configured",
      status: publishStatuses.has(row.status as PublishStatus) ? (row.status as PublishStatus) : "draft",
      scheduledFor: row.last_published_at ? shortDate(row.last_published_at) : undefined,
      freeModeNote: row.free_mode_note || undefined
    }));

  const requestsSent = requestResponse.count ?? 0;
  const assetsPublished = assets.filter((asset) => asset.status === "published").length;
  const responseRate = requestsSent > 0 ? Math.round((submissions.length / requestsSent) * 100) : 0;
  const pendingApproval = assets.some((asset) => asset.status === "draft" || asset.status === "ready");

  return {
    workspace: {
      id: workspace.id,
      name: workspace.name,
      brandName: workspace.brand_name,
      industry: workspace.industry,
      plan: workspace.plan,
      freeMode: workspace.free_mode,
      trustScore: workspace.trust_score
    },
    campaign: {
      id: campaign.id,
      publicSlug: campaign.public_slug,
      name: campaign.name,
      status: campaign.status === "paused" || campaign.status === "draft" ? campaign.status : "active",
      launchedAt: formatDate(campaign.launched_at),
      endsAt: formatDate(campaign.ends_at),
      requestsSent,
      responses: submissions.length,
      responseRate,
      assetsPublished,
      engagement: 0
    },
    contacts,
    submissions,
    assets,
    approvalSteps: [
      { id: "accuracy", title: "Review AI-generated assets", description: "Ensure accuracy, tone, and brand alignment.", state: pendingApproval ? "current" : "pending" },
      { id: "consent", title: "Verify customer consent", description: "Confirm permission to publish and process.", state: submissions.length > 0 ? "done" : "pending" },
      { id: "legal", title: "Legal and compliance check", description: "Review for claims, regulated terms, and consent evidence.", state: "pending" },
      { id: "publish", title: "Approve for publishing", description: "Final approval to publish to selected channels.", state: pendingApproval ? "current" : "pending" },
      { id: "distribution", title: "Publishing and distribution", description: "Assets publish to selected free-mode and connected channels.", state: assetsPublished > 0 ? "done" : "pending" }
    ],
    publishTargets,
    integrations: initialState.integrations,
    metrics: [
      { label: "Response rate", value: `${responseRate}%`, delta: requestsSent ? "Live" : "No requests yet", tone: "neutral", points: [0, 1, 1, 2, 2, 3, 3, 4, 4, responseRate] },
      { label: "Proof received", value: submissions.length.toString(), delta: "Live", tone: "good", points: [0, 0, 1, 1, 2, 2, 3, 3, submissions.length, submissions.length] },
      { label: "Approved assets", value: assetsPublished.toString(), delta: "Live", tone: "good", points: [0, 0, 0, 1, 1, 1, 2, 2, assetsPublished, assetsPublished] },
      { label: "Publish targets", value: publishTargets.length.toString(), delta: "Free-first", tone: "neutral", points: [0, 1, 1, 2, 2, 3, 3, 3, publishTargets.length, publishTargets.length] }
    ],
    auditLogs: (auditResponse.data ?? []).map((row) => ({
      id: row.id,
      event: row.event,
      actor: row.actor_type === "member" ? "Workspace member" : "Automation",
      createdAt: shortDate(row.created_at)
    }))
  };
}
