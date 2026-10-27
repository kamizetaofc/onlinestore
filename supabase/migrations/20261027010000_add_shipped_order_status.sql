alter table public.orders
  drop constraint if exists orders_order_status_check;

alter table public.orders
  add constraint orders_order_status_check
  check (
    order_status = any (
      array[
        'created',
        'awaiting_payment',
        'paid_pending_seller',
        'in_progress',
        'shipped',
        'completed',
        'cancelled',
        'refunded'
      ]::text[]
    )
  );
