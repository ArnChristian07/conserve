"use client";

import React, { useState } from "react";
import Image from "next/image";
import { CheckIcon, EyeIcon, EyeOffIcon, LockIcon } from "./Icons";
import { VaultError } from "../lib/vaultService";
import { ToastVariant } from "../types/vault";

interface AuthScreenProps {
  savedEmail: string;
  onLogin: (email: string, masterPassword: string) => Promise<void>;
  onRegister: (email: string, masterPassword: string) => Promise<"unlocked" | "confirm-email">;
  onSendRecoveryCode: (email: string) => Promise<void>;
  onRecover: (
    email: string,
    code: string,
    recoveryKey: string,
    newMasterPassword: string
  ) => Promise<void>;
  onToast: (message: string, variant?: ToastVariant, detail?: string) => void;
}

const MIN_MASTER_PASSWORD = 8;
const MAX_ATTEMPTS = 5;
const LOCKOUT_MS = 15 * 60 * 1000;

function isCredentialError(err: unknown): boolean {
  return err instanceof VaultError && err.kind === "credentials";
}

function errorMessage(err: unknown): string {
  return err instanceof Error ? err.message : "Something went wrong. Try again.";
}

export function AuthScreen({
  savedEmail,
  onLogin,
  onRegister,
  onSendRecoveryCode,
  onRecover,
  onToast,
}: AuthScreenProps) {
  const [mode, setMode] = useState<"login" | "register">("login");
  const [useRecovery, setUseRecovery] = useState(false);
  const [codeSent, setCodeSent] = useState(false);
  const [busy, setBusy] = useState(false);

  const [email, setEmail] = useState(savedEmail);
  const [password, setPassword] = useState("");
  const [confirmPassword, setConfirmPassword] = useState("");
  const [recoveryInput, setRecoveryInput] = useState("");
  const [otpCode, setOtpCode] = useState("");
  const [showPassword, setShowPassword] = useState(false);

  // UX-level throttle; the real limits are Supabase Auth's server-side rate limits.
  const [failedAttempts, setFailedAttempts] = useState(0);
  const [lockedUntil, setLockedUntil] = useState<number | null>(null);

  const recordFailure = (err: unknown) => {
    if (!isCredentialError(err)) {
      onToast(errorMessage(err), "error");
      return;
    }
    const next = failedAttempts + 1;
    setFailedAttempts(next);
    if (next >= MAX_ATTEMPTS) {
      setLockedUntil(Date.now() + LOCKOUT_MS);
      onToast("Sign-in locked for 15 minutes", "error", "5 consecutive failed attempts reached.");
    } else {
      onToast(
        errorMessage(err),
        "error",
        `${MAX_ATTEMPTS - next} attempts remaining before 15-minute lockout.`
      );
    }
  };

  const validateNewPassword = (): boolean => {
    if (password.length < MIN_MASTER_PASSWORD) {
      onToast(
        "Master password too short",
        "error",
        `Use at least ${MIN_MASTER_PASSWORD} characters to protect your vault.`
      );
      return false;
    }
    if (password !== confirmPassword) {
      onToast("Master passwords do not match", "error");
      return false;
    }
    return true;
  };

  const switchMode = (next: "login" | "register") => {
    setMode(next);
    setUseRecovery(false);
    setCodeSent(false);
    setPassword("");
    setConfirmPassword("");
  };

  const toggleRecovery = (on: boolean) => {
    setUseRecovery(on);
    setCodeSent(false);
    setPassword("");
    setConfirmPassword("");
  };

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    if (busy) return;

    if (lockedUntil !== null && Date.now() < lockedUntil) {
      const minsLeft = Math.max(1, Math.ceil((lockedUntil - Date.now()) / 60000));
      onToast(
        "Sign-in temporarily locked",
        "error",
        `Too many failed attempts. Try again in ${minsLeft} min.`
      );
      return;
    }

    const trimmedEmail = email.trim();
    if (!trimmedEmail || !trimmedEmail.includes("@")) {
      onToast("Enter a valid email address", "error");
      return;
    }

    setBusy(true);
    try {
      if (mode === "register") {
        if (!validateNewPassword()) return;
        const result = await onRegister(trimmedEmail, password);
        if (result === "confirm-email") {
          onToast(
            "Check your inbox",
            "info",
            "Confirm your email, then log in with your master password."
          );
          switchMode("login");
        }
        return;
      }

      if (useRecovery) {
        if (!recoveryInput.trim()) {
          onToast("Enter your recovery key", "error");
          return;
        }
        if (!validateNewPassword()) return;
        if (!codeSent) {
          await onSendRecoveryCode(trimmedEmail);
          setCodeSent(true);
          onToast("Code sent", "info", `Enter the code emailed to ${trimmedEmail}.`);
          return;
        }
        if (!otpCode.trim()) {
          onToast("Enter the code from your email", "error");
          return;
        }
        await onRecover(trimmedEmail, otpCode, recoveryInput, password);
        setFailedAttempts(0);
        return;
      }

      if (!password) {
        onToast("Enter your master password", "error");
        return;
      }
      await onLogin(trimmedEmail, password);
      setFailedAttempts(0);
    } catch (err) {
      recordFailure(err);
    } finally {
      setBusy(false);
    }
  };

  const submitLabel = busy
    ? mode === "register"
      ? "Creating vault…"
      : useRecovery && !codeSent
      ? "Sending code…"
      : "Unlocking…"
    : mode === "register"
    ? "Create & unlock vault"
    : useRecovery
    ? codeSent
      ? "Recover vault"
      : "Email me a code"
    : "Unlock vault";

  return (
    <div className="min-h-screen w-full grid grid-cols-1 lg:grid-cols-2 bg-white animate-fade-slide-up">
      {/* Left Dark Panel (compact top banner on mobile) */}
      <div className="bg-dot-matrix text-white flex flex-col justify-between px-5 py-6 sm:p-10 lg:p-14 lg:min-h-screen">
        <div className="flex items-center justify-between gap-2.5">
          <div className="flex items-center gap-2.5">
            <span className="text-[18px] sm:text-[19px] font-bold tracking-tight text-white">
              Conserve
            </span>
            <span className="text-[11px] font-mono text-white/60 border border-white/15 bg-white/[0.04] px-2 py-0.5 rounded-md">
              v1.0
            </span>
          </div>
          <span className="lg:hidden text-[11px] text-[#9A9A9A] inline-flex items-center gap-1">
            <LockIcon className="w-3 h-3 text-white/70" />
            AES-256
          </span>
        </div>

        <div className="mt-5 mb-4 sm:my-8 lg:my-0 max-w-md flex items-center gap-4 sm:gap-6 lg:block">
          <div className="w-16 h-16 sm:w-28 sm:h-28 lg:w-56 lg:h-56 rounded-full overflow-hidden border-2 lg:border-[3px] border-white/85 bg-[#1a1a1a] shadow-[0_12px_32px_rgba(0,0,0,0.6)] lg:shadow-[0_20px_50px_rgba(0,0,0,0.65)] shrink-0 lg:mb-9 relative">
            <Image
              src="/assets/conserve-icon.png"
              alt="Conserve mascot"
              fill
              sizes="(max-width: 640px) 64px, (max-width: 1024px) 112px, 224px"
              className="object-cover"
              priority
            />
          </div>

          <div className="min-w-0">
            <h1 className="text-[21px] sm:text-[32px] lg:text-[38px] font-bold leading-[1.15] lg:leading-[1.12] tracking-[-0.025em] text-white">
              Every save file has a key. Keep them here.
            </h1>
            <p className="mt-2 sm:mt-3 lg:mt-4 text-[13px] sm:text-[14.5px] leading-relaxed text-[#9A9A9A] max-w-[410px] hidden sm:block">
              One encrypted vault for all your game logins, from gacha mains to
              ranked smurfs. Label them by game and keep them locked.
            </p>
          </div>
        </div>

        <div className="flex flex-wrap items-center gap-x-4 sm:gap-x-6 gap-y-1.5 text-[11.5px] sm:text-[12px] text-[#9A9A9A] pt-1 lg:pt-0">
          <span className="inline-flex items-center gap-1.5">
            <CheckIcon className="w-3.5 h-3.5 text-white/75" />
            Zero-knowledge encryption
          </span>
          <span className="inline-flex items-center gap-1.5">
            <CheckIcon className="w-3.5 h-3.5 text-white/75" />
            Two-step login
          </span>
          <span className="inline-flex items-center gap-1.5">
            <CheckIcon className="w-3.5 h-3.5 text-white/75" />
            Auto-lock
          </span>
        </div>
      </div>

      {/* Right White Form Panel */}
      <div className="flex items-start lg:items-center justify-center px-5 py-7 sm:p-12 bg-white">
        <div className="w-full max-w-[390px]">
          {/* Segmented Switcher */}
          <div className="grid grid-cols-2 p-1 rounded-xl bg-[#F4F4F5] mb-6 sm:mb-8">
            <button
              type="button"
              onClick={() => switchMode("login")}
              className={`py-2.5 text-[13px] font-semibold rounded-lg transition-all cursor-pointer ${
                mode === "login"
                  ? "bg-[#0D0D0D] text-white shadow-sm"
                  : "text-[#525252] hover:text-[#111111]"
              }`}
            >
              Log in
            </button>
            <button
              type="button"
              onClick={() => switchMode("register")}
              className={`py-2.5 text-[13px] font-semibold rounded-lg transition-all cursor-pointer ${
                mode === "register"
                  ? "bg-[#0D0D0D] text-white shadow-sm"
                  : "text-[#525252] hover:text-[#111111]"
              }`}
            >
              Register
            </button>
          </div>

          <div className="mb-6">
            <h2 className="text-[24px] font-bold tracking-tight text-[#111111]">
              {mode === "login" ? "Welcome back" : "Create your vault"}
            </h2>
            <p className="text-[13.5px] text-[#737373] mt-1">
              {mode === "login"
                ? useRecovery
                  ? "Use your recovery key to set a new master password."
                  : "Unlock your vault with your master password."
                : "Set a master password to encrypt your game accounts."}
            </p>
          </div>

          <form onSubmit={handleSubmit} className="space-y-4">
            <div>
              <label className="block text-[12.5px] font-semibold text-[#111111] mb-1.5">
                Email
              </label>
              <input
                type="email"
                autoComplete="email"
                value={email}
                onChange={(e) => setEmail(e.target.value)}
                placeholder="you@example.com"
                className="w-full h-11 px-3.5 rounded-xl border border-[#E2E2E2] bg-white text-[16px] sm:text-[14px] text-[#111111] placeholder:text-[#A3A3A3] focus:outline-none focus:border-[#111111] transition-colors"
              />
            </div>

            {mode === "login" && useRecovery && (
              <div>
                <div className="flex items-center justify-between mb-1.5">
                  <label className="text-[12.5px] font-semibold text-[#111111]">
                    Recovery key
                  </label>
                  <button
                    type="button"
                    onClick={() => toggleRecovery(false)}
                    className="text-[12px] text-[#525252] underline underline-offset-2 hover:text-[#111111] cursor-pointer py-0.5"
                  >
                    Use master password
                  </button>
                </div>
                <input
                  type="text"
                  value={recoveryInput}
                  onChange={(e) => setRecoveryInput(e.target.value)}
                  placeholder="CNSV-XXXX-XXXX-XXXX-XXXX-XXXX"
                  className="w-full h-11 px-3.5 rounded-xl border border-[#E2E2E2] bg-white font-mono text-[16px] sm:text-[13px] text-[#111111] placeholder:text-[#A3A3A3] focus:outline-none focus:border-[#111111] transition-colors"
                />
              </div>
            )}

            <div>
                <div className="flex items-center justify-between mb-1.5">
                  <label className="text-[12.5px] font-semibold text-[#111111]">
                    {useRecovery ? "New master password" : "Master password"}
                  </label>
                  {mode === "login" && !useRecovery && (
                    <button
                      type="button"
                      onClick={() => toggleRecovery(true)}
                      className="text-[12px] text-[#525252] underline underline-offset-2 hover:text-[#111111] cursor-pointer py-0.5"
                    >
                      Use recovery key
                    </button>
                  )}
                </div>
                <div className="relative">
                  <input
                    type={showPassword ? "text" : "password"}
                    value={password}
                    onChange={(e) => setPassword(e.target.value)}
                    autoComplete={mode === "login" && !useRecovery ? "current-password" : "new-password"}
                    placeholder={
                      mode === "login" && !useRecovery
                        ? "Enter master password"
                        : `At least ${MIN_MASTER_PASSWORD} characters`
                    }
                    className="w-full h-11 pl-3.5 pr-11 rounded-xl border border-[#E2E2E2] bg-white text-[16px] sm:text-[14px] text-[#111111] placeholder:text-[#B5B5B5] focus:outline-none focus:border-[#111111] transition-colors"
                  />
                  <button
                    type="button"
                    onClick={() => setShowPassword((v) => !v)}
                    aria-label={showPassword ? "Hide password" : "Show password"}
                    className="absolute right-1.5 top-1/2 -translate-y-1/2 p-2 rounded-lg text-[#888888] hover:text-[#111111] cursor-pointer"
                  >
                    {showPassword ? (
                      <EyeOffIcon className="w-4 h-4" />
                    ) : (
                      <EyeIcon className="w-4 h-4" />
                    )}
                  </button>
                </div>
            </div>

            {(mode === "register" || useRecovery) && (
              <div>
                <label className="block text-[12.5px] font-semibold text-[#111111] mb-1.5">
                  {useRecovery ? "Confirm new master password" : "Confirm master password"}
                </label>
                <input
                  type={showPassword ? "text" : "password"}
                  value={confirmPassword}
                  onChange={(e) => setConfirmPassword(e.target.value)}
                  autoComplete="new-password"
                  placeholder="Re-enter master password"
                  className="w-full h-11 px-3.5 rounded-xl border border-[#E2E2E2] bg-white text-[16px] sm:text-[14px] text-[#111111] placeholder:text-[#B5B5B5] focus:outline-none focus:border-[#111111] transition-colors"
                />
              </div>
            )}

            {mode === "login" && useRecovery && codeSent && (
              <div>
                <label className="block text-[12.5px] font-semibold text-[#111111] mb-1.5">
                  Code from your email
                </label>
                <input
                  type="text"
                  inputMode="numeric"
                  autoComplete="one-time-code"
                  value={otpCode}
                  onChange={(e) => setOtpCode(e.target.value)}
                  placeholder="6-digit code"
                  className="w-full h-11 px-3.5 rounded-xl border border-[#E2E2E2] bg-white font-mono tracking-widest text-[16px] sm:text-[14px] text-[#111111] placeholder:text-[#A3A3A3] placeholder:tracking-normal focus:outline-none focus:border-[#111111] transition-colors"
                />
              </div>
            )}

            <button
              type="submit"
              disabled={busy}
              aria-busy={busy}
              className="w-full h-11 rounded-xl bg-[#0D0D0D] text-white text-[13.5px] font-semibold hover:bg-[#222222] active:scale-[0.99] transition-all cursor-pointer disabled:opacity-60 disabled:cursor-wait"
            >
              {submitLabel}
            </button>
          </form>

          <div className="mt-5 flex items-center gap-2 text-[12px] text-[#888888]">
            <LockIcon className="w-3.5 h-3.5 shrink-0" />
            <span>5 failed attempts locks sign-in for 15 minutes.</span>
          </div>
        </div>
      </div>
    </div>
  );
}
