-- swap_request policies.
-- SCHEMA NOTE: our requester column is `requested_by` (a staff.id FK), NOT
-- `requester_id`, and it references staff(id), NOT auth.users. So "own" means
-- the requester staff row belongs to the caller:
--   requested_by IN (select id from staff where user_id = auth.uid())
--
-- Two SELECT policies stack (Postgres OR's them): a row is visible if you're the
-- requester OR you're a manager at that shift's location.

drop policy if exists swap_read_own on public.swap_request;
create policy swap_read_own on public.swap_request
  for select to authenticated
  using (
    requested_by in (select id from public.staff where user_id = auth.uid())
  );

drop policy if exists swap_insert_own on public.swap_request;
create policy swap_insert_own on public.swap_request
  for insert to authenticated
  with check (
    requested_by in (select id from public.staff where user_id = auth.uid())
  );

drop policy if exists swap_read_as_manager on public.swap_request;
create policy swap_read_as_manager on public.swap_request
  for select to authenticated
  using (
    exists (
      select 1
      from public.staff s
      join public.shift sh on sh.id = swap_request.shift_id
      where s.user_id = auth.uid()
        and s.role = 'manager'
        and s.location_id = sh.location_id
    )
  );
