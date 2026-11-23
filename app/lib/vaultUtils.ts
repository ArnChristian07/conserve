import { randomIndex } from "./crypto";
import { GameAccount, VaultHealthSummary, VaultIssue } from "../types/vault";

const DAY = 24 * 60 * 60 * 1000;

export function generateMonogram(game: string): string {
  const cleaned = game.replace(/[:\-]/g, " ").trim();
  const words = cleaned.split(/\s+/).filter(Boolean);
  if (words.length === 0) return "GM";
  if (words.length === 1) return words[0].slice(0, 1).toUpperCase();
  return (words[0][0] + words[1][0]).toUpperCase();
}

export function formatRelativeTime(timestamp: number, now?: number): string {
  if (now === undefined) {
    now = Date.now();
  }
  const diff = Math.max(0, now - timestamp);
  const mins = Math.floor(diff / 60000);
  if (mins < 1) return "Just now";
  if (mins < 60) return `${mins}m ago`;
  const hours = Math.floor(mins / 60);
  if (hours < 24) return `${hours}h ago`;
  const days = Math.floor(hours / 24);
  if (days === 1) return "Yesterday";
  if (days < 7) return `${days} days ago`;
  if (days < 30) {
    const weeks = Math.floor(days / 7);
    return weeks === 1 ? "1 week ago" : `${weeks} weeks ago`;
  }
  const months = Math.floor(days / 30);
  if (months === 1) return "1 month ago";
  if (months < 12) return `${months} months ago`;
  const years = Math.floor(months / 12);
  return years === 1 ? "1 year ago" : `${years} years ago`;
}

export function evaluatePasswordStrength(pw: string): {
  score: number;
  label: "Weak" | "Fair" | "Strong";
  isWeak: boolean;
  reason?: string;
} {
  let score = 0;
  if (pw.length >= 8) score += 1;
  if (pw.length >= 12) score += 1;
  if (/[A-Z]/.test(pw) && /[a-z]/.test(pw)) score += 1;
  if (/\d/.test(pw)) score += 1;
  if (/[^A-Za-z0-9]/.test(pw)) score += 1;

  if (score <= 2 || pw.length < 12) {
    const missing: string[] = [];
    if (!/[^A-Za-z0-9]/.test(pw)) missing.push("No symbols");
    if (pw.length < 12) missing.push(`${pw.length} characters`);
    return {
      score,
      label: score <= 2 ? "Weak" : "Fair",
      isWeak: score <= 3,
      reason: missing.length > 0 ? missing.join(", ") : "Predictable pattern",
    };
  }
  return { score, label: "Strong", isWeak: false };
}

