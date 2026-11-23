import type { AuthError } from "@supabase/supabase-js";
import { getSupabase } from "./supabase/client";
import {
  KDF_ITERATIONS,
  KDF_NAME,
  decryptString,
  deriveAuthPassword,
  deriveKek,
  encryptString,
  generateRecoveryKey,
  generateVaultKey,
  normalizeEmail,
  normalizeRecoveryKey,
  randomBytes,
  toBase64,
  unwrapVaultKey,
  wrapVaultKey,
} from "./crypto";
import { formatLogTimestamp, formatRelativeTime } from "./vaultUtils";
import {
  AuditCategory,
  AuditLogEntry,
  GameAccount,
  SecuritySettings,
  SignedInDevice,
} from "../types/vault";

// -----------------------------------------------------------------------------
// Row shapes (mirror supabase/migrations/20261123000000_init_schema.sql)
// -----------------------------------------------------------------------------

export interface VaultKeysRow {
  user_id: string;
  kdf: string;
  kdf_iterations: number;
  kdf_salt: string;
  wrapped_vault_key: string;
  recovery_wrapped_vault_key: string;
  key_version: number;
  recovery_key_rotated_at: string;
}

interface GameAccountRow {
  id: string;
  game: string;
  monogram: string;
  nickname: string;
  login_encrypted: string;
  password_encrypted: string;
  notes_encrypted: string | null;
  two_factor: boolean;
  password_updated_at: string;
}

interface SecuritySettingsRow {
  reenter_to_reveal: boolean;
  clear_clipboard: boolean;
  lock_on_tab_close: boolean;
  two_step_login: boolean;
  email_new_sign_ins: boolean;
  auto_lock_minutes: SecuritySettings["autoLockMinutes"];
}

interface DeviceRow {
  id: string;
  session_id: string | null;
  name: string;
  location: string | null;
  last_active_at: string;
}

interface AuditLogRow {
  id: number;
  category: AuditCategory;
  action: string;
  target: string | null;
  device: string | null;
  location: string | null;
  created_at: string;
}

const VAULT_KEY_COLUMNS =
  "user_id, kdf, kdf_iterations, kdf_salt, wrapped_vault_key, recovery_wrapped_vault_key, key_version, recovery_key_rotated_at";
const ACCOUNT_COLUMNS =
  "id, game, monogram, nickname, login_encrypted, password_encrypted, notes_encrypted, two_factor, password_updated_at";
const SETTINGS_COLUMNS =
  "reenter_to_reveal, clear_clipboard, lock_on_tab_close, two_step_login, email_new_sign_ins, auto_lock_minutes";

// -----------------------------------------------------------------------------
// Errors
// -----------------------------------------------------------------------------

/**
 * - `credentials` / `mfa`: wrong secret — counts toward the sign-in lockout
 * - `reauth`: Supabase wants an emailed nonce before changing the password
 */
export type VaultErrorKind = "credentials" | "mfa" | "reauth" | "other";

export class VaultError extends Error {
  constructor(message: string, readonly kind: VaultErrorKind = "other") {
    super(message);
    this.name = "VaultError";
  }
}

function dbError(context: string, error: { message: string }): VaultError {
  return new VaultError(`${context}: ${error.message}`);
}

function authError(error: AuthError): VaultError {
  switch (error.code) {
    case "invalid_credentials":
      return new VaultError("Incorrect email or master password", "credentials");
    case "email_not_confirmed":
      return new VaultError("Confirm your email first — check your inbox for the link.");
    case "otp_expired":
    case "reauthentication_not_valid":
      return new VaultError("That code is invalid or has expired", "credentials");
    case "mfa_verification_failed":
    case "mfa_challenge_expired":
      return new VaultError("Incorrect authenticator code", "mfa");
    case "reauthentication_needed":
    case "reauth_nonce_missing":
      return new VaultError("Confirm it's you with the code we emailed you.", "reauth");
    case "same_password":
      return new VaultError("Choose a master password you haven't used before.");
    case "mfa_totp_enroll_not_enabled":
    case "mfa_totp_verify_not_enabled":
      return new VaultError("Authenticator apps are disabled for this Supabase project.");
    case "over_request_rate_limit":
    case "over_email_send_rate_limit":
      return new VaultError("Too many attempts. Wait a moment and try again.");
    default:
      return new VaultError(error.message);
  }
}

