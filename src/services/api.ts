import { fallbackGeneratedAssets } from "../data/seed";
import { supabase } from "../lib/supabase";
import type {
  GeneratedAssetPayload,
  ProofSubmissionPayload,
  ProofSubmissionResult,
  ProofUploadGrant
} from "../types";

export type PublicCampaignData = {
  publicSlug: string;
  name: string;
  workspaceId: string;
  brandName: string;
  workspaceName: string;
};

export type PublicTestimonial = {
  id: string;
  title: string;
  body: string;
  publishedAt: string | null;
};

export type PublicTestimonialsData = {
  page: {
    brandName: string;
    workspaceName: string;
    publicSlug: string | null;
  };
  testimonials: PublicTestimonial[];
};

class ApiError extends Error {
  constructor(
    message: string,
    readonly status: number
  ) {
    super(message);
  }
}

async function authHeaders() {
  const headers: Record<string, string> = { "Content-Type": "application/json" };
  const session = supabase ? (await supabase.auth.getSession()).data.session : null;
  if (session?.access_token) headers.Authorization = `Bearer ${session.access_token}`;
  return headers;
}

async function postJson<T>(url: string, payload: unknown): Promise<T> {
  const response = await fetch(url, {
    method: "POST",
    headers: await authHeaders(),
    body: JSON.stringify(payload)
  });

  if (!response.ok) {
    const body = await response.json().catch(() => null);
    throw new ApiError(body?.error ?? `Request failed with ${response.status}`, response.status);
  }

  return response.json() as Promise<T>;
}

async function getPublicJson<T>(url: string): Promise<T> {
  const response = await fetch(url, { headers: { Accept: "application/json" }, cache: "no-store" });
  const body = await response.json().catch(() => null);
  if (!response.ok) throw new ApiError(body?.error ?? `Request failed with ${response.status}`, response.status);
  return body as T;
}

function allowLocalFallback(error: unknown) {
  return import.meta.env.DEV &&
    (error instanceof TypeError || (error instanceof ApiError && error.status === 404));
}

export async function generateAssetsFromFeedback(
  feedback: string,
  workspaceId: string,
  campaignId: string,
  sourceSubmissionIds: string[]
): Promise<GeneratedAssetPayload[]> {
  try {
    const result = await postJson<{ assets: GeneratedAssetPayload[] }>("/api/ai-generate", {
      feedback,
      workspaceId,
      campaignId,
      sourceSubmissionIds
    });
    return result.assets;
  } catch (error) {
    if (allowLocalFallback(error)) return fallbackGeneratedAssets;
    throw error;
  }
}

export async function submitCustomerProof(payload: ProofSubmissionPayload): Promise<ProofSubmissionResult> {
  try {
    return await postJson<ProofSubmissionResult>("/api/submit-proof", payload);
  } catch (error) {
    if (!allowLocalFallback(error)) throw error;
    return {
      ok: true,
      id: `local-${Date.now()}`,
      mode: "local-demo"
    };
  }
}

export async function uploadProofMedia(file: File, grant: ProofUploadGrant) {
  if (!supabase) throw new Error("Storage is not connected yet.");

  const upload = await supabase.storage
    .from(grant.bucket)
    .uploadToSignedUrl(grant.path, grant.token, file, {
      contentType: file.type,
      cacheControl: "3600"
    });

  if (upload.error) throw new Error(upload.error.message);

  await postJson<{ ok: boolean }>("/api/confirm-upload", {
    mediaId: grant.mediaId,
    path: grant.path,
    receipt: grant.receipt
  });
}

export async function approveAsset(assetId: string, workspaceId: string) {
  try {
    return await postJson<{ ok: boolean; approved: boolean }>("/api/approve-asset", { assetId, workspaceId });
  } catch (error) {
    if (!allowLocalFallback(error)) throw error;
    return { ok: true, approved: true };
  }
}

export async function runPublishJob(assetId: string, targetIds: string[], workspaceId: string) {
  try {
    return await postJson<{ ok: boolean; published: string[]; queued: string[] }>("/api/publish-job", {
      assetId,
      targetIds,
      workspaceId
    });
  } catch (error) {
    if (!allowLocalFallback(error)) throw error;
    return {
      ok: true,
      published: targetIds.filter((id) => id.includes("1") || id.includes("2")),
      queued: targetIds.filter((id) => !id.includes("1") && !id.includes("2"))
    };
  }
}

export async function fetchPublicCampaign(campaignId: string): Promise<PublicCampaignData> {
  const result = await getPublicJson<{ campaign: PublicCampaignData }>(`/api/public-campaign/${encodeURIComponent(campaignId)}`);
  return result.campaign;
}

export async function fetchPublicTestimonials(workspaceId: string): Promise<PublicTestimonialsData> {
  return getPublicJson<PublicTestimonialsData>(`/api/public-testimonials/${encodeURIComponent(workspaceId)}`);
}
