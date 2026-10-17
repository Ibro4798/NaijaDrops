-- Account deletion: anonymise in place (orders / payouts must stay for accounting).
-- Called only by /api/account/delete using the service role.
create or replace function public.anonymize_account(p_user_id uuid)
returns jsonb
language plpgsql
security definer
set search_path = public, pg_temp
as $$
declare
  v_role text; v_vendor_id uuid; v_rider_id uuid;
  v_active int; v_pending_payout int; v_has_records boolean; v_docs text[];
begin
  select role into v_role from public.users where id = p_user_id;
  if not found then
    return jsonb_build_object('status', 'no_profile', 'has_records', false, 'doc_paths', '[]'::jsonb);
  end if;

  if v_role in ('admin', 'super_admin') or exists (select 1 from public.admin_users where id = p_user_id) then
    raise exception 'ADMIN_ACCOUNT' using errcode = 'P0001';
  end if;

  select id into v_vendor_id from public.vendors where user_id = p_user_id;
  select id into v_rider_id  from public.riders  where user_id = p_user_id;

  select count(*) into v_active
  from public.orders o
  where o.status not in ('delivered', 'cancelled')
    and ( (v_vendor_id is not null and o.vendor_id = v_vendor_id)
       or (v_rider_id  is not null and o.rider_id  = v_rider_id)
       or o.rider_user_id = p_user_id );
  if v_active > 0 then raise exception 'ACTIVE_ORDERS' using errcode = 'P0001'; end if;

  select count(*) into v_pending_payout
  from public.wallet_transactions w
  where w.rider_id = p_user_id and w.status in ('requested', 'pending');
  if v_pending_payout > 0 then raise exception 'PENDING_PAYOUT' using errcode = 'P0001'; end if;

  v_has_records :=
       exists (select 1 from public.orders o
               where (v_vendor_id is not null and o.vendor_id = v_vendor_id)
                  or (v_rider_id  is not null and o.rider_id  = v_rider_id)
                  or o.rider_user_id = p_user_id)
    or exists (select 1 from public.wallet_transactions where rider_id = p_user_id)
    or exists (select 1 from public.bids where rider_id = p_user_id);

  if v_rider_id is not null then
    select array_remove(array[id_card_url, license_url, vehicle_photo_url, profile_photo_url], null)
      into v_docs from public.riders where id = v_rider_id;
  end if;
  if v_vendor_id is not null then
    v_docs := coalesce(v_docs, '{}') || array_remove(array[(select logo_url from public.vendors where id = v_vendor_id)], null);
  end if;

  delete from public.push_subscriptions where user_id = p_user_id;
  if v_rider_id is not null then delete from public.rider_locations where rider_id = v_rider_id; end if;

  update public.messages set text = '[deleted]' where sender_id = p_user_id and text is not null;
  update public.reviews  set feedback = null    where user_id = p_user_id;

  if v_vendor_id is not null then
    update public.vendors set business_name = 'Deleted account', logo_url = null, scheduled_enabled = false where id = v_vendor_id;
  end if;

  if v_rider_id is not null then
    update public.riders
       set full_name = 'Deleted rider', phone = null, plate_number = null,
           profile_photo_url = null, id_card_url = null, license_url = null, vehicle_photo_url = null,
           bank_name = null, account_number = null, account_name = null,
           current_lat = null, current_lng = null, rejection_reason = null,
           approved = false, status = 'paused', operational_status = 'offline'
     where id = v_rider_id;
  end if;

  update public.users
     set name = 'Deleted user', full_name = 'Deleted user', receipt_display_name = null,
         email = null, phone = null, avatar_url = null, is_active = false
   where id = p_user_id;

  return jsonb_build_object('status', 'anonymized', 'has_records', v_has_records,
                            'doc_paths', to_jsonb(coalesce(v_docs, '{}'::text[])));
end;
$$;

revoke all on function public.anonymize_account(uuid) from public, anon, authenticated;
grant execute on function public.anonymize_account(uuid) to service_role;
