-- Read-only crypto wallet address book (Ledger, Tangem, Trust, MetaMask, Coinbase, Rise, …)

create table if not exists public.user_crypto_wallets (
  id uuid primary key default gen_random_uuid(),
  user_id uuid not null references auth.users (id) on delete cascade,
  provider text not null check (
    provider in ('ledger', 'tangem', 'trust', 'metamask', 'coinbase', 'rise', 'other')
  ),
  label text not null default '',
  chain text not null check (chain in ('ethereum', 'arbitrum', 'polygon', 'bitcoin')),
  address text not null,
  notes text,
  created_at timestamptz not null default timezone('utc', now())
);

create unique index if not exists user_crypto_wallets_user_chain_address_uidx
  on public.user_crypto_wallets (user_id, chain, lower(address));

create index if not exists user_crypto_wallets_user_id_idx
  on public.user_crypto_wallets (user_id, created_at desc);

alter table public.user_crypto_wallets enable row level security;

drop policy if exists "user_crypto_wallets_select_own" on public.user_crypto_wallets;
create policy "user_crypto_wallets_select_own"
  on public.user_crypto_wallets for select
  using (auth.uid() = user_id);

drop policy if exists "user_crypto_wallets_insert_own" on public.user_crypto_wallets;
create policy "user_crypto_wallets_insert_own"
  on public.user_crypto_wallets for insert
  with check (auth.uid() = user_id);

drop policy if exists "user_crypto_wallets_update_own" on public.user_crypto_wallets;
create policy "user_crypto_wallets_update_own"
  on public.user_crypto_wallets for update
  using (auth.uid() = user_id);

drop policy if exists "user_crypto_wallets_delete_own" on public.user_crypto_wallets;
create policy "user_crypto_wallets_delete_own"
  on public.user_crypto_wallets for delete
  using (auth.uid() = user_id);

comment on table public.user_crypto_wallets is
  'User-added public wallet addresses for read-only balance tracking — no private keys.';
