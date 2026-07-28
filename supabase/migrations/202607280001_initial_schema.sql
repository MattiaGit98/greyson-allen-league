create extension if not exists pgcrypto;

create type public.season_status as enum ('setup','offseason','draft','auction','regular_season','postseason','completed');
create type public.player_role as enum ('G','A','C');
create type public.slot_type as enum ('regular','two_way','g_league','dpe');
create type public.roster_status as enum ('pending','active','cut','released','expired','traded');
create type public.transaction_status as enum ('pending','committed','reversed');
create type public.transaction_type as enum (
  'initial_import','auction_purchase','free_agent_signing','trade','release',
  'contract_extension','contract_update','credit_adjustment','player_creation',
  'correction','reversal'
);
create type public.auction_status as enum ('draft','active','paused','completed');

create table public.seasons (
  id uuid primary key default gen_random_uuid(),
  name text not null unique,
  start_date date,
  end_date date,
  status public.season_status not null default 'setup',
  is_active boolean not null default false,
  regular_season_starts_at timestamptz,
  trade_deadline_at timestamptz,
  free_agency_ends_at timestamptz,
  created_at timestamptz not null default now(),
  check (end_date is null or start_date is null or end_date > start_date)
);
create unique index one_active_season on public.seasons (is_active) where is_active;

create table public.teams (
  id uuid primary key default gen_random_uuid(),
  code text not null unique check (code = upper(code)),
  name text not null unique,
  slug text not null unique,
  owner_name text not null,
  logo_url text,
  active boolean not null default true,
  created_at timestamptz not null default now()
);

create table public.team_seasons (
  id uuid primary key default gen_random_uuid(),
  team_id uuid not null references public.teams,
  season_id uuid not null references public.seasons,
  initial_credits integer not null default 1000 check (initial_credits >= 0),
  current_credits integer not null default 1000 check (current_credits >= 0),
  regular_slots integer not null default 15 check (regular_slots >= 0),
  two_way_slots integer not null default 2 check (two_way_slots >= 0),
  g_league_slots integer not null default 3 check (g_league_slots >= 0),
  dpe_slots integer not null default 1 check (dpe_slots >= 0),
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  unique(team_id, season_id)
);

