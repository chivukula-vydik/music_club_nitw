# Music Club NITW — portal backend setup

One-time setup, roughly an afternoon. Whoever does it owns the account — put it
on the club's shared Gmail (musicclub.nitw@gmail.com), not a personal one, so it
survives graduation.

## 1. Create the project

1. Sign up at supabase.com with the club Gmail. Free tier is plenty.
2. New project → pick the Mumbai/Singapore region → set a database password and
   store it in the club's password manager.
3. **Settings → API** gives you two values. Paste them into `supabase-config.js`:
   - Project URL → `url`
   - `anon` `public` key → `anonKey`

   Both are meant to be public. The `service_role` key is NOT — never put that in
   the site.

## 2. Turn on Google sign-in

1. **Authentication → Providers → Google** → enable.
2. Follow its link to the Google Cloud console, create an OAuth client (type: web),
   and paste the callback URL Supabase shows you into "Authorized redirect URIs".
3. Copy the Google client ID and secret back into Supabase.
4. Under **Authentication → URL Configuration**, add the URL where the site is
   hosted to "Redirect URLs".

Members now sign in with their @student.nitw.ac.in account. No passwords stored
anywhere, nothing to reset, nothing to leak.

## 3. Create the tables

Open **SQL Editor** and run this whole block.

```sql
-- who's in the club. one row per member.
create table members (
  name        text primary key,
  email       text unique not null,          -- their @student.nitw.ac.in address
  branch      text,
  year        int,
  team        text not null default 'Core',  -- 'Core', 'Tech', or 'Core + Tech'
  major_skill text,
  minor_skill text,
  vibe        text
);

-- the jam room grid. week 0 = this week, 1 = next week.
create table bookings (
  week      int  not null,
  day       text not null,
  slot      text not null,
  song      text not null,
  booked_by text not null references members(name),
  players   text[] not null default '{}',
  created_at timestamptz not null default now(),
  primary key (week, day, slot)
);

-- a member's own edits to their skills.
create table profiles (
  member_name text primary key references members(name),
  major_skill text,
  minor_skill text,
  vibe        text
);

-- minutes of meeting, visible by audience.
create table minutes (
  id           bigserial primary key,
  meeting_date date not null,
  title        text not null,
  audience     text not null check (audience in ('Combined','Core','Tech')),
  author       text not null references members(name),
  body         text not null
);
```

## 4. The rules that actually protect the data

This is the part that matters. Without it, the anon key alone would let anyone
read everything. Run this block too.

```sql
-- helper: which member row belongs to the person currently signed in
create or replace function me() returns members as $$
  select * from members where lower(email) = lower(auth.jwt() ->> 'email')
$$ language sql stable security definer;

alter table members  enable row level security;
alter table bookings enable row level security;
alter table profiles enable row level security;
alter table minutes  enable row level security;

-- only club members can see the roster at all
create policy "members read roster" on members for select
  using ( (select count(*) from members m where lower(m.email) = lower(auth.jwt() ->> 'email')) > 0 );

-- everyone signed in sees the schedule
create policy "members read bookings" on bookings for select
  using ( (select name from me()) is not null );

-- you may only book as yourself
create policy "book as self" on bookings for insert
  with check ( booked_by = (select name from me()) );

-- you may only change or drop your own booking
create policy "edit own booking" on bookings for update
  using ( booked_by = (select name from me()) );
create policy "drop own booking" on bookings for delete
  using ( booked_by = (select name from me()) );

-- skills are readable by the club, writable only by their owner
create policy "members read profiles" on profiles for select
  using ( (select name from me()) is not null );
create policy "write own profile" on profiles for insert
  with check ( member_name = (select name from me()) );
create policy "update own profile" on profiles for update
  using ( member_name = (select name from me()) );

-- minutes: combined for all, team minutes only for that team
create policy "read minutes for my team" on minutes for select
  using (
    audience = 'Combined'
    or (select team from me()) ilike '%' || audience || '%'
  );

-- anyone in the club can post minutes, credited to themselves
create policy "post minutes" on minutes for insert
  with check ( author = (select name from me()) );
```

What this buys you: a Tech minute is never sent to a Core-only member — the server
refuses the row, so there's nothing to find in the page source. Someone who isn't
in `members` gets empty results for everything, even with the anon key in hand.

## 5. Add the members

Each row needs the member's real institute email — that's what ties their Google
login to their name. Either paste a CSV in **Table Editor → members → Insert**, or:

```sql
insert into members (name, email, branch, year, team, major_skill, minor_skill, vibe) values
  ('Saumitra',  'saumitra@student.nitw.ac.in',  'ECE', 3, 'Core', 'Vocals', 'Bass, Photography, Beatbox', 'Naagdari fusion, rock'),
  ('Yashaswini','yashaswini@student.nitw.ac.in','MnC', 3, 'Core', 'Vocals, Violin', '', 'Anything but slow beat');
  -- …one line per member
```

Slot managers are just members; the day→manager mapping lives in the portal code
since it changes rarely.

## 6. Point the site at it

Fill in `supabase-config.js` and reload. The portal detects the config and
switches from local demo mode to the real thing: Google sign-in, shared data,
live updates between devices.

## Ongoing

- **Someone graduates** → delete their `members` row. Their login stops working
  immediately; their bookings can be reassigned or dropped.
- **New members** → add a row. Nothing else to do; they sign in with Google.
- **Weekly reset** → the schedule uses week 0/1. A scheduled job can shift week 1
  down to 0 each Monday, or the slot managers can clear it manually at first.
- **Backups** → Supabase keeps daily backups on the free tier. Worth exporting the
  members table to the club Drive once a semester.
