-- Song IDs: one row per song, bookings point at it. Run once in the Supabase SQL Editor.
-- Safe to re-run. The portal keeps working before and after this runs.

create table if not exists songs (
  id         bigserial primary key,
  name       text not null,
  -- "Hotel California" and "hotel  california " are the same song
  name_key   text generated always as (lower(regexp_replace(btrim(name), '\s+', ' ', 'g'))) stored unique,
  created_by text references members(name),
  created_at timestamptz not null default now()
);

alter table bookings add column if not exists song_id bigint references songs(id) on delete set null;

-- backfill: one song per distinct name in existing bookings, using the most common spelling
insert into songs (name)
select distinct on (k) name
from (
  select btrim(song) as name,
         lower(regexp_replace(btrim(song), '\s+', ' ', 'g')) as k,
         count(*) over (partition by lower(regexp_replace(btrim(song), '\s+', ' ', 'g')), btrim(song)) as n
  from bookings
  -- "practice", "personal slot", "solo session"… are slots, not songs
  where btrim(song) <> '' and lower(regexp_replace(btrim(song), '\s+', ' ', 'g')) !~ '(^| )(practice|personal|session|slot|solo|self|individual|recording|record|shooting|shoot|reel|reels|video)( |$)'
) v
order by k, n desc
on conflict (name_key) do nothing;

update bookings b set song_id = s.id
from songs s
where b.song_id is null
  and s.name_key = lower(regexp_replace(btrim(b.song), '\s+', ' ', 'g'));

alter table songs enable row level security;
drop policy if exists "members read songs" on songs;
create policy "members read songs" on songs for select
  using ( (select name from me()) is not null );
drop policy if exists "members add songs" on songs;
create policy "members add songs" on songs for insert
  with check ( created_by = (select name from me()) );

-- live updates for the song list
do $$ begin
  alter publication supabase_realtime add table songs;
exception when duplicate_object then null; end $$;

-- To merge a typo into the real song (run by hand, swap the ids):
--   update bookings set song_id = <good_id>, song = (select name from songs where id = <good_id>) where song_id = <typo_id>;
--   delete from songs where id = <typo_id>;
-- See duplicates first with:  select id, name from songs order by name_key;

-- Cleanup (safe to re-run): drop "songs" that are really practice/personal slots.
-- Their bookings keep their text and just lose the song id.
delete from songs where name_key ~ '(^| )(practice|personal|session|slot|solo|self|individual|recording|record|shooting|shoot|reel|reels|video)( |$)';
