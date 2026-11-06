-- The agency's claim now runs after the remittance is recorded, so its hash arrives a few seconds later.
alter table remittances alter column claim_tx_hash drop not null;
