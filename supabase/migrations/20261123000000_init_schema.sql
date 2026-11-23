-- =============================================================================
-- Conserve — initial schema (Supabase / PostgreSQL)
--
-- Security model
--   * Supabase Auth (auth.users) owns identity. Every row is scoped to a user
--     and protected by Row Level Security.
--   * ZERO-KNOWLEDGE vault: game logins, passwords and notes are encrypted in
--     the browser (AES-256-GCM) with a key derived from the master password
--     (Argon2id). The database only ever stores ciphertext; a CHECK domain
--     rejects anything that doesn't look like ciphertext.
--   * Audit log is append-only from the client's point of view: rows are
--     written by triggers / SECURITY DEFINER functions, never by direct INSERT.
--   * Users with a verified MFA factor must present an aal2 session to touch
--     vault data.
--
-- Run with:  supabase db push   (or paste into Dashboard → SQL Editor)
-- =============================================================================


-- -----------------------------------------------------------------------------
-- 0. Private schema for internal helpers (NOT exposed through the Data API)
-- -----------------------------------------------------------------------------
create schema if not exists private;
revoke all on schema private from public, anon, authenticated;
-- RLS policies run as the caller, so `authenticated` needs USAGE to evaluate
-- the MFA helper below. EXECUTE is granted per-function, never wholesale.
grant usage on schema private to authenticated;


-- -----------------------------------------------------------------------------
-- 1. Types
-- -----------------------------------------------------------------------------
create type public.audit_category as enum ('access', 'account', 'security', 'device');

-- Encrypted payload format:  v<version>.<base64 IV>.<base64 ciphertext+tag>
-- Guards against the client ever writing a plaintext secret by mistake.
create domain public.ciphertext as text
  check (value ~ '^v[0-9]+\.[A-Za-z0-9+/_=-]{16,}\.[A-Za-z0-9+/_=-]{16,}$');


-- -----------------------------------------------------------------------------
-- 2. Tables
-- -----------------------------------------------------------------------------

-- 2.1 vault_keys — one row per user. Holds KDF parameters and the vault key
--     wrapped (encrypted) by the master-password key and by the recovery key.
--     The master password and recovery key themselves are NEVER stored.
create table public.vault_keys (
  user_id                     uuid primary key default auth.uid()
                              references auth.users (id) on delete cascade,
  kdf                         text not null default 'argon2id'
                              check (kdf in ('argon2id', 'pbkdf2-sha256')),
  kdf_iterations              integer not null check (kdf_iterations > 0),
  kdf_memory_kib              integer,
  kdf_parallelism             smallint check (kdf_parallelism between 1 and 16),
  kdf_salt                    text not null check (char_length(kdf_salt) between 16 and 128),
  wrapped_vault_key           public.ciphertext not null,
  recovery_wrapped_vault_key  public.ciphertext not null,
  key_version                 integer not null default 1 check (key_version > 0),
  created_at                  timestamptz not null default now(),
  updated_at                  timestamptz not null default now(),
  -- OWASP minimums: Argon2id >= 19 MiB memory; PBKDF2-SHA256 >= 600k iterations
  constraint vault_keys_kdf_strength check (
    -- explicit IS NOT NULL: a CHECK that evaluates to NULL would otherwise pass
    (kdf = 'argon2id'      and kdf_memory_kib is not null and kdf_memory_kib >= 19456
                           and kdf_parallelism is not null)
    or
    (kdf = 'pbkdf2-sha256' and kdf_iterations >= 600000)
  )
);

-- 2.2 game_accounts — maps to `GameAccount`. game/monogram/nickname stay in
--     plaintext so the sidebar can group/filter; secrets are ciphertext.
create table public.game_accounts (
  id                   uuid primary key default gen_random_uuid(),
  user_id              uuid not null default auth.uid()
                       references public.vault_keys (user_id) on delete cascade,
  game                 text not null check (char_length(btrim(game)) between 1 and 80),
  monogram             text not null check (char_length(monogram) between 1 and 4),
  nickname             text not null default '' check (char_length(nickname) <= 80),
  login_encrypted      public.ciphertext not null,
  password_encrypted   public.ciphertext not null,
  notes_encrypted      public.ciphertext,
  two_factor           boolean not null default false,
  password_updated_at  timestamptz not null default now(),  -- drives the "OLD" (>90d) health check
  created_at           timestamptz not null default now(),
  updated_at           timestamptz not null default now()
);
create index game_accounts_user_game_idx on public.game_accounts (user_id, game);

