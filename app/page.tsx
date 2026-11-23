"use client";

import React, { useCallback, useEffect, useMemo, useRef, useState } from "react";
import { ActivityLogView } from "./components/ActivityLogView";
import { AuthScreen } from "./components/AuthScreen";
import {
  AccountModal,
  ChangeMasterPasswordModal,
  DeleteAccountModal,
  ExportBackupModal,
  ReauthModal,
  RecoveryKeyModal,
  TwoStepModal,
} from "./components/Modals";
import { SecurityCenterView } from "./components/SecurityCenterView";
import { Sidebar } from "./components/Sidebar";
import { ToastContainer } from "./components/ToastContainer";
import { VaultView } from "./components/VaultView";
import { computeVaultHealth, generateMonogram } from "./lib/vaultUtils";
import {
  UnlockedVault,
  buildEncryptedBackup,
  cancelTotpEnrollment,
  changeMasterPassword,
  completeRecovery,
  confirmTotpEnrollment,
  deleteAccount,
  disableTotp,
  getSessionEmail,
  isTotpEnabled,
  loadAccounts,
  loadDevices,
  loadLogs,
  loadSettings,
  logEvent,
  openVault,
  registerCurrentDevice,
  registerVault,
  revokeDevice,
  revokeOtherDevices,
  requestReauthentication,
  rotateRecoveryKey,
  saveAccount,
  sendRecoveryCode,
  signInForVault,
  startTotpEnrollment,
  updateSetting,
  verifyMasterPassword,
  verifyRecoveryCode,
  verifyTotp,
} from "./lib/vaultService";
import {
  AuditCategory,
  AuditLogEntry,
  GameAccount,
  NavTab,
  SecuritySettings,
  SignedInDevice,
  ToastItem,
  ToastVariant,
} from "./types/vault";

/** Mirrors the column defaults of public.security_settings until loaded. */
const DEFAULT_SETTINGS: SecuritySettings = {
  reenterToReveal: true,
  clearClipboard: true,
  lockOnTabClose: true,
  twoStepLogin: false,
  emailNewSignIns: true,
  autoLockMinutes: 15,
};

type UnlockMethod = "password" | "register" | "recovery";

/** Actions that expose a secret and need a recent master-password check. */
type GuardedAction =
  | { kind: "reveal" | "copy" | "edit"; account: GameAccount }
  | { kind: "rotate" };

const REAUTH_WINDOW_MS = 5 * 60 * 1000;

function reauthExpired(lastVerifiedAt: number): boolean {
  return Date.now() - lastVerifiedAt >= REAUTH_WINDOW_MS;
}

function errorMessage(err: unknown): string {
  return err instanceof Error ? err.message : "Something went wrong.";
}

function downloadFile(contents: string, type: string, filename: string) {
  const url = URL.createObjectURL(new Blob([contents], { type }));
  const a = document.createElement("a");
  a.href = url;
  a.download = filename;
  a.click();
  URL.revokeObjectURL(url);
}

