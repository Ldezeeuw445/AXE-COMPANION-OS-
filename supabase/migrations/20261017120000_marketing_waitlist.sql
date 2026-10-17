-- Marketing waitlist for the public landing pages.
--
-- Why this table exists: the waitlist form on `/` wrote the address to
-- `localStorage` and then told the visitor "You're on the list — thank you."
-- Nothing ever left their browser. Every address collected since the landing
-- page went up is gone, and the privacy policy already promised "waitlist
-- communication" we had no way to send.
--
-- RLS is on with no policies at all: anon and authenticated clients can
-- neither read nor write. Inserts go through /api/waitlist on the service
-- role, so the email address is never readable from the browser and the
-- endpoint can validate and throttle before anything is stored.

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

comment on table public.marketing_waitlist is
  'Public landing-page waitlist. Written only by /api/waitlist on the service role; RLS denies every client.';
