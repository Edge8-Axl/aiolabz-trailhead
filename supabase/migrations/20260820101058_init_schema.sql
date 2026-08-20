-- Trailhead initial schema: location, staff, shift, swap_request
-- RLS is enabled on `staff` only (the sensitivity of record: it holds phone + pay_band).
-- The other three tables are intentionally left without RLS for now; revisit before real data.

-- ─────────────────────────────────────────────────────────────
-- location: a café branch that groups staff and shifts
-- ─────────────────────────────────────────────────────────────
create table public.location (
  id         uuid primary key default gen_random_uuid(),
  name       text not null,
  created_at timestamptz not null default now()
);

-- ─────────────────────────────────────────────────────────────
-- staff: an employee. SENSITIVE — holds phone + pay_band.
-- `user_id` is the OWNER column: the signed-in auth user this row belongs to.
-- ─────────────────────────────────────────────────────────────
create table public.staff (
  id          uuid primary key default gen_random_uuid(),
  user_id     uuid not null references auth.users (id) on delete cascade,  -- owner
  location_id uuid references public.location (id) on delete set null,
  name        text not null,
  role        text not null default 'barista',
  phone       text,   -- SENSITIVE: never expose outside an allowlisted response
  pay_band    text,   -- SENSITIVE: never expose outside an allowlisted response
  created_at  timestamptz not null default now()
);

-- ─────────────────────────────────────────────────────────────
-- shift: a scheduled work block at a location, assigned to one staff member
-- ─────────────────────────────────────────────────────────────
create table public.shift (
  id          uuid primary key default gen_random_uuid(),
  location_id uuid not null references public.location (id) on delete cascade,
  staff_id    uuid references public.staff (id) on delete set null,
  starts_at   timestamptz not null,
  ends_at     timestamptz not null,
  created_at  timestamptz not null default now(),
  constraint shift_time_valid check (ends_at > starts_at)
);

-- ─────────────────────────────────────────────────────────────
-- swap_request: a request to give up / swap a shift
-- ─────────────────────────────────────────────────────────────
create table public.swap_request (
  id           uuid primary key default gen_random_uuid(),
  shift_id     uuid not null references public.shift (id) on delete cascade,
  requested_by uuid not null references public.staff (id) on delete cascade,
  status       text not null default 'pending'
                 check (status in ('pending', 'approved', 'rejected')),
  approved_by  uuid references public.staff (id) on delete set null,
  created_at   timestamptz not null default now()
);

-- ─────────────────────────────────────────────────────────────
-- Row-Level Security: ON for staff.
-- NOTE: enabling RLS with NO policy = deny-by-default. Every query returns
-- zero rows until a policy is added. That is the safe starting state; the
-- owner-only read/write policies come as the next step.
-- ─────────────────────────────────────────────────────────────
alter table public.staff enable row level security;
