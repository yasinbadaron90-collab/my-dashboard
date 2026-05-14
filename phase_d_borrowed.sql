-- ============================================================
-- Phase D — Borrowed (May 2026)
-- ============================================================
-- 3 tables:
--   borrow_entries          — passenger borrows/repayments (Lezaun, David, etc.)
--   external_borrowers      — non-passenger people (Tariq, etc.) registry
--   external_borrow_entries — borrows/repayments to/from external people
--
-- Proper columns, per-row (no JSON blobs). RLS scoped to household.
-- ============================================================

-- ── 1. borrow_entries (passenger borrows) ────────────────────
create table if not exists borrow_entries (
  id              uuid primary key default gen_random_uuid(),
  household_id    uuid not null references households(id) on delete cascade,
  person_name     text not null,             -- e.g. "Lezaun" (matches passenger name)
  passenger_id    uuid references passengers(id) on delete set null,
  type            text not null check (type in ('borrow','repay')),
  amount          numeric(12,2) not null check (amount > 0),
  entry_date      date not null,
  note            text,
  account         text,                       -- FNB / TymeBank / Cash where money WENT (for borrow) or CAME from
  bank            text,                       -- repay's destination bank
  paid            boolean not null default false,
  cf_id           text,                       -- link to cash flow entry id
  deleted_at      timestamptz,
  created_at      timestamptz not null default now(),
  updated_at      timestamptz not null default now()
);

create index if not exists borrow_entries_household_person_idx
  on borrow_entries (household_id, person_name) where deleted_at is null;
create index if not exists borrow_entries_household_date_idx
  on borrow_entries (household_id, entry_date) where deleted_at is null;

alter table borrow_entries enable row level security;

create policy "borrow_entries_select" on borrow_entries for select
  using (household_id = current_household_id());
create policy "borrow_entries_insert" on borrow_entries for insert
  with check (household_id = current_household_id());
create policy "borrow_entries_update" on borrow_entries for update
  using (household_id = current_household_id());
create policy "borrow_entries_delete" on borrow_entries for delete
  using (household_id = current_household_id());

-- Future-proof grants for the May/Oct 2026 Supabase rollout
grant select, insert, update, delete on public.borrow_entries to authenticated;
grant select, insert, update, delete on public.borrow_entries to service_role;


-- ── 2. external_borrowers (non-passenger people registry) ────
create table if not exists external_borrowers (
  id              uuid primary key default gen_random_uuid(),
  household_id    uuid not null references households(id) on delete cascade,
  key             text not null,             -- e.g. "tariq" (the localStorage key)
  display_name    text not null,             -- e.g. "Tariq"
  deleted_at      timestamptz,
  updated_at      timestamptz not null default now(),
  unique (household_id, key)
);

create index if not exists external_borrowers_household_idx
  on external_borrowers (household_id) where deleted_at is null;

alter table external_borrowers enable row level security;

create policy "external_borrowers_select" on external_borrowers for select
  using (household_id = current_household_id());
create policy "external_borrowers_insert" on external_borrowers for insert
  with check (household_id = current_household_id());
create policy "external_borrowers_update" on external_borrowers for update
  using (household_id = current_household_id());
create policy "external_borrowers_delete" on external_borrowers for delete
  using (household_id = current_household_id());

grant select, insert, update, delete on public.external_borrowers to authenticated;
grant select, insert, update, delete on public.external_borrowers to service_role;


-- ── 3. external_borrow_entries (borrows/repayments to external people) ──
create table if not exists external_borrow_entries (
  id              uuid primary key default gen_random_uuid(),
  household_id    uuid not null references households(id) on delete cascade,
  borrower_id     uuid not null references external_borrowers(id) on delete cascade,
  type            text not null check (type in ('borrow','repay')),
  amount          numeric(12,2) not null check (amount > 0),
  entry_date      date not null,
  note            text,
  paid            boolean not null default false,
  deleted_at      timestamptz,
  created_at      timestamptz not null default now(),
  updated_at      timestamptz not null default now()
);

create index if not exists external_borrow_entries_borrower_idx
  on external_borrow_entries (borrower_id) where deleted_at is null;
create index if not exists external_borrow_entries_household_date_idx
  on external_borrow_entries (household_id, entry_date) where deleted_at is null;

alter table external_borrow_entries enable row level security;

create policy "external_borrow_entries_select" on external_borrow_entries for select
  using (household_id = current_household_id());
create policy "external_borrow_entries_insert" on external_borrow_entries for insert
  with check (household_id = current_household_id());
create policy "external_borrow_entries_update" on external_borrow_entries for update
  using (household_id = current_household_id());
create policy "external_borrow_entries_delete" on external_borrow_entries for delete
  using (household_id = current_household_id());

grant select, insert, update, delete on public.external_borrow_entries to authenticated;
grant select, insert, update, delete on public.external_borrow_entries to service_role;
