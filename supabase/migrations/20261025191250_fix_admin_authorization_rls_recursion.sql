create or replace function public.is_store_admin()
returns boolean language sql stable security invoker set search_path = '' as $$
  select coalesce((auth.jwt()->'app_metadata'->>'role') = 'admin', false);
$$;
revoke all on function public.is_store_admin() from public;
grant execute on function public.is_store_admin() to anon, authenticated, service_role;