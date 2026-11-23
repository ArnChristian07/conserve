"use client";

import React, { useEffect, useState } from "react";
import Image from "next/image";
import { NavTab } from "../types/vault";
import {
  ActivityIcon,
  LockIcon,
  MenuIcon,
  ShieldCheckIcon,
  UnlockIcon,
  VaultIcon,
  XIcon,
} from "./Icons";

interface SidebarProps {
  activeTab: NavTab;
  onSelectTab: (tab: NavTab) => void;
  gameCounts: { game: string; count: number }[];
  totalCount: number;
  selectedGame: string;
  onSelectGame: (game: string) => void;
  autoLockMinutes: number;
  onLockNow: () => void;
}

export function Sidebar({
  activeTab,
  onSelectTab,
  gameCounts,
  totalCount,
  selectedGame,
  onSelectGame,
  autoLockMinutes,
  onLockNow,
}: SidebarProps) {
  const [drawerOpen, setDrawerOpen] = useState(false);

  const autoLockLabel =
    autoLockMinutes === 60 ? "1 hour" : `${autoLockMinutes} min`;

  useEffect(() => {
    if (!drawerOpen) return;
    const onKey = (e: KeyboardEvent) => {
      if (e.key === "Escape") setDrawerOpen(false);
    };
    const prevOverflow = document.body.style.overflow;
    document.body.style.overflow = "hidden";
    window.addEventListener("keydown", onKey);
    return () => {
      document.body.style.overflow = prevOverflow;
      window.removeEventListener("keydown", onKey);
    };
  }, [drawerOpen]);

  const handleSelectTab = (tab: NavTab) => {
    onSelectTab(tab);
    setDrawerOpen(false);
  };

  const handleSelectGame = (game: string) => {
    onSelectGame(game);
    onSelectTab("vault");
    setDrawerOpen(false);
  };

  const renderSidebarContent = (isDrawer = false) => (
    <>
      <div>
        {/* Brand */}
        <div className="flex items-center justify-between gap-2 px-2 py-2 mb-5">
          <div className="flex items-center gap-3 min-w-0">
            <div className="w-9 h-9 rounded-full overflow-hidden border border-white/25 shrink-0 bg-[#1a1a1a] relative">
              <Image
                src="/assets/conserve-icon.png"
                alt="Conserve"
                fill
                sizes="36px"
                className="object-cover"
              />
            </div>
            <div className="min-w-0">
              <p className="text-[15px] font-bold leading-tight text-white tracking-tight">
                Conserve
              </p>
              <p className="text-[11.5px] text-[#8A8A8A] leading-tight mt-0.5">
                Game account vault
              </p>
            </div>
          </div>

          {isDrawer && (
            <button
              type="button"
              onClick={() => setDrawerOpen(false)}
              aria-label="Close menu"
              className="p-2 rounded-lg text-[#A3A3A3] hover:text-white hover:bg-white/10 transition-colors cursor-pointer"
            >
              <XIcon className="w-5 h-5" />
            </button>
          )}
        </div>

        {/* Main Navigation */}
        <nav className="space-y-1">
          <button
            type="button"
            onClick={() => handleSelectTab("vault")}
            className={`w-full flex items-center gap-2.5 px-3 py-2.5 rounded-xl text-[13.5px] font-medium transition-all cursor-pointer ${
              activeTab === "vault"
                ? "bg-white text-[#111111] shadow-sm"
                : "text-[#A3A3A3] hover:text-white hover:bg-white/[0.06]"
            }`}
          >
            <VaultIcon className="w-4 h-4 shrink-0" />
            <span>Vault</span>
          </button>

          <button
            type="button"
            onClick={() => handleSelectTab("security")}
            className={`w-full flex items-center gap-2.5 px-3 py-2.5 rounded-xl text-[13.5px] font-medium transition-all cursor-pointer ${
              activeTab === "security"
                ? "bg-white text-[#111111] shadow-sm"
                : "text-[#A3A3A3] hover:text-white hover:bg-white/[0.06]"
            }`}
          >
            <ShieldCheckIcon className="w-4 h-4 shrink-0" />
            <span>Security center</span>
          </button>

          <button
            type="button"
            onClick={() => handleSelectTab("activity")}
            className={`w-full flex items-center gap-2.5 px-3 py-2.5 rounded-xl text-[13.5px] font-medium transition-all cursor-pointer ${
              activeTab === "activity"
                ? "bg-white text-[#111111] shadow-sm"
                : "text-[#A3A3A3] hover:text-white hover:bg-white/[0.06]"
            }`}
          >
            <ActivityIcon className="w-4 h-4 shrink-0" />
            <span>Activity log</span>
          </button>
        </nav>

        {/* Game Labels */}
        <div className="mt-7 px-1">
          <p className="px-2 text-[10.5px] font-semibold tracking-[0.08em] uppercase text-[#737373] mb-2">
            GAME LABELS
          </p>
          <div className="space-y-0.5 max-h-[280px] overflow-y-auto pr-1">
            <button
              type="button"
              onClick={() => handleSelectGame("all")}
              className={`w-full flex items-center justify-between px-2 py-2 lg:py-1.5 rounded-lg text-[13px] transition-colors cursor-pointer ${
                selectedGame === "all" && activeTab === "vault"
                  ? "text-white font-medium bg-white/[0.06]"
                  : "text-[#9A9A9A] hover:text-white hover:bg-white/[0.04]"
              }`}
            >
              <span className="flex items-center gap-2.5 truncate">
                <span
                  className={`w-1.5 h-1.5 rounded-[2px] shrink-0 ${
                    selectedGame === "all" && activeTab === "vault"
                      ? "bg-white"
                      : "border border-[#666666]"
                  }`}
                />
                <span className="truncate">All games</span>
              </span>
              <span className="text-[11.5px] text-[#737373] tabular-nums">
                {totalCount}
              </span>
            </button>

            {gameCounts.map(({ game, count }) => {
              const isSelected =
                selectedGame === game && activeTab === "vault";
              return (
                <button
                  key={game}
                  type="button"
                  onClick={() => handleSelectGame(game)}
                  className={`w-full flex items-center justify-between px-2 py-2 lg:py-1.5 rounded-lg text-[13px] transition-colors cursor-pointer ${
                    isSelected
                      ? "text-white font-medium bg-white/[0.06]"
                      : "text-[#9A9A9A] hover:text-white hover:bg-white/[0.04]"
                  }`}
                >
                  <span className="flex items-center gap-2.5 truncate">
                    <span
                      className={`w-1.5 h-1.5 rounded-[2px] shrink-0 ${
                        isSelected ? "bg-white" : "border border-[#525252]"
                      }`}
                    />
                    <span className="truncate">{game}</span>
                  </span>
                  <span className="text-[11.5px] text-[#737373] tabular-nums">
                    {count}
                  </span>
                </button>
              );
            })}
          </div>
        </div>
      </div>

      {/* Bottom Vault Status Card */}
      <div className="mt-6 rounded-xl border border-white/12 bg-white/[0.03] p-3.5">
        <div className="flex items-center gap-2 text-[12.5px] font-semibold text-white">
          <UnlockIcon className="w-3.5 h-3.5 text-white/85 shrink-0" />
          <span>Vault unlocked</span>
        </div>
        <p className="text-[11px] leading-relaxed text-[#8A8A8A] mt-1.5">
          Auto-locks after {autoLockLabel} idle. AES-256, encrypted on this
          device.
        </p>
        <button
          type="button"
          onClick={() => {
            setDrawerOpen(false);
            onLockNow();
          }}
          className="mt-3 w-full py-2 rounded-lg border border-white/20 text-[12.5px] font-medium text-white hover:bg-white/10 active:scale-[0.98] transition-all cursor-pointer"
        >
          Lock now
        </button>
      </div>
    </>
  );

  return (
    <>
      {/* Mobile & Tablet Top App Bar */}
      <header className="lg:hidden sticky top-0 z-30 bg-dot-matrix text-white border-b border-white/10 px-4 h-14 flex items-center justify-between gap-3">
        <div className="flex items-center gap-2.5 min-w-0">
          <button
            type="button"
            onClick={() => setDrawerOpen(true)}
            aria-label="Open navigation menu"
            className="w-9 h-9 -ml-1.5 rounded-xl flex items-center justify-center text-white/85 hover:text-white hover:bg-white/10 active:scale-95 transition-all cursor-pointer shrink-0"
          >
            <MenuIcon className="w-5 h-5" />
          </button>

          <div className="w-7 h-7 rounded-full overflow-hidden border border-white/25 shrink-0 bg-[#1a1a1a] relative">
            <Image
              src="/assets/conserve-icon.png"
              alt="Conserve"
              fill
              sizes="28px"
              className="object-cover"
            />
          </div>
          <div className="min-w-0">
            <p className="text-[14.5px] font-bold leading-tight text-white tracking-tight truncate">
              Conserve
            </p>
          </div>
        </div>

        <button
          type="button"
          onClick={onLockNow}
          aria-label="Lock vault now"
          className="h-8 px-3 rounded-lg border border-white/20 bg-white/[0.04] text-[12px] font-medium text-white inline-flex items-center gap-1.5 hover:bg-white/10 active:scale-[0.97] transition-all shrink-0 cursor-pointer"
        >
          <LockIcon className="w-3.5 h-3.5" />
          <span>Lock</span>
        </button>
      </header>

      {/* Mobile & Tablet Slide-over Drawer */}
      {drawerOpen && (
        <div
          className="lg:hidden fixed inset-0 z-50 flex bg-black/60 backdrop-blur-[2px] animate-backdrop-in"
          onClick={() => setDrawerOpen(false)}
        >
          <aside
            role="dialog"
            aria-modal="true"
            aria-label="Navigation menu"
            className="w-[280px] max-w-[85vw] h-full bg-dot-matrix text-white flex flex-col justify-between p-4 border-r border-white/10 overflow-y-auto animate-drawer-in"
            onClick={(e) => e.stopPropagation()}
          >
            {renderSidebarContent(true)}
          </aside>
        </div>
      )}

      {/* Desktop Sticky Sidebar */}
      <aside className="hidden lg:flex w-[240px] shrink-0 bg-dot-matrix text-white flex-col justify-between p-4 min-h-screen sticky top-0">
        {renderSidebarContent(false)}
      </aside>

      {/* Mobile & Tablet Bottom Navigation Bar */}
      <nav
        aria-label="Primary navigation"
        className="lg:hidden fixed bottom-0 inset-x-0 z-30 bg-[#0D0D0D]/95 backdrop-blur-md border-t border-white/10 px-2 pt-1.5 pb-[max(0.5rem,env(safe-area-inset-bottom))]"
      >
        <div className="grid grid-cols-3 gap-1 max-w-md mx-auto">
          <button
            type="button"
            onClick={() => onSelectTab("vault")}
            className={`flex flex-col items-center justify-center gap-1 py-1.5 rounded-xl text-[11px] font-medium transition-all cursor-pointer ${
              activeTab === "vault"
                ? "bg-white text-[#111111] shadow-sm"
                : "text-[#9A9A9A] hover:text-white"
            }`}
          >
            <VaultIcon className="w-4 h-4" />
            <span>Vault</span>
          </button>

          <button
            type="button"
            onClick={() => onSelectTab("security")}
            className={`flex flex-col items-center justify-center gap-1 py-1.5 rounded-xl text-[11px] font-medium transition-all cursor-pointer ${
              activeTab === "security"
                ? "bg-white text-[#111111] shadow-sm"
                : "text-[#9A9A9A] hover:text-white"
            }`}
          >
            <ShieldCheckIcon className="w-4 h-4" />
            <span>Security</span>
          </button>

          <button
            type="button"
            onClick={() => onSelectTab("activity")}
            className={`flex flex-col items-center justify-center gap-1 py-1.5 rounded-xl text-[11px] font-medium transition-all cursor-pointer ${
              activeTab === "activity"
                ? "bg-white text-[#111111] shadow-sm"
                : "text-[#9A9A9A] hover:text-white"
            }`}
          >
            <ActivityIcon className="w-4 h-4" />
            <span>Activity</span>
          </button>
        </div>
      </nav>
    </>
  );
}
