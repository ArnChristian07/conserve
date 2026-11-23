"use client";

import React, { useMemo, useState } from "react";
import { formatRelativeTime } from "../data/initialVault";
import { GameAccount, VaultHealthSummary } from "../types/vault";
import {
  CheckIcon,
  CopyIcon,
  EyeIcon,
  EyeOffIcon,
  LockIcon,
  PencilIcon,
  PlusIcon,
  SearchIcon,
  TrashIcon,
} from "./Icons";

interface VaultViewProps {
  accounts: GameAccount[];
  health: VaultHealthSummary;
  gameCounts: { game: string; count: number }[];
  selectedGame: string;
  onSelectGame: (game: string) => void;
  revealedIds: Set<string>;
  onToggleReveal: (account: GameAccount) => void;
  onCopyPassword: (account: GameAccount) => void;
  onNewAccount: () => void;
  onEditAccount: (account: GameAccount) => void;
  onDeleteAccount: (account: GameAccount) => void;
  onGoToSecurity: () => void;
  clearClipboardEnabled: boolean;
}

export function VaultView({
  accounts,
  health,
  gameCounts,
  selectedGame,
  onSelectGame,
  revealedIds,
  onToggleReveal,
  onCopyPassword,
  onNewAccount,
  onEditAccount,
  onDeleteAccount,
  onGoToSecurity,
  clearClipboardEnabled,
}: VaultViewProps) {
  const [search, setSearch] = useState("");
  const [copiedId, setCopiedId] = useState<string | null>(null);

  const filteredAccounts = useMemo(() => {
    const q = search.trim().toLowerCase();
    return accounts.filter((acc) => {
      const matchesGame = selectedGame === "all" || acc.game === selectedGame;
      if (!matchesGame) return false;
      if (!q) return true;
      return (
        acc.game.toLowerCase().includes(q) ||
        acc.nickname.toLowerCase().includes(q) ||
        acc.login.toLowerCase().includes(q)
      );
    });
  }, [accounts, selectedGame, search]);

  const twoFACount = useMemo(
    () => accounts.filter((a) => a.twoFactor).length,
    [accounts]
  );

  const handleCopy = (acc: GameAccount) => {
    onCopyPassword(acc);
    setCopiedId(acc.id);
    setTimeout(() => {
      setCopiedId((prev) => (prev === acc.id ? null : prev));
    }, 1800);
  };

  return (
    <div className="space-y-5 sm:space-y-6 animate-fade-slide-up">
      {/* Top Header */}
      <div className="flex flex-col md:flex-row md:items-center justify-between gap-3.5 sm:gap-4">
        <div>
          <h1 className="text-[24px] sm:text-[28px] font-bold tracking-tight text-[#111111] leading-tight">
            Your vault
          </h1>
          <p className="text-[13px] sm:text-[13.5px] text-[#737373] mt-1">
            {accounts.length} {accounts.length === 1 ? "account" : "accounts"}{" "}
            across {gameCounts.length}{" "}
            {gameCounts.length === 1 ? "game" : "games"} · end-to-end encrypted
          </p>
        </div>

        <div className="flex items-center gap-2 sm:gap-2.5">
          <div className="relative flex-1 sm:w-[270px]">
            <SearchIcon className="w-4 h-4 text-[#8A8A8A] absolute left-3.5 top-1/2 -translate-y-1/2 pointer-events-none" />
            <input
              type="text"
              value={search}
              onChange={(e) => setSearch(e.target.value)}
              placeholder="Search game, login, nickname"
              className="w-full h-10 pl-9 pr-3.5 rounded-xl border border-[#E5E5E5] bg-white text-[16px] sm:text-[13px] text-[#111111] placeholder:text-[#9A9A9A] focus:outline-none focus:border-[#111111] transition-colors"
            />
          </div>
          <button
            type="button"
            onClick={onNewAccount}
            className="h-10 px-3.5 sm:px-4 rounded-xl bg-[#0D0D0D] text-white text-[13px] font-semibold inline-flex items-center gap-1.5 hover:bg-[#262626] active:scale-[0.98] transition-all shrink-0 cursor-pointer"
          >
            <PlusIcon className="w-4 h-4" />
            <span className="hidden sm:inline">New account</span>
            <span className="sm:hidden">New</span>
          </button>
        </div>
      </div>

      {/* 4 Summary Cards */}
      <div className="grid grid-cols-2 xl:grid-cols-4 gap-3 sm:gap-4">
        <div className="bg-white rounded-2xl border border-[#EAEAEA] p-4 sm:p-5 shadow-[0_1px_2px_rgba(0,0,0,0.03)]">
          <p className="text-[10.5px] sm:text-[11px] font-semibold tracking-[0.07em] uppercase text-[#8A8A8A]">
            ACCOUNTS
          </p>
          <p className="text-[26px] sm:text-[30px] font-bold text-[#111111] mt-1.5 sm:mt-2 leading-none tabular-nums">
            {accounts.length}
          </p>
        </div>

        <div className="bg-white rounded-2xl border border-[#EAEAEA] p-4 sm:p-5 shadow-[0_1px_2px_rgba(0,0,0,0.03)]">
          <p className="text-[10.5px] sm:text-[11px] font-semibold tracking-[0.07em] uppercase text-[#8A8A8A]">
            GAME LABELS
          </p>
          <p className="text-[26px] sm:text-[30px] font-bold text-[#111111] mt-1.5 sm:mt-2 leading-none tabular-nums">
            {gameCounts.length}
          </p>
        </div>

        <div className="bg-white rounded-2xl border border-[#EAEAEA] p-4 sm:p-5 shadow-[0_1px_2px_rgba(0,0,0,0.03)]">
          <p className="text-[10.5px] sm:text-[11px] font-semibold tracking-[0.07em] uppercase text-[#8A8A8A]">
            2FA COVERAGE
          </p>
          <p className="text-[26px] sm:text-[30px] font-bold text-[#111111] mt-1.5 sm:mt-2 leading-none tabular-nums">
            {twoFACount}/{accounts.length}
          </p>
        </div>

        <button
          type="button"
          onClick={onGoToSecurity}
          className="text-left bg-dot-matrix-subtle text-white rounded-2xl border border-[#222222] p-4 sm:p-5 shadow-[0_4px_14px_rgba(0,0,0,0.08)] hover:border-[#404040] active:scale-[0.99] transition-all cursor-pointer group"
        >
          <p className="text-[10.5px] sm:text-[11px] font-semibold tracking-[0.07em] uppercase text-[#9A9A9A]">
            NEEDS ATTENTION
          </p>
          <p className="text-[26px] sm:text-[30px] font-bold text-white mt-1.5 sm:mt-2 leading-none tabular-nums">
            {health.needsAttentionAccountsCount}
          </p>
          <p className="text-[11px] sm:text-[12px] text-[#9A9A9A] mt-1.5 sm:mt-2 group-hover:text-white transition-colors truncate">
            {health.weakOrReusedCount} weak · {health.reusedAccountIds.size}{" "}
            reused →
          </p>
        </button>
      </div>

      {/* Game Filter Pills */}
      <div className="flex items-center gap-2 overflow-x-auto no-scrollbar pb-1 -mx-4 px-4 sm:mx-0 sm:px-0 sm:pb-0 sm:flex-wrap">
        <button
          type="button"
          onClick={() => onSelectGame("all")}
          className={`shrink-0 whitespace-nowrap px-3.5 py-1.5 rounded-full text-[12.5px] font-medium border transition-all cursor-pointer ${
            selectedGame === "all"
              ? "bg-[#0D0D0D] text-white border-[#0D0D0D]"
              : "bg-white text-[#404040] border-[#E5E5E5] hover:border-[#BDBDBD]"
          }`}
        >
          All games · {accounts.length}
        </button>

        {gameCounts.map(({ game, count }) => {
          const active = selectedGame === game;
          return (
            <button
              key={game}
              type="button"
              onClick={() => onSelectGame(game)}
              className={`shrink-0 whitespace-nowrap px-3.5 py-1.5 rounded-full text-[12.5px] font-medium border transition-all cursor-pointer ${
                active
                  ? "bg-[#0D0D0D] text-white border-[#0D0D0D]"
                  : "bg-white text-[#404040] border-[#E5E5E5] hover:border-[#BDBDBD]"
              }`}
            >
              {game} · {count}
            </button>
          );
        })}
      </div>

      {/* Accounts List (Mobile Cards + Desktop Table) */}
      <div className="bg-white rounded-2xl border border-[#EAEAEA] shadow-[0_1px_2px_rgba(0,0,0,0.03)] overflow-hidden">
        {/* Mobile Card View */}
        <div className="md:hidden divide-y divide-[#F0F0F0]">
          {filteredAccounts.length === 0 ? (
            <div className="py-12 px-4 text-center text-[13.5px] text-[#737373]">
              No accounts match your current filter.
            </div>
          ) : (
            filteredAccounts.map((acc) => {
              const isRevealed = revealedIds.has(acc.id);
              const isReused = health.reusedAccountIds.has(acc.id);
              const isCopied = copiedId === acc.id;

              return (
                <div key={acc.id} className="p-4 space-y-3">
                  {/* Top Row: Game + Nickname + 2FA */}
                  <div className="flex items-start justify-between gap-3">
                    <div className="flex items-start gap-3 min-w-0">
                      <div className="w-9 h-9 rounded-lg bg-[#111111] text-white text-[11px] font-bold flex items-center justify-center shrink-0 mt-0.5">
                        {acc.monogram}
                      </div>
                      <div className="min-w-0">
                        <p className="text-[11.5px] font-medium text-[#737373] truncate">
                          {acc.game}
                        </p>
                        <p className="text-[14px] font-semibold text-[#111111] leading-snug truncate">
                          {acc.nickname}
                        </p>
                        <p className="text-[12px] text-[#737373] truncate mt-0.5">
                          {acc.login}
                        </p>
                      </div>
                    </div>

                    {acc.twoFactor ? (
                      <span className="inline-flex items-center gap-1 px-2 py-0.5 rounded-full bg-[#111111] text-white text-[11px] font-medium shrink-0">
                        <CheckIcon className="w-3 h-3" />
                        2FA
                      </span>
                    ) : (
                      <span className="inline-flex items-center px-2 py-0.5 rounded-full border border-dashed border-[#D4D4D8] text-[#737373] text-[11px] font-medium shrink-0">
                        No 2FA
                      </span>
                    )}
                  </div>

                  {/* Password Bar */}
                  <div className="flex items-center justify-between gap-2 px-3 py-2 rounded-xl bg-[#F7F7F7] border border-[#EFEFEF]">
                    <div className="flex items-center gap-2 min-w-0">
                      <span
                        className={`text-[13px] truncate ${
                          isRevealed
                            ? "font-mono text-[#111111] break-all whitespace-normal"
                            : "tracking-[0.14em] text-[#262626]"
                        }`}
                      >
                        {isRevealed ? acc.password : "••••••••••••"}
                      </span>
                      {isReused && (
                        <span className="px-1.5 py-0.5 rounded border border-[#D4D4D8] bg-white text-[9.5px] font-semibold tracking-wider text-[#525252] uppercase shrink-0">
                          REUSED
                        </span>
                      )}
                    </div>

                    <div className="flex items-center gap-1 shrink-0">
                      <button
                        type="button"
                        onClick={() => onToggleReveal(acc)}
                        aria-label={
                          isRevealed ? "Hide password" : "Reveal password"
                        }
                        className="w-9 h-9 rounded-lg flex items-center justify-center text-[#525252] hover:text-[#111111] hover:bg-white transition-colors cursor-pointer"
                      >
                        {isRevealed ? (
                          <EyeOffIcon className="w-4 h-4" />
                        ) : (
                          <EyeIcon className="w-4 h-4" />
                        )}
                      </button>
                      <button
                        type="button"
                        onClick={() => handleCopy(acc)}
                        aria-label="Copy password"
                        className="w-9 h-9 rounded-lg flex items-center justify-center text-[#525252] hover:text-[#111111] hover:bg-white transition-colors cursor-pointer"
                      >
                        {isCopied ? (
                          <CheckIcon className="w-4 h-4 text-[#111111]" />
                        ) : (
                          <CopyIcon className="w-4 h-4" />
                        )}
                      </button>
                    </div>
                  </div>

                  {/* Footer Meta + Edit/Delete */}
                  <div className="flex items-center justify-between gap-2 pt-0.5">
                    <span className="text-[11.5px] text-[#8A8A8A]">
                      Updated {formatRelativeTime(acc.updatedAt)}
                    </span>
                    <div className="flex items-center gap-1.5">
                      <button
                        type="button"
                        onClick={() => onEditAccount(acc)}
                        aria-label={`Edit ${acc.game} ${acc.nickname}`}
                        className="h-8 px-2.5 rounded-lg border border-[#E5E5E5] bg-white inline-flex items-center gap-1.5 text-[12px] font-medium text-[#404040] hover:text-[#111111] hover:border-[#BDBDBD] transition-colors cursor-pointer"
                      >
                        <PencilIcon className="w-3.5 h-3.5" />
                        <span>Edit</span>
                      </button>
                      <button
                        type="button"
                        onClick={() => onDeleteAccount(acc)}
                        aria-label={`Delete ${acc.game} ${acc.nickname}`}
                        className="w-8 h-8 rounded-lg border border-[#E5E5E5] bg-white flex items-center justify-center text-[#525252] hover:text-red-600 hover:border-red-200 transition-colors cursor-pointer"
                      >
                        <TrashIcon className="w-3.5 h-3.5" />
                      </button>
                    </div>
                  </div>
                </div>
              );
            })
          )}
        </div>

        {/* Desktop Table View */}
        <div className="hidden md:block overflow-x-auto">
          <table className="w-full text-left border-collapse min-w-[780px]">
            <thead>
              <tr className="border-b border-[#F0F0F0] text-[11px] font-semibold tracking-[0.06em] uppercase text-[#8A8A8A]">
                <th className="py-3.5 pl-6 pr-3">GAME</th>
                <th className="py-3.5 px-3">ACCOUNT</th>
                <th className="py-3.5 px-3">PASSWORD</th>
                <th className="py-3.5 px-3">2FA</th>
                <th className="py-3.5 px-3">UPDATED</th>
                <th className="py-3.5 pl-3 pr-6 text-right">ACTIONS</th>
              </tr>
            </thead>
            <tbody className="divide-y divide-[#F3F3F3]">
              {filteredAccounts.length === 0 ? (
                <tr>
                  <td
                    colSpan={6}
                    className="py-14 text-center text-[13.5px] text-[#737373]"
                  >
                    No accounts match your current filter.
                  </td>
                </tr>
              ) : (
                filteredAccounts.map((acc) => {
                  const isRevealed = revealedIds.has(acc.id);
                  const isReused = health.reusedAccountIds.has(acc.id);
                  const isCopied = copiedId === acc.id;

                  return (
                    <tr
                      key={acc.id}
                      className="hover:bg-[#FAFAFA] transition-colors group"
                    >
                      {/* GAME */}
                      <td className="py-4 pl-6 pr-3">
                        <div className="flex items-center gap-3">
                          <div className="w-8 h-8 rounded-lg bg-[#111111] text-white text-[11px] font-bold flex items-center justify-center shrink-0">
                            {acc.monogram}
                          </div>
                          <span className="text-[13.5px] font-medium text-[#111111]">
                            {acc.game}
                          </span>
                        </div>
                      </td>

                      {/* ACCOUNT */}
                      <td className="py-4 px-3">
                        <p className="text-[13.5px] font-semibold text-[#111111] leading-snug">
                          {acc.nickname}
                        </p>
                        <p className="text-[12px] text-[#737373] leading-snug mt-0.5">
                          {acc.login}
                        </p>
                      </td>

                      {/* PASSWORD */}
                      <td className="py-4 px-3">
                        <div className="flex items-center gap-2">
                          <span
                            className={`text-[13px] min-w-[112px] ${
                              isRevealed
                                ? "font-mono text-[#111111] bg-[#F4F4F5] px-2 py-0.5 rounded-md"
                                : "tracking-[0.14em] text-[#262626]"
                            }`}
                          >
                            {isRevealed ? acc.password : "••••••••••••"}
                          </span>

                          <button
                            type="button"
                            onClick={() => onToggleReveal(acc)}
                            aria-label={
                              isRevealed ? "Hide password" : "Reveal password"
                            }
                            className="p-1 rounded-md text-[#737373] hover:text-[#111111] hover:bg-[#F0F0F0] transition-colors cursor-pointer"
                          >
                            {isRevealed ? (
                              <EyeOffIcon className="w-4 h-4" />
                            ) : (
                              <EyeIcon className="w-4 h-4" />
                            )}
                          </button>

                          <button
                            type="button"
                            onClick={() => handleCopy(acc)}
                            aria-label="Copy password"
                            className="p-1 rounded-md text-[#737373] hover:text-[#111111] hover:bg-[#F0F0F0] transition-colors cursor-pointer"
                          >
                            {isCopied ? (
                              <CheckIcon className="w-4 h-4 text-[#111111]" />
                            ) : (
                              <CopyIcon className="w-4 h-4" />
                            )}
                          </button>

                          {isReused && (
                            <span className="ml-0.5 px-1.5 py-0.5 rounded border border-[#D4D4D8] bg-[#FAFAFA] text-[10px] font-semibold tracking-wider text-[#525252] uppercase">
                              REUSED
                            </span>
                          )}
                        </div>
                      </td>

                      {/* 2FA */}
                      <td className="py-4 px-3">
                        {acc.twoFactor ? (
                          <span className="inline-flex items-center gap-1 px-2.5 py-1 rounded-full bg-[#111111] text-white text-[11.5px] font-medium">
                            <CheckIcon className="w-3 h-3" />
                            On
                          </span>
                        ) : (
                          <span className="inline-flex items-center px-2.5 py-1 rounded-full border border-dashed border-[#D4D4D8] text-[#737373] text-[11.5px] font-medium">
                            Off
                          </span>
                        )}
                      </td>

                      {/* UPDATED */}
                      <td className="py-4 px-3 text-[12.5px] text-[#737373] whitespace-nowrap">
                        {formatRelativeTime(acc.updatedAt)}
                      </td>

                      {/* ACTIONS */}
                      <td className="py-4 pl-3 pr-6">
                        <div className="flex items-center justify-end gap-1.5">
                          <button
                            type="button"
                            onClick={() => onEditAccount(acc)}
                            aria-label={`Edit ${acc.game} ${acc.nickname}`}
                            className="w-8 h-8 rounded-lg border border-[#E5E5E5] bg-white flex items-center justify-center text-[#525252] hover:text-[#111111] hover:border-[#BDBDBD] transition-colors cursor-pointer"
                          >
                            <PencilIcon className="w-3.5 h-3.5" />
                          </button>
                          <button
                            type="button"
                            onClick={() => onDeleteAccount(acc)}
                            aria-label={`Delete ${acc.game} ${acc.nickname}`}
                            className="w-8 h-8 rounded-lg border border-[#E5E5E5] bg-white flex items-center justify-center text-[#525252] hover:text-red-600 hover:border-red-200 transition-colors cursor-pointer"
                          >
                            <TrashIcon className="w-3.5 h-3.5" />
                          </button>
                        </div>
                      </td>
                    </tr>
                  );
                })
              )}
            </tbody>
          </table>
        </div>
      </div>

      {/* Footer Security Note */}
      <div className="flex items-center gap-2 text-[12px] text-[#737373]">
        <LockIcon className="w-3.5 h-3.5 shrink-0" />
        <span>
          Passwords are decrypted only when you reveal or copy them.
          {clearClipboardEnabled
            ? " Copied passwords clear from the clipboard after 30 seconds."
            : ""}
        </span>
      </div>
    </div>
  );
}