export default function Home() {
  const [ready, setReady] = useState(false);
  const [configError, setConfigError] = useState<string | null>(null);

  // Decrypted vault lives in memory only; locking drops it.
  const [vault, setVault] = useState<UnlockedVault | null>(null);
  const isUnlocked = vault !== null;

  const [activeTab, setActiveTab] = useState<NavTab>("vault");
  const [selectedGame, setSelectedGame] = useState<string>("all");
  const [email, setEmail] = useState("");

  const [accounts, setAccounts] = useState<GameAccount[]>([]);
  const [settings, setSettings] = useState<SecuritySettings>(DEFAULT_SETTINGS);
  const [devices, setDevices] = useState<SignedInDevice[]>([]);
  const [auditLogs, setAuditLogs] = useState<AuditLogEntry[]>([]);

  const [revealedIds, setRevealedIds] = useState<Set<string>>(new Set());
  const [lastVerifiedAt, setLastVerifiedAt] = useState<number>(0);
  const [now, setNow] = useState<number | null>(null);

  // Modals
  const [accountModalOpen, setAccountModalOpen] = useState(false);
  const [editingAccount, setEditingAccount] = useState<GameAccount | null>(null);
  const [deletingAccount, setDeletingAccount] = useState<GameAccount | null>(null);
  const [pendingAction, setPendingAction] = useState<GuardedAction | null>(null);
  const [recoveryModalOpen, setRecoveryModalOpen] = useState(false);
  /** Freshly generated recovery key — shown once, then discarded. */
  const [shownRecoveryKey, setShownRecoveryKey] = useState<string | null>(null);
  const [exportModalOpen, setExportModalOpen] = useState(false);
  const [twoStepMode, setTwoStepMode] = useState<"enable" | "disable" | null>(null);
  const [changePasswordOpen, setChangePasswordOpen] = useState(false);

  /** Work to resume after the authenticator step during sign-in / recovery. */
  const pendingAfterMfaRef = useRef<(() => Promise<void>) | null>(null);

  // Toasts
  const [toasts, setToasts] = useState<ToastItem[]>([]);
  const clipboardTimerRef = useRef<ReturnType<typeof setTimeout> | null>(null);

  const addToast = useCallback(
    (message: string, variant: ToastVariant = "success", detail?: string) => {
      const id = `toast-${Date.now()}-${Math.random().toString(36).slice(2, 6)}`;
      setToasts((prev) => [...prev.slice(-3), { id, message, variant, detail }]);
      setTimeout(() => {
        setToasts((prev) => prev.filter((t) => t.id !== id));
      }, 3800);
    },
    []
  );

  const dismissToast = useCallback((id: string) => {
    setToasts((prev) => prev.filter((t) => t.id !== id));
  }, []);

  const refreshLogs = useCallback(async () => {
    try {
      setAuditLogs(await loadLogs());
    } catch (err) {
      console.warn(errorMessage(err));
    }
  }, []);

  /** Write a client-side audit event, then refresh the activity feed. */
  const appendLog = useCallback(
    async (category: Exclude<AuditCategory, "account">, action: string, target?: string) => {
      await logEvent(category, action, target);
      await refreshLogs();
    },
    [refreshLogs]
  );

  // Restore the persisted Supabase session's email (the vault itself stays locked).
  useEffect(() => {
    getSessionEmail()
      .then((sessionEmail) => setEmail(sessionEmail ?? ""))
      .catch((err) => setConfigError(errorMessage(err)))
      .finally(() => setReady(true));
  }, []);

  const lockVault = useCallback(() => {
    setVault(null);
    setAccounts([]);
    setDevices([]);
    setAuditLogs([]);
    setRevealedIds(new Set());
    setShownRecoveryKey(null);
    setRecoveryModalOpen(false);
    setPendingAction(null);
    // Modals hold decrypted secrets in their own state; close them all.
    setAccountModalOpen(false);
    setEditingAccount(null);
    setDeletingAccount(null);
    setExportModalOpen(false);
    setTwoStepMode(null);
    setChangePasswordOpen(false);
    pendingAfterMfaRef.current = null;
  }, []);

  // Idle auto-lock timer
  useEffect(() => {
    if (!isUnlocked) return;
    let timer: ReturnType<typeof setTimeout>;
    const resetTimer = () => {
      clearTimeout(timer);
      timer = setTimeout(() => {
        void logEvent("security", "Vault auto-locked", "Idle timeout");
        lockVault();
        addToast(
          "Vault auto-locked",
          "info",
          `Locked after ${settings.autoLockMinutes} min of inactivity.`
        );
      }, settings.autoLockMinutes * 60 * 1000);
    };

    const events = ["mousedown", "keydown", "scroll", "touchstart"];
    events.forEach((ev) => window.addEventListener(ev, resetTimer));
    resetTimer();

    return () => {
      clearTimeout(timer);
      events.forEach((ev) => window.removeEventListener(ev, resetTimer));
    };
  }, [isUnlocked, settings.autoLockMinutes, lockVault, addToast]);

  // Derived data
  const health = useMemo(() => computeVaultHealth(accounts, now), [accounts, now]);

  const gameCounts = useMemo(() => {
    const map = new Map<string, number>();
    for (const acc of accounts) {
      map.set(acc.game, (map.get(acc.game) ?? 0) + 1);
    }
    return Array.from(map.entries())
      .map(([game, count]) => ({ game, count }))
      .sort((a, b) => a.game.localeCompare(b.game));
  }, [accounts]);

  const existingGames = useMemo(() => gameCounts.map((g) => g.game), [gameCounts]);

  // ---------------------------------------------------------------------------
  // Unlock / register / recover
  // ---------------------------------------------------------------------------

  /** Load everything for a freshly unlocked vault, then open the UI. */
  const enterVault = async (unlocked: UnlockedVault, method: UnlockMethod) => {
    const [loadedAccounts, loadedSettings, totpOn] = await Promise.all([
      loadAccounts(unlocked.vaultKey),
      loadSettings(unlocked.userId),
      isTotpEnabled(),
    ]);

    // two_step_login mirrors the real Supabase MFA state, never the reverse.
    if (loadedSettings.twoStepLogin !== totpOn) {
      loadedSettings.twoStepLogin = totpOn;
      updateSetting(unlocked.userId, "twoStepLogin", totpOn).catch((err) =>
        console.warn(errorMessage(err))
      );
    }

    try {
      await registerCurrentDevice(unlocked.sessionId);
    } catch (err) {
      console.warn(errorMessage(err));
    }

    const vaultCreated = unlocked.newRecoveryKey !== null && method !== "recovery";
    if (!vaultCreated) {
      // "Vault created" is logged by a database trigger.
      await logEvent(
        "security",
        "Vault unlocked",
        method === "recovery" ? "Recovery key used" : "Master password verified"
      );
    }

    const [loadedDevices, loadedLogs] = await Promise.all([
      loadDevices(unlocked.sessionId),
      loadLogs(),
    ]);

    const ts = Date.now();
    setAccounts(loadedAccounts);
    setSettings(loadedSettings);
    setDevices(loadedDevices);
    setAuditLogs(loadedLogs);
    setEmail(unlocked.email);
    setLastVerifiedAt(ts);
    setNow(ts);
    setActiveTab("vault");
    setSelectedGame("all");
    setVault(unlocked);

    if (unlocked.newRecoveryKey) {
      setShownRecoveryKey(unlocked.newRecoveryKey);
      setRecoveryModalOpen(true);
    }

    if (method === "recovery") {
      addToast("Master password reset", "success", "Save your new recovery key now.");
    } else if (vaultCreated) {
      addToast("Vault created & unlocked", "success", "Save your recovery key now.");
    } else {
      addToast("Vault unlocked", "success", "AES-256 session active on this device.");
    }
  };

  /** Runs `next` now, or parks it until the authenticator code is verified. */
  const continueAfterMfa = async (
    mfaRequired: boolean,
    next: () => Promise<void>
  ): Promise<"done" | "mfa"> => {
    if (mfaRequired) {
      pendingAfterMfaRef.current = next;
      return "mfa";
    }
    await next();
    return "done";
  };

  const handleLogin = async (userEmail: string, masterPassword: string) => {
    const { mfaRequired } = await signInForVault(userEmail, masterPassword);
    return continueAfterMfa(mfaRequired, async () =>
      enterVault(await openVault(masterPassword), "password")
    );
  };

  const handleVerifyMfa = async (code: string) => {
    await verifyTotp(code);
    const next = pendingAfterMfaRef.current;
    pendingAfterMfaRef.current = null;
    await next?.();
  };

  const handleRegister = async (userEmail: string, masterPassword: string) => {
    const result = await registerVault(userEmail, masterPassword);
    if (result.status === "confirm-email") return "confirm-email" as const;
    await enterVault(result.vault, "register");
    return "unlocked" as const;
  };

  const handleRecover = async (
    userEmail: string,
    code: string,
    recoveryKey: string,
    newMasterPassword: string
  ) => {
    const { mfaRequired } = await verifyRecoveryCode(userEmail, code);
    return continueAfterMfa(mfaRequired, async () =>
      enterVault(
        await completeRecovery(userEmail, recoveryKey, newMasterPassword),
        "recovery"
      )
    );
  };

  const handleLockNow = () => {
    void logEvent("security", "Vault locked", "Manual lock");
    lockVault();
    addToast("Vault locked", "info", "Decrypted data cleared from memory.");
  };

  // ---------------------------------------------------------------------------
  // Vault items
  // ---------------------------------------------------------------------------

  const revealAccountPassword = (acc: GameAccount) => {
    setRevealedIds((prev) => {
      const next = new Set(prev);
      next.add(acc.id);
      return next;
    });
    void appendLog("access", "Password revealed", `${acc.game} — ${acc.nickname}`);
  };

  const handleToggleReveal = (acc: GameAccount) => {
    if (revealedIds.has(acc.id)) {
      setRevealedIds((prev) => {
        const next = new Set(prev);
        next.delete(acc.id);
        return next;
      });
      return;
    }

    void requireMasterPassword({ kind: "reveal", account: acc });
  };

  const openEditAccount = (acc: GameAccount) => {
    setEditingAccount(acc);
    setAccountModalOpen(true);
  };

  const performGuarded = async (action: GuardedAction) => {
    switch (action.kind) {
      case "reveal":
        revealAccountPassword(action.account);
        return;
      case "copy":
        await copyPassword(action.account);
        return;
      case "edit":
        openEditAccount(action.account);
        return;
      case "rotate":
        await handleRotateRecoveryKey();
        return;
    }
  };

  /**
   * Runs the action now if the master password was verified recently,
   * otherwise asks for it first. Viewing/copying/editing a password honours
   * the "re-enter to reveal" setting; rotating the recovery key always asks.
   */
  const requireMasterPassword = async (action: GuardedAction) => {
    const gated = action.kind === "rotate" || settings.reenterToReveal;
    if (gated && reauthExpired(lastVerifiedAt)) {
      setPendingAction(action);
      return;
    }
    await performGuarded(action);
  };

  const handleCopyPassword = (acc: GameAccount) => {
    void requireMasterPassword({ kind: "copy", account: acc });
  };

  const copyPassword = async (acc: GameAccount) => {
    try {
      await navigator.clipboard.writeText(acc.password);
    } catch {
      // Clipboard API blocked
    }
    void appendLog("access", "Password copied", `${acc.game} — ${acc.nickname}`);

    if (settings.clearClipboard) {
      if (clipboardTimerRef.current) clearTimeout(clipboardTimerRef.current);
      addToast(
        `Copied password for ${acc.game}`,
        "success",
        `${acc.nickname} · Clipboard clears in 30 seconds`
      );
      clipboardTimerRef.current = setTimeout(async () => {
        try {
          await navigator.clipboard.writeText("");
        } catch {
          // ignore
        }
        addToast("Clipboard cleared", "info", "30-second security timer elapsed.");
      }, 30000);
    } else {
      addToast(`Copied password for ${acc.game}`, "success", acc.nickname);
    }
  };

  /** Throws on failure so the modal can show the error and stay open. */
  const handleSaveAccount = async (
    data: Omit<GameAccount, "id" | "updatedAt" | "monogram">,
    editId?: string
  ) => {
    if (!vault) throw new Error("Vault is locked.");
    const saved = await saveAccount(
      vault.vaultKey,
      { ...data, monogram: generateMonogram(data.game) },
      editId
        ? {
            id: editId,
            previousPassword: accounts.find((a) => a.id === editId)?.password,
          }
        : undefined
    );

    setNow(Date.now());
    if (editId) {
      setAccounts((prev) => prev.map((a) => (a.id === editId ? saved : a)));
      addToast("Account updated", "success", `${saved.game} — ${saved.nickname}`);
    } else {
      setAccounts((prev) => [saved, ...prev]);
      addToast("Account added to vault", "success", `${saved.game} — ${saved.nickname}`);
    }
    // Account events are written by a database trigger.
    void refreshLogs();
  };

  const handleDeleteAccount = async (acc: GameAccount) => {
    try {
      await deleteAccount(acc.id);
    } catch (err) {
      addToast("Could not delete account", "error", errorMessage(err));
      return;
    }
    setAccounts((prev) => prev.filter((a) => a.id !== acc.id));
    setRevealedIds((prev) => {
      const next = new Set(prev);
      next.delete(acc.id);
      return next;
    });
    addToast("Account deleted", "info", `${acc.game} — ${acc.nickname}`);
    void refreshLogs();
  };

  // ---------------------------------------------------------------------------
  // Security center
  // ---------------------------------------------------------------------------

  const handleUpdateSetting = async <K extends keyof SecuritySettings>(
    key: K,
    value: SecuritySettings[K]
  ) => {
    if (!vault) return;
    if (key === "twoStepLogin") {
      setTwoStepMode(value ? "enable" : "disable");
      return;
    }
    const previous = settings[key];
    setSettings((prev) => ({ ...prev, [key]: value }));
    try {
      await updateSetting(vault.userId, key, value);
    } catch (err) {
      setSettings((prev) => ({ ...prev, [key]: previous }));
      addToast("Could not update setting", "error", errorMessage(err));
      return;
    }
    addToast("Vault setting updated", "success");
    void appendLog("security", "Security setting updated", `${String(key)}: ${String(value)}`);
  };

  const reloadDevicesAndLogs = async () => {
    if (!vault) return;
    try {
      setDevices(await loadDevices(vault.sessionId));
    } catch (err) {
      console.warn(errorMessage(err));
    }
    await refreshLogs();
  };

  const handleSignOutDevice = async (deviceId: string) => {
    const target = devices.find((d) => d.id === deviceId);
    try {
      await revokeDevice(deviceId);
    } catch (err) {
      addToast("Could not sign out device", "error", errorMessage(err));
      return;
    }
    addToast("Device signed out", "info", target?.name);
    await reloadDevicesAndLogs();
  };

  const handleSignOutOthers = async () => {
    try {
      const removedCount = await revokeOtherDevices();
      addToast(
        "Signed out all other devices",
        "success",
        `${removedCount} session(s) revoked.`
      );
    } catch (err) {
      addToast("Could not sign out other devices", "error", errorMessage(err));
      return;
    }
    await reloadDevicesAndLogs();
  };

  const setTwoStepMirror = (enabled: boolean) => {
    if (!vault) return;
    setSettings((prev) => ({ ...prev, twoStepLogin: enabled }));
    updateSetting(vault.userId, "twoStepLogin", enabled).catch((err) =>
      console.warn(errorMessage(err))
    );
  };

  const handleConfirmTwoStep = async (factorId: string, code: string) => {
    await confirmTotpEnrollment(factorId, code);
    setTwoStepMirror(true);
    addToast(
      "Two-step login is on",
      "success",
      "Other signed-in devices will need a code to open the vault."
    );
    void appendLog("security", "Two-step login enabled", "Authenticator app");
  };

  const handleDisableTwoStep = async (code: string) => {
    await disableTotp(code);
    setTwoStepMirror(false);
    addToast("Two-step login is off", "info");
    void appendLog("security", "Two-step login disabled", "Authenticator app");
  };

  const handleChangeMasterPassword = async (
    current: string,
    next: string,
    nonce?: string
  ) => {
    if (!vault) throw new Error("Vault is locked.");
    const keys = await changeMasterPassword(vault, current, next, nonce);
    setVault({ ...vault, keys });
    setLastVerifiedAt(Date.now());
    addToast("Master password changed", "success", "Use it next time you unlock.");
    void refreshLogs(); // "Master password changed" is trigger-logged
  };

  const handleRotateRecoveryKey = async () => {
    if (!vault) return;
    try {
      const { recoveryKey, keys } = await rotateRecoveryKey(vault);
      setVault({ ...vault, keys });
      setShownRecoveryKey(recoveryKey);
      addToast("New recovery key generated", "success", "Save it offline.");
      void refreshLogs(); // "Recovery key regenerated" is trigger-logged
    } catch (err) {
      addToast("Could not rotate recovery key", "error", errorMessage(err));
    }
  };

  const handleExportBackup = async () => {
    try {
      const { json, count } = await buildEncryptedBackup(email);
      downloadFile(
        json,
        "application/json",
        `conserve-backup-${new Date().toISOString().slice(0, 10)}.conserve.json`
      );
      addToast("Encrypted backup downloaded", "success", `${count} accounts included.`);
      void appendLog("security", "Encrypted backup exported", `${count} accounts`);
    } catch (err) {
      addToast("Backup failed", "error", errorMessage(err));
    }
  };

  const handleExportLogsCsv = () => {
    const header = "Timestamp,Category,Action,Target,Device,Location\n";
    const rows = auditLogs
      .map((l) =>
        [
          new Date(l.createdAt).toISOString(),
          l.category,
          l.action,
          l.target ?? "",
          l.device,
          l.location ?? "",
        ]
          // Quote, and neutralise spreadsheet formula injection (=, +, -, @).
          .map((v) => `"${String(v).replace(/^([=+\-@])/, "'$1").replace(/"/g, '""')}"`)
          .join(",")
      )
      .join("\n");
    downloadFile(
      header + rows,
      "text/csv;charset=utf-8",
      `conserve-audit-log-${new Date().toISOString().slice(0, 10)}.csv`
    );
    addToast("Audit log exported as CSV", "success");
  };

  if (!ready) {
    return <div className="min-h-screen bg-[#0D0D0D]" />;
  }

  if (configError) {
    return (
      <div className="min-h-screen flex items-center justify-center bg-[#0D0D0D] px-4">
        <div className="max-w-md rounded-2xl border border-white/10 bg-white/[0.04] p-6 text-white">
          <h1 className="text-[17px] font-semibold">Conserve can&apos;t connect</h1>
          <p className="mt-2 text-[13.5px] leading-relaxed text-[#9A9A9A]">{configError}</p>
        </div>
      </div>
    );
  }

  return (
    <>
      {!isUnlocked ? (
        <AuthScreen
          savedEmail={email}
          onLogin={handleLogin}
          onRegister={handleRegister}
          onSendRecoveryCode={sendRecoveryCode}
          onRecover={handleRecover}
          onVerifyMfa={handleVerifyMfa}
          onCancelMfa={() => {
            pendingAfterMfaRef.current = null;
          }}
          onToast={addToast}
        />
      ) : (
        <div className="min-h-screen flex flex-col lg:flex-row bg-[#F7F7F7]">
          <Sidebar
            activeTab={activeTab}
            onSelectTab={setActiveTab}
            gameCounts={gameCounts}
            totalCount={accounts.length}
            selectedGame={selectedGame}
            onSelectGame={setSelectedGame}
            autoLockMinutes={settings.autoLockMinutes}
            onLockNow={handleLockNow}
          />

          <main className="flex-1 min-w-0 px-4 pt-5 pb-24 sm:px-6 sm:pt-7 lg:p-10 max-w-[1320px] w-full mx-auto">
            {activeTab === "vault" && (
              <VaultView
                accounts={accounts}
                health={health}
                gameCounts={gameCounts}
                selectedGame={selectedGame}
                onSelectGame={setSelectedGame}
                revealedIds={revealedIds}
                onToggleReveal={handleToggleReveal}
                onCopyPassword={handleCopyPassword}
                onNewAccount={() => {
                  setEditingAccount(null);
                  setAccountModalOpen(true);
                }}
                onEditAccount={(acc) =>
                  void requireMasterPassword({ kind: "edit", account: acc })
                }
                onDeleteAccount={(acc) => setDeletingAccount(acc)}
                onGoToSecurity={() => setActiveTab("security")}
                clearClipboardEnabled={settings.clearClipboard}
              />
            )}

            {activeTab === "security" && (
              <SecurityCenterView
                health={health}
                accounts={accounts}
                settings={settings}
                devices={devices}
                recentLogs={auditLogs}
                onFixAccount={(acc) =>
                  void requireMasterPassword({ kind: "edit", account: acc })
                }
                onUpdateSetting={handleUpdateSetting}
                onSignOutDevice={handleSignOutDevice}
                onSignOutOthers={handleSignOutOthers}
                onOpenRecoveryKey={() => setRecoveryModalOpen(true)}
                onOpenChangePassword={() => setChangePasswordOpen(true)}
                recoveryKeyRotatedAt={
                  vault ? Date.parse(vault.keys.recovery_key_rotated_at) : null
                }
                onOpenExportBackup={() => setExportModalOpen(true)}
                onViewAllActivity={() => setActiveTab("activity")}
              />
            )}

            {activeTab === "activity" && (
              <ActivityLogView
                logs={auditLogs}
                onExportLogs={handleExportLogsCsv}
              />
            )}
          </main>
        </div>
      )}

      {/* Modals — only while unlocked, so nothing decrypted outlives a lock */}
      {isUnlocked && (
      <>
      <AccountModal
        open={accountModalOpen}
        onClose={() => {
          setAccountModalOpen(false);
          setEditingAccount(null);
        }}
        initialAccount={editingAccount}
        existingGames={existingGames}
        existingPasswords={accounts.map((a) => ({
          id: a.id,
          password: a.password,
          game: a.game,
        }))}
        onSave={handleSaveAccount}
      />

      <DeleteAccountModal
        account={deletingAccount}
        onClose={() => setDeletingAccount(null)}
        onConfirm={handleDeleteAccount}
      />

      <RecoveryKeyModal
        open={recoveryModalOpen}
        onClose={() => {
          setRecoveryModalOpen(false);
          setShownRecoveryKey(null); // never keep the plaintext key around
        }}
        recoveryKey={shownRecoveryKey}
        onCopy={async () => {
          if (!shownRecoveryKey) return;
          try {
            await navigator.clipboard.writeText(shownRecoveryKey);
          } catch {
            // ignore
          }
          addToast("Recovery key copied", "success");
        }}
        onRegenerate={() => requireMasterPassword({ kind: "rotate" })}
      />

      <TwoStepModal
        mode={twoStepMode}
        onClose={() => setTwoStepMode(null)}
        onStartSetup={startTotpEnrollment}
        onConfirmSetup={handleConfirmTwoStep}
        onCancelSetup={(factorId) => {
          cancelTotpEnrollment(factorId).catch((err) => console.warn(errorMessage(err)));
        }}
        onDisable={handleDisableTwoStep}
      />

      <ChangeMasterPasswordModal
        open={changePasswordOpen}
        onClose={() => setChangePasswordOpen(false)}
        onSubmit={handleChangeMasterPassword}
        onRequestCode={requestReauthentication}
      />

      <ExportBackupModal
        open={exportModalOpen}
        onClose={() => setExportModalOpen(false)}
        accountCount={accounts.length}
        onConfirmExport={handleExportBackup}
      />

      {/* Rendered last so it stacks above the modal that triggered it */}
      <ReauthModal
        open={pendingAction !== null}
        onClose={() => setPendingAction(null)}
        onVerify={(pw) => (vault ? verifyMasterPassword(vault.keys, pw) : Promise.resolve(false))}
        onVerified={() => {
          const action = pendingAction;
          setPendingAction(null);
          setLastVerifiedAt(Date.now());
          addToast("Master password verified", "success", "No need to re-enter it for 5 minutes.");
          if (action) void performGuarded(action);
        }}
        onInvalidAttempt={() => {
          addToast("Incorrect master password", "error");
        }}
      />
      </>
      )}

      {/* Bottom Toast Notifications */}
      <ToastContainer
        toasts={toasts}
        onDismiss={dismissToast}
        elevatedMobile={isUnlocked}
      />
    </>
  );
}