-- 2.3 security_settings — maps to `SecuritySettings`. Created automatically
--     for every new auth user (see trigger in section 4).
create table public.security_settings (
  user_id             uuid primary key references auth.users (id) on delete cascade,
  reenter_to_reveal   boolean  not null default true,
  clear_clipboard     boolean  not null default true,
  lock_on_tab_close   boolean  not null default true,
  two_step_login      boolean  not null default false,  -- mirror of Supabase Auth MFA enrolment
  email_new_sign_ins  boolean  not null default true,
  auto_lock_minutes   smallint not null default 15 check (auto_lock_minutes in (1, 5, 15, 60)),
  updated_at          timestamptz not null default now()
);

-- 2.4 user_devices — maps to `SignedInDevice`. One row per Supabase Auth
--     session; `isCurrent` is computed client-side by comparing session_id
--     with the `session_id` claim in the current JWT.
create table public.user_devices (
  id              uuid primary key default gen_random_uuid(),
  user_id         uuid not null default auth.uid()
                  references auth.users (id) on delete cascade,
  session_id      uuid unique default (nullif(auth.jwt() ->> 'session_id', '')::uuid),
  name            text not null check (char_length(name) between 1 and 100),
  location        text check (char_length(location) <= 100),
  user_agent      text check (char_length(user_agent) <= 512),
  last_active_at  timestamptz not null default now(),
  created_at      timestamptz not null default now()
);
create index user_devices_user_active_idx on public.user_devices (user_id, last_active_at desc);

-- 2.5 audit_logs — maps to `AuditLogEntry`. `timestampLabel` is derived in
--     the UI from created_at, so it is not stored.
create table public.audit_logs (
  id          bigint generated always as identity primary key,
  user_id     uuid not null references auth.users (id) on delete cascade,
  account_id  uuid references public.game_accounts (id) on delete set null,
  category    public.audit_category not null,
  action      text not null check (char_length(action) between 1 and 80),
  target      text check (char_length(target) <= 200),
  device      text check (char_length(device) <= 100),
  location    text check (char_length(location) <= 100),
  ip_address  inet,
  session_id  uuid,
  created_at  timestamptz not null default now()
);
create index audit_logs_user_created_idx on public.audit_logs (user_id, created_at desc);
create index audit_logs_account_idx      on public.audit_logs (account_id);


-- -----------------------------------------------------------------------------
-- 3. Internal helper functions (private schema)
-- -----------------------------------------------------------------------------

-- 3.1 updated_at maintenance
create or replace function private.set_updated_at()
returns trigger
language plpgsql
set search_path = ''
as $$
begin
  new.updated_at := now();
  return new;
end;
$$;

-- 3.2 game_accounts: keep password_updated_at honest
create or replace function private.game_accounts_before_update()
returns trigger
language plpgsql
set search_path = ''
as $$
begin
  new.created_at := old.created_at;
  if new.password_encrypted is distinct from old.password_encrypted then
    new.password_updated_at := now();
  else
    new.password_updated_at := old.password_updated_at;
  end if;
  return new;
end;
$$;

-- 3.3 Client IP from the PostgREST request headers (first X-Forwarded-For hop)
create or replace function private.request_ip()
returns inet
language plpgsql
stable
set search_path = ''
as $$
declare
  v_ip text;
begin
  v_ip := btrim(split_part(
            coalesce(current_setting('request.headers', true)::json ->> 'x-forwarded-for', ''),
            ',', 1));
  return nullif(v_ip, '')::inet;
exception when others then
  return null;
end;
$$;