// -----------------------------------------------------------------------------
// Session / unlock
// -----------------------------------------------------------------------------

export interface UnlockedVault {
  userId: string;
  email: string;
  sessionId: string | null;
  vaultKey: CryptoKey;
  keys: VaultKeysRow;
  /** Present only when a recovery key was just generated and must be shown once. */
  newRecoveryKey: string | null;
}

/** Email of the persisted Supabase session, used to prefill the unlock form. */
export async function getSessionEmail(): Promise<string | null> {
  const { data } = await getSupabase().auth.getSession();
  return data.session?.user.email ?? null;
}

async function currentIdentity() {
  const { data, error } = await getSupabase().auth.getClaims();
  if (error || !data) throw new VaultError("Your session has expired. Log in again.");
  return {
    userId: data.claims.sub,
    email: (data.claims.email as string | undefined) ?? "",
    sessionId: data.claims.session_id ?? null,
  };
}

async function fetchVaultKeys(): Promise<VaultKeysRow | null> {
  const { data, error } = await getSupabase()
    .from("vault_keys")
    .select(VAULT_KEY_COLUMNS)
    .maybeSingle<VaultKeysRow>();
  if (error) throw dbError("Could not load vault", error);
  if (data && data.kdf !== KDF_NAME) {
    throw new VaultError(`Unsupported key derivation: ${data.kdf}`);
  }
  return data;
}

async function createVault(masterPassword: string): Promise<{
  keys: VaultKeysRow;
  vaultKey: CryptoKey;
  recoveryKey: string;
}> {
  const salt = toBase64(randomBytes(16));
  const vaultKey = await generateVaultKey();
  const recoveryKey = generateRecoveryKey();
  const [kek, recoveryKek] = await Promise.all([
    deriveKek(masterPassword, salt, KDF_ITERATIONS),
    deriveKek(normalizeRecoveryKey(recoveryKey), salt, KDF_ITERATIONS),
  ]);

  const { data, error } = await getSupabase()
    .from("vault_keys")
    .insert({
      kdf: KDF_NAME,
      kdf_iterations: KDF_ITERATIONS,
      kdf_salt: salt,
      wrapped_vault_key: await wrapVaultKey(vaultKey, kek),
      recovery_wrapped_vault_key: await wrapVaultKey(vaultKey, recoveryKek),
    })
    .select(VAULT_KEY_COLUMNS)
    .single<VaultKeysRow>();
  if (error) throw dbError("Could not create vault", error);

  return { keys: data, vaultKey, recoveryKey };
}

/** Decrypt the vault for the signed-in user; creates it on first sign-in. */
export async function openVault(masterPassword: string): Promise<UnlockedVault> {
  const identity = await currentIdentity();
  const existing = await fetchVaultKeys();

  if (!existing) {
    const created = await createVault(masterPassword);
    return {
      ...identity,
      vaultKey: created.vaultKey,
      keys: created.keys,
      newRecoveryKey: created.recoveryKey,
    };
  }

  const kek = await deriveKek(masterPassword, existing.kdf_salt, existing.kdf_iterations);
  try {
    const vaultKey = await unwrapVaultKey(existing.wrapped_vault_key, kek);
    return { ...identity, vaultKey, keys: existing, newRecoveryKey: null };
  } catch {
    throw new VaultError("Incorrect master password", "credentials");
  }
}

/**
 * Step 1 of unlocking. Signs in with the derived auth password unless a
 * session for this email already exists (vault locked but still signed in).
 * Step 2 is `openVault()`, after `verifyTotp()` when `mfaRequired` is true.
 */
export async function signInForVault(
  email: string,
  masterPassword: string
): Promise<{ mfaRequired: boolean }> {
  const supabase = getSupabase();
  const { data } = await supabase.auth.getSession();
  const sessionEmail = data.session?.user.email;

  if (!sessionEmail || normalizeEmail(sessionEmail) !== normalizeEmail(email)) {
    const password = await deriveAuthPassword(email, masterPassword);
    const { error } = await supabase.auth.signInWithPassword({
      email: normalizeEmail(email),
      password,
    });
    if (error) throw authError(error);
  }

  return { mfaRequired: await isMfaStepUpRequired() };
}

