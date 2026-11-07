create table auth_sessions (
  id bigserial primary key,
  token_hash text not null unique,
  created_at timestamptz not null default now(),
  expires_at timestamptz not null,
  last_seen_at timestamptz not null default now(),
  user_agent text,
  revoked_at timestamptz
);

create index auth_sessions_active_expiry_idx
  on auth_sessions (expires_at)
  where revoked_at is null;

create table auth_login_attempts (
  key_hash text primary key,
  failures integer not null default 0,
  window_started_at timestamptz not null default now(),
  blocked_until timestamptz
);
