-- Phone notifications: one row per phone/browser that turned them on. Run once in the Supabase SQL Editor.
create table if not exists push_subs (
  endpoint    text primary key,
  member_name text not null references members(name) on delete cascade,
  sub         jsonb not null,
  created_at  timestamptz not null default now()
);

alter table push_subs enable row level security;

-- members manage only their own phones; the server (service role) reads all to send
drop policy if exists "read own push" on push_subs;
create policy "read own push" on push_subs for select
  using ( member_name = (select name from me()) );
drop policy if exists "add own push" on push_subs;
create policy "add own push" on push_subs for insert
  with check ( member_name = (select name from me()) );
drop policy if exists "update own push" on push_subs;
create policy "update own push" on push_subs for update
  using ( member_name = (select name from me()) )
  with check ( member_name = (select name from me()) );
drop policy if exists "remove own push" on push_subs;
create policy "remove own push" on push_subs for delete
  using ( member_name = (select name from me()) );