export type RegisterResult =
  | { status: "unlocked"; vault: UnlockedVault }
  | { status: "confirm-email" };

export async function registerVault(
  email: string,
  masterPassword: string
): Promise<RegisterResult> {
  const password = await deriveAuthPassword(email, masterPassword);
  const { data, error } = await getSupabase().auth.signUp({
    email: normalizeEmail(email),
    password,
  });
  if (error) throw authError(error);

  // Email confirmation enabled (default) → no session yet. The vault is
  // created on first successful login instead.
  if (!data.session) return { status: "confirm-email" };
  return { status: "unlocked", vault: await openVault(masterPassword) };
}

export async function sendRecoveryCode(email: string): Promise<void> {
  const { error } = await getSupabase().auth.signInWithOtp({
    email: normalizeEmail(email),
    options: { shouldCreateUser: false },
  });
  if (error) throw authError(error);
}

/**
 * Forgotten master password, step 1: prove email ownership with the emailed
 * one-time code. Step 2 is `completeRecovery()` (after `verifyTotp()` when
 * `mfaRequired` is true).
 */
export async function verifyRecoveryCode(
  email: string,
  code: string
): Promise<{ mfaRequired: boolean }> {
  const { error } = await getSupabase().auth.verifyOtp({
    email: normalizeEmail(email),
    token: code.trim(),
    type: "email",
  });
  if (error) throw authError(error);
  return { mfaRequired: await isMfaStepUpRequired() };
}

/**
 * Step 2: unwrap the vault with the recovery key, set a new master password
 * and rotate the (now used) recovery key, which is returned for display.
 */
export async function completeRecovery(
  email: string,
  recoveryKey: string,
  newMasterPassword: string
): Promise<UnlockedVault> {
  const supabase = getSupabase();
  const keys = await fetchVaultKeys();
  if (!keys) throw new VaultError("No vault exists for this account yet.");

  const recoveryKek = await deriveKek(
    normalizeRecoveryKey(recoveryKey),
    keys.kdf_salt,
    keys.kdf_iterations
  );
  let vaultKey: CryptoKey;
  try {
    vaultKey = await unwrapVaultKey(keys.recovery_wrapped_vault_key, recoveryKek);
  } catch {
    throw new VaultError("Invalid recovery key", "credentials");
  }

  // Auth password first: if the re-wrap below then fails, the vault is still
  // wrapped by the *old* recovery key, so recovery can simply be repeated.
  const { error: pwError } = await supabase.auth.updateUser({
    password: await deriveAuthPassword(email, newMasterPassword),
  });
  if (pwError) throw authError(pwError);

  const nextRecoveryKey = generateRecoveryKey();
  const [kek, nextRecoveryKek] = await Promise.all([
    deriveKek(newMasterPassword, keys.kdf_salt, keys.kdf_iterations),
    deriveKek(normalizeRecoveryKey(nextRecoveryKey), keys.kdf_salt, keys.kdf_iterations),
  ]);

  const { data: updated, error } = await supabase
    .from("vault_keys")
    .update({
      wrapped_vault_key: await wrapVaultKey(vaultKey, kek),
      recovery_wrapped_vault_key: await wrapVaultKey(vaultKey, nextRecoveryKek),
    })
    .eq("user_id", keys.user_id)
    .select(VAULT_KEY_COLUMNS)
    .single<VaultKeysRow>();
  if (error) {
    throw new VaultError(
      `Could not finish recovery (${error.message}). Your recovery key still works — try again.`
    );
  }

  return {
    ...(await currentIdentity()),
    vaultKey,
    keys: updated,
    newRecoveryKey: nextRecoveryKey,
  };
}

/**
 * Change the master password while unlocked. Pass `nonce` after
 * `requestReauthentication()` when this throws a `reauth` VaultError
 * (only if "Secure password change" is enabled in Supabase Auth).
 */
