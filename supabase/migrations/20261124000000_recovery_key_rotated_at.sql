-- =============================================================================
-- Track when the recovery key was last rotated (shown in the Security center).
-- Maintained server-side; clients cannot write it (not in the UPDATE grant).
-- =============================================================================

alter table public.vault_keys
  add column recovery_key_rotated_at timestamptz not null default now();

create or replace function private.vault_keys_before_update()
returns trigger
language plpgsql
set search_path = ''
as $$
begin
  new.created_at := old.created_at;
  if new.recovery_wrapped_vault_key is distinct from old.recovery_wrapped_vault_key then
    new.recovery_key_rotated_at := now();
  else
    new.recovery_key_rotated_at := old.recovery_key_rotated_at;
  end if;
  return new;
end;
$$;

revoke all on function private.vault_keys_before_update() from public, anon, authenticated;

create trigger vault_keys_protect_columns
  before update on public.vault_keys
  for each row execute function private.vault_keys_before_update();
