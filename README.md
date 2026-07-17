# VouchForge AI

VouchForge AI is a free-first customer proof platform. It collects real customer feedback, stores explicit consent, turns approved source material into reviewable AI drafts, and publishes only after a human approval step.

## What is included

- React + Vite command-center dashboard with public collection and testimonial routes.
- Text, image, audio, and video proof intake with size/type validation and private signed uploads.
- Supabase Auth/Postgres/Storage/RLS schema for tenant isolation.
- Gemini Interactions API boundary with structured JSON output, source provenance, one retry for transient rate/provider errors, and human approval gates.
- Free-first channel behavior: website widget and testimonial page publish automatically after approval; email/social/WhatsApp/SMS are queued until an approved integration is connected.
- Netlify Functions for proof intake, upload confirmation, AI generation, approval, publishing jobs, public widget delivery, and signed Meta webhook intake.
- Deployment, security, legal-name, and click-by-click setup documentation.

## Core routes

| Route | Purpose |
| --- | --- |
| `/` | Command-center dashboard and approval queue. |
| `/collect/:campaignId` | Public customer proof collection page. |
| `/testimonials/:workspaceId` | Public approved-testimonial page. |
| `/widget/:workspaceId.js` | Embeddable testimonial widget script. |

## Local development

```powershell
npm install
Copy-Item .env.example .env.local
npm run dev
```

Open `http://127.0.0.1:5173`. Without live credentials, the dashboard intentionally runs in a local demo mode. Do not treat local demo submissions as production records.

With Supabase browser variables configured, use **Sign in** to create an email account, complete email confirmation when it is enabled, and finish the workspace setup dialog. That creates your first tenant, public collection campaign, and free website publishing targets using the database policies.

For a local run that includes Netlify Functions, use `npx netlify dev` after installing dependencies and configuring the variables in `.env.local`.

## Production setup

Follow [the click-by-click launch checklist](docs/LAUNCH_CHECKLIST.md), run [the Supabase schema](supabase/schema.sql), and review [the security controls](docs/SECURITY.md) before accepting customer data.

## Important product rule

VouchForge AI must never create fake testimonials. AI may only transform submitted customer material with recorded consent, and a business user must approve the output before it becomes public.

## Project map

| Path | Responsibility |
| --- | --- |
| `src/` | React user experience, public form, and browser API client. |
| `netlify/functions/` | Server-only providers, validation, signed uploads, webhooks, and publishing gates. |
| `supabase/schema.sql` | Database, private storage, RLS, and policies. |
| `docs/` | Manual setup, architecture, security, and legal readiness. |
| `tests/e2e/` | Main customer and operator flows. |

## Before revenue

The no-cost stack is suitable for an early, carefully monitored launch. Paid messaging, high-volume media, provider-approved social posting, compliance certification, and high availability need a budget as usage grows. The product keeps those channels queued or in test mode rather than claiming they are free when they are not.
