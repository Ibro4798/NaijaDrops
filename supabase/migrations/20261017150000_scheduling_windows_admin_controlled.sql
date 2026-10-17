-- Scheduling is controlled from the admin dashboard:
--  * ops creates delivery windows (start, duration, cut-off to join, optional cap)
--  * only vendors ops has switched on can book a window
--  * a booked order is always paid up front (payment_required follows scheduled_at)
--  * the rules are enforced here, not just in the app

create table if not exists public.schedule_windows (
  id               uuid primary key default gen_random_uuid(),
  label            text,
  starts_at        timestamptz not null,
  duration_minutes integer not null default 60 check (duration_minutes between 15 and 480),
  cutoff_at        timestamptz not null,
  max_orders       integer check (max_orders is null or max_orders > 0),
  is_open          boolean not null default true,
  created_by       uuid,
  created_at       timestamptz not null default now(),
  constraint schedule_windows_cutoff_before_start check (cutoff_at <= starts_at)
);
create index if not exists schedule_windows_starts_idx on public.schedule_windows (starts_at);

-- Admin screens use the service role; vendors read through open_schedule_windows() below.
alter table public.schedule_windows enable row level security;
revoke all on public.schedule_windows from anon, authenticated;

alter table public.orders
  add column if not exists schedule_window_id uuid references public.schedule_windows(id) on delete restrict;
create index if not exists orders_schedule_window_idx on public.orders (schedule_window_id) where schedule_window_id is not null;

-- Validate + stamp scheduled bookings on insert (anonymous / signed-in callers only).
create or replace function public.apply_schedule_window()
returns trigger
language plpgsql
security definer
set search_path to 'public', 'pg_temp'
as $function$
declare
  w         public.schedule_windows%rowtype;
  v_enabled boolean;
  v_taken   integer;
begin
  if coalesce(auth.role(), '') not in ('anon', 'authenticated') then
    return NEW;  -- service role / SQL editor
  end if;

  if NEW.scheduled_at is null and NEW.schedule_window_id is null then
    return NEW;  -- normal on-demand order
  end if;

  if NEW.schedule_window_id is null then
    raise exception 'WINDOW_REQUIRED: scheduled orders must be booked into an open delivery window';
  end if;

  select v.scheduled_enabled into v_enabled from public.vendors v where v.id = NEW.vendor_id;
  if coalesce(v_enabled, false) is not true then
    raise exception 'SCHEDULING_NOT_ENABLED: scheduled delivery is not available on this account';
  end if;

  -- Lock the window row so two vendors cannot both take the last place.
  select * into w from public.schedule_windows where id = NEW.schedule_window_id for update;
  if not found or w.is_open is not true then
    raise exception 'WINDOW_CLOSED: this delivery window is not open';
  end if;
  if now() >= w.cutoff_at then
    raise exception 'WINDOW_CLOSED: the cut-off for this delivery window has passed';
  end if;

  if w.max_orders is not null then
    select count(*) into v_taken
      from public.orders o
     where o.schedule_window_id = w.id and o.status <> 'cancelled';
    if v_taken >= w.max_orders then
      raise exception 'WINDOW_FULL: this delivery window is full';
    end if;
  end if;

  NEW.scheduled_at := w.starts_at;  -- authoritative, never the client's value
  return NEW;
end;
$function$;

revoke execute on function public.apply_schedule_window() from public, anon, authenticated;

drop trigger if exists trg_orders_apply_schedule_window on public.orders;
create trigger trg_orders_apply_schedule_window
  before insert on public.orders
  for each row execute function public.apply_schedule_window();
-- (fires before trg_orders_set_payment_required, alphabetical order)

-- Pay first ONLY for scheduled orders. Everything else uses the customer-chosen payment_timing.
create or replace function public.set_order_payment_required()
returns trigger
language plpgsql
set search_path to 'public'
as $function$
begin
  NEW.payment_required := (NEW.scheduled_at is not null);
  if NEW.payment_required then
    NEW.payment_timing := 'after_match';
  end if;
  return NEW;
end;
$function$;

-- Unpaid scheduled orders also lapse when their window's cut-off passes.
create or replace function public.expire_unpaid_orders()
returns integer
language plpgsql
security definer
set search_path to 'public'
as $function$
declare
  v_minutes integer;
  v_before  timestamptz;
  v_count   integer;
begin
  select (value ->> 'minutes')::integer into v_minutes
    from public.app_settings where key = 'unpaid_expiry_minutes';
  v_minutes := coalesce(v_minutes, 30);
  v_before  := case when v_minutes > 0 then now() - make_interval(mins => v_minutes) else '-infinity'::timestamptz end;

  with cancelled as (
    update public.orders o
       set status = 'cancelled',
           cancellation_reason = 'Payment not completed in time'
     where o.payment_required
       and o.status in ('pending', 'looking_for_driver')
       and o.rider_id is null
       and o.payment_status in ('unpaid', 'pending')
       and ( o.created_at < v_before
          or exists (select 1 from public.schedule_windows w
                      where w.id = o.schedule_window_id and now() >= w.cutoff_at) )
    returning 1
  )
  select count(*) into v_count from cancelled;

  return v_count;
end;
$function$;

-- What a vendor sees: windows coming up (next 3 days) and how many places are left.
-- Returns nothing unless ops has switched scheduling on for this vendor.
create or replace function public.open_schedule_windows()
returns table (
  id uuid, label text, starts_at timestamptz, duration_minutes integer,
  cutoff_at timestamptz, is_open boolean, spots_left integer
)
language sql
stable
security definer
set search_path to 'public', 'pg_temp'
as $function$
  select w.id, w.label, w.starts_at, w.duration_minutes, w.cutoff_at, w.is_open,
         case when w.max_orders is null then null
              else greatest(w.max_orders - (select count(*) from public.orders o
                                             where o.schedule_window_id = w.id and o.status <> 'cancelled'), 0)::integer
         end
    from public.schedule_windows w
   where w.starts_at > now()
     and w.starts_at < now() + interval '3 days'
     and exists (select 1 from public.vendors v where v.user_id = auth.uid() and v.scheduled_enabled)
   order by w.starts_at;
$function$;

revoke all on function public.open_schedule_windows() from public, anon;
grant execute on function public.open_schedule_windows() to authenticated;
