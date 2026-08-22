-- Complete staff's CRUD coverage: owner-scoped UPDATE and DELETE.
-- UPDATE needs BOTH clauses: USING (you may only target your own row) and
-- WITH CHECK (the updated row must still be yours — you can't rewrite user_id
-- to hand your row to someone else). DELETE needs only USING.
--
-- Known-and-deferred: RLS is row-level, so an owner can still edit any COLUMN
-- of their own row, including pay_band. Locking pay_band to read-only needs a
-- column grant (revoke update (pay_band) ... from authenticated) or route-level
-- control — noted for later, not done here.

drop policy if exists staff_update_own on public.staff;
create policy staff_update_own
  on public.staff
  for update
  to authenticated
  using (auth.uid() = user_id)
  with check (auth.uid() = user_id);

drop policy if exists staff_delete_own on public.staff;
create policy staff_delete_own
  on public.staff
  for delete
  to authenticated
  using (auth.uid() = user_id);
