"use client";

import React, { useEffect, useState } from "react";
import {
  evaluatePasswordStrength,
  generateMonogram,
  generateStrongPassword,
} from "../data/initialVault";
import { GameAccount } from "../types/vault";
import {
  AlertTriangleIcon,
  CheckIcon,
  CopyIcon,
  DownloadIcon,
  EyeIcon,
  EyeOffIcon,
  LockIcon,
  SparklesIcon,
  XIcon,
} from "./Icons";

interface ModalShellProps {
  open: boolean;
  onClose: () => void;
  title: string;
  subtitle?: string;
  maxWidth?: string;
  children: React.ReactNode;
}

function ModalShell({
  open,
  onClose,
  title,
  subtitle,
  maxWidth = "max-w-md",
  children,
}: ModalShellProps) {
  useEffect(() => {
    if (!open) return;
    const onKey = (e: KeyboardEvent) => {
      if (e.key === "Escape") onClose();
    };
    const prevOverflow = document.body.style.overflow;
    document.body.style.overflow = "hidden";
    window.addEventListener("keydown", onKey);
    return () => {
      document.body.style.overflow = prevOverflow;
      window.removeEventListener("keydown", onKey);
    };
  }, [open, onClose]);

  if (!open) return null;

  return (
    <div
      className="fixed inset-0 z-50 flex items-end sm:items-center justify-center p-0 sm:p-4 bg-black/45 backdrop-blur-[2px] animate-backdrop-in"
      onClick={onClose}
    >
      <div
        role="dialog"
        aria-modal="true"
        className={`w-full ${maxWidth} max-h-[92dvh] flex flex-col bg-white rounded-t-2xl sm:rounded-2xl border-t sm:border border-[#E5E5E5] shadow-[0_24px_60px_rgba(0,0,0,0.2)] animate-sheet-up sm:animate-modal-in overflow-hidden`}
        onClick={(e) => e.stopPropagation()}
      >
        <div className="flex items-start justify-between gap-4 px-5 sm:px-6 pt-5 pb-4 border-b border-[#F0F0F0] shrink-0">
          <div className="min-w-0">
            <h2 className="text-[17px] font-semibold text-[#111111] tracking-tight">
              {title}
            </h2>
            {subtitle && (
              <p className="text-[12.5px] sm:text-[13px] text-[#737373] mt-0.5">
                {subtitle}
              </p>
            )}
          </div>
          <button
            type="button"
            onClick={onClose}
            aria-label="Close modal"
            className="p-2 -mr-1 rounded-lg text-[#737373] hover:text-[#111111] hover:bg-[#F4F4F5] transition-colors shrink-0 cursor-pointer"
          >
            <XIcon className="w-4 h-4" />
          </button>
        </div>
        <div className="p-5 sm:p-6 overflow-y-auto pb-[max(1.25rem,env(safe-area-inset-bottom))] sm:pb-6">
          {children}
        </div>
      </div>
    </div>
  );
}

/* 1. Add / Edit Account Modal */
interface AccountModalProps {
  open: boolean;
  onClose: () => void;
  initialAccount?: GameAccount | null;
  existingGames: string[];
  existingPasswords: { id: string; password: string; game: string }[];
  onSave: (
    data: Omit<GameAccount, "id" | "updatedAt" | "monogram">,
    editId?: string
  ) => void;
}

export function AccountModal({
  open,
  onClose,
  initialAccount,
  existingGames,
  existingPasswords,
  onSave,
}: AccountModalProps) {
  if (!open) return null;

  return (
    <AccountModalContent
      key={initialAccount?.id ?? "new"}
      onClose={onClose}
      initialAccount={initialAccount}
      existingGames={existingGames}
      existingPasswords={existingPasswords}
      onSave={onSave}
    />
  );
}

