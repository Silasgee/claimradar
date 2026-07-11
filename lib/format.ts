/** Presentation formatters shared across the UI. Pure, framework-agnostic. */

/** 0x1234…abcd */
export function shortenAddress(address: string, chars = 4): string {
  if (address.length <= chars * 2 + 2) return address;
  return `${address.slice(0, chars + 2)}…${address.slice(-chars)}`;
}

const usd = new Intl.NumberFormat("en-US", {
  style: "currency",
  currency: "USD",
  maximumFractionDigits: 2,
});

/** USD value, or an em dash when unpriced. */
export function formatUsd(value: number | null | undefined): string {
  if (value === null || value === undefined) return "—";
  return usd.format(value);
}

/** Human token amount from a decimal string, adapting precision to magnitude. */
export function formatTokenAmount(amountDecimal: string, symbol?: string): string {
  const n = Number(amountDecimal);
  if (!Number.isFinite(n)) return symbol ? `${amountDecimal} ${symbol}` : amountDecimal;
  const abs = Math.abs(n);
  const maximumFractionDigits = abs === 0 ? 0 : abs < 1 ? 6 : abs < 1000 ? 4 : 2;
  const formatted = new Intl.NumberFormat("en-US", { maximumFractionDigits }).format(n);
  return symbol ? `${formatted} ${symbol}` : formatted;
}

const relative = new Intl.RelativeTimeFormat("en", { numeric: "auto" });
const DIVISIONS: [number, Intl.RelativeTimeFormatUnit][] = [
  [60, "seconds"],
  [60, "minutes"],
  [24, "hours"],
  [7, "days"],
  [4.34524, "weeks"],
  [12, "months"],
  [Number.POSITIVE_INFINITY, "years"],
];

/** "just now" / "3 minutes ago" / "in 2 days". */
export function formatRelativeTime(iso: string): string {
  const date = new Date(iso).getTime();
  if (!Number.isFinite(date)) return "";
  let duration = (date - Date.now()) / 1000;
  if (Math.abs(duration) < 45) return "just now";
  for (const [amount, unit] of DIVISIONS) {
    if (Math.abs(duration) < amount) return relative.format(Math.round(duration), unit);
    duration /= amount;
  }
  return "";
}

const dateTime = new Intl.DateTimeFormat("en-US", {
  dateStyle: "medium",
  timeStyle: "short",
});

export function formatDateTime(iso: string): string {
  const d = new Date(iso);
  return Number.isFinite(d.getTime()) ? dateTime.format(d) : "";
}

/** "820ms" / "3.4s". */
export function formatDuration(ms: number): string {
  if (ms < 1000) return `${Math.round(ms)}ms`;
  return `${(ms / 1000).toFixed(1)}s`;
}

/** Days until an ISO timestamp (negative if past), or null. */
export function daysUntil(iso: string | null): number | null {
  if (!iso) return null;
  const t = new Date(iso).getTime();
  if (!Number.isFinite(t)) return null;
  return (t - Date.now()) / 86_400_000;
}
