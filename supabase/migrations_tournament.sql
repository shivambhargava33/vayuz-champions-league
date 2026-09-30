-- Run once in Supabase SQL Editor (existing database).
alter table teams   add column if not exists group_name text;
alter table matches add column if not exists match_no int;
alter table matches add column if not exists play_order int;
alter table matches add column if not exists stage text not null default 'friendly';
alter table matches add column if not exists winner_id uuid references teams(id);
alter table matches alter column batting_first drop not null;
alter table matches drop constraint if exists matches_status_check;
alter table matches add constraint matches_status_check check (status in ('scheduled','live','completed'));
