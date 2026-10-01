-- Run once in Supabase SQL Editor: adds "special events" (-5 penalty, batter revival) to the ball log.
alter table balls add column if not exists event text check (event in ('penalty','revive'));
