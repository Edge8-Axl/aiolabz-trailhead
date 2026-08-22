-- Read policies to take `location` and `shift` off deny-all.
--
-- location: operational reference data, no owner concept — every signed-in
-- staffer may read the branch list. This is the one legitimate `using (true)`.
--
-- shift: NOT owner-scoped (a shift isn't owned by one person). Readable when
-- the shift's location matches the caller's own location (subquery on staff).

drop policy if exists location_read on public.location;
create policy location_read
  on public.location
  for select
  to authenticated
  using (true);

drop policy if exists shift_read_own_location on public.shift;
create policy shift_read_own_location
  on public.shift
  for select
  to authenticated
  using (
    location_id in (
      select location_id from public.staff where user_id = auth.uid()
    )
  );
