-- 1. Lead views bypassed the service-role-only RLS on public.leads and were readable by anon.
ALTER VIEW public.leads_pipeline   SET (security_invoker = true);
ALTER VIEW public.leads_to_contact SET (security_invoker = true);
REVOKE ALL ON public.leads_pipeline   FROM PUBLIC, anon, authenticated;
REVOKE ALL ON public.leads_to_contact FROM PUBLIC, anon, authenticated;

-- 2. Pin search_path on functions flagged as mutable.
ALTER FUNCTION public.expand_order_radius(uuid)               SET search_path = public, extensions, pg_temp;
ALTER FUNCTION public.get_nearby_online_riders(uuid)          SET search_path = public, extensions, pg_temp;
ALTER FUNCTION public.resolve_withdrawal(uuid, boolean, text) SET search_path = public, extensions, pg_temp;
ALTER FUNCTION public.accept_order_direct(uuid)               SET search_path = public, extensions, pg_temp;
ALTER FUNCTION public.request_withdrawal(numeric)             SET search_path = public, extensions, pg_temp;

-- 3. Trigger-only functions never need to be callable through the REST API.
REVOKE EXECUTE ON FUNCTION public.handle_new_user()      FROM PUBLIC, anon, authenticated;
REVOKE EXECUTE ON FUNCTION public.notify_order_matched() FROM PUBLIC, anon, authenticated;

-- 4. Unauthenticated callers must not write learned locations.
REVOKE EXECUTE ON FUNCTION public.upsert_learned_location(text, double precision, double precision, text, text) FROM PUBLIC, anon;
