import { useEffect, useRef, useState } from "react";
import type { ChangeEvent, FormEvent, ReactNode } from "react";
import {
  Activity,
  BarChart3,
  Bell,
  BookOpen,
  Check,
  CheckCircle2,
  ChevronDown,
  ClipboardCheck,
  FileText,
  Globe,
  HelpCircle,
  Home,
  Inbox,
  Library,
  Link,
  Lock,
  Menu,
  Megaphone,
  MessageSquare,
  Play,
  Plus,
  RefreshCw,
  Search,
  Send,
  Settings,
  ShieldCheck,
  Star,
  Upload,
  Video,
  Wand,
  X
} from "lucide-react";
import type { LucideIcon } from "lucide-react";
import type { Session } from "@supabase/supabase-js";
import { initialState } from "./data/seed";
import { isSupabaseConfigured, supabase } from "./lib/supabase";
import {
  approveAsset,
  fetchPublicCampaign,
  fetchPublicTestimonials,
  generateAssetsFromFeedback,
  runPublishJob,
  submitCustomerProof,
  uploadProofMedia
} from "./services/api";
import type { PublicCampaignData, PublicTestimonialsData } from "./services/api";
import { bootstrapWorkspace, createLiveCampaign, loadLiveDashboard } from "./services/workspace";
import type {
  AiAsset,
  AppState,
  AssetStatus,
  Integration,
  Metric,
  ProofSubmissionPayload,
  PublishStatus,
  PublishTarget,
  RequestStatus,
  Submission
} from "./types";

type Route =
  | { name: "dashboard" }
  | { name: "collect"; campaignId: string }
  | { name: "testimonials"; workspaceId: string }
  | { name: "privacy" }
  | { name: "terms" };

function parseRoute(pathname: string): Route {
  const parts = pathname.split("/").filter(Boolean);
  if (parts[0] === "collect" && parts[1]) return { name: "collect", campaignId: parts[1] };
  if (parts[0] === "testimonials" && parts[1]) return { name: "testimonials", workspaceId: parts[1] };
  if (parts[0] === "privacy") return { name: "privacy" };
  if (parts[0] === "terms") return { name: "terms" };
  return { name: "dashboard" };
}

function statusLabel(status: RequestStatus | AssetStatus | PublishStatus | Integration["status"] | string) {
  return status
    .split("-")
    .map((part) => part.charAt(0).toUpperCase() + part.slice(1))
    .join(" ");
}

function initials(name: string) {
  return name
    .split(" ")
    .map((part) => part[0])
    .join("")
    .slice(0, 2)
    .toUpperCase();
}