function AccountModalContent({
  onClose,
  initialAccount,
  existingGames,
  existingPasswords,
  onSave,
}: Omit<AccountModalProps, "open">) {
  const [game, setGame] = useState(initialAccount?.game ?? "");
  const [nickname, setNickname] = useState(initialAccount?.nickname ?? "");
  const [login, setLogin] = useState(initialAccount?.login ?? "");
  const [password, setPassword] = useState(initialAccount?.password ?? "");
  const [twoFactor, setTwoFactor] = useState(initialAccount?.twoFactor ?? false);
  const [notes, setNotes] = useState(initialAccount?.notes ?? "");
  const [showPw, setShowPw] = useState(false);
  const [error, setError] = useState("");

  const strength = evaluatePasswordStrength(password);
  const isReused =
    password.length > 0 &&
    existingPasswords.some(
      (p) => p.password === password && p.id !== initialAccount?.id
    );

  const handleSubmit = (e: React.FormEvent) => {
    e.preventDefault();
    if (!game.trim() || !nickname.trim() || !login.trim() || !password.trim()) {
      setError("Please fill in game, account nickname, login, and password.");
      return;
    }
    onSave(
      {
        game: game.trim(),
        nickname: nickname.trim(),
        login: login.trim(),
        password,
        twoFactor,
        notes: notes.trim() || undefined,
      },
      initialAccount?.id
    );
    onClose();
  };

  return (
    <ModalShell
      open={true}
      onClose={onClose}
      title={initialAccount ? "Edit account" : "New game account"}
      subtitle={
        initialAccount
          ? `Update credentials for ${initialAccount.game} — ${initialAccount.nickname}`
          : "Encrypted locally with AES-256 before saving to your vault."
      }
      maxWidth="max-w-lg"
    >
      <form onSubmit={handleSubmit} className="space-y-4">
        <div>
          <label className="block text-[12px] font-medium text-[#404040] mb-1.5">
            Game label
          </label>
          <div className="flex items-center gap-2.5">
            <div className="w-9 h-9 rounded-lg bg-[#111111] text-white text-xs font-bold flex items-center justify-center shrink-0">
              {generateMonogram(game || "GM")}
            </div>
            <input
              type="text"
              value={game}
              onChange={(e) => setGame(e.target.value)}
              placeholder="e.g. Genshin Impact, Valorant"
              className="w-full h-10 px-3 rounded-xl border border-[#E2E2E2] text-[16px] sm:text-[13.5px] focus:outline-none focus:border-[#111111] transition-colors"
            />
          </div>
          {existingGames.length > 0 && (
            <div className="flex flex-wrap gap-1.5 mt-2">
              {existingGames.map((g) => (
                <button
                  key={g}
                  type="button"
                  onClick={() => setGame(g)}
                  className={`px-2.5 py-1 rounded-full text-[11px] font-medium border transition-colors cursor-pointer ${
                    game === g
                      ? "bg-[#111111] text-white border-[#111111]"
                      : "bg-[#F7F7F7] text-[#525252] border-[#E5E5E5] hover:border-[#BDBDBD]"
                  }`}
                >
                  {g}
                </button>
              ))}
            </div>
          )}
        </div>

        <div className="grid grid-cols-1 sm:grid-cols-2 gap-3.5">
          <div>
            <label className="block text-[12px] font-medium text-[#404040] mb-1.5">
              Account nickname / server
            </label>
            <input
              type="text"
              value={nickname}
              onChange={(e) => setNickname(e.target.value)}
              placeholder="e.g. Main · Asia server"
              className="w-full h-10 px-3 rounded-xl border border-[#E2E2E2] text-[16px] sm:text-[13.5px] focus:outline-none focus:border-[#111111] transition-colors"
            />
          </div>
          <div>
            <label className="block text-[12px] font-medium text-[#404040] mb-1.5">
              Email or username
            </label>
            <input
              type="text"
              value={login}
              onChange={(e) => setLogin(e.target.value)}
              placeholder="you@example.com"
              className="w-full h-10 px-3 rounded-xl border border-[#E2E2E2] text-[16px] sm:text-[13.5px] focus:outline-none focus:border-[#111111] transition-colors"
            />
          </div>
        </div>

        <div>
          <div className="flex items-center justify-between mb-1.5">
            <label className="text-[12px] font-medium text-[#404040]">
              Password
            </label>
            <button
              type="button"
              onClick={() => {
                setPassword(generateStrongPassword(16));
                setShowPw(true);
              }}
              className="inline-flex items-center gap-1 text-[11.5px] font-medium text-[#111111] hover:underline cursor-pointer"
            >
              <SparklesIcon className="w-3.5 h-3.5" />
              Generate strong
            </button>
          </div>
          <div className="relative">
            <input
              type={showPw ? "text" : "password"}
              value={password}
              onChange={(e) => setPassword(e.target.value)}
              placeholder="Enter account password"
              className="w-full h-10 pl-3 pr-10 rounded-xl border border-[#E2E2E2] font-mono text-[16px] sm:text-[13px] focus:outline-none focus:border-[#111111] transition-colors"
            />
            <button
              type="button"
              onClick={() => setShowPw((v) => !v)}
              aria-label={showPw ? "Hide password" : "Show password"}
              className="absolute right-2.5 top-1/2 -translate-y-1/2 p-1 text-[#737373] hover:text-[#111111] cursor-pointer"
            >
              {showPw ? (
                <EyeOffIcon className="w-4 h-4" />
              ) : (
                <EyeIcon className="w-4 h-4" />
              )}
            </button>
          </div>

          {password && (
            <div className="mt-2 space-y-1.5">
              <div className="flex items-center gap-2">
                <div className="flex-1 h-1.5 rounded-full bg-[#ECECEC] overflow-hidden">
                  <div
                    className={`h-full transition-all duration-300 ${
                      strength.label === "Strong"
                        ? "w-full bg-[#111111]"
                        : strength.label === "Fair"
                        ? "w-2/3 bg-amber-500"
                        : "w-1/3 bg-red-500"
                    }`}
                  />
                </div>
                <span className="text-[11px] font-medium text-[#525252]">
                  {strength.label}
                </span>
              </div>
              {isReused && (
                <p className="text-[11.5px] text-amber-700 flex items-center gap-1">
                  <AlertTriangleIcon className="w-3.5 h-3.5 shrink-0" />
                  This password is already used on another account.
                </p>
              )}
            </div>
          )}
        </div>

        <div className="flex items-center justify-between p-3.5 rounded-xl bg-[#F8F8F8] border border-[#EAEAEA]">
          <div>
            <p className="text-[13px] font-medium text-[#111111]">
              Two-factor authentication (2FA)
            </p>
            <p className="text-[11.5px] text-[#737373]">
              Mark whether 2FA is active on this game account
            </p>
          </div>
          <button
            type="button"
            role="switch"
            aria-checked={twoFactor}
            onClick={() => setTwoFactor((v) => !v)}
            className={`w-11 h-6 rounded-full p-0.5 transition-colors cursor-pointer ${
              twoFactor ? "bg-[#111111]" : "bg-[#D4D4D8]"
            }`}
          >
            <span
              className={`block w-5 h-5 rounded-full bg-white shadow transition-transform ${
                twoFactor ? "translate-x-5" : "translate-x-0"
              }`}
            />
          </button>
        </div>

        <div>
          <label className="block text-[12px] font-medium text-[#404040] mb-1.5">
            Notes (optional)
          </label>
          <input
            type="text"
            value={notes}
            onChange={(e) => setNotes(e.target.value)}
            placeholder="UID, server region, recovery email..."
            className="w-full h-10 px-3 rounded-xl border border-[#E2E2E2] text-[16px] sm:text-[13px] focus:outline-none focus:border-[#111111] transition-colors"
          />
        </div>

        {error && (
          <p className="text-[12.5px] text-red-600 font-medium">{error}</p>
        )}

        <div className="flex flex-col-reverse sm:flex-row sm:items-center sm:justify-end gap-2 sm:gap-2.5 pt-2">
          <button
            type="button"
            onClick={onClose}
            className="w-full sm:w-auto px-4 py-2.5 sm:py-2 rounded-xl border border-[#E2E2E2] text-[13px] font-medium text-[#404040] hover:bg-[#F5F5F5] transition-colors cursor-pointer"
          >
            Cancel
          </button>
          <button
            type="submit"
            className="w-full sm:w-auto px-4 py-2.5 sm:py-2 rounded-xl bg-[#111111] text-white text-[13px] font-medium hover:bg-[#262626] active:scale-[0.98] transition-all cursor-pointer"
          >
            {initialAccount ? "Save changes" : "Add to vault"}
          </button>
        </div>
      </form>
    </ModalShell>
  );
}