export async function changeMasterPassword(
  vault: Pick<UnlockedVault, "vaultKey" | "keys" | "email">,
  currentPassword: string,
  newPassword: string,
  nonce?: string
): Promise<VaultKeysRow> {
  if (!(await verifyMasterPassword(vault.keys, currentPassword))) {
    throw new VaultError("Current master password is incorrect", "credentials");
  }
  const supabase = getSupabase();
  const [oldAuth, newAuth, kek] = await Promise.all([
    deriveAuthPassword(vault.email, currentPassword),
    deriveAuthPassword(vault.email, newPassword),
    deriveKek(newPassword, vault.keys.kdf_salt, vault.keys.kdf_iterations),
  ]);

  const { error: pwError } = await supabase.auth.updateUser({
    password: newAuth,
    ...(nonce ? { nonce: nonce.trim() } : {}),
  });
  if (pwError) throw authError(pwError);

  const { data, error } = await supabase
    .from("vault_keys")
    .update({ wrapped_vault_key: await wrapVaultKey(vault.vaultKey, kek) })
    .eq("user_id", vault.keys.user_id)
    .select(VAULT_KEY_COLUMNS)
    .single<VaultKeysRow>();
  if (error) {
    // Keep login and vault in sync: put the old auth password back.
    await supabase.auth.updateUser({ password: oldAuth });
    throw dbError("Could not change master password", error);
  }
  return data;
}

/** Emails a one-time nonce for `changeMasterPassword(..., nonce)`. */
export async function requestReauthentication(): Promise<void> {
  const { error } = await getSupabase().auth.reauthenticate();
  if (error) throw authError(error);
}

// -----------------------------------------------------------------------------
// Two-step login (TOTP via Supabase Auth MFA)
// The database requires an aal2 session for vault data once a factor exists.
// -----------------------------------------------------------------------------

async function isMfaStepUpRequired(): Promise<boolean> {
  const { data, error } = await getSupabase().auth.mfa.getAuthenticatorAssuranceLevel();
  if (error) throw authError(error);
  return data.nextLevel === "aal2" && data.currentLevel !== "aal2";
}

async function verifiedTotpFactorId(): Promise<string | null> {
  const { data, error } = await getSupabase().auth.mfa.listFactors();
  if (error) throw authError(error);
  return data.totp[0]?.id ?? null;
}

export async function isTotpEnabled(): Promise<boolean> {
  return (await verifiedTotpFactorId()) !== null;
}

function cleanCode(code: string): string {
  return code.replace(/\s/g, "");
}

/** Upgrades the current session to aal2. */
export async function verifyTotp(code: string): Promise<void> {
  const factorId = await verifiedTotpFactorId();
  if (!factorId) throw new VaultError("Two-step login isn't set up for this account.");
  const { error } = await getSupabase().auth.mfa.challengeAndVerify({
    factorId,
    code: cleanCode(code),
  });
  if (error) throw authError(error);
}

export interface TotpEnrollment {
  factorId: string;
  /** SVG data URL — render with <img>. */
  qrCode: string;
  /** Base32 secret for manual entry. */
  secret: string;
}

export async function startTotpEnrollment(): Promise<TotpEnrollment> {
  const mfa = getSupabase().auth.mfa;

  // Clear abandoned (unverified) attempts so friendly names don't collide.
  const { data: factors, error: listError } = await mfa.listFactors();
  if (listError) throw authError(listError);
  for (const f of factors.all) {
    if (f.factor_type === "totp" && f.status === "unverified") {
      await mfa.unenroll({ factorId: f.id });
    }
  }

  const { data, error } = await mfa.enroll({
    factorType: "totp",
    issuer: "Conserve",
    friendlyName: `Authenticator ${new Date().toISOString().slice(0, 19)}`,
  });
  if (error) throw authError(error);
  return { factorId: data.id, qrCode: data.totp.qr_code, secret: data.totp.secret };
}

/** The first valid code activates the factor and upgrades this session to aal2. */
export async function confirmTotpEnrollment(factorId: string, code: string): Promise<void> {
  const { error } = await getSupabase().auth.mfa.challengeAndVerify({
    factorId,
    code: cleanCode(code),
  });
  if (error) throw authError(error);
}

export async function cancelTotpEnrollment(factorId: string): Promise<void> {
  await getSupabase().auth.mfa.unenroll({ factorId });
}

