-- Trailhead seed data (fake fixtures — no real PII).
-- PREREQUISITE: create a user in Supabase Auth → Users, then replace
-- <OWNER_USER_UUID> below with that user's id. The staff.user_id column
-- references auth.users(id), so the id must belong to a real auth user.

-- One location + one staff row owned by the test user.
with loc as (
  insert into public.location (name)
  values ('Downtown')
  returning id
)
insert into public.staff (user_id, location_id, name, role, phone, pay_band)
select
  '<OWNER_USER_UUID>'::uuid,
  loc.id,
  'Alex Barista',
  'barista',
  '+1-555-0100',
  'Band C'
from loc;

-- OPTIONAL — a second staff row owned by a DIFFERENT auth user, to prove
-- cross-user isolation (owner sees only their own row, not this one).
-- Needs a second user created in Auth → Users; paste its id here.
-- insert into public.staff (user_id, location_id, name, role, phone, pay_band)
-- values ('<OTHER_USER_UUID>'::uuid, null, 'Sam Barista', 'barista', '+1-555-0199', 'Band A');
