-- Run once on an existing database (already included in schema.sql for new ones).
alter table matches add column if not exists umpire text;