export function computeVaultHealth(
  accounts: GameAccount[],
  now: number | null
): VaultHealthSummary {
  const passwordCounts = new Map<string, GameAccount[]>();
  for (const acc of accounts) {
    const list = passwordCounts.get(acc.password) ?? [];
    list.push(acc);
    passwordCounts.set(acc.password, list);
  }

  const reusedAccountIds = new Set<string>();
  const weakAccountIds = new Set<string>();
  const oldAccountIds = new Set<string>();
  const issues: VaultIssue[] = [];

  for (const acc of accounts) {
    const samePwList = passwordCounts.get(acc.password) ?? [];
    const isReused = samePwList.length > 1;
    const strength = evaluatePasswordStrength(acc.password);
    const daysOld = now !== null ? (now - acc.updatedAt) / DAY : 0;
    const isOld = now !== null && daysOld > 90;

    if (isReused) {
      reusedAccountIds.add(acc.id);
      const other = samePwList.find((o) => o.id !== acc.id);
      issues.push({
        id: `issue-reused-${acc.id}`,
        accountId: acc.id,
        game: acc.game,
        monogram: acc.monogram,
        nickname: acc.nickname,
        reason: strength.isWeak && other
          ? `Weak password, same as ${other.game}`
          : other
          ? `Same password as another account`
          : "Reused password",
        tag: "REUSED",
      });
    } else if (strength.isWeak) {
      weakAccountIds.add(acc.id);
      const parts: string[] = [];
      if (strength.reason) parts.push(strength.reason);
      if (!acc.twoFactor) parts.push("no 2FA");
      issues.push({
        id: `issue-weak-${acc.id}`,
        accountId: acc.id,
        game: acc.game,
        monogram: acc.monogram,
        nickname: acc.nickname,
        reason: parts.join(", ") || "Weak password",
        tag: "WEAK",
      });
    }

    if (isOld && now !== null) {
      oldAccountIds.add(acc.id);
      issues.push({
        id: `issue-old-${acc.id}`,
        accountId: acc.id,
        game: acc.game,
        monogram: acc.monogram,
        nickname: acc.nickname,
        reason: `Not changed in ${formatRelativeTime(acc.updatedAt, now).replace(" ago", "")}`,
        tag: "OLD",
      });
    }
  }

  const weakOrReusedSet = new Set([...reusedAccountIds, ...weakAccountIds]);
  const without2FACount = accounts.filter((a) => !a.twoFactor).length;

  // Score out of 100
  let score = 100;
  if (accounts.length > 0) {
    const reusedPenalty = reusedAccountIds.size * 10;
    const weakOnlyCount = [...weakAccountIds].filter((id) => !reusedAccountIds.has(id)).length;
    const weakPenalty = weakOnlyCount * 8;
    const twoFAPenalty = without2FACount * 4;
    const oldPenalty = oldAccountIds.size * 1;
    score = Math.max(0, Math.min(100, 100 - reusedPenalty - weakPenalty - twoFAPenalty - oldPenalty));
  }

  let label = "Strong";
  if (score < 70) label = "Needs work";
  else if (score < 90) label = "Fair";

  return {
    score,
    label,
    weakOrReusedCount: weakOrReusedSet.size,
    without2FACount,
    olderThan90DaysCount: oldAccountIds.size,
    needsAttentionAccountsCount: reusedAccountIds.size,
    reusedAccountIds,
    weakAccountIds,
    oldAccountIds,
    issues,
  };
}

export function generateStrongPassword(length = 16): string {
  const upper = "ABCDEFGHJKLMNPQRSTUVWXYZ";
  const lower = "abcdefghijkmnopqrstuvwxyz";
  const digits = "23456789";
  const symbols = "!@#$%^&*-_";
  const all = upper + lower + digits + symbols;
  const required = [
    upper[randomIndex(upper.length)],
    lower[randomIndex(lower.length)],
    digits[randomIndex(digits.length)],
    symbols[randomIndex(symbols.length)],
  ];
  const rest = Array.from({ length: length - required.length }, () =>
    all[randomIndex(all.length)]
  );
  const chars = [...required, ...rest];
  for (let i = chars.length - 1; i > 0; i--) {
    const j = randomIndex(i + 1);
    [chars[i], chars[j]] = [chars[j], chars[i]];
  }
  return chars.join("");
}

/** "Today 19:42" · "Yesterday 08:10" · "3 days ago" · "12 Oct 2026" */
export function formatLogTimestamp(createdAt: number, now = Date.now()): string {
  const d = new Date(createdAt);
  const time = `${String(d.getHours()).padStart(2, "0")}:${String(d.getMinutes()).padStart(2, "0")}`;
  const startOfToday = new Date(now);
  startOfToday.setHours(0, 0, 0, 0);
  const dayDiff = Math.floor((startOfToday.getTime() - createdAt) / DAY) + 1;
  if (createdAt >= startOfToday.getTime()) return `Today ${time}`;
  if (dayDiff <= 1) return `Yesterday ${time}`;
  if (dayDiff < 7) return `${dayDiff} days ago`;
  return d.toLocaleDateString(undefined, { day: "numeric", month: "short", year: "numeric" });
}
