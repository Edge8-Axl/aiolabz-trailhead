-- Seed shifts across TWO locations so GET /shifts location-scoping is testable.
-- Prereq: seed.sql already ran (creates 'Downtown' + the test staff row whose
-- location_id = Downtown). The test user is a Downtown staffer, so they should
-- see the Downtown shifts below but NOT the Uptown one.
--
-- Run once. Re-running duplicates rows (no unique constraint on these).

-- A second location the caller does NOT belong to.
insert into public.location (name) values ('Uptown');

-- Two shifts at Downtown (the caller's location) — should be visible.
insert into public.shift (location_id, staff_id, starts_at, ends_at)
select l.id,
       (select id from public.staff where name = 'Alex Barista' limit 1),
       now() + interval '1 day',
       now() + interval '1 day' + interval '8 hours'
from public.location l where l.name = 'Downtown';

insert into public.shift (location_id, staff_id, starts_at, ends_at)
select l.id, null,
       now() + interval '2 day',
       now() + interval '2 day' + interval '8 hours'
from public.location l where l.name = 'Downtown';

-- One shift at Uptown (a DIFFERENT location) — should be HIDDEN from the caller.
insert into public.shift (location_id, staff_id, starts_at, ends_at)
select l.id, null,
       now() + interval '1 day',
       now() + interval '1 day' + interval '8 hours'
from public.location l where l.name = 'Uptown';