/* 2. Delete Confirmation Modal */
interface DeleteAccountModalProps {
  account: GameAccount | null;
  onClose: () => void;
  onConfirm: (account: GameAccount) => void;
}

export function DeleteAccountModal({
  account,
  onClose,
  onConfirm,
}: DeleteAccountModalProps) {
  return (
    <ModalShell
      open={Boolean(account)}
      onClose={onClose}
      title="Remove account from vault?"
      subtitle="This action permanently deletes the encrypted entry from this device."
    >
      {account && (
        <div className="space-y-4">
          <div className="flex items-center gap-3 p-3.5 rounded-xl bg-[#F8F8F8] border border-[#EAEAEA]">
            <div className="w-9 h-9 rounded-lg bg-[#111111] text-white text-xs font-bold flex items-center justify-center">
              {account.monogram}
            </div>
            <div className="min-w-0">
              <p className="text-[13.5px] font-semibold text-[#111111] truncate">
                {account.game} — {account.nickname}
              </p>
              <p className="text-[12px] text-[#737373] truncate">
                {account.login}
              </p>
            </div>
          </div>

          <div className="flex flex-col-reverse sm:flex-row sm:items-center sm:justify-end gap-2 sm:gap-2.5 pt-1">
            <button
              type="button"
              onClick={onClose}
              className="w-full sm:w-auto px-4 py-2.5 sm:py-2 rounded-xl border border-[#E2E2E2] text-[13px] font-medium text-[#404040] hover:bg-[#F5F5F5] transition-colors cursor-pointer"
            >
              Cancel
            </button>
            <button
              type="button"
              onClick={() => {
                onConfirm(account);
                onClose();
              }}
              className="w-full sm:w-auto px-4 py-2.5 sm:py-2 rounded-xl bg-red-600 text-white text-[13px] font-medium hover:bg-red-700 active:scale-[0.98] transition-all cursor-pointer"
            >
              Delete account
            </button>
          </div>
        </div>
      )}
    </ModalShell>
  );
}

