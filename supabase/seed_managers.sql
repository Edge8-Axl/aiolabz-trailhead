-- Managers for the approver-read test.
-- Prereq: create TWO users in Auth → Users, paste their UUIDs below.
-- staff.user_id is an FK to auth.users, so these must be real user ids.

-- Downtown manager — should be able to read Downtown swap requests.
insert into public.staff (user_id, location_id, name, role)
select '<DOWNTOWN_MANAGER_UUID>'::uuid, l.id, 'Dana Manager', 'manager'
from public.location l where l.name = 'Downtown';

-- Uptown manager — should NOT see Downtown swap requests (wrong location).
insert into public.staff (user_id, location_id, name, role)
select '<UPTOWN_MANAGER_UUID>'::uuid, l.id, 'Uma Manager', 'manager'
from public.location l where l.name = 'Uptown';