function App() {
  const [route, setRoute] = useState<Route>(() => parseRoute(window.location.pathname));
  const [state, setState] = useState<AppState>(initialState);
  const [notice, setNotice] = useState("");
  const [session, setSession] = useState<Session | null>(null);
  const [authLoading, setAuthLoading] = useState(isSupabaseConfigured);
  const [authOpen, setAuthOpen] = useState(false);
  const [onboardingOpen, setOnboardingOpen] = useState(false);
  const [refreshingWorkspace, setRefreshingWorkspace] = useState(false);

  useEffect(() => {
    const onPop = () => setRoute(parseRoute(window.location.pathname));
    window.addEventListener("popstate", onPop);
    return () => window.removeEventListener("popstate", onPop);
  }, []);

  useEffect(() => {
    if (!supabase) {
      setAuthLoading(false);
      return;
    }
    let mounted = true;
    void supabase.auth.getSession().then(({ data, error }) => {
      if (!mounted) return;
      if (error) setNotice(error.message);
      setSession(data.session);
      setAuthLoading(false);
    });
    const { data } = supabase.auth.onAuthStateChange((_event, nextSession) => {
      if (mounted) setSession(nextSession);
    });
    return () => {
      mounted = false;
      data.subscription.unsubscribe();
    };
  }, []);

  useEffect(() => {
    if (!session || !supabase) return;
    void refreshWorkspace(false);
  }, [session?.user.id]);

  function navigate(path: string) {
    window.history.pushState(null, "", path);
    setRoute(parseRoute(path));
    window.scrollTo({ top: 0 });
  }

  async function refreshWorkspace(announce = true) {
    if (!session || !supabase) return;
    setRefreshingWorkspace(true);
    try {
      const liveState = await loadLiveDashboard();
      if (!liveState) {
        setOnboardingOpen(true);
        return;
      }
      setState(liveState);
      setOnboardingOpen(false);
      if (announce) setNotice("Live workspace refreshed.");
    } catch (error) {
      setNotice(error instanceof Error ? error.message : "The live workspace could not be refreshed.");
    } finally {
      setRefreshingWorkspace(false);
    }
  }

  async function createWorkspace(input: { name: string; brandName: string; industry: string }) {
    if (!session) return;
    try {
      await bootstrapWorkspace({ ...input, userId: session.user.id });
      setOnboardingOpen(false);
      await refreshWorkspace(false);
      setNotice("Your live workspace and first collection campaign are ready.");
    } catch (error) {
      throw error instanceof Error ? error : new Error("The workspace could not be created.");
    }
  }

  async function signOut() {
    if (!supabase) return;
    const { error } = await supabase.auth.signOut();
    if (error) {
      setNotice(error.message);
      return;
    }
    setSession(null);
    setState(initialState);
    setOnboardingOpen(false);
    setNotice("Signed out. The local demo is still available.");
  }

  async function approveAndPublish() {
    const firstReady = state.assets.find((asset) => asset.status === "ready" || asset.status === "draft");
    if (!firstReady) return;

    try {
      await approveAsset(firstReady.id, state.workspace.id);
      await runPublishJob(firstReady.id, state.publishTargets.map((target) => target.id), state.workspace.id);

      setState((current) => ({
        ...current,
        campaign: {
          ...current.campaign,
          assetsPublished: current.campaign.assetsPublished + 1,
          engagement: Number((current.campaign.engagement + 0.4).toFixed(1))
        },
        assets: current.assets.map((asset) =>
          asset.id === firstReady.id ? { ...asset, status: "published" } : asset
        ),
        approvalSteps: current.approvalSteps.map((step) =>
          step.id === "ap-4" || step.id === "ap-5" ? { ...step, state: "done" } : step
        ),
        publishTargets: current.publishTargets.map((target) =>
          target.status === "queued" ? { ...target, status: "scheduled" } : target
        ),
        auditLogs: [
          {
            id: `log-${Date.now()}`,
            event: `${firstReady.title} approved and sent to the publish queue`,
            actor: "Maya Patel",
            createdAt: "Now"
          },
          ...current.auditLogs
        ]
      }));
      setNotice("Human approval recorded. Free website channels are live and external channels are queued.");
    } catch (error) {
      setNotice(error instanceof Error ? error.message : "Publishing could not be completed. Please try again.");
    }
  }

  async function generateNewAssets() {
    const feedback = state.submissions.map((submission) => submission.quote).join("\n");
    try {
      const generated = await generateAssetsFromFeedback(
        feedback,
        state.workspace.id,
        state.campaign.id,
        state.submissions.map((submission) => submission.id)
      );
      const now = new Date().toLocaleDateString("en", {
        month: "short",
        day: "numeric",
        year: "numeric"
      });

      setState((current) => ({
        ...current,
        assets: [
          ...generated.map<AiAsset>((asset, index) => ({
            id: asset.id ?? `generated-${Date.now()}-${index}`,
            type: asset.type,
            title: asset.title,
            source: "AI generation",
            body: asset.body,
            status: index === 0 ? "ready" : "draft",
            createdAt: now,
            channelHint: asset.channelHint
          })),
          ...current.assets
        ],
        auditLogs: [
          {
            id: `log-${Date.now()}`,
            event: "AI generated a new multi-channel proof package",
            actor: "Automation",
            createdAt: "Now"
          },
          ...current.auditLogs
        ]
      }));
      setNotice("New drafts are ready for human review. Nothing is public until you approve it.");
    } catch (error) {
      setNotice(error instanceof Error ? error.message : "AI generation could not be completed. Please retry.");
    }
  }

  function createCampaign() {
    if (session && supabase) {
      void createLiveCampaign(state.workspace.id)
        .then(() => refreshWorkspace(false))
        .then(() => setNotice("A new live customer-proof campaign was created."))
        .catch((error: unknown) => setNotice(error instanceof Error ? error.message : "The campaign could not be created."));
      return;
    }
    setState((current) => ({
      ...current,
      campaign: {
        ...current.campaign,
        name: "New Free-Tier Pilot Campaign",
        status: "active",
        requestsSent: current.campaign.requestsSent + 25
      },
      auditLogs: [
        {
          id: `log-${Date.now()}`,
          event: "Created a free-tier pilot campaign",
          actor: "Maya Patel",
          createdAt: "Now"
        },
        ...current.auditLogs
      ]
    }));
    setNotice("Free-tier pilot campaign created.");
  }

  if (route.name === "collect") {
    return <CollectPage campaignId={route.campaignId} state={state} onNavigate={navigate} />;
  }

  if (route.name === "testimonials") {
    return <TestimonialsPage workspaceId={route.workspaceId} state={state} onNavigate={navigate} />;
  }

  if (route.name === "privacy" || route.name === "terms") {
    return <LegalPage kind={route.name} onNavigate={navigate} />;
  }

  return (
    <>
      <Dashboard
        state={state}
        onNavigate={navigate}
        onApprove={approveAndPublish}
        onGenerate={generateNewAssets}
        onCreateCampaign={createCampaign}
        notice={notice}
        authConfigured={isSupabaseConfigured}
        authLoading={authLoading}
        userEmail={session?.user.email}
        onOpenAuth={() => setAuthOpen(true)}
        onSignOut={signOut}
        onRefreshWorkspace={() => void refreshWorkspace()}
        refreshingWorkspace={refreshingWorkspace}
      />
      {authOpen ? <AuthModal onClose={() => setAuthOpen(false)} /> : null}
      {onboardingOpen && session ? <WorkspaceOnboarding onComplete={createWorkspace} /> : null}
    </>
  );
}

