export type NavTab = "vault" | "security" | "activity";

export type ToastVariant = "success" | "error" | "info" | "warning";

export interface ToastItem {
  id: string;
  message: string;
  detail?: string;
  variant: ToastVariant;
}

export interface GameAccount {
  id: string;
  game: string;
  monogram: string;
  nickname: string;
  login: string;
  password: string;
  twoFactor: boolean;
  updatedAt: number; // epoch ms
  notes?: string;
}

export interface SecuritySettings {
  reenterToReveal: boolean;
  clearClipboard: boolean;
  lockOnTabClose: boolean;
  twoStepLogin: boolean;
  emailNewSignIns: boolean;
  autoLockMinutes: 1 | 5 | 15 | 60;
}

export interface SignedInDevice {
  id: string;
  name: string;
  location: string;
  lastActive: string;
  isCurrent: boolean;
}

export type AuditCategory = "access" | "account" | "security" | "device";

export interface AuditLogEntry {
  id: string;
  timestampLabel: string;
  createdAt: number;
  action: string;
  target?: string;
  device: string;
  location?: string;
  category: AuditCategory;
}

export interface VaultIssue {
  id: string;
  accountId: string;
  game: string;
  monogram: string;
  nickname: string;
  reason: string;
  tag: "REUSED" | "WEAK" | "OLD";
}

export interface VaultHealthSummary {
  score: number;
  label: string;
  weakOrReusedCount: number;
  without2FACount: number;
  olderThan90DaysCount: number;
  needsAttentionAccountsCount: number;
  reusedAccountIds: Set<string>;
  weakAccountIds: Set<string>;
  oldAccountIds: Set<string>;
  issues: VaultIssue[];
}
