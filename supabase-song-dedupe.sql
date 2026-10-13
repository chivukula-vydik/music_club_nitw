-- Song duplicates. Run once in the Supabase SQL Editor (after supabase-song-key.sql). Safe to re-run.
--
-- 1. Exact rule: spaces, punctuation, emoji and doubled letters don't count, so
--    "NainaMorey" = "Naina Morey" and "kannulo" = "kanulo". These merge automatically.
--    Keep the character list identical to songKey() in "Member Portal.dc.html" and db.js.

create or replace function song_key(t text) returns text language sql immutable as $$
  select regexp_replace(
    regexp_replace(lower(t), '[[:space:]!-/:-@\[\\\]^_`{-~☀-➿️‍\U0001F000-\U0001FAFF]+', '', 'g'),
    '(.)\1+', '\1', 'g')
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

alter table songs drop column name_key;
alter table songs add column name_key text generated always as (song_key(name)) stored unique;

-- 2. Hand merge: select merge_song(<wrong id>, <right id>);
--    Moves every booking of the wrong song onto the right one, then deletes the wrong song.
create or replace function merge_song(bad bigint, good bigint) returns void language sql as $$
  update bookings set song_id = good, song = (select name from songs where id = good) where song_id = bad;
  delete from songs where id = bad;
$$;
revoke execute on function merge_song(bigint, bigint) from public, anon, authenticated;

create extension if not exists fuzzystrmatch with schema extensions;

-- 3. Review list: likely duplicates ("ilayaraja" / "ilaiyaraja", "kanulanu" / "kanulanu thaake").
--    Copy the run_this lines you agree with, run them, then run this query again.
-- with s as (
--   select id, name, name_key as k, (select count(*) from bookings b where b.song_id = songs.id) as n from songs
-- )
-- select a.name as keep, b.name as merge_away,
--        format('select merge_song(%s, %s);', b.id, a.id) as run_this
-- from s a join s b on a.id <> b.id and (a.n > b.n or (a.n = b.n and a.id < b.id))
-- where (least(length(a.k), length(b.k)) >= 4 and (strpos(a.k, b.k) > 0 or strpos(b.k, a.k) > 0))
--    or (least(length(a.k), length(b.k)) >= 5 and abs(length(a.k) - length(b.k)) <= 2
--        and extensions.levenshtein(a.k, b.k) <= greatest(1, least(length(a.k), length(b.k)) / 6))
-- order by a.name;