/** Requires a current code, so an unattended unlocked tab can't silently remove 2FA. */
export async function disableTotp(code: string): Promise<void> {
  await verifyTotp(code);
  const factorId = await verifiedTotpFactorId();
  if (!factorId) return;
  const { error } = await getSupabase().auth.mfa.unenroll({ factorId });
  if (error) throw authError(error);
}

/** Re-authentication for "re-enter to reveal": purely local, no network. */
export async function verifyMasterPassword(
  keys: VaultKeysRow,
  masterPassword: string
): Promise<boolean> {
  try {
    const kek = await deriveKek(masterPassword, keys.kdf_salt, keys.kdf_iterations);
    await unwrapVaultKey(keys.wrapped_vault_key, kek);
    return true;
  } catch {
    return false;
  }
}

export async function rotateRecoveryKey(
  vault: Pick<UnlockedVault, "vaultKey" | "keys">
): Promise<{ recoveryKey: string; keys: VaultKeysRow }> {
  const recoveryKey = generateRecoveryKey();
  const kek = await deriveKek(
    normalizeRecoveryKey(recoveryKey),
    vault.keys.kdf_salt,
    vault.keys.kdf_iterations
  );
  const { data, error } = await getSupabase()
    .from("vault_keys")
    .update({ recovery_wrapped_vault_key: await wrapVaultKey(vault.vaultKey, kek) })
    .eq("user_id", vault.keys.user_id)
    .select(VAULT_KEY_COLUMNS)
    .single<VaultKeysRow>();
  if (error) throw dbError("Could not rotate recovery key", error);
  return { recoveryKey, keys: data };
}

// -----------------------------------------------------------------------------
// Game accounts
// -----------------------------------------------------------------------------

async function rowToAccount(vaultKey: CryptoKey, row: GameAccountRow): Promise<GameAccount> {
  const [login, password, notes] = await Promise.all([
    decryptString(vaultKey, row.login_encrypted),
    decryptString(vaultKey, row.password_encrypted),
    row.notes_encrypted ? decryptString(vaultKey, row.notes_encrypted) : undefined,
  ]);
  return {
    id: row.id,
    game: row.game,
    monogram: row.monogram,
    nickname: row.nickname,
    login,
    password,
    notes,
    twoFactor: row.two_factor,
    updatedAt: Date.parse(row.password_updated_at),
  };
}

export async function loadAccounts(vaultKey: CryptoKey): Promise<GameAccount[]> {
  const { data, error } = await getSupabase()
    .from("game_accounts")
    .select(ACCOUNT_COLUMNS)
    .order("created_at", { ascending: false })
    .overrideTypes<GameAccountRow[], { merge: false }>();
  if (error) throw dbError("Could not load accounts", error);
  try {
    return await Promise.all(data.map((row) => rowToAccount(vaultKey, row)));
  } catch {
    throw new VaultError("Some vault items could not be decrypted.");
  }
}

export type AccountInput = Omit<GameAccount, "id" | "updatedAt">;

export interface AccountEdit {
  id: string;
  /** Plaintext password currently stored; used to detect a real change. */
  previousPassword?: string;
}

export async function saveAccount(
  vaultKey: CryptoKey,
  input: AccountInput,
  edit?: AccountEdit
): Promise<GameAccount> {
  const notes = input.notes?.trim();
  const payload: Record<string, unknown> = {
    game: input.game.trim(),
    monogram: input.monogram,
    nickname: input.nickname.trim(),
    login_encrypted: await encryptString(vaultKey, input.login),
    notes_encrypted: notes ? await encryptString(vaultKey, notes) : null,
    two_factor: input.twoFactor,
  };
  // AES-GCM uses a random IV, so re-encrypting an unchanged password still
  // produces new ciphertext. The DB trigger treats any ciphertext change as a
  // password change (resets password_updated_at, logs "Password changed"), so
  // only send it when the plaintext actually changed.
  if (!edit || edit.previousPassword !== input.password) {
    payload.password_encrypted = await encryptString(vaultKey, input.password);
  }

  const table = getSupabase().from("game_accounts");
  const query = edit
    ? table.update(payload).eq("id", edit.id)
    : table.insert(payload);
  const { data, error } = await query.select(ACCOUNT_COLUMNS).single<GameAccountRow>();
  if (error) throw dbError("Could not save account", error);

  return rowToAccount(vaultKey, data);
}

