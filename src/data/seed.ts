import type { AppState, GeneratedAssetPayload } from "../types";

export const initialState: AppState = {
  workspace: {
    id: "acme-demo",
    name: "Acme Co.",
    brandName: "VouchForge AI",
    industry: "All-business launch template",
    plan: "free",
    freeMode: true,
    trustScore: 92
  },
  campaign: {
    id: "q2-customer-advocacy",
    publicSlug: "q2-customer-advocacy",
    name: "Q2 Customer Advocacy",
    status: "active",
    launchedAt: "May 5, 2026",
    endsAt: "Aug 5, 2026",
    requestsSent: 1248,
    responses: 312,
    responseRate: 25,
    assetsPublished: 48,
    engagement: 18.7
  },
  contacts: [
    {
      id: "c-1",
      name: "Olivia Bennett",
      email: "olivia@bluestone.com",
      company: "BlueStone Inc.",
      channel: "email",
      status: "sent",
      age: "2m ago"
    },
    {
      id: "c-2",
      name: "Marcus Johnson",
      email: "marcus@peakfit.io",
      company: "PeakFit",
      channel: "sms",
      status: "opened",
      age: "15m ago"
    },
    {
      id: "c-3",
      name: "Priya Patel",
      email: "priya@elevateco.com",
      company: "Elevate Co.",
      channel: "email",
      status: "reminder-sent",
      age: "1h ago"
    },
    {
      id: "c-4",
      name: "Daniel Kim",
      email: "daniel@northwind.io",
      company: "Northwind",
      channel: "linkedin",
      status: "responded",
      age: "2h ago"
    },
    {
      id: "c-5",
      name: "Sophia Chen",
      email: "sophia@lumenapp.com",
      company: "LumenApp",
      channel: "email",
      status: "responded",
      age: "3h ago"
    }
  ],
  submissions: [
    {
      id: "s-1",
      customerName: "Olivia Bennett",
      company: "BlueStone Inc.",
      channel: "text",
      quote: "VouchForge helped us increase outbound conversions by 48% in just two quarters.",
      rating: 5,
      sentiment: "positive",
      receivedAt: "May 21, 2026",
      consentPublish: true,
      consentAiProcessing: true
    },
    {
      id: "s-2",
      customerName: "Marcus Johnson",
      company: "PeakFit",
      channel: "video",
      quote: "The impact on our pipeline has been immediate. Our buyers trust us faster.",
      rating: 5,
      sentiment: "positive",
      receivedAt: "May 20, 2026",
      consentPublish: true,
      consentAiProcessing: true
    },
    {
      id: "s-3",
      customerName: "Priya Patel",
      company: "Elevate Co.",
      channel: "audio",
      quote: "The AI turned a quick voice note into polished proof our sales team could use.",
      rating: 5,
      sentiment: "positive",
      receivedAt: "May 19, 2026",
      consentPublish: true,
      consentAiProcessing: true
    },
    {
      id: "s-4",
      customerName: "Daniel Kim",
      company: "Northwind",
      channel: "text",
      quote: "Highly recommend for any B2B team looking to scale credible customer stories.",
      rating: 4,
      sentiment: "positive",
      receivedAt: "May 19, 2026",
      consentPublish: true,
      consentAiProcessing: true
    }
  ],
  assets: [
    {
      id: "a-1",
      type: "testimonial",
      title: "Testimonial - Olivia Bennett",
      source: "Customer testimonial",
      body: "VouchForge helped us increase outbound conversions by 48% in just two quarters.",
      status: "draft",
      createdAt: "May 21, 2026",
      channelHint: "Website widget"
    },
    {
      id: "a-2",
      type: "case-study",
      title: "Case Study - BlueStone Inc.",
      source: "Case study",
      body: "BlueStone used automated customer proof collection to turn sales wins into a repeatable conversion system.",
      status: "draft",
      createdAt: "May 20, 2026",
      channelHint: "Blog"
    },
    {
      id: "a-3",
      type: "linkedin-post",
      title: "LinkedIn Post - Marcus Johnson",
      source: "Social post",
      body: "Trust compounds when happy customers explain the before-and-after in their own words.",
      status: "ready",
      createdAt: "May 20, 2026",
      channelHint: "LinkedIn"
    },
    {
      id: "a-4",
      type: "x-post",
      title: "X Post - Priya Patel",
      source: "Social post",
      body: "A 40-second voice note became a polished customer story, a quote card, and a sales-ready proof point.",
      status: "draft",
      createdAt: "May 19, 2026",
      channelHint: "X"
    },
    {
      id: "a-5",
      type: "testimonial",
      title: "Testimonial - Daniel Kim",
      source: "Approved customer proof",
      body: "Highly recommend for any B2B team looking to scale credible customer stories.",
      status: "published",
      createdAt: "May 19, 2026",
      channelHint: "Public testimonial page"
    }
  ],
  approvalSteps: [
    {
      id: "ap-1",
      title: "Review AI-generated assets",
      description: "Ensure accuracy, tone, and brand alignment.",
      state: "done"
    },
    {
      id: "ap-2",
      title: "Verify customer consent",
      description: "Confirm permission to publish and process.",
      state: "done"
    },
    {
      id: "ap-3",
      title: "Legal and compliance check",
      description: "Review for claims, regulated terms, and consent evidence.",
      state: "done"
    },
    {
      id: "ap-4",
      title: "Approve for publishing",
      description: "Final approval to publish to selected channels.",
      state: "current"
    },
    {
      id: "ap-5",
      title: "Publishing and distribution",
      description: "Assets publish to selected free-mode and connected channels.",
      state: "pending"
    }
  ],
  publishTargets: [
    {
      id: "p-1",
      name: "Website widget",
      type: "widget",
      location: "Homepage",
      status: "published"
    },
    {
      id: "p-2",
      name: "Testimonial page",
      type: "page",
      location: "/testimonials/acme-demo",
      status: "published"
    },
    {
      id: "p-3",
      name: "Blog",
      type: "blog",
      location: "/customer-success/acme",
      status: "scheduled",
      scheduledFor: "May 24, 2026"
    },
    {
      id: "p-4",
      name: "Email",
      type: "email",
      location: "Q2 customer newsletter",
      status: "scheduled",
      scheduledFor: "May 25, 2026",
      freeModeNote: "Resend/Gmail free tier"
    },
    {
      id: "p-5",
      name: "LinkedIn",
      type: "linkedin",
      location: "Company page",
      status: "published"
    },
    {
      id: "p-6",
      name: "X",
      type: "x",
      location: "@acme",
      status: "queued",
      freeModeNote: "One-click share until API approval"
    }
  ],
  integrations: [
    {
      id: "i-1",
      provider: "Supabase",
      status: "ready-to-connect",
      freeTier: "500 MB DB, 1 GB storage",
      risk: "low"
    },
    {
      id: "i-2",
      provider: "Gemini",
      status: "test-mode",
      freeTier: "Developer free tier with rate limits",
      risk: "medium"
    },
    {
      id: "i-3",
      provider: "Resend",
      status: "ready-to-connect",
      freeTier: "3,000 emails/month, 100/day",
      risk: "low"
    },
    {
      id: "i-4",
      provider: "WhatsApp Cloud API",
      status: "test-mode",
      freeTier: "Cloud API access; paid template messages gated",
      risk: "medium"
    },
    {
      id: "i-5",
      provider: "Twilio",
      status: "blocked-paid",
      freeTier: "Trial/test only before revenue",
      risk: "high"
    },
    {
      id: "i-6",
      provider: "Cloudflare Turnstile",
      status: "ready-to-connect",
      freeTier: "Free bot protection",
      risk: "low"
    }
  ],
  metrics: [
    {
      label: "Engagement rate",
      value: "18.7%",
      delta: "+12%",
      tone: "good",
      points: [11, 13, 12, 16, 15, 19, 18, 23, 21, 27]
    },
    {
      label: "Asset views",
      value: "9,842",
      delta: "+24%",
      tone: "good",
      points: [28, 26, 31, 33, 35, 38, 36, 42, 39, 48]
    },
    {
      label: "Clicks",
      value: "1,245",
      delta: "+15%",
      tone: "good",
      points: [9, 12, 13, 15, 18, 17, 19, 22, 23, 27]
    },
    {
      label: "Conversions",
      value: "312",
      delta: "+18%",
      tone: "good",
      points: [6, 8, 7, 10, 11, 9, 13, 12, 16, 19]
    }
  ],
  auditLogs: [
    {
      id: "log-1",
      event: "Consent verified for Olivia Bennett",
      actor: "Maya Patel",
      createdAt: "May 21, 2026"
    },
    {
      id: "log-2",
      event: "Website widget published",
      actor: "Automation",
      createdAt: "May 21, 2026"
    }
  ]
};

export const fallbackGeneratedAssets: GeneratedAssetPayload[] = [
  {
    type: "testimonial",
    title: "Testimonial - Fresh customer proof",
    body: "The customer described a clear before-and-after improvement and gave permission to publish the story after review.",
    channelHint: "Website widget"
  },
  {
    type: "case-study",
    title: "SEO case study draft",
    body: "Problem, solution, measurable outcome, and customer quote are structured into a publish-ready success story draft.",
    channelHint: "Blog"
  },
  {
    type: "linkedin-post",
    title: "LinkedIn proof post",
    body: "A concise social post turns the customer's outcome into a credible trust-building story for business audiences.",
    channelHint: "LinkedIn"
  },
  {
    type: "google-review",
    title: "Google review draft",
    body: "A short, customer-authored review draft is prepared for the customer to approve and post themselves.",
    channelHint: "Google Business Profile"
  }
];