-- 3.4 Single writer for audit rows
create or replace function private.write_audit(
  p_user_id    uuid,
  p_category   public.audit_category,
  p_action     text,
  p_target     text default null,
  p_account_id uuid default null
)
returns void
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_session  uuid := nullif(auth.jwt() ->> 'session_id', '')::uuid;
  v_device   text;
  v_location text;
begin
  select d.name, d.location
    into v_device, v_location
    from public.user_devices d
   where d.session_id = v_session
     and d.user_id = p_user_id;

  insert into public.audit_logs
    (user_id, account_id, category, action, target, device, location, ip_address, session_id)
  values
    (p_user_id, p_account_id, p_category, left(p_action, 80), left(p_target, 200),
     coalesce(v_device, 'Unknown device'), v_location, private.request_ip(), v_session);
end;
$$;

-- 3.5 Automatic account audit trail
create or replace function private.audit_game_account()
returns trigger
language plpgsql
security definer
set search_path = ''
as $$
begin
  if tg_op = 'INSERT' then
    perform private.write_audit(new.user_id, 'account', 'Account added',
                                new.game || ' — ' || new.nickname, new.id);
    return new;

  elsif tg_op = 'UPDATE' then
    perform private.write_audit(
      new.user_id, 'account',
      case when new.password_encrypted is distinct from old.password_encrypted
           then 'Password changed' else 'Account edited' end,
      new.game || ' — ' || new.nickname, new.id);
    return new;

  else -- DELETE
    -- Skip when the delete is a cascade (e.g. the whole user is being removed),
    -- otherwise the new audit row would violate its FK to auth.users.
    if pg_trigger_depth() > 1 then
      return old;
    end if;
    perform private.write_audit(old.user_id, 'account', 'Account deleted',
                                old.game || ' — ' || old.nickname, null);
    return old;
  end if;
end;
$$;

-- 3.6 Master password / recovery key changes are security events
create or replace function private.audit_vault_keys()
returns trigger
language plpgsql
security definer
set search_path = ''
as $$
begin
  if tg_op = 'INSERT' then
    perform private.write_audit(new.user_id, 'security', 'Vault created');
  else
    if new.wrapped_vault_key is distinct from old.wrapped_vault_key then
      perform private.write_audit(new.user_id, 'security', 'Master password changed');
    end if;
    if new.recovery_wrapped_vault_key is distinct from old.recovery_wrapped_vault_key then
      perform private.write_audit(new.user_id, 'security', 'Recovery key regenerated');
    end if;
  end if;
  return new;
end;
$$;

-- 3.7 Bootstrap per-user rows on sign-up
create or replace function private.handle_new_user()
returns trigger
language plpgsql
security definer
set search_path = ''
as $$
begin
  insert into public.security_settings (user_id)
  values (new.id)
  on conflict (user_id) do nothing;
  return new;
end;
$$;

-- 3.8 MFA gate: users with a verified factor must be at aal2
create or replace function private.mfa_satisfied()
returns boolean
language sql
stable
security definer
set search_path = ''
as $$
  select coalesce(auth.jwt() ->> 'aal', 'aal1') = 'aal2'
      or not exists (
           select 1
             from auth.mfa_factors f
            where f.user_id = auth.uid()
              and f.status = 'verified'
         );
$$;


-- -----------------------------------------------------------------------------
-- 4. Triggers
-- -----------------------------------------------------------------------------
create trigger vault_keys_set_updated_at
  before update on public.vault_keys
  for each row execute function private.set_updated_at();

create trigger security_settings_set_updated_at
  before update on public.security_settings
  for each row execute function private.set_updated_at();

create trigger game_accounts_set_updated_at
  before update on public.game_accounts
  for each row execute function private.set_updated_at();

create trigger game_accounts_protect_columns
  before update on public.game_accounts
  for each row execute function private.game_accounts_before_update();

create trigger game_accounts_audit
  after insert or update or delete on public.game_accounts
  for each row execute function private.audit_game_account();

create trigger vault_keys_audit
  after insert or update on public.vault_keys
  for each row execute function private.audit_vault_keys();

