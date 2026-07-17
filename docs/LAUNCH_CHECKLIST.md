# Click-by-Click Launch Checklist

This is the no-cost, free-first path. It deliberately avoids paid messaging and enterprise infrastructure until customer revenue justifies them.

## 1. Run it locally

1. Open PowerShell in the project folder.
2. Run `npm install`.
3. Run `Copy-Item .env.example .env.local`.
4. Run `npm run dev`.
5. Open `http://127.0.0.1:5173` and test the dashboard, public form, and testimonial page.

## 2. Create the GitHub repository

1. Sign in to GitHub and click **New repository**.
2. Name it `vouchforge-ai` and choose **Private** while you set it up.
3. Do not add a conflicting README or `.gitignore` in the GitHub dialog.
4. In this project folder, initialize Git, add the GitHub remote, commit the files, and push the main branch.
5. Confirm `.env.local` is ignored before pushing. Never commit any service-role, Gemini, Turnstile secret, Resend, Meta, or Twilio value.

## 3. Create Supabase free project

1. Go to [Supabase](https://supabase.com/dashboard) and create a free project.
2. In **SQL Editor**, create a new query, paste all of [`supabase/schema.sql`](../supabase/schema.sql), and click **Run**.
3. In **Project Settings > API**, copy the project URL and the publishable key. Do not copy the service-role key into any `VITE_*` variable.
4. In **Project Settings > API**, copy the service-role key for Netlify only.
5. In **Authentication > URL Configuration**, set the Site URL to your future Netlify URL and add both the Netlify URL and `http://127.0.0.1:5173` to Redirect URLs.
6. In **Authentication > Providers**, keep Email enabled. Turn on email confirmation for a real launch.
7. In **Storage**, confirm `proof-media` exists, is private, has the 6 MB limit, and only uses the MIME types in the schema.
8. In `.env.local`, set `VITE_SUPABASE_URL` and `VITE_SUPABASE_PUBLISHABLE_KEY`.

## 4. Create Gemini free API key

1. Open [Google AI Studio](https://aistudio.google.com/) and create an API key for the project.
2. Keep the key server-side only. Put it in `GEMINI_API_KEY` in Netlify later, never in `VITE_*`.
3. Keep the default `GEMINI_MODEL=gemini-3.5-flash` only if your account has access. Change it to an available supported model if the provider indicates otherwise.
4. Generate a draft using only consented sample feedback. Confirm it stays in the approval queue and does not publish automatically.

## 5. Create Cloudflare Turnstile

1. Sign in to [Cloudflare Turnstile](https://dash.cloudflare.com/).
2. Create a new widget for your Netlify hostname and, for development, `127.0.0.1`.
3. Copy the site key into `VITE_TURNSTILE_SITE_KEY`.
4. Copy the secret key into Netlify as `TURNSTILE_SECRET_KEY`.
5. Test the public form once with a valid challenge and once with the token removed. The second attempt must be rejected in live mode.

## 6. Connect optional free providers

1. For email, create a [Resend](https://resend.com/) account or configure Gmail SMTP after checking its sending policies. Add only server-side credentials to Netlify.
2. For WhatsApp, create a Meta developer test app and use its test-number flow. Configure `META_APP_SECRET` and `META_WEBHOOK_VERIFY_TOKEN` before pointing webhooks at the app.
3. For SMS, use Twilio trial/test behavior only. Do not enable paid SMS templates until there is a budget and opt-out workflow.
4. For social channels, use share links and draft exports first. Add API auto-publishing only after each platform has granted the app access.

## 7. Deploy on Netlify free

1. Sign in to [Netlify](https://app.netlify.com/) and click **Add new project > Import an existing project**.
2. Select the GitHub repository.
3. Verify build command `npm run build` and publish directory `dist`. `netlify.toml` supplies the redirects and function location.
4. In **Site configuration > Environment variables**, add:
   - Browser-safe: `VITE_SUPABASE_URL`, `VITE_SUPABASE_PUBLISHABLE_KEY`, `VITE_TURNSTILE_SITE_KEY`, `VITE_APP_ORIGIN`.
   - Server-only: `SUPABASE_URL`, `SUPABASE_SERVICE_ROLE_KEY`, `GEMINI_API_KEY`, `GEMINI_MODEL`, `TURNSTILE_SECRET_KEY`, `APP_ORIGIN`, `IP_HASH_PEPPER`, and any connected provider secrets.
5. Set `APP_ORIGIN` and `VITE_APP_ORIGIN` to the deployed `https://your-site.netlify.app` URL. Do not include a trailing slash.
6. Deploy, then use the generated `*.netlify.app` subdomain as the free commercial launch URL.
7. In Supabase Auth, replace the temporary Site URL and add the exact Netlify URL to Redirect URLs.
8. Open the deployed app, select **Sign in**, create the first owner account, complete email confirmation if enabled, and finish the workspace setup dialog. Keep the resulting public campaign link for the production verification steps.

## 8. Production verification

1. Visit `/collect/<your-public-slug>` in an incognito window and submit a consented test proof.
2. Upload one permitted file smaller than 6 MB. Confirm the object is private in Supabase Storage.
3. Open the dashboard as a workspace member, generate a draft, approve it, and verify that only the public page/widget go live automatically.
4. Test the widget by adding `<script async src="https://your-site.netlify.app/widget/<workspace-id>.js"></script>` to a blank HTML page.
5. Run the cross-tenant RLS checks in [`supabase/rls-smoke-tests.sql`](../supabase/rls-smoke-tests.sql).
6. Review every item in [`docs/SECURITY.md`](SECURITY.md) before inviting real customers.

## 9. Scale only after revenue

1. Move higher-volume media to a paid storage/CDN plan after measuring actual uploads.
2. Add a durable rate limiter and malware scanning before broad public campaigns.
3. Buy a domain and set custom DNS after trademark clearance.
4. Enable paid SMS, WhatsApp templates, social APIs, monitoring, and backups only with explicit usage/cost ownership.
5. Have counsel review privacy, consent, marketing outreach, and data-retention obligations before expanding regions.