/* 3. Master Password Re-auth Modal */
interface ReauthModalProps {
  open: boolean;
  onClose: () => void;
  expectedPassword: string;
  onVerified: () => void;
  onInvalidAttempt: () => void;
}

export function ReauthModal({
  open,
  onClose,
  expectedPassword,
  onVerified,
  onInvalidAttempt,
}: ReauthModalProps) {
  if (!open) return null;

  return (
    <ReauthModalContent
      onClose={onClose}
      expectedPassword={expectedPassword}
      onVerified={onVerified}
      onInvalidAttempt={onInvalidAttempt}
    />
  );
}

function ReauthModalContent({
  onClose,
  expectedPassword,
  onVerified,
  onInvalidAttempt,
}: Omit<ReauthModalProps, "open">) {
  const [input, setInput] = useState("");
  const [error, setError] = useState("");

  const handleSubmit = (e: React.FormEvent) => {
    e.preventDefault();
    if (!input) {
      setError("Enter your master password.");
      return;
    }
    if (input !== expectedPassword) {
      setError("Incorrect master password.");
      onInvalidAttempt();
      return;
    }
    onVerified();
    onClose();
  };

  return (
    <ModalShell
      open={true}
      onClose={onClose}
      title="Confirm master password"
      subtitle="Required once every 5 minutes before revealing a password."
    >
      <form onSubmit={handleSubmit} className="space-y-4">
        <div className="flex items-center gap-2.5 px-3 py-2.5 rounded-xl bg-[#F7F7F7] border border-[#EAEAEA] text-[12px] text-[#525252]">
          <LockIcon className="w-4 h-4 text-[#111111] shrink-0" />
          <span>
            Session master password:{" "}
            <code className="font-mono font-semibold text-[#111111]">
              {expectedPassword}
            </code>
          </span>
        </div>

        <div>
          <label className="block text-[12px] font-medium text-[#404040] mb-1.5">
            Master password
          </label>
          <input
            type="password"
            autoFocus
            value={input}
            onChange={(e) => {
              setInput(e.target.value);
              setError("");
            }}
            placeholder="Enter master password"
            className="w-full h-10 px-3 rounded-xl border border-[#E2E2E2] text-[16px] sm:text-[13.5px] focus:outline-none focus:border-[#111111]"
          />
          {error && <p className="text-[12px] text-red-600 mt-1.5">{error}</p>}
        </div>

        <div className="flex flex-col-reverse sm:flex-row sm:items-center sm:justify-end gap-2 sm:gap-2.5">
          <button
            type="button"
            onClick={onClose}
            className="w-full sm:w-auto px-4 py-2.5 sm:py-2 rounded-xl border border-[#E2E2E2] text-[13px] font-medium text-[#404040] hover:bg-[#F5F5F5] cursor-pointer"
          >
            Cancel
          </button>
          <button
            type="submit"
            className="w-full sm:w-auto px-4 py-2.5 sm:py-2 rounded-xl bg-[#111111] text-white text-[13px] font-medium hover:bg-[#262626] active:scale-[0.98] transition-all cursor-pointer"
          >
            Verify & reveal
          </button>
        </div>
      </form>
    </ModalShell>
  );
}

/* 4. Recovery Key Modal */
interface RecoveryKeyModalProps {
  open: boolean;
  onClose: () => void;
  recoveryKey: string;
  onCopy: () => void;
  onRegenerate: () => void;
}

