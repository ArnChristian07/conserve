"use client";

import React from "react";
import {
  AuditLogEntry,
  GameAccount,
  SecuritySettings,
  SignedInDevice,
  VaultHealthSummary,
} from "../types/vault";
import { formatRelativeTime } from "../lib/vaultUtils";
import { DeviceIcon, DownloadIcon } from "./Icons";

interface SecurityCenterViewProps {
  health: VaultHealthSummary;
  accounts: GameAccount[];
  settings: SecuritySettings;
  devices: SignedInDevice[];
  recentLogs: AuditLogEntry[];
  onFixAccount: (account: GameAccount) => void;
  onUpdateSetting: <K extends keyof SecuritySettings>(
    key: K,
    value: SecuritySettings[K]
  ) => void;
  onSignOutDevice: (deviceId: string) => void;
  onSignOutOthers: () => void;
  onOpenRecoveryKey: () => void;
  onOpenChangePassword: () => void;
  onOpenExportBackup: () => void;
  onViewAllActivity: () => void;
  /** epoch ms of the last recovery-key rotation, from vault_keys */
  recoveryKeyRotatedAt: number | null;
}

export function SecurityCenterView({
  health,
  accounts,
  settings,
  devices,
  recentLogs,
  onFixAccount,
  onUpdateSetting,
  onSignOutDevice,
  onSignOutOthers,
  onOpenRecoveryKey,
  onOpenChangePassword,
  onOpenExportBackup,
  onViewAllActivity,
  recoveryKeyRotatedAt,
}: SecurityCenterViewProps) {
  const toggleRows: {
    key: keyof Omit<SecuritySettings, "autoLockMinutes">;
    title: string;
    description: string;
  }[] = [
    {
      key: "reenterToReveal",
      title: "Re-enter master password to reveal",
      description: "Asked once per 5 minutes before showing a password.",
    },
    {
      key: "clearClipboard",
      title: "Clear clipboard after 30 seconds",
      description: "Copied passwords don't linger.",
    },
    {
      key: "lockOnTabClose",
      title: "Lock when the tab closes",
      description: "Reopening asks for your master password.",
    },
    {
      key: "twoStepLogin",
      title: "Two-step login for Conserve",
      description: "Authenticator app code at every sign-in.",
    },
    {
      key: "emailNewSignIns",
      title: "Email me on new sign-ins",
      description: "Get notified when a device is added.",
    },
  ];

  const autoLockOptions: { label: string; value: 1 | 5 | 15 | 60 }[] = [
    { label: "1 min", value: 1 },
    { label: "5 min", value: 5 },
    { label: "15 min", value: 15 },
    { label: "1 hour", value: 60 },
  ];

  return (
    <div className="space-y-5 sm:space-y-6 animate-fade-slide-up">
      {/* Header */}
      <div>
        <h1 className="text-[24px] sm:text-[28px] font-bold tracking-tight text-[#111111] leading-tight">
          Security center
        </h1>
        <p className="text-[13px] sm:text-[13.5px] text-[#737373] mt-1">
          Check password health, tighten vault settings and see who&apos;s signed
          in.
        </p>
      </div>

      {/* Top Row: Vault Health + Fix these first */}
      <div className="grid grid-cols-1 lg:grid-cols-2 gap-4 sm:gap-5">
        {/* Vault Health Dark Card */}
        <div className="bg-dot-matrix-subtle text-white rounded-2xl border border-[#222222] p-5 sm:p-6 flex flex-col justify-between shadow-[0_6px_20px_rgba(0,0,0,0.08)]">
          <div>
            <div className="flex items-center justify-between gap-3">
              <span className="text-[11px] font-semibold tracking-[0.08em] uppercase text-[#9A9A9A]">
                VAULT HEALTH
              </span>
              <span className="px-2.5 py-1 rounded-full border border-white/20 bg-white/[0.06] text-[11.5px] font-medium text-white">
                {health.label}
              </span>
            </div>

            <div className="mt-4 flex items-baseline gap-1">
              <span className="text-[44px] sm:text-[52px] font-bold leading-none tracking-tight tabular-nums">
                {health.score}
              </span>
              <span className="text-[16px] sm:text-[18px] text-[#8A8A8A] font-medium">
                /100
              </span>
            </div>

            {/* Progress bar */}
            <div className="mt-4 sm:mt-5 h-2 w-full rounded-full bg-white/15 overflow-hidden">
              <div
                className="h-full bg-white rounded-full transition-all duration-500 ease-out"
                style={{ width: `${health.score}%` }}
              />
            </div>
          </div>

          <div className="mt-5 sm:mt-6 pt-4 sm:pt-5 border-t border-white/10 grid grid-cols-3 gap-2.5 sm:gap-4">
            <div>
              <p className="text-[18px] sm:text-[20px] font-bold tabular-nums">
                {health.weakOrReusedCount}
              </p>
              <p className="text-[11px] sm:text-[11.5px] text-[#8A8A8A] mt-0.5 leading-snug">
                Weak or reused
              </p>
            </div>
            <div>
              <p className="text-[18px] sm:text-[20px] font-bold tabular-nums">
                {health.without2FACount}
              </p>
              <p className="text-[11px] sm:text-[11.5px] text-[#8A8A8A] mt-0.5 leading-snug">
                Without 2FA
              </p>
            </div>
            <div>
              <p className="text-[18px] sm:text-[20px] font-bold tabular-nums">
                {health.olderThan90DaysCount}
              </p>
              <p className="text-[11px] sm:text-[11.5px] text-[#8A8A8A] mt-0.5 leading-snug">
                Older than 90d
              </p>
            </div>
          </div>
        </div>

        {/* Fix these first */}
        <div className="bg-white rounded-2xl border border-[#EAEAEA] p-5 sm:p-6 shadow-[0_1px_2px_rgba(0,0,0,0.03)]">
          <h2 className="text-[15.5px] font-semibold text-[#111111]">
            Fix these first
          </h2>

          {health.issues.length === 0 ? (
            <div className="py-10 sm:py-12 text-center">
              <p className="text-[14px] font-medium text-[#111111]">
                All accounts look healthy
              </p>
              <p className="text-[12.5px] text-[#737373] mt-1">
                No weak, reused, or outdated passwords detected.
              </p>
            </div>
          ) : (
            <div className="mt-4 divide-y divide-[#F2F2F2] max-h-[260px] sm:max-h-[235px] overflow-y-auto pr-1">
              {health.issues.map((issue) => {
                const targetAccount = accounts.find(
                  (a) => a.id === issue.accountId
                );
                return (
                  <div
                    key={issue.id}
                    className="py-3 first:pt-1 last:pb-0 flex flex-col sm:flex-row sm:items-center justify-between gap-2.5 sm:gap-3"
                  >
                    <div className="flex items-center gap-3 min-w-0">
                      <div className="w-8 h-8 rounded-lg bg-[#111111] text-white text-[11px] font-bold flex items-center justify-center shrink-0">
                        {issue.monogram}
                      </div>
                      <div className="min-w-0">
                        <p className="text-[13px] font-semibold text-[#111111] truncate">
                          {issue.game} — {issue.nickname}
                        </p>
                        <p className="text-[11.5px] text-[#737373] truncate">
                          {issue.reason}
                        </p>
                      </div>
                    </div>

                    <div className="flex items-center justify-end gap-2 shrink-0 pl-11 sm:pl-0">
                      <span className="px-1.5 py-0.5 rounded border border-[#D4D4D8] text-[10px] font-semibold tracking-wider text-[#525252]">
                        {issue.tag}
                      </span>
                      {targetAccount && (
                        <button
                          type="button"
                          onClick={() => onFixAccount(targetAccount)}
                          className="px-3 py-1.5 sm:px-2.5 sm:py-1 rounded-lg border border-[#E2E2E2] bg-white text-[12px] font-medium text-[#111111] hover:bg-[#F5F5F5] transition-colors cursor-pointer"
                        >
                          Fix
                        </button>
                      )}
                    </div>
                  </div>
                );
              })}
            </div>
          )}
        </div>
      </div>

      {/* Middle Row: Vault Protection + Signed-in Devices & Recovery */}
      <div className="grid grid-cols-1 lg:grid-cols-2 gap-4 sm:gap-5">
        {/* Vault Protection */}
        <div className="bg-white rounded-2xl border border-[#EAEAEA] p-5 sm:p-6 shadow-[0_1px_2px_rgba(0,0,0,0.03)]">
          <h2 className="text-[15.5px] font-semibold text-[#111111] mb-3">
            Vault protection
          </h2>

          <div className="divide-y divide-[#F2F2F2]">
            {toggleRows.map((row) => {
              const checked = settings[row.key];
              return (
                <div
                  key={row.key}
                  className="py-3.5 flex items-center justify-between gap-4"
                >
                  <div className="min-w-0">
                    <p className="text-[13.5px] font-medium text-[#111111]">
                      {row.title}
                    </p>
                    <p className="text-[12px] text-[#737373] mt-0.5">
                      {row.description}
                    </p>
                  </div>

                  <button
                    type="button"
                    role="switch"
                    aria-checked={checked}
                    onClick={() => onUpdateSetting(row.key, !checked)}
                    className={`w-11 h-6 rounded-full p-0.5 transition-colors shrink-0 cursor-pointer ${
                      checked ? "bg-[#111111]" : "bg-[#D4D4D8]"
                    }`}
                  >
                    <span
                      className={`block w-5 h-5 rounded-full bg-white shadow transition-transform duration-200 ${
                        checked ? "translate-x-5" : "translate-x-0"
                      }`}
                    />
                  </button>
                </div>
              );
            })}
          </div>

          <div className="pt-4 mt-1 border-t border-[#F2F2F2]">
            <p className="text-[13px] font-medium text-[#111111] mb-2.5">
              Auto-lock after
            </p>
            <div className="grid grid-cols-2 sm:grid-cols-4 gap-2">
              {autoLockOptions.map((opt) => {
                const active = settings.autoLockMinutes === opt.value;
                return (
                  <button
                    key={opt.value}
                    type="button"
                    onClick={() =>
                      onUpdateSetting("autoLockMinutes", opt.value)
                    }
                    className={`py-2.5 sm:py-2 rounded-xl text-[12.5px] font-medium border transition-all cursor-pointer ${
                      active
                        ? "bg-[#0D0D0D] text-white border-[#0D0D0D]"
                        : "bg-white text-[#404040] border-[#E5E5E5] hover:border-[#BDBDBD]"
                    }`}
                  >
                    {opt.label}
                  </button>
                );
              })}
            </div>
          </div>
        </div>

        {/* Right Stack: Signed-in Devices + Recovery & Backup */}
        <div className="space-y-4 sm:space-y-5">
          {/* Signed-in devices */}
          <div className="bg-white rounded-2xl border border-[#EAEAEA] p-5 sm:p-6 shadow-[0_1px_2px_rgba(0,0,0,0.03)]">
            <div className="flex items-center justify-between gap-3 mb-4">
              <h2 className="text-[15.5px] font-semibold text-[#111111]">
                Signed-in devices
              </h2>
              {devices.length > 1 && (
                <button
                  type="button"
                  onClick={onSignOutOthers}
                  className="px-3 py-1.5 rounded-lg border border-[#E5E5E5] text-[12px] font-medium text-[#404040] hover:text-[#111111] hover:bg-[#F5F5F5] transition-colors shrink-0 cursor-pointer"
                >
                  Sign out others
                </button>
              )}
            </div>

            <div className="divide-y divide-[#F2F2F2]">
              {devices.map((dev) => (
                <div
                  key={dev.id}
                  className="py-3 first:pt-0 last:pb-0 flex items-center justify-between gap-3"
                >
                  <div className="flex items-center gap-3 min-w-0">
                    <div className="w-8 h-8 rounded-lg border border-[#EAEAEA] bg-[#FAFAFA] flex items-center justify-center text-[#525252] shrink-0">
                      <DeviceIcon className="w-4 h-4" />
                    </div>
                    <div className="min-w-0">
                      <p className="text-[13.5px] font-medium text-[#111111] truncate">
                        {dev.name}
                      </p>
                      <p className="text-[11.5px] text-[#737373] truncate">
                        {dev.location} · {dev.lastActive}
                      </p>
                    </div>
                  </div>

                  {dev.isCurrent ? (
                    <span className="px-2.5 py-1 rounded-full bg-[#111111] text-white text-[11px] font-medium shrink-0">
                      This device
                    </span>
                  ) : (
                    <button
                      type="button"
                      onClick={() => onSignOutDevice(dev.id)}
                      className="px-3 py-1.5 sm:py-1 rounded-lg border border-[#E5E5E5] text-[12px] font-medium text-[#404040] hover:text-[#111111] hover:bg-[#F5F5F5] transition-colors shrink-0 cursor-pointer"
                    >
                      Sign out
                    </button>
                  )}
                </div>
              ))}
            </div>
          </div>

          {/* Recovery & backup */}
          <div className="bg-white rounded-2xl border border-[#EAEAEA] p-5 sm:p-6 shadow-[0_1px_2px_rgba(0,0,0,0.03)]">
            <h2 className="text-[15.5px] font-semibold text-[#111111]">
              Recovery &amp; backup
            </h2>
            <p className="text-[12.5px] text-[#737373] mt-1.5 leading-relaxed">
              Your recovery key is the only way back in if you forget your
              master password.
              {recoveryKeyRotatedAt !== null &&
                ` Last rotated ${formatRelativeTime(recoveryKeyRotatedAt).toLowerCase()}.`}
            </p>
            <div className="mt-4 flex flex-col sm:flex-row sm:flex-wrap items-stretch sm:items-center gap-2.5">
              <button
                type="button"
                onClick={onOpenRecoveryKey}
                className="w-full sm:w-auto justify-center inline-flex items-center px-4 py-2.5 sm:py-2 rounded-xl bg-[#0D0D0D] text-white text-[13px] font-medium hover:bg-[#262626] active:scale-[0.98] transition-all cursor-pointer"
              >
                New recovery key
              </button>
              <button
                type="button"
                onClick={onOpenChangePassword}
                className="w-full sm:w-auto justify-center inline-flex items-center px-4 py-2.5 sm:py-2 rounded-xl border border-[#E5E5E5] bg-white text-[13px] font-medium text-[#111111] hover:bg-[#F5F5F5] active:scale-[0.98] transition-all cursor-pointer"
              >
                Change master password
              </button>
              <button
                type="button"
                onClick={onOpenExportBackup}
                className="w-full sm:w-auto justify-center inline-flex items-center gap-1.5 px-4 py-2.5 sm:py-2 rounded-xl border border-[#E5E5E5] bg-white text-[13px] font-medium text-[#111111] hover:bg-[#F5F5F5] active:scale-[0.98] transition-all cursor-pointer"
              >
                <DownloadIcon className="w-4 h-4" />
                Export encrypted backup
              </button>
            </div>
          </div>
        </div>
      </div>

      {/* Bottom Activity Log Preview */}
      <div className="bg-white rounded-2xl border border-[#EAEAEA] p-5 sm:p-6 shadow-[0_1px_2px_rgba(0,0,0,0.03)]">
        <div className="flex items-center justify-between gap-3 mb-3">
          <h2 className="text-[15.5px] font-semibold text-[#111111]">
            Activity log
          </h2>
          <button
            type="button"
            onClick={onViewAllActivity}
            className="text-[12.5px] font-medium text-[#525252] hover:text-[#111111] transition-colors cursor-pointer"
          >
            View full log →
          </button>
        </div>

        <div className="divide-y divide-[#F2F2F2]">
          {recentLogs.slice(0, 5).map((log) => (
            <div
              key={log.id}
              className="py-3 flex flex-col sm:flex-row sm:items-center justify-between gap-1 sm:gap-4 text-[13px]"
            >
              <div className="flex flex-col sm:flex-row sm:items-center gap-0.5 sm:gap-6 min-w-0">
                <span className="hidden sm:inline-block text-[12px] text-[#8A8A8A] w-[86px] shrink-0">
                  {log.timestampLabel}
                </span>
                <p className="text-[#111111] sm:truncate">
                  <span className="font-semibold">{log.action}</span>
                  {log.target && (
                    <span className="text-[#525252]"> · {log.target}</span>
                  )}
                </p>
              </div>
              <div className="flex items-center gap-2 text-[11.5px] sm:text-[12px] text-[#8A8A8A] shrink-0">
                <span className="sm:hidden">{log.timestampLabel} ·</span>
                <span>{log.device}</span>
              </div>
            </div>
          ))}
        </div>
      </div>
    </div>
  );
}
