-- Song matching ignores emoji and punctuation too: "tilak 💥", "Tilak!" and "tilak" are one song.
-- Run once in the Supabase SQL Editor, after supabase-songs.sql. Safe to re-run.
-- Keep the character list identical to songKey() in "Member Portal.dc.html" and db.js.

create or replace function song_key(t text) returns text language sql immutable as $$
  select btrim(regexp_replace(lower(t),
    '[[:space:]!-/:-@\[\\]^_`{-~☀-➿️‍\U0001F000-\U0001FAFF]+', ' ', 'g'))
$$;

-- merge songs that now share a key into the one with the most bookings
create temp table song_merge as
with k as (
  select s.id, s.name, song_key(s.name) as key,
         (select count(*) from bookings b where b.song_id = s.id) as n
  from songs s
),
keep as (select distinct on (key) key, id, name from k order by key, n desc, id)
select k.id as bad_id, keep.id as good_id, keep.name as good_name
from k join keep using (key) where k.id <> keep.id;

update bookings b set song_id = m.good_id, song = m.good_name
from song_merge m where b.song_id = m.bad_id;
delete from songs where id in (select bad_id from song_merge);
drop table song_merge;

-- swap the key column to the new rule
alter table songs drop column name_key;
alter table songs add column name_key text generated always as (song_key(name)) stored unique;
