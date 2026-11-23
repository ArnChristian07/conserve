"use client";

import React, { useMemo, useState } from "react";
import { AuditCategory, AuditLogEntry } from "../types/vault";
import { DownloadIcon, SearchIcon } from "./Icons";

interface ActivityLogViewProps {
  logs: AuditLogEntry[];
  onExportLogs: () => void;
}

const CATEGORY_LABELS: { id: "all" | AuditCategory; label: string }[] = [
  { id: "all", label: "All events" },
  { id: "access", label: "Access & reveals" },
  { id: "account", label: "Account changes" },
  { id: "security", label: "Security" },
  { id: "device", label: "Devices" },
];

const CATEGORY_BADGE: Record<AuditCategory, string> = {
  access: "ACCESS",
  account: "ACCOUNT",
  security: "SECURITY",
  device: "DEVICE",
};

export function ActivityLogView({ logs, onExportLogs }: ActivityLogViewProps) {
  const [category, setCategory] = useState<"all" | AuditCategory>("all");
  const [search, setSearch] = useState("");

  const filteredLogs = useMemo(() => {
    const q = search.trim().toLowerCase();
    return logs.filter((log) => {
      if (category !== "all" && log.category !== category) return false;
      if (!q) return true;
      return (
        log.action.toLowerCase().includes(q) ||
        (log.target?.toLowerCase().includes(q) ?? false) ||
        log.device.toLowerCase().includes(q) ||
        (log.location?.toLowerCase().includes(q) ?? false)
      );
    });
  }, [logs, category, search]);

  return (
    <div className="space-y-5 sm:space-y-6 animate-fade-slide-up">
      {/* Header */}
      <div className="flex flex-col md:flex-row md:items-center justify-between gap-3.5 sm:gap-4">
        <div>
          <h1 className="text-[24px] sm:text-[28px] font-bold tracking-tight text-[#111111] leading-tight">
            Activity log
          </h1>
          <p className="text-[13px] sm:text-[13.5px] text-[#737373] mt-1">
            Tamper-evident audit trail of vault unlocks, reveals, edits and
            device sessions.
          </p>
        </div>

        <div className="flex items-center gap-2 sm:gap-2.5">
          <div className="relative flex-1 sm:w-[260px]">
            <SearchIcon className="w-4 h-4 text-[#8A8A8A] absolute left-3.5 top-1/2 -translate-y-1/2 pointer-events-none" />
            <input
              type="text"
              value={search}
              onChange={(e) => setSearch(e.target.value)}
              placeholder="Search action, account, device"
              className="w-full h-10 pl-9 pr-3.5 rounded-xl border border-[#E5E5E5] bg-white text-[16px] sm:text-[13px] text-[#111111] placeholder:text-[#9A9A9A] focus:outline-none focus:border-[#111111] transition-colors"
            />
          </div>
          <button
            type="button"
            onClick={onExportLogs}
            className="h-10 px-3.5 sm:px-4 rounded-xl border border-[#E5E5E5] bg-white text-[#111111] text-[13px] font-medium inline-flex items-center gap-1.5 hover:bg-[#F5F5F5] active:scale-[0.98] transition-all shrink-0 cursor-pointer"
          >
            <DownloadIcon className="w-4 h-4" />
            <span className="hidden sm:inline">Export CSV</span>
            <span className="sm:hidden">CSV</span>
          </button>
        </div>
      </div>

      {/* Category Filter Pills */}
      <div className="flex items-center gap-2 overflow-x-auto no-scrollbar pb-1 -mx-4 px-4 sm:mx-0 sm:px-0 sm:pb-0 sm:flex-wrap">
        {CATEGORY_LABELS.map((cat) => {
          const count =
            cat.id === "all"
              ? logs.length
              : logs.filter((l) => l.category === cat.id).length;
          const active = category === cat.id;
          return (
            <button
              key={cat.id}
              type="button"
              onClick={() => setCategory(cat.id)}
              className={`shrink-0 whitespace-nowrap px-3.5 py-1.5 rounded-full text-[12.5px] font-medium border transition-all cursor-pointer ${
                active
                  ? "bg-[#0D0D0D] text-white border-[#0D0D0D]"
                  : "bg-white text-[#404040] border-[#E5E5E5] hover:border-[#BDBDBD]"
              }`}
            >
              {cat.label} · {count}
            </button>
          );
        })}
      </div>

      {/* Audit Log (Mobile Cards + Desktop Table) */}
      <div className="bg-white rounded-2xl border border-[#EAEAEA] shadow-[0_1px_2px_rgba(0,0,0,0.03)] overflow-hidden">
        {/* Mobile Card View */}
        <div className="md:hidden divide-y divide-[#F0F0F0]">
          {filteredLogs.length === 0 ? (
            <div className="py-12 px-4 text-center text-[13.5px] text-[#737373]">
              No activity events match your filter.
            </div>
          ) : (
            filteredLogs.map((log) => (
              <div key={log.id} className="p-4 space-y-1.5">
                <div className="flex items-center justify-between gap-2">
                  <span className="px-2 py-0.5 rounded border border-[#E2E2E2] bg-[#FAFAFA] text-[10px] font-semibold tracking-wider text-[#525252]">
                    {CATEGORY_BADGE[log.category]}
                  </span>
                  <span className="text-[11.5px] text-[#8A8A8A]">
                    {log.timestampLabel}
                  </span>
                </div>
                <p className="text-[13.5px] text-[#111111] leading-snug pt-0.5">
                  <span className="font-semibold">{log.action}</span>
                  {log.target && (
                    <span className="text-[#525252]"> · {log.target}</span>
                  )}
                </p>
                <p className="text-[12px] text-[#737373]">
                  {log.device}
                  {log.location ? ` · ${log.location}` : ""}
                </p>
              </div>
            ))
          )}
        </div>

        {/* Desktop Table View */}
        <div className="hidden md:block overflow-x-auto">
          <table className="w-full text-left border-collapse min-w-[680px]">
            <thead>
              <tr className="border-b border-[#F0F0F0] text-[11px] font-semibold tracking-[0.06em] uppercase text-[#8A8A8A]">
                <th className="py-3.5 pl-6 pr-3">TIME</th>
                <th className="py-3.5 px-3">TYPE</th>
                <th className="py-3.5 px-3">EVENT</th>
                <th className="py-3.5 pl-3 pr-6 text-right">DEVICE &amp; LOCATION</th>
              </tr>
            </thead>
            <tbody className="divide-y divide-[#F3F3F3]">
              {filteredLogs.length === 0 ? (
                <tr>
                  <td
                    colSpan={4}
                    className="py-14 text-center text-[13.5px] text-[#737373]"
                  >
                    No activity events match your filter.
                  </td>
                </tr>
              ) : (
                filteredLogs.map((log) => (
                  <tr
                    key={log.id}
                    className="hover:bg-[#FAFAFA] transition-colors"
                  >
                    <td className="py-3.5 pl-6 pr-3 text-[12.5px] text-[#8A8A8A] whitespace-nowrap w-[130px]">
                      {log.timestampLabel}
                    </td>
                    <td className="py-3.5 px-3 w-[110px]">
                      <span className="px-2 py-0.5 rounded border border-[#E2E2E2] bg-[#FAFAFA] text-[10px] font-semibold tracking-wider text-[#525252]">
                        {CATEGORY_BADGE[log.category]}
                      </span>
                    </td>
                    <td className="py-3.5 px-3 text-[13.5px] text-[#111111]">
                      <span className="font-semibold">{log.action}</span>
                      {log.target && (
                        <span className="text-[#525252]"> · {log.target}</span>
                      )}
                    </td>
                    <td className="py-3.5 pl-3 pr-6 text-right text-[12.5px] text-[#737373] whitespace-nowrap">
                      {log.device}
                      {log.location ? ` · ${log.location}` : ""}
                    </td>
                  </tr>
                ))
              )}
            </tbody>
          </table>
        </div>
      </div>
    </div>
  );
}
