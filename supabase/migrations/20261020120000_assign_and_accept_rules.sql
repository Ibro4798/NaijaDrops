-- Offers come from two places that work TOGETHER: the automatic broadcast to nearby online riders and a manual
-- assignment by ops. Both just add a row here; whoever accepts first wins, nothing is locked.
alter table public.order_broadcasts add column if not exists source text not null default 'auto';
do $$
begin
  if not exists (select 1 from pg_constraint where conname = 'order_broadcasts_source_check') then
    alter table public.order_broadcasts add constraint order_broadcasts_source_check check (source in ('auto', 'admin'));
  end if;
end $$;

-- A rider may only accept a job that (a) they are approved to do and (b) was offered to them.
create or replace function public.accept_order_direct(p_order_id uuid)
returns void
language plpgsql
security definer
set search_path to 'public', 'extensions', 'pg_temp'
as $function$
declare v_rider_row_id uuid; v_updated int;
begin
  select id into v_rider_row_id from public.riders
   where user_id = auth.uid() and status::text = 'approved' and approved is true;
  if v_rider_row_id is null then raise exception 'Only approved riders can accept jobs'; end if;

  if not exists (select 1 from public.order_broadcasts b where b.order_id = p_order_id and b.rider_id = v_rider_row_id) then
    raise exception 'This job was not offered to you';
  end if;

  update public.orders set rider_id = v_rider_row_id, status = 'matched'
   where id = p_order_id and status in ('pending', 'looking_for_driver') and rider_id is null;
  get diagnostics v_updated = row_count;
  if v_updated = 0 then raise exception 'Order no longer available'; end if;

  update public.riders set operational_status = 'busy' where id = v_rider_row_id;
end;
$function$;
