"use client";

import React from "react";
import { ToastItem } from "../types/vault";
import { AlertTriangleIcon, CheckIcon, LockIcon, XIcon } from "./Icons";

interface ToastContainerProps {
  toasts: ToastItem[];
  onDismiss: (id: string) => void;
  elevatedMobile?: boolean;
}

export function ToastContainer({
  toasts,
  onDismiss,
  elevatedMobile = false,
}: ToastContainerProps) {
  if (toasts.length === 0) return null;

  return (
    <div
      aria-live="polite"
      className={`fixed left-1/2 -translate-x-1/2 z-50 flex flex-col items-center gap-2 w-full max-w-md px-4 pointer-events-none ${
        elevatedMobile ? "bottom-20 lg:bottom-5" : "bottom-5"
      }`}
    >
      {toasts.map((toast) => {
        const isError = toast.variant === "error";
        const isWarning = toast.variant === "warning";

        return (
          <div
            key={toast.id}
            role="status"
            className={`pointer-events-auto animate-toast-in w-full flex items-center gap-3 px-4 py-3 rounded-xl shadow-[0_12px_32px_rgba(0,0,0,0.22)] border backdrop-blur-md transition-all ${
              isError
                ? "bg-[#191111] text-white border-red-500/40"
                : isWarning
                ? "bg-[#171510] text-white border-amber-400/35"
                : "bg-[#111111] text-white border-white/15"
            }`}
          >
            <div
              className={`w-6 h-6 rounded-full flex items-center justify-center shrink-0 ${
                isError
                  ? "bg-red-500/20 text-red-400"
                  : isWarning
                  ? "bg-amber-400/20 text-amber-300"
                  : toast.variant === "info"
                  ? "bg-white/15 text-white"
                  : "bg-white text-[#111111]"
              }`}
            >
              {isError ? (
                <XIcon className="w-3.5 h-3.5" />
              ) : isWarning ? (
                <AlertTriangleIcon className="w-3.5 h-3.5" />
              ) : toast.variant === "info" ? (
                <LockIcon className="w-3.5 h-3.5" />
              ) : (
                <CheckIcon className="w-3.5 h-3.5" />
              )}
            </div>

            <div className="flex-1 min-w-0">
              <p className="text-[13px] font-medium leading-snug text-white">
                {toast.message}
              </p>
              {toast.detail && (
                <p className="text-[11.5px] text-white/60 truncate mt-0.5">
                  {toast.detail}
                </p>
              )}
            </div>

            <button
              type="button"
              onClick={() => onDismiss(toast.id)}
              aria-label="Dismiss notification"
              className="p-1 rounded-md text-white/50 hover:text-white hover:bg-white/10 transition-colors cursor-pointer"
            >
              <XIcon className="w-3.5 h-3.5" />
            </button>
          </div>
        );
      })}
    </div>
  );
}