export async function deleteAccount(id: string): Promise<void> {
  const { error } = await getSupabase().from("game_accounts").delete().eq("id", id);
  if (error) throw dbError("Could not delete account", error);
}

// -----------------------------------------------------------------------------
// Security settings
// -----------------------------------------------------------------------------

const SETTING_COLUMN: Record<keyof SecuritySettings, keyof SecuritySettingsRow> = {
  reenterToReveal: "reenter_to_reveal",
  clearClipboard: "clear_clipboard",
  lockOnTabClose: "lock_on_tab_close",
  twoStepLogin: "two_step_login",
  emailNewSignIns: "email_new_sign_ins",
  autoLockMinutes: "auto_lock_minutes",
};

function rowToSettings(row: SecuritySettingsRow): SecuritySettings {
  return {
    reenterToReveal: row.reenter_to_reveal,
    clearClipboard: row.clear_clipboard,
    lockOnTabClose: row.lock_on_tab_close,
    twoStepLogin: row.two_step_login,
    emailNewSignIns: row.email_new_sign_ins,
    autoLockMinutes: row.auto_lock_minutes,
  };
}

export async function loadSettings(userId: string): Promise<SecuritySettings> {
  const supabase = getSupabase();
  const { data, error } = await supabase
    .from("security_settings")
    .select(SETTINGS_COLUMNS)
    .maybeSingle<SecuritySettingsRow>();
  if (error) throw dbError("Could not load settings", error);
  if (data) return rowToSettings(data);

  // Normally created by the on_auth_user_created trigger; this covers users
  // that existed before the migration ran.
  const { data: created, error: insertError } = await supabase
    .from("security_settings")
    .insert({ user_id: userId })
    .select(SETTINGS_COLUMNS)
    .single<SecuritySettingsRow>();
  if (insertError) throw dbError("Could not create settings", insertError);
  return rowToSettings(created);
}

export async function updateSetting<K extends keyof SecuritySettings>(
  userId: string,
  key: K,
  value: SecuritySettings[K]
): Promise<void> {
  const { error } = await getSupabase()
    .from("security_settings")
    .update({ [SETTING_COLUMN[key]]: value })
    .eq("user_id", userId);
  if (error) throw dbError("Could not update setting", error);
}

// -----------------------------------------------------------------------------
// Devices
// -----------------------------------------------------------------------------

function describeDevice(): { name: string; location: string; userAgent: string } {
  const ua = navigator.userAgent;
  const browser = /Edg\//.test(ua)
    ? "Edge"
    : /OPR\//.test(ua)
    ? "Opera"
    : /Firefox\//.test(ua)
    ? "Firefox"
    : /Chrome\//.test(ua)
    ? "Chrome"
    : /Safari\//.test(ua)
    ? "Safari"
    : "Browser";
  const os = /Android/.test(ua)
    ? "Android"
    : /iPhone|iPad|iPod/.test(ua)
    ? "iOS"
    : /Windows/.test(ua)
    ? "Windows"
    : /Mac OS X/.test(ua)
    ? "macOS"
    : /Linux/.test(ua)
    ? "Linux"
    : "Unknown OS";
  // Time zone is the only location signal available without a geo-IP service.
  const location = Intl.DateTimeFormat().resolvedOptions().timeZone ?? "Unknown";
  return { name: `${browser} on ${os}`, location, userAgent: ua.slice(0, 512) };
}

/** Upsert the row for the current auth session; logs first sign-in on a device. */
export async function registerCurrentDevice(sessionId: string | null): Promise<void> {
  if (!sessionId) return;
  const supabase = getSupabase();
  const device = describeDevice();

  const { data: existing, error } = await supabase
    .from("user_devices")
    .select("id")
    .eq("session_id", sessionId)
    .maybeSingle<{ id: string }>();
  if (error) throw dbError("Could not register device", error);

  if (existing) {
    const { error: updateError } = await supabase
      .from("user_devices")
      .update({ last_active_at: new Date().toISOString(), location: device.location })
      .eq("id", existing.id);
    if (updateError) throw dbError("Could not update device", updateError);
    return;
  }

  const { error: insertError } = await supabase.from("user_devices").insert({
    name: device.name,
    location: device.location,
    user_agent: device.userAgent,
  });
  if (insertError) throw dbError("Could not register device", insertError);
  await logEvent("device", "New device signed in", device.name);
}

