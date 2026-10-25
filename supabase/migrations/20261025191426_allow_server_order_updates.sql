create or replace function public.guard_order_update()
returns trigger language plpgsql security invoker set search_path = '' as $$
begin
  if not public.is_store_admin() and coalesce(auth.jwt()->>'role','') <> 'service_role' then
    if new.user_id is distinct from old.user_id
       or new.payment_status is distinct from old.payment_status
       or new.order_status is distinct from old.order_status
       or new.total_cents is distinct from old.total_cents
       or new.subtotal_cents is distinct from old.subtotal_cents
       or new.shipping_cents is distinct from old.shipping_cents
       or new.order_nsu is distinct from old.order_nsu then
      raise exception 'Sensitive order fields can only be changed by server/admin';
    end if;
  end if;
  new.updated_at=now();
  return new;
end;
$$;
revoke all on function public.guard_order_update() from public;