create or replace function public.refresh_public_order_count()
returns trigger language plpgsql security definer set search_path = '' as $$
declare total_orders bigint;
begin
  select count(*) into total_orders from public.orders;
  insert into public.store_settings(key,value,updated_at)
  values ('public_order_count',jsonb_build_object('count',total_orders),now())
  on conflict(key) do update set value=excluded.value,updated_at=now();
  return null;
end;
$$;
revoke all on function public.refresh_public_order_count() from public, anon, authenticated;