create trigger on_auth_user_created
  after insert on auth.users
  for each row execute function private.handle_new_user();


-- -----------------------------------------------------------------------------
-- 5. Public RPC functions (callable via supabase.rpc)
-- -----------------------------------------------------------------------------

-- 5.1 Client-side events: "Vault unlocked", "Password revealed", "Vault exported"…
--     Account events are trigger-generated only, so they can't be forged.
create or replace function public.log_event(
  p_category public.audit_category,
  p_action   text,
  p_target   text default null
)
returns void
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_uid uuid := auth.uid();
begin
  if v_uid is null then
    raise exception 'Not authenticated' using errcode = '42501';
  end if;
  if p_category = 'account' then
    raise exception 'Account events are recorded automatically' using errcode = '42501';
  end if;
  if p_action is null or char_length(btrim(p_action)) = 0 then
    raise exception 'action is required' using errcode = '22023';
  end if;

  perform private.write_audit(v_uid, p_category, btrim(p_action), p_target, null);
end;
$$;

-- 5.2 Sign out one other device (revokes its Supabase Auth session / refresh token)
create or replace function public.revoke_device(p_device_id uuid)
returns void
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_uid     uuid := auth.uid();
  v_current uuid := nullif(auth.jwt() ->> 'session_id', '')::uuid;
  v_session uuid;
  v_name    text;
begin
  if v_uid is null then
    raise exception 'Not authenticated' using errcode = '42501';
  end if;

  select d.session_id, d.name
    into v_session, v_name
    from public.user_devices d
   where d.id = p_device_id
     and d.user_id = v_uid;

  if not found then
    raise exception 'Device not found' using errcode = 'P0002';
  end if;
  if v_session is not distinct from v_current then
    raise exception 'Use sign out for the current device' using errcode = '22023';
  end if;

  delete from public.user_devices where id = p_device_id and user_id = v_uid;
  if v_session is not null then
    delete from auth.sessions where id = v_session and user_id = v_uid;
  end if;

  perform private.write_audit(v_uid, 'device', 'Device signed out', v_name);
end;
$$;

-- 5.3 Sign out every device except the current one
create or replace function public.revoke_other_devices()
returns integer
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_uid     uuid := auth.uid();
  v_current uuid := nullif(auth.jwt() ->> 'session_id', '')::uuid;
  v_count   integer;
begin
  if v_uid is null or v_current is null then
    raise exception 'Not authenticated' using errcode = '42501';
  end if;

  delete from public.user_devices
   where user_id = v_uid
     and session_id is distinct from v_current;
  get diagnostics v_count = row_count;

  delete from auth.sessions
   where user_id = v_uid
     and id <> v_current;

  perform private.write_audit(v_uid, 'device', 'Signed out other devices',
                              v_count || ' sessions ended');
  return v_count;
end;
$$;


-- -----------------------------------------------------------------------------
-- 6. Function privileges (functions default to EXECUTE for PUBLIC)
-- -----------------------------------------------------------------------------
revoke all on all functions in schema private from public, anon, authenticated;
grant execute on function private.mfa_satisfied() to authenticated;

revoke all on function public.log_event(public.audit_category, text, text) from public, anon;
revoke all on function public.revoke_device(uuid)                          from public, anon;
revoke all on function public.revoke_other_devices()                       from public, anon;
grant execute on function public.log_event(public.audit_category, text, text) to authenticated;
grant execute on function public.revoke_device(uuid)                          to authenticated;
grant execute on function public.revoke_other_devices()                       to authenticated;


-- -----------------------------------------------------------------------------
-- 7. Table privileges — least privilege, anon gets nothing
--    (explicit grants also cover projects where new tables aren't
--    auto-exposed to the Data API)
-- -----------------------------------------------------------------------------
revoke all on public.vault_keys, public.game_accounts, public.security_settings,
              public.user_devices, public.audit_logs
  from anon, authenticated;

