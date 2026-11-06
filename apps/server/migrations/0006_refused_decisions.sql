-- "Try to break it" (#9) records the contract's refusals as their own decision kind.
alter table decisions drop constraint if exists decisions_action_check;
alter table decisions add constraint decisions_action_check check (action in ('pay', 'wait', 'ask_user', 'refused'));
