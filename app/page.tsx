"use client";

import React, {
  useCallback,
  useEffect,
  useMemo,
  useRef,
  useState,
  useSyncExternalStore,
} from "react";
import { ActivityLogView } from "./components/ActivityLogView";
import { AuthScreen } from "./components/AuthScreen";
import {
  AccountModal,
  DeleteAccountModal,
  ExportBackupModal,
  ReauthModal,
  RecoveryKeyModal,
} from "./components/Modals";
import { SecurityCenterView } from "./components/SecurityCenterView";
import { Sidebar } from "./components/Sidebar";
import { ToastContainer } from "./components/ToastContainer";
import { VaultView } from "./components/VaultView";
import {
  computeVaultHealth,
  formatCurrentTimestampLabel,
  generateMonogram,
  generateRecoveryKey,
  INITIAL_ACCOUNTS,
  INITIAL_AUDIT_LOGS,
  INITIAL_DEVICES,
  INITIAL_RECOVERY_KEY,
  INITIAL_SETTINGS,
} from "./data/initialVault";
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

const STORAGE_KEY = "conserve_vault_state_v1";
const emptySubscribe = () => () => {};

function readStoredState() {
  if (typeof window === "undefined") return null;
  try {
    const raw = localStorage.getItem(STORAGE_KEY);
    return raw ? JSON.parse(raw) : null;
  } catch {
    return null;
  }
}