function Dashboard({
  state,
  onNavigate,
  onApprove,
  onGenerate,
  onCreateCampaign,
  notice,
  authConfigured,
  authLoading,
  userEmail,
  onOpenAuth,
  onSignOut,
  onRefreshWorkspace,
  refreshingWorkspace
}: {
  state: AppState;
  onNavigate: (path: string) => void;
  onApprove: () => Promise<void> | void;
  onGenerate: () => Promise<void> | void;
  onCreateCampaign: () => void;
  notice: string;
  authConfigured: boolean;
  authLoading: boolean;
  userEmail?: string;
  onOpenAuth: () => void;
  onSignOut: () => Promise<void> | void;
  onRefreshWorkspace: () => void;
  refreshingWorkspace: boolean;
}) {
  const [generating, setGenerating] = useState(false);
  const [publishing, setPublishing] = useState(false);
  const collectionUrl = `/collect/${state.campaign.publicSlug}`;

  async function handleGenerate() {
    setGenerating(true);
    await onGenerate();
    setGenerating(false);
  }

  async function handleApprove() {
    setPublishing(true);
    await onApprove();
    setPublishing(false);
  }

  return (
    <div className="app-frame">
      <Sidebar onNavigate={onNavigate} />
      <main className="workspace" aria-label="VouchForge AI command center">
        <TopBar
          state={state}
          onCreateCampaign={onCreateCampaign}
          authConfigured={authConfigured}
          authLoading={authLoading}
          userEmail={userEmail}
          onOpenAuth={onOpenAuth}
          onSignOut={onSignOut}
          onRefreshWorkspace={onRefreshWorkspace}
          refreshingWorkspace={refreshingWorkspace}
        />
        <section className="campaign-strip" aria-label="Campaign status">
          <div>
            <div className="section-title">
              <h1>Campaign: {state.campaign.name}</h1>
              <span className="status good">Active</span>
            </div>
            <p>
              Launched: {state.campaign.launchedAt} <span>Ends: {state.campaign.endsAt}</span>
            </p>
          </div>
          <Stat label="Requests Sent" value={state.campaign.requestsSent.toLocaleString()} />
          <Stat label="Responses" value={state.campaign.responses.toString()} />
          <Stat label="Response Rate" value={`${state.campaign.responseRate}%`} />
          <Stat label="Assets Published" value={state.campaign.assetsPublished.toString()} />
          <Stat label="Engagement" value={`${state.campaign.engagement}%`} />
        </section>
        {notice ? <p className="notice" role="status">{notice}</p> : null}

        <section className="dashboard-grid">
          <Panel className="queue-panel" title="Review Request Queue" count={state.contacts.length}>
            <RequestQueue contacts={state.contacts} />
          </Panel>

          <Panel title="AI Asset Generation" count={state.assets.length}>
            <div className="panel-tabs">
              <button className="tab active">All</button>
              <button className="tab">Testimonials</button>
              <button className="tab">Case Studies</button>
              <button className="tab">Social Posts</button>
            </div>
            <AssetList assets={state.assets.slice(0, 5)} />
            <button className="text-action" onClick={handleGenerate} disabled={generating}>
              <Wand size={15} />
              {generating ? "Generating assets..." : "Generate from latest feedback"}
            </button>
          </Panel>

          <Panel title="Review Collection Page">
            <CollectionPreview brandName={state.workspace.brandName} collectionUrl={collectionUrl} onNavigate={() => onNavigate(collectionUrl)} />
          </Panel>

          <Panel title="Review & Approvals" count={state.approvalSteps.length}>
            <ApprovalPanel state={state} onApprove={handleApprove} publishing={publishing} />
          </Panel>

          <Panel title="Collected Feedback" count={state.submissions.length}>
            <FeedbackList submissions={state.submissions} />
          </Panel>

          <Panel title="Analytics Overview">
            <AnalyticsGrid metrics={state.metrics} />
          </Panel>

          <Panel title="Website Widget Preview">
            <WidgetPreview state={state} />
          </Panel>

          <Panel title="Channel Publishing Status">
            <PublishStatusList targets={state.publishTargets} />
          </Panel>
        </section>
      </main>
    </div>
  );
}

function Sidebar({ onNavigate }: { onNavigate: (path: string) => void }) {
  const [mobileNavOpen, setMobileNavOpen] = useState(false);
  const groups: Array<{ label: string; icon: LucideIcon; items?: string[] }> = [
    { label: "Command Center", icon: Home }
  ];

  return (
    <aside className={`sidebar ${mobileNavOpen ? "mobile-open" : ""}`}>
      <button
        className="brand"
        onClick={() => {
          setMobileNavOpen(false);
          onNavigate("/");
        }}
      >
        <span className="brand-mark">V</span>
        <span>VouchForge <strong>AI</strong></span>
      </button>
      <button
        className="mobile-nav-toggle"
        aria-label={mobileNavOpen ? "Close navigation" : "Open navigation"}
        aria-expanded={mobileNavOpen}
        onClick={() => setMobileNavOpen((open) => !open)}
      >
        {mobileNavOpen ? <X size={20} /> : <Menu size={20} />}
      </button>

      <nav className="side-nav" aria-label="Primary">
        {groups.map((group, index) => {
          const Icon = group.icon;
          return (
            <div key={group.label} className="nav-block">
              <button className={`nav-row ${index === 0 ? "active" : ""}`}>
                <Icon size={18} />
                <span>{group.label}</span>
                {group.items ? <ChevronDown size={14} /> : null}
              </button>
              {group.items ? (
                <div className="nav-children">
                  {group.items.map((item) => (
                    <button key={item}>{item}</button>
                  ))}
                </div>
              ) : null}
            </div>
          );
        })}
      </nav>

      <div className="trust-card">
        <div>
          <strong>Security controls</strong>
          <p>Consent and approval records</p>
        </div>
        <div className="trust-row">
          <span>GDPR</span>
          <CheckCircle2 size={15} />
        </div>
        <div className="trust-row">
          <span>Consent ledger</span>
          <CheckCircle2 size={15} />
        </div>
        <button>View trust center</button>
      </div>

      <div className="sidebar-footer">
        <button>
          <HelpCircle size={16} />
          Help
        </button>
        <button>
          <BookOpen size={16} />
          What's new
        </button>
      </div>
    </aside>
  );
}

