-- Slot managers can put an hour on hold so nobody books it. Run once in the Supabase SQL Editor.
-- A hold is a bookings row with hold = true; song holds the reason, booked_by the manager.
alter table bookings add column if not exists hold boolean not null default false;
