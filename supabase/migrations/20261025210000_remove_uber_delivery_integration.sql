-- Desativa a integração Uber e remove seus campos/tabela; preserva frete fixo e InfinitePay.
alter table public.orders
  drop constraint if exists orders_delivery_quote_status_check;
alter table public.orders
  add constraint orders_delivery_quote_status_check
  check (delivery_quote_status in ('not_requested','quoted','unavailable','expired','failed','fixed'));

drop table if exists public.delivery_estimates;

alter table public.orders
  drop column if exists delivery_provider,
  drop column if exists delivery_estimate_id,
  drop column if exists delivery_estimate_expires_at,
  drop column if exists delivery_estimate_payload,
  drop column if exists uber_delivery_code;