function TopBar({
  state,
  onCreateCampaign,
  authConfigured,
  authLoading,
  userEmail,
  onOpenAuth,
  onSignOut,
  onRefreshWorkspace,
  refreshingWorkspace
}: {
  state: AppState;
  onCreateCampaign: () => void;
  authConfigured: boolean;
  authLoading: boolean;
  userEmail?: string;
  onOpenAuth: () => void;
  onSignOut: () => Promise<void> | void;
  onRefreshWorkspace: () => void;
  refreshingWorkspace: boolean;
}) {
  const signedIn = Boolean(userEmail);
  const newAction = authConfigured && !signedIn ? onOpenAuth : onCreateCampaign;
  return (
    <header className="topbar">
      <div className="workspace-switcher">
        <Home size={16} />
        <strong>{state.workspace.name}</strong>
        <ChevronDown size={15} />
        <span>
          {state.workspace.plan === "free"
            ? "Free-first Plan"
            : state.workspace.plan === "pro"
              ? "Pro Plan"
              : "Enterprise Plan"}
        </span>
      </div>
      <label className="searchbox">
        <Search size={16} />
        <input aria-label="Search" placeholder="Search anything..." />
      </label>
      <button className="primary-button" onClick={newAction} disabled={authLoading}>
        {authConfigured && !signedIn ? <Lock size={16} /> : <Plus size={17} />}
        {authConfigured && !signedIn ? "Sign in" : "New"}
      </button>
      {authConfigured && signedIn ? (
        <button className="icon-button" aria-label="Refresh workspace" onClick={onRefreshWorkspace} disabled={refreshingWorkspace}>
          <RefreshCw size={18} />
        </button>
      ) : null}
      <button className="icon-button" aria-label="Notifications">
        <Bell size={18} />
      </button>
      <button className="icon-button" aria-label="Settings">
        <Settings size={18} />
      </button>
      {authConfigured ? (
        <button
          className="avatar"
          aria-label={signedIn ? "Sign out" : "Sign in"}
          onClick={signedIn ? () => void onSignOut() : onOpenAuth}
          disabled={authLoading}
          title={signedIn ? userEmail : "Sign in"}
        >
          {signedIn ? initials(userEmail ?? "Member") : <Lock size={15} />}
        </button>
      ) : (
        <div className="avatar">MP</div>
      )}
    </header>
  );
}

function AuthModal({ onClose }: { onClose: () => void }) {
  const [mode, setMode] = useState<"sign-in" | "sign-up">("sign-in");
  const [email, setEmail] = useState("");
  const [password, setPassword] = useState("");
  const [message, setMessage] = useState("");
  const [submitting, setSubmitting] = useState(false);

  async function handleSubmit(event: FormEvent) {
    event.preventDefault();
    if (!supabase) return;
    setMessage("");
    setSubmitting(true);
    const result = mode === "sign-in"
      ? await supabase.auth.signInWithPassword({ email, password })
      : await supabase.auth.signUp({ email, password });
    setSubmitting(false);
    if (result.error) {
      setMessage(result.error.message);
      return;
    }
    if (mode === "sign-up" && !result.data.session) {
      setMessage("Check your inbox to confirm this address, then sign in.");
      return;
    }
    onClose();
  }

  return (
    <div className="modal-backdrop" role="presentation">
      <section className="auth-modal" role="dialog" aria-modal="true" aria-labelledby="auth-title">
        <div className="modal-header">
          <div>
            <span className="brand-mark">V</span>
            <h2 id="auth-title">{mode === "sign-in" ? "Sign in to VouchForge AI" : "Create your workspace access"}</h2>
          </div>
          <button className="icon-button" aria-label="Close sign in" onClick={onClose}>
            <X size={18} />
          </button>
        </div>
        <form className="modal-form" onSubmit={handleSubmit}>
          <label>
            Work email
            <input type="email" value={email} onChange={(event) => setEmail(event.target.value)} required autoComplete="email" />
          </label>
          <label>
            Password
            <input
              type="password"
              value={password}
              onChange={(event) => setPassword(event.target.value)}
              minLength={8}
              required
              autoComplete={mode === "sign-in" ? "current-password" : "new-password"}
            />
          </label>
          {message ? <p className="form-error" role="alert">{message}</p> : null}
          <button className="primary-button" type="submit" disabled={submitting}>
            {submitting ? "Working..." : mode === "sign-in" ? "Sign in" : "Create account"}
          </button>
          <button
            className="text-action"
            type="button"
            onClick={() => {
              setMode((current) => current === "sign-in" ? "sign-up" : "sign-in");
              setMessage("");
            }}
          >
            {mode === "sign-in" ? "Create a new account" : "I already have an account"}
          </button>
        </form>
      </section>
    </div>
  );
}

function WorkspaceOnboarding({
  onComplete
}: {
  onComplete: (input: { name: string; brandName: string; industry: string }) => Promise<void> | void;
}) {
  const [name, setName] = useState("");
  const [brandName, setBrandName] = useState("");
  const [industry, setIndustry] = useState("");
  const [message, setMessage] = useState("");
  const [submitting, setSubmitting] = useState(false);

  async function handleSubmit(event: FormEvent) {
    event.preventDefault();
    setSubmitting(true);
    setMessage("");
    try {
      await onComplete({ name, brandName, industry });
    } catch (error) {
      setMessage(error instanceof Error ? error.message : "Workspace setup could not be completed.");
    } finally {
      setSubmitting(false);
    }
  }

  return (
    <div className="modal-backdrop" role="presentation">
      <section className="auth-modal" role="dialog" aria-modal="true" aria-labelledby="onboarding-title">
        <div className="modal-header">
          <div>
            <span className="brand-mark">V</span>
            <h2 id="onboarding-title">Set up your first workspace</h2>
          </div>
        </div>
        <p className="modal-copy">This creates your private workspace, a public collection link, and the free website publishing targets.</p>
        <form className="modal-form" onSubmit={handleSubmit}>
          <label>
            Workspace name
            <input value={name} onChange={(event) => setName(event.target.value)} placeholder="Northstar Labs" minLength={2} required />
          </label>
          <label>
            Customer-facing brand
            <input value={brandName} onChange={(event) => setBrandName(event.target.value)} placeholder="Northstar" minLength={2} required />
          </label>
          <label>
            Industry
            <input value={industry} onChange={(event) => setIndustry(event.target.value)} placeholder="B2B software" />
          </label>
          {message ? <p className="form-error" role="alert">{message}</p> : null}
          <button className="primary-button" type="submit" disabled={submitting}>
            {submitting ? "Creating workspace..." : "Create workspace"}
          </button>
        </form>
      </section>
    </div>
  );
}