export async function loadDevices(currentSessionId: string | null): Promise<SignedInDevice[]> {
  const { data, error } = await getSupabase()
    .from("user_devices")
    .select("id, session_id, name, location, last_active_at")
    .order("last_active_at", { ascending: false })
    .overrideTypes<DeviceRow[], { merge: false }>();
  if (error) throw dbError("Could not load devices", error);

  const now = Date.now();
  return data
    .map((row) => {
      const isCurrent = row.session_id !== null && row.session_id === currentSessionId;
      return {
        id: row.id,
        name: row.name,
        location: row.location ?? "Unknown",
        lastActive: isCurrent
          ? "active now"
          : formatRelativeTime(Date.parse(row.last_active_at), now),
        isCurrent,
      };
    })
    .sort((a, b) => Number(b.isCurrent) - Number(a.isCurrent));
}

export async function revokeDevice(deviceId: string): Promise<void> {
  const { error } = await getSupabase().rpc("revoke_device", { p_device_id: deviceId });
  if (error) throw dbError("Could not sign out device", error);
}

export async function revokeOtherDevices(): Promise<number> {
  const { data, error } = await getSupabase().rpc("revoke_other_devices");
  if (error) throw dbError("Could not sign out other devices", error);
  return (data as number | null) ?? 0;
}

// -----------------------------------------------------------------------------
// Audit log
// -----------------------------------------------------------------------------

const LOG_LIMIT = 200;

export async function loadLogs(): Promise<AuditLogEntry[]> {
  const { data, error } = await getSupabase()
    .from("audit_logs")
    .select("id, category, action, target, device, location, created_at")
    .order("created_at", { ascending: false })
    .limit(LOG_LIMIT)
    .overrideTypes<AuditLogRow[], { merge: false }>();
  if (error) throw dbError("Could not load activity", error);

  const now = Date.now();
  return data.map((row) => {
    const createdAt = Date.parse(row.created_at);
    return {
      id: String(row.id),
      createdAt,
      timestampLabel: formatLogTimestamp(createdAt, now),
      action: row.action,
      target: row.target ?? undefined,
      device: row.device ?? "Unknown device",
      location: row.location ?? undefined,
      category: row.category,
    };
  });
}

/**
 * Client-originated events (unlock, reveal, copy, export…). Account
 * add/edit/delete events are written by database triggers, not from here.
 * Logging failures are reported but never block the user action.
 */
export async function logEvent(
  category: Exclude<AuditCategory, "account">,
  action: string,
  target?: string
): Promise<void> {
  const { error } = await getSupabase().rpc("log_event", {
    p_category: category,
    p_action: action,
    p_target: target ?? null,
  });
  if (error) console.warn("Audit log write failed:", error.message);
}

// -----------------------------------------------------------------------------
// Encrypted backup
// -----------------------------------------------------------------------------

/** Ciphertext-only export: restorable with the master password or recovery key. */
export async function buildEncryptedBackup(email: string): Promise<{
  json: string;
  count: number;
}> {
  const supabase = getSupabase();
  const [keys, accounts] = await Promise.all([
    fetchVaultKeys(),
    supabase
      .from("game_accounts")
      .select(`${ACCOUNT_COLUMNS}, created_at`)
      .order("created_at", { ascending: false }),
  ]);
  if (!keys) throw new VaultError("No vault to export.");
  if (accounts.error) throw dbError("Could not export accounts", accounts.error);

  const payload = {
    format: "conserve-backup",
    version: 2,
    exportedAt: new Date().toISOString(),
    email,
    cipher: "AES-256-GCM",
    kdf: {
      name: keys.kdf,
      iterations: keys.kdf_iterations,
      salt: keys.kdf_salt,
    },
    wrappedVaultKey: keys.wrapped_vault_key,
    recoveryWrappedVaultKey: keys.recovery_wrapped_vault_key,
    accounts: accounts.data,
  };
  return { json: JSON.stringify(payload, null, 2), count: accounts.data.length };
}
