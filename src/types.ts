export type RequestChannel = "email" | "sms" | "whatsapp" | "linkedin";
export type RequestStatus = "sent" | "opened" | "reminder-sent" | "responded" | "queued";
export type AssetType =
  | "testimonial"
  | "case-study"
  | "linkedin-post"
  | "x-post"
  | "instagram-caption"
  | "google-review"
  | "quote-card"
  | "website-widget";
export type AssetStatus = "draft" | "ready" | "approved" | "published";
export type PublishStatus = "published" | "scheduled" | "queued" | "blocked" | "draft";

export interface Workspace {
  id: string;
  name: string;
  brandName: string;
  industry: string;
  plan: "free" | "pro" | "enterprise";
  freeMode: boolean;
  trustScore: number;
}

export interface Campaign {
  id: string;
  publicSlug: string;
  name: string;
  status: "active" | "draft" | "paused";
  launchedAt: string;
  endsAt: string;
  requestsSent: number;
  responses: number;
  responseRate: number;
  assetsPublished: number;
  engagement: number;
}

export interface Contact {
  id: string;
  name: string;
  email: string;
  company: string;
  channel: RequestChannel;
  status: RequestStatus;
  age: string;
}

export interface Submission {
  id: string;
  customerName: string;
  company: string;
  channel: "text" | "video" | "audio" | "image";
  quote: string;
  rating: number;
  sentiment: "positive" | "neutral" | "negative";
  receivedAt: string;
  consentPublish: boolean;
  consentAiProcessing: boolean;
}

export interface AiAsset {
  id: string;
  type: AssetType;
  title: string;
  source: string;
  body: string;
  status: AssetStatus;
  createdAt: string;
  channelHint: string;
}

export interface ApprovalStep {
  id: string;
  title: string;
  description: string;
  state: "done" | "current" | "pending";
}

export interface PublishTarget {
  id: string;
  name: string;
  type: "widget" | "page" | "blog" | "email" | "linkedin" | "x" | "facebook" | "instagram";
  location: string;
  status: PublishStatus;
  scheduledFor?: string;
  freeModeNote?: string;
}

export interface Integration {
  id: string;
  provider: "Supabase" | "Gemini" | "Resend" | "Gmail SMTP" | "WhatsApp Cloud API" | "Twilio" | "LinkedIn" | "Cloudflare Turnstile" | "Netlify";
  status: "connected" | "test-mode" | "ready-to-connect" | "blocked-paid";
  freeTier: string;
  risk: "low" | "medium" | "high";
}

export interface Metric {
  label: string;
  value: string;
  delta: string;
  tone: "good" | "warn" | "neutral";
  points: number[];
}

export interface AuditLog {
  id: string;
  event: string;
  actor: string;
  createdAt: string;
}

export interface AppState {
  workspace: Workspace;
  campaign: Campaign;
  contacts: Contact[];
  submissions: Submission[];
  assets: AiAsset[];
  approvalSteps: ApprovalStep[];
  publishTargets: PublishTarget[];
  integrations: Integration[];
  metrics: Metric[];
  auditLogs: AuditLog[];
}

export interface GeneratedAssetPayload {
  id?: string;
  type: AssetType;
  title: string;
  body: string;
  channelHint: string;
}

export interface ProofSubmissionPayload {
  campaignId: string;
  customerName: string;
  customerEmail: string;
  customerCompany: string;
  rating: number;
  feedbackText: string;
  consentPublish: boolean;
  consentAiProcessing: boolean;
  consentContact: boolean;
  turnstileToken?: string;
  upload?: ProofUploadDescriptor;
}

export interface ProofUploadDescriptor {
  fileName: string;
  contentType: string;
  byteSize: number;
}

export interface ProofUploadGrant {
  bucket: string;
  path: string;
  token: string;
  mediaId: string;
  receipt: string;
}

export interface ProofSubmissionResult {
  ok: boolean;
  id: string;
  mode: "live" | "demo" | "local-demo";
  upload?: ProofUploadGrant;
}
