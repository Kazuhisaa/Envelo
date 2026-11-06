create table invoices (
  id bigserial primary key,
  payment_intent_id text not null unique,
  client_name text not null,
  description text not null,
  amount_stroops bigint not null,
  checkout_url text not null,
  status text not null default 'created',
  created_at timestamptz not null default now()
);

-- One row per verified Velo payment.succeeded. Unique event id and intent id make replays no-ops.
create table client_payments (
  id bigserial primary key,
  event_id text not null unique,
  payment_intent_id text not null unique,
  invoice_id bigint references invoices (id),
  amount_stroops bigint not null,
  asset text not null,
  tx_hash text,
  received_at timestamptz not null default now(),
  period text not null
);
