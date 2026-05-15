-- ============================================================
-- Phase G — Part 1: School (May 2026)
-- ============================================================
-- 3 tables:
--   school_events          — webinars/assignments/quizzes/exams (32 rows)
--   school_results         — year/period containers (Year 1, Year 2...)
--   school_result_subjects — subjects within each result period
--
-- Proper columns, per-row. RLS scoped to household.
-- Run each CREATE block separately on mobile if paste truncates.
-- ============================================================

-- ── 1. school_events ─────────────────────────────────────────
create table if not exists school_events (
  id            uuid primary key default gen_random_uuid(),
  household_id  uuid not null references households(id) on delete cascade,
  type          text not null check (type in ('webinar','assignment','quiz','exam')),
  subject       text,
  title         text,
  event_date    date,
  event_time    text,
  done          boolean not null default false,
  deleted_at    timestamptz,
  created_at    timestamptz not null default now(),
  updated_at    timestamptz not null default now()
);

create index if not exists school_events_household_idx
  on school_events (household_id, event_date) where deleted_at is null;

alter table school_events enable row level security;

create policy "school_events_select" on school_events for select
  using (household_id = current_household_id());
create policy "school_events_insert" on school_events for insert
  with check (household_id = current_household_id());
create policy "school_events_update" on school_events for update
  using (household_id = current_household_id());
create policy "school_events_delete" on school_events for delete
  using (household_id = current_household_id());

grant select, insert, update, delete on public.school_events to authenticated;
grant select, insert, update, delete on public.school_events to service_role;


-- ── 2. school_results (year/period containers) ───────────────
create table if not exists school_results (
  id            uuid primary key default gen_random_uuid(),
  household_id  uuid not null references households(id) on delete cascade,
  year_label    text not null,
  period        text,
  sort_order    int not null default 0,
  deleted_at    timestamptz,
  updated_at    timestamptz not null default now()
);

create index if not exists school_results_household_idx
  on school_results (household_id, sort_order) where deleted_at is null;

alter table school_results enable row level security;

create policy "school_results_select" on school_results for select
  using (household_id = current_household_id());
create policy "school_results_insert" on school_results for insert
  with check (household_id = current_household_id());
create policy "school_results_update" on school_results for update
  using (household_id = current_household_id());
create policy "school_results_delete" on school_results for delete
  using (household_id = current_household_id());

grant select, insert, update, delete on public.school_results to authenticated;
grant select, insert, update, delete on public.school_results to service_role;


-- ── 3. school_result_subjects (subjects within a result period) ──
create table if not exists school_result_subjects (
  id                uuid primary key default gen_random_uuid(),
  household_id      uuid not null references households(id) on delete cascade,
  result_id         uuid not null references school_results(id) on delete cascade,
  name              text not null,
  code              text,
  color             text,
  year_pct          numeric(5,2),
  exam_pct          numeric(5,2),
  final_pct         numeric(5,2),
  result            text,
  quiz_score        numeric(5,2),
  assessment_score  numeric(5,2),
  sort_order        int not null default 0,
  deleted_at        timestamptz,
  updated_at        timestamptz not null default now()
);

create index if not exists school_result_subjects_result_idx
  on school_result_subjects (result_id) where deleted_at is null;

alter table school_result_subjects enable row level security;

create policy "school_result_subjects_select" on school_result_subjects for select
  using (household_id = current_household_id());
create policy "school_result_subjects_insert" on school_result_subjects for insert
  with check (household_id = current_household_id());
create policy "school_result_subjects_update" on school_result_subjects for update
  using (household_id = current_household_id());
create policy "school_result_subjects_delete" on school_result_subjects for delete
  using (household_id = current_household_id());

grant select, insert, update, delete on public.school_result_subjects to authenticated;
grant select, insert, update, delete on public.school_result_subjects to service_role;
