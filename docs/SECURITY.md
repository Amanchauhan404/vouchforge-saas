# Security Controls

VouchForge AI handles customer identity, customer feedback, consent records, media, and provider secrets. This is a security baseline for an early SaaS product, not a claim of SOC 2, ISO 27001, GDPR, or any other certification.

## Threat model

| Abuse case | Impact | Mitigations | Evidence |
| --- | --- | --- | --- |
| A member tries to read another tenant's customer proof. | PII or testimonial leakage. | RLS is enabled on every exposed table; membership checks exist in the browser-accessible database policies and in server functions. | `supabase/schema.sql`, `supabase/rls-smoke-tests.sql` |
| An attacker floods the public form or bypasses consent. | Spam, unwanted storage, compliance exposure. | Server-side field limits, consent checks, IP-hashed in-memory throttling, Turnstile verification in live mode, and no anonymous database grants. | `netlify/functions/submit-proof.cjs`, `netlify/functions/_shared.cjs` |
| A malicious file is uploaded or exposed. | Malware delivery or customer-media disclosure. | Private bucket, signed upload tokens, 6 MB limit, allowlisted MIME types, randomized paths, and a post-upload confirmation record. Add malware scanning before accepting larger or regulated-media workloads. | `netlify/functions/submit-proof.cjs`, `supabase/schema.sql` |
| AI fabricates a testimonial or publishes it automatically. | Loss of trust, false advertising, legal risk. | Source text is reloaded from consented database records; prompts prohibit invented facts; all generated assets begin as drafts; approval rechecks publish consent. | `netlify/functions/ai-generate.cjs`, `netlify/functions/approve-asset.cjs` |
| A forged provider webhook changes delivery status. | Fraudulent or inaccurate automation state. | Meta subscription checks and HMAC verification use the raw body; webhook events are deduplicated by provider/event ID. | `netlify/functions/webhooks.cjs`, `supabase/schema.sql` |

## Control checklist

| Boundary | Required control before live use |
| --- | --- |
| Browser to app | HTTPS deployment, CSP added at hosting layer, visible focus states, no service keys in `VITE_*`. |
| Public collection | Turnstile site and secret keys, valid `APP_ORIGIN`, monitored form abuse, privacy/consent text reviewed for your jurisdiction. |
| App to database | Supabase RLS policies from `supabase/schema.sql`, restricted Auth redirect URLs, no anonymous table grants. |
| App to storage | Private `proof-media` bucket, signed URLs only, approved MIME/size limits, retention/deletion workflow. |
| Server providers | Netlify environment variables, key rotation plan, provider webhook signing secret, explicit outbound opt-out handling. |
| Publishing | Human approval record, source consent, idempotency key, audit log. |
| Operations | Dependency updates, error alerting, backup/restore checks, incident contact, and data-deletion response owner. |

## Evidence to collect before launch

- Screenshot of Supabase RLS policies and private storage bucket configuration.
- Netlify environment variable list showing names only, never values.
- Turnstile test submission result.
- Test showing a user from workspace B cannot select a row from workspace A.
- Signed upload expiration test and an unauthorized download test.
- AI quota/error test showing the dashboard keeps content as drafts and reports a retryable error.
- Meta webhook signature failure test.
- Screenshot or log of the approval and audit trail for one real, consented customer story.

## Residual risks

- The included rate limiter is process-local. Add a durable rate-limit service or edge rule when public traffic grows.
- Media is validated by metadata and MIME allowlists, not virus-scanned. Add an asynchronous scanner before accepting higher-risk uploads.
- Legal language is a product template, not legal advice. Have counsel review your privacy, consent, outreach, retention, and jurisdiction-specific obligations before a broad launch.
- Provider APIs and platform policies can change. Keep paid channels disabled until each provider account is approved and monitored.
