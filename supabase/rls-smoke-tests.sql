-- Run in the Supabase SQL editor only after replacing the two UUID placeholders.
-- This is a manual validation aid; it does not create or alter production data.

-- 1. In the dashboard, use the SQL Editor's "Run as role" feature or a test JWT
--    to impersonate member A. Confirm this returns only workspace A rows:
-- select id, name from public.workspaces;
-- select id, customer_email from public.submissions;

-- 2. Repeat as member B and confirm no rows from workspace A appear.
-- select id, name from public.workspaces;
-- select id, customer_email from public.submissions;

-- 3. Confirm anonymous access is denied:
-- set local role anon;
-- select * from public.submissions;
-- reset role;

-- 4. Confirm private storage is not public. This must return an empty result for an anon user:
-- set local role anon;
-- select * from storage.objects where bucket_id = 'proof-media';
-- reset role;
