-- One row per (client payment, agency). A failed row is retried in place; a funded row is final.
create table set_asides (
  id bigserial primary key,
  client_payment_id bigint not null references client_payments (id),
  agency text not null,
  period text not null,
  php_centavos integer not null,
  stroops bigint not null,
  status text not null check (status in ('funded', 'failed')),
  tx_hash text,
  reason text not null,
  error text,
  created_at timestamptz not null default now(),
  unique (client_payment_id, agency)
);