grant select, insert on public.vault_keys to authenticated;
grant update (kdf, kdf_iterations, kdf_memory_kib, kdf_parallelism, kdf_salt,
              wrapped_vault_key, recovery_wrapped_vault_key, key_version)
  on public.vault_keys to authenticated;
-- no DELETE: wiping the vault key would orphan every encrypted item

grant select, insert, delete on public.game_accounts to authenticated;
grant update (game, monogram, nickname, login_encrypted, password_encrypted,
              notes_encrypted, two_factor)
  on public.game_accounts to authenticated;

grant select, insert on public.security_settings to authenticated;
grant update (reenter_to_reveal, clear_clipboard, lock_on_tab_close, two_step_login,
              email_new_sign_ins, auto_lock_minutes)
  on public.security_settings to authenticated;

grant select, insert on public.user_devices to authenticated;
grant update (name, location, user_agent, last_active_at)
  on public.user_devices to authenticated;
-- no DELETE: use public.revoke_device() so the auth session is revoked too

grant select on public.audit_logs to authenticated;
-- no INSERT/UPDATE/DELETE: append-only via triggers and public.log_event()


-- -----------------------------------------------------------------------------
-- 8. Row Level Security
--    `(select auth.uid())` is wrapped so Postgres evaluates it once per query.
-- -----------------------------------------------------------------------------
alter table public.vault_keys        enable row level security;
alter table public.game_accounts     enable row level security;
alter table public.security_settings enable row level security;
alter table public.user_devices      enable row level security;
alter table public.audit_logs        enable row level security;

-- vault_keys
create policy "vault_keys: owner can read"
  on public.vault_keys for select to authenticated
  using ((select auth.uid()) = user_id);

create policy "vault_keys: owner can create"
  on public.vault_keys for insert to authenticated
  with check ((select auth.uid()) = user_id);

create policy "vault_keys: owner can update"
  on public.vault_keys for update to authenticated
  using ((select auth.uid()) = user_id)
  with check ((select auth.uid()) = user_id);

create policy "vault_keys: require MFA when enrolled"
  on public.vault_keys as restrictive for all to authenticated
  using ((select private.mfa_satisfied()))
  with check ((select private.mfa_satisfied()));

-- game_accounts
create policy "game_accounts: owner can read"
  on public.game_accounts for select to authenticated
  using ((select auth.uid()) = user_id);

create policy "game_accounts: owner can create"
  on public.game_accounts for insert to authenticated
  with check ((select auth.uid()) = user_id);

create policy "game_accounts: owner can update"
  on public.game_accounts for update to authenticated
  using ((select auth.uid()) = user_id)
  with check ((select auth.uid()) = user_id);

create policy "game_accounts: owner can delete"
  on public.game_accounts for delete to authenticated
  using ((select auth.uid()) = user_id);

create policy "game_accounts: require MFA when enrolled"
  on public.game_accounts as restrictive for all to authenticated
  using ((select private.mfa_satisfied()))
  with check ((select private.mfa_satisfied()));

-- security_settings
create policy "security_settings: owner can read"
  on public.security_settings for select to authenticated
  using ((select auth.uid()) = user_id);

create policy "security_settings: owner can create"
  on public.security_settings for insert to authenticated
  with check ((select auth.uid()) = user_id);

create policy "security_settings: owner can update"
  on public.security_settings for update to authenticated
  using ((select auth.uid()) = user_id)
  with check ((select auth.uid()) = user_id);

-- user_devices
create policy "user_devices: owner can read"
  on public.user_devices for select to authenticated
  using ((select auth.uid()) = user_id);

create policy "user_devices: register current session only"
  on public.user_devices for insert to authenticated
  with check (
    (select auth.uid()) = user_id
    and session_id = (select nullif(auth.jwt() ->> 'session_id', '')::uuid)
  );

create policy "user_devices: owner can update"
  on public.user_devices for update to authenticated
  using ((select auth.uid()) = user_id)
  with check ((select auth.uid()) = user_id);

-- audit_logs (read-only for clients)
create policy "audit_logs: owner can read"
  on public.audit_logs for select to authenticated
  using ((select auth.uid()) = user_id);
