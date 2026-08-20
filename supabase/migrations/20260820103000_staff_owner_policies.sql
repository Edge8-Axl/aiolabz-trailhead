-- Owner-only RLS policies for staff.
-- RLS was already enabled in the init migration. These policies scope every
-- read and insert to the row's owner (the signed-in user), so a barista can
-- only ever see or create their own staff row — never another person's
-- phone or pay_band.
--
-- This file is the CORRECT end state. In the learning loop you first apply a
-- permissive `using (true)` policy by hand, watch a signed-out read leak a
-- pay band, then replace it with what's below.

drop policy if exists staff_read_own on public.staff;
create policy staff_read_own
  on public.staff
  for select
  using (auth.uid() = user_id);

drop policy if exists staff_insert_own on public.staff;
create policy staff_insert_own
  on public.staff
  for insert
  with check (auth.uid() = user_id);