export function RecoveryKeyModal({
  open,
  onClose,
  recoveryKey,
  onCopy,
  onRegenerate,
}: RecoveryKeyModalProps) {
  const [copied, setCopied] = useState(false);

  const handleCopy = () => {
    onCopy();
    setCopied(true);
    setTimeout(() => setCopied(false), 2000);
  };

  const handleDownload = () => {
    const blob = new Blob(
      [
        `CONSERVE VAULT RECOVERY KEY\nGenerated: ${new Date().toISOString()}\n\nRecovery Key: ${recoveryKey}\n\nKeep this key offline in a safe place. It is the only way to recover your vault if you forget your master password.\n`,
      ],
      { type: "text/plain;charset=utf-8" }
    );
    const url = URL.createObjectURL(blob);
    const a = document.createElement("a");
    a.href = url;
    a.download = "conserve-recovery-key.txt";
    a.click();
    URL.revokeObjectURL(url);
  };

  return (
    <ModalShell
      open={open}
      onClose={onClose}
      title="Your vault recovery key"
      subtitle="Store this key offline. Anyone with this key can unlock your encrypted vault."
    >
      <div className="space-y-4">
        <div className="p-3.5 sm:p-4 rounded-xl bg-[#111111] text-white font-mono text-[12.5px] sm:text-[14px] tracking-wider text-center select-all break-all border border-white/10">
          {recoveryKey}
        </div>

        <div className="grid grid-cols-2 sm:flex sm:flex-wrap items-center gap-2">
          <button
            type="button"
            onClick={handleCopy}
            className="col-span-2 sm:flex-1 inline-flex items-center justify-center gap-1.5 px-3.5 py-2.5 sm:py-2 rounded-xl bg-[#111111] text-white text-[13px] font-medium hover:bg-[#262626] cursor-pointer"
          >
            {copied ? (
              <>
                <CheckIcon className="w-4 h-4" /> Copied
              </>
            ) : (
              <>
                <CopyIcon className="w-4 h-4" /> Copy key
              </>
            )}
          </button>
          <button
            type="button"
            onClick={handleDownload}
            className="inline-flex items-center justify-center gap-1.5 px-3.5 py-2.5 sm:py-2 rounded-xl border border-[#E2E2E2] text-[13px] font-medium text-[#111111] hover:bg-[#F5F5F5] cursor-pointer"
          >
            <DownloadIcon className="w-4 h-4" /> Save .txt
          </button>
          <button
            type="button"
            onClick={onRegenerate}
            className="inline-flex items-center justify-center gap-1.5 px-3.5 py-2.5 sm:py-2 rounded-xl border border-[#E2E2E2] text-[13px] font-medium text-[#525252] hover:text-[#111111] hover:bg-[#F5F5F5] cursor-pointer"
          >
            Rotate
          </button>
        </div>
      </div>
    </ModalShell>
  );
}

/* 5. Export Encrypted Backup Modal */
interface ExportBackupModalProps {
  open: boolean;
  onClose: () => void;
  accountCount: number;
  onConfirmExport: () => void;
}

export function ExportBackupModal({
  open,
  onClose,
  accountCount,
  onConfirmExport,
}: ExportBackupModalProps) {
  return (
    <ModalShell
      open={open}
      onClose={onClose}
      title="Export encrypted backup"
      subtitle="Download an AES-256 encrypted snapshot of your game accounts."
    >
      <div className="space-y-4">
        <div className="p-3.5 rounded-xl bg-[#F8F8F8] border border-[#EAEAEA] space-y-1.5 text-[13px]">
          <div className="flex justify-between">
            <span className="text-[#737373]">Included accounts</span>
            <span className="font-semibold text-[#111111]">{accountCount}</span>
          </div>
          <div className="flex justify-between">
            <span className="text-[#737373]">Cipher</span>
            <span className="font-mono text-[12px] text-[#111111]">
              AES-256-GCM
            </span>
          </div>
          <div className="flex justify-between">
            <span className="text-[#737373]">Format</span>
            <span className="font-mono text-[12px] text-[#111111]">
              .conserve.json
            </span>
          </div>
        </div>

        <div className="flex flex-col-reverse sm:flex-row sm:items-center sm:justify-end gap-2 sm:gap-2.5">
          <button
            type="button"
            onClick={onClose}
            className="w-full sm:w-auto px-4 py-2.5 sm:py-2 rounded-xl border border-[#E2E2E2] text-[13px] font-medium text-[#404040] hover:bg-[#F5F5F5] cursor-pointer"
          >
            Cancel
          </button>
          <button
            type="button"
            onClick={() => {
              onConfirmExport();
              onClose();
            }}
            className="w-full sm:w-auto inline-flex items-center justify-center gap-1.5 px-4 py-2.5 sm:py-2 rounded-xl bg-[#111111] text-white text-[13px] font-medium hover:bg-[#262626] active:scale-[0.98] transition-all cursor-pointer"
          >
            <DownloadIcon className="w-4 h-4" />
            Download backup
          </button>
        </div>
      </div>
    </ModalShell>
  );
}
