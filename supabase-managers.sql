-- Day managers can edit or drop any booking on their day from the jam room grid.
-- Run once in the Supabase SQL Editor. Names must match members.name exactly,
-- and must match the DAYS list in "Member Portal.dc.html".

create table if not exists day_managers (
  day     text primary key,
  manager text not null references members(name)
);

insert into day_managers (day, manager) values
  ('Monday', 'Saumitra'),
  ('Tuesday', 'Yashaswini'),
  ('Wednesday', 'Kaivalya Kappaganthula'),
  ('Thursday', 'Arkadeep'),
  ('Friday', 'Divya'),
  ('Saturday', 'Joshua'),
  ('Sunday', 'Balla Sri Sathwik')
on conflict (day) do update set manager = excluded.manager;

alter table day_managers enable row level security;
drop policy if exists "members read day managers" on day_managers;
create policy "members read day managers" on day_managers for select
  using ( (select name from me()) is not null );

-- added alongside "edit own booking" / "drop own booking"; Postgres ORs them
drop policy if exists "manager edits day" on bookings;
create policy "manager edits day" on bookings for update
  using ( exists (select 1 from day_managers dm where dm.day = bookings.day and dm.manager = (select name from me())) )
  with check ( exists (select 1 from day_managers dm where dm.day = bookings.day and dm.manager = (select name from me())) );

drop policy if exists "manager drops day" on bookings;
create policy "manager drops day" on bookings for delete
  using ( exists (select 1 from day_managers dm where dm.day = bookings.day and dm.manager = (select name from me())) );

-- moving a slot writes the booking into the new hour under the original booker's name
drop policy if exists "manager books day" on bookings;
create policy "manager books day" on bookings for insert
  with check ( exists (select 1 from day_managers dm where dm.day = bookings.day and dm.manager = (select name from me())) );
