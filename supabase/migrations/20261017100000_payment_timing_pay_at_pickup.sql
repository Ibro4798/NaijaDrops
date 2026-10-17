-- Two payment modes chosen per order:
--   after_match : pay once a price is agreed with the rider
--   at_pickup   : rider heads to pickup first; customer pays on arrival; rider only sets off once paid
alter table public.orders
  add column if not exists payment_timing text not null default 'after_match',
  add column if not exists pickup_arrived_at timestamptz;

do $$
begin
  if not exists (select 1 from pg_constraint where conname = 'orders_payment_timing_check') then
    alter table public.orders
      add constraint orders_payment_timing_check check (payment_timing in ('after_match', 'at_pickup'));
  end if;
end $$;

create or replace function public.guard_order_payment_timing()
returns trigger language plpgsql set search_path to 'public', 'pg_temp'
as $function$
declare v_privileged boolean;
begin
  v_privileged := coalesce(auth.role(), '') not in ('anon', 'authenticated') or coalesce(public.is_admin(), false);
  if not v_privileged then
    NEW.payment_timing := OLD.payment_timing;
    if NEW.pickup_arrived_at is distinct from OLD.pickup_arrived_at then
      if OLD.pickup_arrived_at is not null
         or auth.uid() is distinct from NEW.rider_user_id
         or NEW.status is distinct from 'matched' then
        NEW.pickup_arrived_at := OLD.pickup_arrived_at;
      end if;
    end if;
    if NEW.status is distinct from OLD.status
       and NEW.status in ('picked_up', 'in_transit', 'delivered', 'completed')
       and NEW.payment_status is distinct from 'paid' then
      raise exception 'ORDER_NOT_PAID: this order must be paid before it can move on';
    end if;
  end if;
  return NEW;
end;
$function$;

drop trigger if exists trg_orders_guard_payment_timing on public.orders;
create trigger trg_orders_guard_payment_timing
  before update on public.orders
  for each row execute function public.guard_order_payment_timing();
revoke execute on function public.guard_order_payment_timing() from public, anon, authenticated;

create or replace function public.notify_order_matched()
returns trigger language plpgsql security definer set search_path to 'public'
as $function$
begin
  if new.status = 'matched' and (old.status is distinct from 'matched') then
    insert into public.messages (order_id, sender_id, sender_role, channel, type, text)
    values (new.id, null, 'system', 'vendor_rider', 'system_ephemeral',
      case when new.payment_timing = 'at_pickup'
        then 'Rider matched. They are heading to pickup now. You will be asked to pay when they arrive, and they set off with the package once payment is confirmed.'
        else 'Rider matched. They will proceed to pickup as soon as payment is confirmed.' end);
  end if;
  if new.status = 'matched' and new.payment_timing = 'at_pickup'
     and new.pickup_arrived_at is not null and old.pickup_arrived_at is null
     and new.payment_status is distinct from 'paid' then
    insert into public.messages (order_id, sender_id, sender_role, channel, type, text)
    values (new.id, null, 'system', 'vendor_rider', 'system_ephemeral',
      'Your rider has arrived at pickup. Please pay now so they can set off with your package.');
  end if;
  return new;
end;
$function$;
revoke execute on function public.notify_order_matched() from public, anon, authenticated;