create table public.players (
  id uuid primary key default gen_random_uuid(),
  full_name text not null,
  normalized_name text not null unique,
  nba_team text,
  role public.player_role,
  status text not null default 'active',
  birth_date date,
  external_id text unique,
  on_dunkest_list boolean not null default false,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

create table public.roster_entries (
  id uuid primary key default gen_random_uuid(),
  season_id uuid not null references public.seasons,
  team_id uuid not null references public.teams,
  player_id uuid not null references public.players,
  slot public.slot_type not null default 'regular',
  status public.roster_status not null default 'pending',
  acquisition_type text not null default 'initial_import',
  acquisition_cost integer not null check (acquisition_cost >= 0),
  current_cost integer not null check (current_cost >= 0),
  original_years smallint check (original_years between 1 and 3),
  option_type text check (option_type is null or option_type in ('team','qualifying')),
  extension_count smallint not null default 0 check (extension_count >= 0),
  last_extended_season_id uuid references public.seasons,
  acquired_at timestamptz,
  released_at timestamptz,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);
create unique index one_current_roster_per_player
  on public.roster_entries(season_id, player_id)
  where status in ('pending','active');

create table public.contract_terms (
  id uuid primary key default gen_random_uuid(),
  roster_entry_id uuid not null references public.roster_entries on delete restrict,
  season_id uuid not null references public.seasons,
  amount integer not null check (amount >= 0),
  guaranteed_amount integer not null check (guaranteed_amount between 0 and amount),
  is_team_option boolean not null default false,
  option_exercised boolean,
  created_at timestamptz not null default now(),
  unique(roster_entry_id, season_id)
);

create table public.transactions (
  id uuid primary key default gen_random_uuid(),
  season_id uuid not null references public.seasons,
  type public.transaction_type not null,
  status public.transaction_status not null default 'committed',
  occurred_at timestamptz not null default now(),
  created_by uuid references auth.users,
  description text not null,
  notes text,
  reason text,
  reversed_transaction_id uuid unique references public.transactions,
  created_at timestamptz not null default now(),
  check (type <> 'correction' or nullif(trim(reason),'') is not null),
  check (type <> 'reversal' or reversed_transaction_id is not null)
);

create table public.transaction_items (
  id uuid primary key default gen_random_uuid(),
  transaction_id uuid not null references public.transactions on delete restrict,
  team_from_id uuid references public.teams,
  team_to_id uuid references public.teams,
  player_id uuid references public.players,
  roster_entry_id uuid references public.roster_entries,
  credit_amount integer,
  item_type text not null,
  metadata jsonb not null default '{}'::jsonb,
  created_at timestamptz not null default now(),
  check (team_from_id is distinct from team_to_id)
);

create table public.cap_charges (
  id uuid primary key default gen_random_uuid(),
  team_id uuid not null references public.teams,
  season_id uuid not null references public.seasons,
  roster_entry_id uuid references public.roster_entries,
  transaction_id uuid not null references public.transactions,
  kind text not null check (kind in ('contract','dead_cap','buyout','stretch','adjustment')),
  amount integer not null check (amount >= 0),
  active boolean not null default true,
  created_at timestamptz not null default now()
);

create table public.draft_picks (
  id uuid primary key default gen_random_uuid(),
  draft_year integer not null check (draft_year between 2020 and 2100),
  round smallint not null check (round in (1,2)),
  original_team_id uuid not null references public.teams,
  owning_team_id uuid not null references public.teams,
  overall_number smallint check (overall_number > 0),
  source_note text,
  created_at timestamptz not null default now(),
  unique(draft_year, round, original_team_id)
);
create table public.draft_pick_conditions (
  id uuid primary key default gen_random_uuid(),
  draft_pick_id uuid not null references public.draft_picks,
  counterparty_pick_id uuid references public.draft_picks,
  condition_type text not null check (condition_type in ('protection','swap')),
  protected_through smallint,
  description text not null,
  created_at timestamptz not null default now()
);

create table public.auction_sessions (
  id uuid primary key default gen_random_uuid(),
  season_id uuid not null references public.seasons,
  name text not null,
  status public.auction_status not null default 'draft',
  started_at timestamptz,
  ended_at timestamptz,
  created_by uuid references auth.users,
  created_at timestamptz not null default now()
);
create table public.auction_events (
  id uuid primary key default gen_random_uuid(),
  auction_session_id uuid not null references public.auction_sessions,
  transaction_id uuid not null unique references public.transactions,
  player_id uuid not null references public.players,
  team_id uuid not null references public.teams,
  price integer not null check (price > 0),
  contract_data jsonb not null default '{}'::jsonb,
  sequence_number bigint not null,
  created_at timestamptz not null default now(),
  reversed_at timestamptz,
  unique(auction_session_id, sequence_number)
);

create table public.league_rules (
  id uuid primary key default gen_random_uuid(),
  season_id uuid references public.seasons,
  key text not null,
  value jsonb not null,
  description text not null,
  unique(season_id, key)
);
create table public.admin_users (
  user_id uuid primary key references auth.users on delete cascade,
  role text not null default 'admin' check (role in ('admin','commissioner')),
  created_at timestamptz not null default now()
);
create table public.audit_log (
  id bigint generated always as identity primary key,
  user_id uuid references auth.users,
  action text not null,
  entity_type text not null,
  entity_id uuid,
  old_data jsonb,
  new_data jsonb,
  reason text,
  created_at timestamptz not null default now()
);
create table public.import_runs (
  id uuid primary key default gen_random_uuid(),
  file_sha256 text not null unique,
  file_name text not null,
  status text not null check (status in ('started','completed','failed')),
  report jsonb not null default '{}'::jsonb,
  created_by uuid references auth.users,
  created_at timestamptz not null default now()
);

create or replace function public.is_admin()
returns boolean language sql stable security definer set search_path = ''
as $$ select exists(select 1 from public.admin_users where user_id = auth.uid()) $$;

alter table public.seasons enable row level security;
alter table public.teams enable row level security;
alter table public.team_seasons enable row level security;
alter table public.players enable row level security;
alter table public.roster_entries enable row level security;
alter table public.contract_terms enable row level security;
alter table public.transactions enable row level security;
alter table public.transaction_items enable row level security;
alter table public.cap_charges enable row level security;
alter table public.draft_picks enable row level security;
alter table public.draft_pick_conditions enable row level security;
alter table public.auction_sessions enable row level security;
alter table public.auction_events enable row level security;
alter table public.league_rules enable row level security;
alter table public.admin_users enable row level security;
alter table public.audit_log enable row level security;
alter table public.import_runs enable row level security;

do $$ declare t text;
begin
  foreach t in array array['seasons','teams','team_seasons','players','roster_entries','contract_terms','transactions','transaction_items','draft_picks','draft_pick_conditions','auction_sessions','auction_events']
  loop execute format('create policy public_read on public.%I for select using (true)', t); end loop;
  foreach t in array array['seasons','teams','team_seasons','players','roster_entries','contract_terms','transactions','transaction_items','cap_charges','draft_picks','draft_pick_conditions','auction_sessions','auction_events','league_rules','audit_log','import_runs']
  loop execute format('create policy admin_all on public.%I for all using (public.is_admin()) with check (public.is_admin())', t); end loop;
end $$;

create policy admin_self_read on public.admin_users for select using (user_id = auth.uid() or public.is_admin());

alter publication supabase_realtime add table public.team_seasons;
alter publication supabase_realtime add table public.transactions;
alter publication supabase_realtime add table public.auction_events;
