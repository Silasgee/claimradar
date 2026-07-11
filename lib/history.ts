"use client";

import { useCallback, useEffect, useState } from "react";

import type { DiscoveryReport } from "@/types";

/**
 * Local-only scan history + report cache (no auth, no server state).
 *
 * - History summaries live in localStorage so recent scans persist.
 * - Full reports are cached in sessionStorage keyed by scanId so /results can
 *   render without a refetch, while staying out of long-term storage.
 */

const HISTORY_KEY = "assetradar:history:v1";
const REPORT_PREFIX = "assetradar:report:";
const MAX_HISTORY = 8;

export interface ScanHistoryEntry {
  scanId: string;
  address: string;
  at: string;
  totalClaims: number;
  actionableClaims: number;
  status: DiscoveryReport["status"];
}

function readHistory(): ScanHistoryEntry[] {
  if (typeof window === "undefined") return [];
  try {
    const raw = window.localStorage.getItem(HISTORY_KEY);
    return raw ? (JSON.parse(raw) as ScanHistoryEntry[]) : [];
  } catch {
    return [];
  }
}

function writeHistory(entries: ScanHistoryEntry[]): void {
  try {
    window.localStorage.setItem(HISTORY_KEY, JSON.stringify(entries.slice(0, MAX_HISTORY)));
    window.dispatchEvent(new Event("assetradar:history"));
  } catch {
    /* storage full or unavailable — history is best-effort */
  }
}

/** Persist a completed report + prepend a history entry. Returns the scanId. */
export function saveScan(report: DiscoveryReport): string {
  try {
    window.sessionStorage.setItem(REPORT_PREFIX + report.discoveryId, JSON.stringify(report));
    window.sessionStorage.setItem("assetradar:lastScanId", report.discoveryId);
  } catch {
    /* ignore */
  }
  const entry: ScanHistoryEntry = {
    scanId: report.discoveryId,
    address: report.wallet,
    at: report.completedAt,
    totalClaims: report.claims.length,
    actionableClaims: report.claims.filter((c) => c.status === "CLAIMABLE").length,
    status: report.status,
  };
  const next = [entry, ...readHistory().filter((e) => e.address !== entry.address)];
  writeHistory(next);
  return report.discoveryId;
}

export function loadReport(scanId: string): DiscoveryReport | null {
  if (typeof window === "undefined") return null;
  try {
    const raw = window.sessionStorage.getItem(REPORT_PREFIX + scanId);
    return raw ? (JSON.parse(raw) as DiscoveryReport) : null;
  } catch {
    return null;
  }
}

export function lastScanId(): string | null {
  if (typeof window === "undefined") return null;
  try {
    return window.sessionStorage.getItem("assetradar:lastScanId");
  } catch {
    return null;
  }
}

/** Reactive history list, kept in sync across tabs and in-tab updates. */
export function useScanHistory(): {
  history: ScanHistoryEntry[];
  clear: () => void;
  remove: (address: string) => void;
} {
  const [history, setHistory] = useState<ScanHistoryEntry[]>([]);

  useEffect(() => {
    const sync = () => setHistory(readHistory());
    sync();
    window.addEventListener("storage", sync);
    window.addEventListener("assetradar:history", sync);
    return () => {
      window.removeEventListener("storage", sync);
      window.removeEventListener("assetradar:history", sync);
    };
  }, []);

  const clear = useCallback(() => writeHistory([]), []);
  const remove = useCallback(
    (address: string) => writeHistory(readHistory().filter((e) => e.address !== address)),
    [],
  );

  return { history, clear, remove };
}
