-- =============================================================================
-- Extend the MFA gate beyond vault_keys / game_accounts.
--
-- Before: a session at aal1 (master password known, authenticator code not)
-- could still read devices and the audit log, change security settings, and
-- call revoke_device / revoke_other_devices to sign the real owner out.
-- After: once a user has a verified factor, every table and RPC requires aal2.
-- =============================================================================

create policy "security_settings: require MFA when enrolled"
  on public.security_settings as restrictive for all to authenticated
  using ((select private.mfa_satisfied()))
  with check ((select private.mfa_satisfied()));

create policy "user_devices: require MFA when enrolled"
  on public.user_devices as restrictive for all to authenticated
  using ((select private.mfa_satisfied()))
  with check ((select private.mfa_satisfied()));

create policy "audit_logs: require MFA when enrolled"
  on public.audit_logs as restrictive for all to authenticated
  using ((select private.mfa_satisfied()));


-- RPCs are SECURITY DEFINER and bypass RLS, so they check explicitly.

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
  if not private.mfa_satisfied() then
    raise exception 'Two-step verification required' using errcode = '42501';
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
  if not private.mfa_satisfied() then
    raise exception 'Two-step verification required' using errcode = '42501';
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
  if not private.mfa_satisfied() then
    raise exception 'Two-step verification required' using errcode = '42501';
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