function Panel({
  title,
  count,
  action,
  className = "",
  children
}: {
  title: string;
  count?: number;
  action?: string;
  className?: string;
  children: ReactNode;
}) {
  return (
    <article className={`panel ${className}`}>
      <header className="panel-header">
        <div>
          <h2>{title}</h2>
          {typeof count === "number" ? <span className="count">{count}</span> : null}
        </div>
        {action ? <button>{action}</button> : null}
      </header>
      <div className="panel-body">{children}</div>
    </article>
  );
}

function Stat({ label, value }: { label: string; value: string }) {
  return (
    <div className="stat">
      <span>{label}</span>
      <strong>{value}</strong>
    </div>
  );
}

function RequestQueue({ contacts }: { contacts: AppState["contacts"] }) {
  return (
    <div className="request-list">
      {contacts.map((contact) => (
        <div className="request-row" key={contact.id}>
          <input type="checkbox" aria-label={`Select ${contact.name}`} />
          <div className="avatar photo">{initials(contact.name)}</div>
          <div className="row-main">
            <strong>{contact.name}</strong>
            <span>{contact.email}</span>
          </div>
          <span className="muted">{statusLabel(contact.channel)}</span>
          <span className="muted">{contact.age}</span>
          <span className={`status ${contact.status}`}>{statusLabel(contact.status)}</span>
        </div>
      ))}
    </div>
  );
}

function AssetList({ assets }: { assets: AiAsset[] }) {
  return (
    <div className="asset-list">
      {assets.map((asset) => (
        <div className="asset-row" key={asset.id}>
          <div className={`asset-icon ${asset.type}`}>
            {asset.type === "case-study" ? <FileText size={20} /> : asset.type.includes("post") ? <Megaphone size={20} /> : <MessageSquare size={20} />}
          </div>
          <div className="row-main">
            <strong>{asset.title}</strong>
            <span>
              {asset.source} - {asset.createdAt} - {asset.channelHint}
            </span>
          </div>
          <span className={`status ${asset.status}`}>{statusLabel(asset.status)}</span>
        </div>
      ))}
    </div>
  );
}

function CollectionPreview({ brandName, collectionUrl, onNavigate }: { brandName: string; collectionUrl: string; onNavigate: () => void }) {
  const [copied, setCopied] = useState(false);
  const handleCopy = () => {
    navigator.clipboard.writeText(window.location.origin + collectionUrl);
    setCopied(true);
    setTimeout(() => setCopied(false), 2000);
  };

  return (
    <div className="collection-preview">
      <div className="preview-hero">
        <strong>{brandName.toUpperCase()}</strong>
        <h3>Shape the Future of {brandName}</h3>
        <p>Join industry leaders in helping us build a more powerful platform.</p>
        <span>
          <Lock size={13} />
          Secure & private
        </span>
      </div>
      <div className="preview-form">
        <label>How would you rate your experience?</label>
        <div className="stars" aria-label="Five star rating preview">
          {[1, 2, 3, 4, 5].map((star) => (
            <Star key={star} size={22} fill={star < 5 ? "currentColor" : "none"} />
          ))}
        </div>
        <label>What impact has {brandName} had on your business?</label>
        <textarea readOnly value={`${brandName} helped us streamline our workflow and improve productivity across the entire team.`} />
        
        <div style={{ display: 'flex', gap: '10px', marginTop: '10px' }}>
          <button className="secondary-button" onClick={handleCopy} style={{ flex: 1, justifyContent: 'center' }}>
            <Link size={15} />
            {copied ? "Copied!" : "Copy Link"}
          </button>
          <button className="dark-button" onClick={onNavigate} style={{ flex: 1 }}>
            Open Page
          </button>
        </div>
      </div>
    </div>
  );
}

function ApprovalPanel({
  state,
  onApprove,
  publishing
}: {
  state: AppState;
  onApprove: () => Promise<void> | void;
  publishing: boolean;
}) {
  return (
    <div className="approval-panel">
      {state.approvalSteps.map((step, index) => (
        <div className="approval-step" key={step.id}>
          <span>{index + 1}.</span>
          <div>
            <strong>{step.title}</strong>
            <p>{step.description}</p>
          </div>
          <StatusDot state={step.state} />
        </div>
      ))}
      <div className="approver">
        <div className="avatar">MP</div>
        <div>
          <strong>Maya Patel</strong>
          <span>Marketing Director</span>
        </div>
        <span>Due May 25, 2026</span>
      </div>
      <button className="gold-button" onClick={onApprove} disabled={publishing}>
        {publishing ? "Recording approval..." : "Approve & Publish"}
      </button>
    </div>
  );
}

function StatusDot({ state }: { state: "done" | "current" | "pending" }) {
  if (state === "done") {
    return (
      <span className="step-dot done">
        <Check size={13} />
      </span>
    );
  }
  return <span className={`step-dot ${state}`} />;
}

function FeedbackList({ submissions }: { submissions: Submission[] }) {
  return (
    <div className="feedback-list">
      <div className="panel-tabs">
        <button className="tab active">All</button>
        <button className="tab">Text</button>
        <button className="tab">Video</button>
        <button className="tab">Audio</button>
      </div>
      {submissions.map((submission) => (
        <div className="feedback-row" key={submission.id}>
          <div className={`media-thumb ${submission.channel}`}>
            {submission.channel === "video" ? <Play size={16} /> : submission.channel === "audio" ? <Activity size={16} /> : "T"}
          </div>
          <div className="row-main">
            <strong>"{submission.quote}"</strong>
            <span>
              {submission.customerName} - {submission.receivedAt}
            </span>
          </div>
          <span className={`status ${submission.channel}`}>{statusLabel(submission.channel)}</span>
        </div>
      ))}
    </div>
  );
}

