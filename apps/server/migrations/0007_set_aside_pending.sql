-- A set-aside row is created before its fundEscrow is sent; 'pending' marks that window
-- (it used to be stored as 'failed', which the dashboard showed as an error mid-demo).
alter table set_asides drop constraint if exists set_asides_status_check;
alter table set_asides add constraint set_asides_status_check check (status in ('pending', 'funded', 'failed'));