export default function Home() {
  const hydrated = useSyncExternalStore(
    emptySubscribe,
    () => true,
    () => false
  );
  const [isUnlocked, setIsUnlocked] = useState(false);
  const [activeTab, setActiveTab] = useState<NavTab>("vault");
  const [selectedGame, setSelectedGame] = useState<string>("all");

  const [email, setEmail] = useState(
    () => readStoredState()?.email ?? "you@example.com"
  );
  const [masterPassword, setMasterPassword] = useState(
    () => readStoredState()?.masterPassword ?? "conserve2026"
  );
  const [recoveryKey, setRecoveryKey] = useState(
    () => readStoredState()?.recoveryKey ?? INITIAL_RECOVERY_KEY
  );

  const [accounts, setAccounts] = useState<GameAccount[]>(
    () => readStoredState()?.accounts ?? INITIAL_ACCOUNTS
  );
  const [settings, setSettings] = useState<SecuritySettings>(
    () => readStoredState()?.settings ?? INITIAL_SETTINGS
  );
  const [devices, setDevices] = useState<SignedInDevice[]>(
    () => readStoredState()?.devices ?? INITIAL_DEVICES
  );
  const [auditLogs, setAuditLogs] = useState<AuditLogEntry[]>(
    () => readStoredState()?.auditLogs ?? INITIAL_AUDIT_LOGS
  );

  const [revealedIds, setRevealedIds] = useState<Set<string>>(new Set());
  const [lastVerifiedAt, setLastVerifiedAt] = useState<number>(0);
  const [now, setNow] = useState<number | null>(null);

  // Modals
  const [accountModalOpen, setAccountModalOpen] = useState(false);
  const [editingAccount, setEditingAccount] = useState<GameAccount | null>(
    null
  );
  const [deletingAccount, setDeletingAccount] = useState<GameAccount | null>(
    null
  );
  const [pendingRevealAccount, setPendingRevealAccount] =
    useState<GameAccount | null>(null);
  const [recoveryModalOpen, setRecoveryModalOpen] = useState(false);
  const [exportModalOpen, setExportModalOpen] = useState(false);

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

  const appendLog = useCallback(
    (action: string, category: AuditCategory, target?: string) => {
      const entry: AuditLogEntry = {
        id: `log-${Date.now()}-${Math.random().toString(36).slice(2, 6)}`,
        timestampLabel: formatCurrentTimestampLabel(),
        createdAt: Date.now(),
        action,
        target,
        device: "Chrome on Windows",
        location: "Quezon City, PH",
        category,
      };
      setAuditLogs((prev) => [entry, ...prev]);
    },
    []
  );

  // Persist to localStorage
  useEffect(() => {
    if (!hydrated) return;
    try {
      localStorage.setItem(
        STORAGE_KEY,
        JSON.stringify({
          accounts,
          settings,
          devices,
          auditLogs,
          email,
          masterPassword,
          recoveryKey,
        })
      );
    } catch {
      // ignore storage errors
    }
  }, [
    hydrated,
    accounts,
    settings,
    devices,
    auditLogs,
    email,
    masterPassword,
    recoveryKey,
  ]);

  // Idle auto-lock timer
  useEffect(() => {
    if (!isUnlocked) return;
    let timer: ReturnType<typeof setTimeout>;
    const resetTimer = () => {
      clearTimeout(timer);
      timer = setTimeout(() => {
        setIsUnlocked(false);
        setRevealedIds(new Set());
        appendLog("Vault auto-locked", "security", "Idle timeout");
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
  }, [isUnlocked, settings.autoLockMinutes, appendLog, addToast]);

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

  const existingGames = useMemo(
    () => gameCounts.map((g) => g.game),
    [gameCounts]
  );

  // Handlers
  const handleUnlock = (
    userEmail: string,
    method: "password" | "recovery"
  ) => {
    const ts = Date.now();
    setEmail(userEmail);
    setIsUnlocked(true);
    setLastVerifiedAt(ts);
    setNow(ts);
    setActiveTab("vault");
    appendLog(
      "Vault unlocked",
      "security",
      method === "recovery" ? "Recovery key used" : "Master password verified"
    );
    addToast(
      "Vault unlocked",
      "success",
      method === "recovery"
        ? "Unlocked using your recovery key."
        : "AES-256 session active on this device."
    );
  };

  const handleRegister = (userEmail: string, newPassword: string) => {
    const ts = Date.now();
    setEmail(userEmail);
    setMasterPassword(newPassword);
    setIsUnlocked(true);
    setLastVerifiedAt(ts);
    setNow(ts);
    setActiveTab("vault");
    appendLog("Vault created", "security", userEmail);
    addToast("Vault created & unlocked", "success", `Signed in as ${userEmail}`);
  };

  const handleLockNow = () => {
    setIsUnlocked(false);
    setRevealedIds(new Set());
    appendLog("Vault locked", "security", "Manual lock");
    addToast("Vault locked", "info", "All credentials re-encrypted.");
  };

  const revealAccountPassword = (acc: GameAccount) => {
    setRevealedIds((prev) => {
      const next = new Set(prev);
      next.add(acc.id);
      return next;
    });
    appendLog("Password revealed", "access", `${acc.game} — ${acc.nickname}`);
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

    const fiveMinsAgo = Date.now() - 5 * 60 * 1000;
    if (settings.reenterToReveal && lastVerifiedAt < fiveMinsAgo) {
      setPendingRevealAccount(acc);
      return;
    }

    revealAccountPassword(acc);
  };

  const handleCopyPassword = async (acc: GameAccount) => {
    try {
      await navigator.clipboard.writeText(acc.password);
    } catch {
      // Fallback if clipboard API blocked
    }
    appendLog("Password copied", "access", `${acc.game} — ${acc.nickname}`);

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

  const handleSaveAccount = (
    data: Omit<GameAccount, "id" | "updatedAt" | "monogram">,
    editId?: string
  ) => {
    const ts = Date.now();
    setNow(ts);
    const monogram = generateMonogram(data.game);
    if (editId) {
      setAccounts((prev) =>
        prev.map((a) =>
          a.id === editId
            ? { ...a, ...data, monogram, updatedAt: ts }
            : a
        )
      );
      appendLog("Account edited", "account", `${data.game} — ${data.nickname}`);
      addToast(
        "Account updated",
        "success",
        `${data.game} — ${data.nickname}`
      );
    } else {
      const newAcc: GameAccount = {
        id: `acc-${ts}`,
        ...data,
        monogram,
        updatedAt: ts,
      };
      setAccounts((prev) => [newAcc, ...prev]);
      appendLog("Account added", "account", `${data.game} — ${data.nickname}`);
      addToast(
        "Account added to vault",
        "success",
        `${data.game} — ${data.nickname}`
      );
    }
  };

  const handleDeleteAccount = (acc: GameAccount) => {
    setAccounts((prev) => prev.filter((a) => a.id !== acc.id));
    setRevealedIds((prev) => {
      const next = new Set(prev);
      next.delete(acc.id);
      return next;
    });
    appendLog("Account removed", "account", `${acc.game} — ${acc.nickname}`);
    addToast("Account deleted", "info", `${acc.game} — ${acc.nickname}`);
  };

  const handleUpdateSetting = <K extends keyof SecuritySettings>(
    key: K,
    value: SecuritySettings[K]
  ) => {
    setSettings((prev) => ({ ...prev, [key]: value }));
    appendLog("Security setting updated", "security", `${String(key)}: ${String(value)}`);
    addToast("Vault setting updated", "success");
  };

  const handleSignOutDevice = (deviceId: string) => {
    const target = devices.find((d) => d.id === deviceId);
    setDevices((prev) => prev.filter((d) => d.id !== deviceId));
    if (target) {
      appendLog("Device signed out", "device", target.name);
      addToast("Device signed out", "info", target.name);
    }
  };

  const handleSignOutOthers = () => {
    const removedCount = devices.filter((d) => !d.isCurrent).length;
    setDevices((prev) => prev.filter((d) => d.isCurrent));
    appendLog("Signed out other devices", "device", `${removedCount} sessions ended`);
    addToast(
      "Signed out all other devices",
      "success",
      `${removedCount} session(s) revoked.`
    );
  };

  const handleExportBackup = () => {
    const payload = {
      version: "1.0",
      exportedAt: new Date().toISOString(),
      cipher: "AES-256-GCM",
      email,
      accountsCount: accounts.length,
      accounts,
    };
    const blob = new Blob([JSON.stringify(payload, null, 2)], {
      type: "application/json",
    });
    const url = URL.createObjectURL(blob);
    const a = document.createElement("a");
    a.href = url;
    a.download = `conserve-backup-${new Date().toISOString().slice(0, 10)}.conserve.json`;
    a.click();
    URL.revokeObjectURL(url);
    appendLog("Encrypted backup exported", "security", `${accounts.length} accounts`);
    addToast("Encrypted backup downloaded", "success", `${accounts.length} accounts included.`);
  };

  const handleExportLogsCsv = () => {
    const header = "Timestamp,Category,Action,Target,Device,Location\n";
    const rows = auditLogs
      .map((l) =>
        [l.timestampLabel, l.category, l.action, l.target ?? "", l.device, l.location ?? ""]
          .map((v) => `"${String(v).replace(/"/g, '""')}"`)
          .join(",")
      )
      .join("\n");
    const blob = new Blob([header + rows], { type: "text/csv;charset=utf-8" });
    const url = URL.createObjectURL(blob);
    const a = document.createElement("a");
    a.href = url;
    a.download = `conserve-audit-log-${new Date().toISOString().slice(0, 10)}.csv`;
    a.click();
    URL.revokeObjectURL(url);
    addToast("Audit log exported as CSV", "success");
  };

  if (!hydrated) {
    return <div className="min-h-screen bg-[#0D0D0D]" />;
  }

  return (
    <>
      {!isUnlocked ? (
        <AuthScreen
          expectedPassword={masterPassword}
          expectedRecoveryKey={recoveryKey}
          savedEmail={email}
          onUnlock={handleUnlock}
          onRegister={handleRegister}
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
                onEditAccount={(acc) => {
                  setEditingAccount(acc);
                  setAccountModalOpen(true);
                }}
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
                onFixAccount={(acc) => {
                  setEditingAccount(acc);
                  setAccountModalOpen(true);
                }}
                onUpdateSetting={handleUpdateSetting}
                onSignOutDevice={handleSignOutDevice}
                onSignOutOthers={handleSignOutOthers}
                onOpenRecoveryKey={() => setRecoveryModalOpen(true)}
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

      {/* Modals */}
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

      <ReauthModal
        open={Boolean(pendingRevealAccount)}
        onClose={() => setPendingRevealAccount(null)}
        expectedPassword={masterPassword}
        onVerified={() => {
          setLastVerifiedAt(Date.now());
          if (pendingRevealAccount) {
            revealAccountPassword(pendingRevealAccount);
          }
          addToast("Master password verified", "success", "Unlocked reveals for 5 minutes.");
        }}
        onInvalidAttempt={() => {
          addToast("Incorrect master password", "error");
        }}
      />

      <RecoveryKeyModal
        open={recoveryModalOpen}
        onClose={() => setRecoveryModalOpen(false)}
        recoveryKey={recoveryKey}
        onCopy={async () => {
          try {
            await navigator.clipboard.writeText(recoveryKey);
          } catch {
            // ignore
          }
          addToast("Recovery key copied", "success");
        }}
        onRegenerate={() => {
          const nextKey = generateRecoveryKey();
          setRecoveryKey(nextKey);
          appendLog("Recovery key rotated", "security", "New key generated");
          addToast("New recovery key generated", "success", "Save it offline.");
        }}
      />

      <ExportBackupModal
        open={exportModalOpen}
        onClose={() => setExportModalOpen(false)}
        accountCount={accounts.length}
        onConfirmExport={handleExportBackup}
      />

      {/* Bottom Toast Notifications */}
      <ToastContainer
        toasts={toasts}
        onDismiss={dismissToast}
        elevatedMobile={isUnlocked}
      />
    </>
  );
}