function AnalyticsGrid({ metrics }: { metrics: Metric[] }) {
  return (
    <div className="analytics-grid">
      {metrics.map((metric) => (
        <div className="metric-card" key={metric.label}>
          <span>{metric.label}</span>
          <strong>{metric.value}</strong>
          <em>{metric.delta}</em>
          <Sparkline points={metric.points} />
        </div>
      ))}
    </div>
  );
}

function Sparkline({ points }: { points: number[] }) {
  const max = Math.max(...points);
  const min = Math.min(...points);
  const path = points
    .map((point, index) => {
      const x = (index / (points.length - 1)) * 118;
      const y = 42 - ((point - min) / Math.max(max - min, 1)) * 34;
      return `${index === 0 ? "M" : "L"} ${x.toFixed(1)} ${y.toFixed(1)}`;
    })
    .join(" ");

  return (
    <svg viewBox="0 0 120 46" role="img" aria-label="Trend line">
      <path d={path} />
    </svg>
  );
}

function WidgetPreview({ state }: { state: AppState }) {
  const featured = state.assets.find((asset) => asset.type === "testimonial" && asset.status === "published");
  const widgetSource = `${window.location.origin}/widget/${state.workspace.id}.js`;

  if (!featured) {
    return (
      <div className="widget-preview widget-empty">
        <MessageSquare size={26} />
        <strong>Approved customer stories will appear here.</strong>
      </div>
    );
  }

  return (
    <div className="widget-preview">
      <MessageSquare size={26} />
      <blockquote>"{featured.body}"</blockquote>
      <div className="testimonial-author">
        <div className="avatar photo">OB</div>
        <div>
          <strong>Olivia Bennett</strong>
          <span>Head of Growth, BlueStone Inc.</span>
        </div>
      </div>
      <div className="widget-controls">
        <button aria-label="Previous testimonial">{"<"}</button>
        <span className="dot active" />
        <span className="dot" />
        <span className="dot" />
        <button aria-label="Next testimonial">{">"}</button>
      </div>
      <div className="embed-row">
        <code>{`<script async src="${widgetSource}"></script>`}</code>
        <span className="status good">Active</span>
      </div>
    </div>
  );
}

function PublishStatusList({ targets }: { targets: PublishTarget[] }) {
  const iconForTarget = (type: PublishTarget["type"]): LucideIcon => {
    if (type === "widget") return Globe;
    if (type === "page") return Library;
    if (type === "email") return Send;
    if (type === "blog") return FileText;
    if (type === "linkedin") return ClipboardCheck;
    return Megaphone;
  };

  return (
    <div className="publish-list">
      {targets.map((target) => {
        const Icon = iconForTarget(target.type);
        return (
          <div className="publish-row" key={target.id}>
            <div className="channel-icon">
              <Icon size={16} />
            </div>
            <div className="row-main">
              <strong>{target.name}</strong>
              <span>{target.location}</span>
            </div>
            <div className="publish-status">
              <span className={`status ${target.status}`}>{statusLabel(target.status)}</span>
              <em>{target.scheduledFor ?? target.freeModeNote}</em>
            </div>
          </div>
        );
      })}
    </div>
  );
}

type TurnstileOptions = {
  sitekey: string;
  callback: (token: string) => void;
  "error-callback": () => void;
  "expired-callback": () => void;
};

declare global {
  interface Window {
    turnstile?: {
      render: (element: HTMLElement, options: TurnstileOptions) => string | number;
      remove?: (widgetId: string | number) => void;
    };
  }
}

function TurnstileField({ onToken }: { onToken: (token: string) => void }) {
  const containerRef = useRef<HTMLDivElement>(null);
  const siteKey = import.meta.env.VITE_TURNSTILE_SITE_KEY;

  useEffect(() => {
    if (!siteKey || !containerRef.current) return;
    let cancelled = false;
    let widgetId: string | number | undefined;
    const render = () => {
      if (cancelled || !containerRef.current || !window.turnstile) return;
      widgetId = window.turnstile.render(containerRef.current, {
        sitekey: siteKey,
        callback: onToken,
        "error-callback": () => onToken(""),
        "expired-callback": () => onToken("")
      });
    };
    const existing = document.querySelector<HTMLScriptElement>(
      'script[src^="https://challenges.cloudflare.com/turnstile/"]'
    );
    if (window.turnstile) {
      render();
    } else if (existing) {
      existing.addEventListener("load", render, { once: true });
    } else {
      const script = document.createElement("script");
      script.src = "https://challenges.cloudflare.com/turnstile/v0/api.js?render=explicit";
      script.async = true;
      script.defer = true;
      script.addEventListener("load", render, { once: true });
      document.head.appendChild(script);
    }
    return () => {
      cancelled = true;
      if (widgetId !== undefined) window.turnstile?.remove?.(widgetId);
    };
  }, [onToken, siteKey]);

  if (!siteKey) return null;
  return <div className="turnstile-field" ref={containerRef} aria-label="Spam protection" style={{ marginTop: '20px' }} />;
}

