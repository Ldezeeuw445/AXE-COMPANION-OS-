-- Marketing waitlist for the public landing pages.
--
-- Why this table exists: the waitlist form on `/` wrote the address to
-- `localStorage` and then told the visitor "You're on the list — thank you."
-- Nothing ever left their browser. Every address collected since the landing
-- page went up is gone, and the privacy policy already promised "waitlist
-- communication" we had no way to send.
--
-- Access model (stricter than "anon INSERT"):
--   RLS is on with no policies at all. Default table grants to anon /
--   authenticated are revoked. Inserts go through POST /api/waitlist on the
--   service role, which validates and rate-limits (5/hour/IP) before writing.
--   An anon INSERT policy would let anyone with the public anon key dump rows
--   and skip that throttle, and a SELECT grant would leak every address if RLS
--   were ever disabled. No client can read or write this table.
--
-- Live note: AXE Core already applied `20261017114651` / marketing_waitlist on
-- pqnngpcgbdwxavbatbia (same columns + unique lower(email)). This file is
-- idempotent; applying it still matters for the REVOKE below.

create table if not exists public.marketing_waitlist (
  id          uuid primary key default gen_random_uuid(),
  email       text not null,
  -- Which surface the signup came from, so Companion and Trading OS can share
  -- one table without guessing later who asked for what.
  surface     text not null default 'companion',
  -- Free-text note about the campaign/path, nullable on purpose.
  source      text,
  created_at  timestamptz not null default now()
);

-- One row per address, case-insensitively: Luka@x.com and luka@x.com are one
-- person. The API inserts plainly and reads 23505 as "already on the list",
-- so it needs no ON CONFLICT target and this can stay an expression index.
create unique index if not exists marketing_waitlist_email_key
  on public.marketing_waitlist (lower(email));

create index if not exists marketing_waitlist_created_at_idx
  on public.marketing_waitlist (created_at desc);

alter table public.marketing_waitlist enable row level security;

-- No policies by design. See the header: only the service role touches this.
revoke all on table public.marketing_waitlist from public;
revoke all on table public.marketing_waitlist from anon;
revoke all on table public.marketing_waitlist from authenticated;
grant all on table public.marketing_waitlist to service_role;

comment on table public.marketing_waitlist is
  'Public landing-page waitlist. Written only by /api/waitlist on the service role; RLS denies every client.';
