-- Run this once in Supabase: SQL Editor -> New query -> paste -> Run.
create table teams (
  id uuid primary key default gen_random_uuid(),
  name text not null unique,
  created_at timestamptz default now()
);

create table players (
  id uuid primary key default gen_random_uuid(),
  team_id uuid not null references teams(id) on delete cascade,
  name text not null,
  created_at timestamptz default now()
);

create table matches (
  id uuid primary key default gen_random_uuid(),
  team_a uuid not null references teams(id),
  team_b uuid not null references teams(id),
  overs int not null,
  balls_per_over int not null default 3,
  players_per_side int not null,
  batting_first uuid not null references teams(id),
  status text not null default 'live' check (status in ('live','completed')),
  current_innings int not null default 1,
  result text,
  umpire text,
  created_at timestamptz default now()
);

create table balls (
  id uuid primary key default gen_random_uuid(),
  match_id uuid not null references matches(id) on delete cascade,
  innings int not null,
  seq int not null,
  striker_id uuid,
  non_striker_id uuid,
  bowler_id uuid,
  runs_off_bat int not null default 0,
  extra_type text check (extra_type in ('wide','noball','bye','legbye')),
  extra_runs int not null default 0,
  is_legal boolean not null,
  wicket_type text,
  out_player_id uuid,
  created_at timestamptz default now(),
  unique (match_id, innings, seq)
);

-- Lock the tables: only the server (service role key) can read/write.
alter table teams enable row level security;
alter table players enable row level security;
alter table matches enable row level security;
alter table balls enable row level security;