function CollectPage({
  campaignId,
  state,
  onNavigate
}: {
  campaignId: string;
  state: AppState;
  onNavigate: (path: string) => void;
}) {
  const requiresPublicData = isSupabaseConfigured || import.meta.env.PROD;
  const [publicCampaign, setPublicCampaign] = useState<PublicCampaignData | null>(null);
  const [campaignAvailability, setCampaignAvailability] = useState<"loading" | "ready" | "unavailable">(
    requiresPublicData ? "loading" : "ready"
  );
  const [rating, setRating] = useState(5);
  const [customerName, setCustomerName] = useState("");
  const [customerEmail, setCustomerEmail] = useState("");
  const [customerCompany, setCustomerCompany] = useState("");
  const [feedbackText, setFeedbackText] = useState("");
  const [turnstileToken, setTurnstileToken] = useState("");
  const [selectedFile, setSelectedFile] = useState<File | null>(null);

  const [submissionError, setSubmissionError] = useState("");
  const [mediaNote, setMediaNote] = useState("");
  const [submitted, setSubmitted] = useState(false);
  const [submitting, setSubmitting] = useState(false);

  useEffect(() => {
    let active = true;
    if (!requiresPublicData) {
      setCampaignAvailability("ready");
      return () => {
        active = false;
      };
    }
    setCampaignAvailability("loading");
    void fetchPublicCampaign(campaignId)
      .then((campaign) => {
        if (!active) return;
        setPublicCampaign(campaign);
        setCampaignAvailability("ready");
      })
      .catch(() => {
        if (active) setCampaignAvailability("unavailable");
      });
    return () => {
      active = false;
    };
  }, [campaignId, requiresPublicData]);

  const brandName = publicCampaign?.brandName ?? state.workspace.name;

  function handleFileChange(event: ChangeEvent<HTMLInputElement>) {
    const file = event.target.files?.[0] ?? null;
    setSubmissionError("");
    if (!file) {
      setSelectedFile(null);
      return;
    }
    const validType = ["image/jpeg", "image/png", "image/webp", "audio/mpeg", "audio/wav", "audio/webm", "video/mp4", "video/webm"].includes(file.type);
    if (!validType || file.size > 6 * 1024 * 1024) {
      event.target.value = "";
      setSelectedFile(null);
      setSubmissionError("Use a JPG, PNG, WebP, MP3, WAV, WebM, or MP4 file up to 6 MB.");
      return;
    }
    setSelectedFile(file);
  }

  async function handleSubmit(event: FormEvent) {
    event.preventDefault();
    if (!customerName || !customerEmail || !feedbackText || !rating) return;
    if (isSupabaseConfigured && import.meta.env.VITE_TURNSTILE_SITE_KEY && !turnstileToken) {
      setSubmissionError("Please complete the spam protection check before submitting.");
      return;
    }
    setSubmissionError("");
    setMediaNote("");
    setSubmitting(true);
    const payload: ProofSubmissionPayload = {
      campaignId,
      customerName,
      customerEmail,
      customerCompany,
      rating,
      feedbackText,
      consentPublish: true,
      consentAiProcessing: true,
      consentContact: true,
      turnstileToken: turnstileToken || undefined,
      upload: selectedFile
        ? {
            fileName: selectedFile.name,
            contentType: selectedFile.type,
            byteSize: selectedFile.size
          }
        : undefined
    };
    try {
      const result = await submitCustomerProof(payload);
      if (selectedFile) {
        if (result.upload) {
          try {
            await uploadProofMedia(selectedFile, result.upload);
            setMediaNote("Your media file was attached to this proof submission.");
          } catch {
            setMediaNote("Your written feedback was saved. The media file needs a retry from the business team.");
          }
        } else {
          setMediaNote("Your written feedback was saved. Media storage will be enabled when this workspace is connected.");
        }
      }
      setSubmitted(true);
    } catch (error) {
      setSubmissionError(error instanceof Error ? error.message : "Your feedback could not be submitted. Please retry.");
    } finally {
      setSubmitting(false);
    }
  }

  if (submitted) {
    return (
      <main className="public-page success-page">
        <section className="public-card">
          <CheckCircle2 size={42} />
          <h1>Thank you for sharing your story.</h1>
          <p>
            Your feedback is saved for review. {brandName} will approve anything public before it is
            published.
          </p>
          {mediaNote ? <p className="submission-note">{mediaNote}</p> : null}
          <button className="primary-button" onClick={() => onNavigate("/")}>
            Back to VouchForge AI
          </button>
        </section>
      </main>
    );
  }

  if (campaignAvailability === "loading") {
    return (
      <main className="public-page">
        <section className="public-card">
          <Lock size={36} />
          <h1>Checking this feedback link</h1>
          <p>Please wait a moment while we verify the collection page.</p>
        </section>
      </main>
    );
  }

  if (campaignAvailability === "unavailable") {
    return (
      <main className="public-page">
        <section className="public-card">
          <Lock size={36} />
          <h1>This feedback link is unavailable</h1>
          <p>Please ask the business for a current collection link.</p>
        </section>
      </main>
    );
  }

  return (
    <main className="public-page">
      <form className="public-card collection-form" onSubmit={handleSubmit}>
        <div className="public-brand">
          <span className="brand-mark">V</span>
          <strong>{brandName}</strong>
          <span>
            <Lock size={14} />
            Secure & private
          </span>
        </div>
        <h1 style={{ fontSize: '2.5rem', marginTop: '1rem' }}>Shape the Future of {brandName}</h1>
        <p style={{ fontSize: '1.1rem', color: 'var(--muted)', maxWidth: '500px', margin: '0.5rem auto 2rem' }}>
          Join industry leaders in helping us build a more powerful platform. Your insights directly influence our enterprise roadmap.
        </p>

        <fieldset className="rating-field">
          <legend>How would you rate your experience?</legend>
          <div className="stars">
            {[1, 2, 3, 4, 5].map((star) => (
              <button
                type="button"
                key={star}
                className={star <= rating ? "selected" : ""}
                onClick={() => setRating(star)}
                aria-label={`${star} star`}
              >
                <Star size={26} fill="currentColor" />
              </button>
            ))}
          </div>
        </fieldset>

        <div className="form-grid">
          <label>
            Name
            <input value={customerName} onChange={(event) => setCustomerName(event.target.value)} required />
          </label>
          <label>
            Email
            <input
              type="email"
              value={customerEmail}
              onChange={(event) => setCustomerEmail(event.target.value)}
              required
            />
          </label>
          <label>
            Company (Optional)
            <input value={customerCompany} onChange={(event) => setCustomerCompany(event.target.value)} />
          </label>
        </div>

        <label>
          <span style={{ display: 'block', marginBottom: '8px' }}>What impact has {brandName} had on your business operations?</span>
          <textarea
            value={feedbackText}
            onChange={(event) => setFeedbackText(event.target.value)}
            minLength={24}
            required
            placeholder="Example: We streamlined our workflows, reduced operational overhead, and accelerated growth..."
          />
        </label>

        <label className="upload-box">
          <Upload size={20} />
          {selectedFile ? selectedFile.name : "Optional voice, video, image, or screenshot"}
          <input type="file" accept="image/jpeg,image/png,image/webp,audio/mpeg,audio/wav,audio/webm,video/mp4,video/webm" onChange={handleFileChange} />
        </label>

        <TurnstileField onToken={setTurnstileToken} />
        {submissionError ? <p className="form-error" role="alert">{submissionError}</p> : null}
        <button className="dark-button" type="submit" disabled={submitting}>
          {submitting ? "Securely Submitting..." : "Submit Experience"}
        </button>
        <div className="legal-links">
          <button type="button" className="text-action" onClick={() => onNavigate("/privacy")}>
            Privacy and AI processing
          </button>
          <button type="button" className="text-action" onClick={() => onNavigate("/terms")}>
            Terms and consent rules
          </button>
        </div>
      </form>
    </main>
  );
}

