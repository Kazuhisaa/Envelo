alter table set_asides
  add column if not exists outer_tx_hash text,
  add column if not exists inner_tx_hash text,
  add column if not exists actual_fee_stroops bigint,
  add column if not exists gas_request_id text;
