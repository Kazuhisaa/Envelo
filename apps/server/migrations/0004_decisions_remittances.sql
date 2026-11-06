create table decisions (
  id bigserial primary key,
  agency text not null,
  period text not null,
  action text not null check (action in ('pay', 'wait', 'ask_user')),
  amount_stroops bigint not null default 0,
  reason text not null,
  facts_snapshot jsonb not null,
  model text not null,
  created_at timestamptz not null default now()
);

create table remittances (
  id bigserial primary key,
  agency text not null,
  period text not null,
  amount_stroops bigint not null,
  authorize_tx_hash text not null,
  claim_tx_hash text not null,
  nonce text not null,
  decision_id bigint references decisions (id),
  created_at timestamptz not null default now(),
  unique (agency, period)
);