function TestimonialsPage({
  workspaceId,
  state,
  onNavigate
}: {
  workspaceId: string;
  state: AppState;
  onNavigate: (path: string) => void;
}) {
  const requiresPublicData = isSupabaseConfigured || import.meta.env.PROD;
  const [publicTestimonials, setPublicTestimonials] = useState<PublicTestimonialsData | null>(null);
  const [pageAvailability, setPageAvailability] = useState<"loading" | "ready" | "unavailable">(
    requiresPublicData ? "loading" : "ready"
  );

  useEffect(() => {
    let active = true;
    if (!requiresPublicData) {
      setPageAvailability("ready");
      return () => {
        active = false;
      };
    }
    setPageAvailability("loading");
    void fetchPublicTestimonials(workspaceId)
      .then((result) => {
        if (!active) return;
        setPublicTestimonials(result);
        setPageAvailability("ready");
      })
      .catch(() => {
        if (active) setPageAvailability("unavailable");
      });
    return () => {
      active = false;
    };
  }, [requiresPublicData, workspaceId]);

  const fallbackPublished = state.assets.filter((asset) => asset.type === "testimonial" && asset.status === "published");
  const published = publicTestimonials?.testimonials ?? (requiresPublicData ? [] : fallbackPublished);
  const brandName = publicTestimonials?.page.brandName ?? (requiresPublicData ? "this business" : state.workspace.name);
  const collectionPath = publicTestimonials?.page.publicSlug
    ? `/collect/${publicTestimonials.page.publicSlug}`
    : requiresPublicData
      ? null
      : `/collect/${state.campaign.publicSlug}`;

  if (pageAvailability === "loading") {
    return (
      <main className="testimonial-page">
        <section className="testimonial-hero">
          <h1>Loading public customer proof</h1>
          <p>Please wait while the approved stories are retrieved.</p>
        </section>
      </main>
    );
  }

  if (pageAvailability === "unavailable") {
    return (
      <main className="testimonial-page">
        <section className="testimonial-hero">
          <h1>This testimonial page is unavailable</h1>
          <p>Please ask the business for its current public proof link.</p>
        </section>
      </main>
    );
  }

  return (
    <main className="testimonial-page">
      <header>
        <button className="brand light" onClick={() => onNavigate("/")}>
          <span className="brand-mark">V</span>
          <span>VouchForge <strong>AI</strong></span>
        </button>
        {collectionPath ? (
          <button className="primary-button" onClick={() => onNavigate(collectionPath)}>
            Share your story
          </button>
        ) : null}
      </header>
      <section className="testimonial-hero">
        <h1>Real customer proof for {brandName}</h1>
        <p>Every quote on this page is based on submitted customer feedback and approval records.</p>
      </section>
      <section className="testimonial-list">
        {published.length === 0 ? <p className="empty-testimonials">No approved customer stories are public yet.</p> : null}
        {published.map((asset) => (
          <article className="testimonial-card" key={asset.id}>
            <MessageSquare size={28} />
            <blockquote>"{asset.body}"</blockquote>
            <span>{asset.title.replace("Testimonial - ", "")}</span>
          </article>
        ))}
      </section>
    </main>
  );
}

function LegalPage({ kind, onNavigate }: { kind: "privacy" | "terms"; onNavigate: (path: string) => void }) {
  const isPrivacy = kind === "privacy";
  return (
    <main className="legal-page">
      <button className="brand light" onClick={() => onNavigate("/")}>
        <span className="brand-mark">V</span>
        <span>VouchForge <strong>AI</strong></span>
      </button>
      <article>
        <ShieldCheck size={36} />
        <h1>{isPrivacy ? "Privacy and AI Processing" : "Terms and Consent Rules"}</h1>
        {isPrivacy ? (
          <>
            <p>
              VouchForge AI stores business contact details, customer submissions, consent records, generated
              assets, publishing history, and audit events. Secrets stay server-side and media should be kept in
              private storage with signed URLs.
            </p>
            <p>
              AI is used only to transform real customer feedback into reviewable marketing drafts. The system
              must not create fake testimonials or publish without business approval and recorded customer consent.
            </p>
          </>
        ) : (
          <>
            <p>
              Customers must explicitly allow publishing and AI processing before their story becomes part of any
              testimonial, case study, quote card, or widget.
            </p>
            <p>
              WhatsApp, SMS, and social publishing are restricted to provider-approved usage. Paid-only messaging
              stays disabled until a connected account and budget approval exist.
            </p>
          </>
        )}
        <button className="primary-button" onClick={() => onNavigate("/")}>
          Return to dashboard
        </button>
      </article>
    </main>
  );
}

export default App;
