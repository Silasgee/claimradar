import { ConnectorRunStatus, ScanStatus, type DiscoveryReport } from "@/types";

/**
 * Client-side wrapper around POST /api/scan.
 *
 * The Discovery Engine is the single source of business logic; this only maps
 * HTTP + report outcomes into UI-friendly error kinds. No claim logic here.
 */

export type ScanErrorKind =
  | "invalid" // malformed wallet address
  | "timeout" // connector(s) exceeded the deadline
  | "rpc" // upstream chain/RPC failure
  | "rate_limited" // too many requests
  | "cancelled" // user aborted
  | "server"; // unexpected failure

export class ScanError extends Error {
  constructor(
    readonly kind: ScanErrorKind,
    message: string,
  ) {
    super(message);
    this.name = "ScanError";
  }
}

/** Derive a UX error kind from a FAILED report's connector runs. */
function failedReportKind(report: DiscoveryReport): ScanErrorKind {
  const timedOut = report.connectorRuns.some((r) => r.status === ConnectorRunStatus.TIMEOUT);
  return timedOut ? "timeout" : "rpc";
}

/**
 * Run a scan. Resolves with a report for COMPLETE/PARTIAL outcomes (including
 * zero-claim reports — that is a valid empty result, not an error). Rejects
 * with a `ScanError` for invalid input, transport errors, rate limits,
 * cancellation, or an all-connectors-failed report.
 */
export async function runScan(address: string, signal?: AbortSignal): Promise<DiscoveryReport> {
  let res: Response;
  try {
    res = await fetch("/api/scan", {
      method: "POST",
      headers: { "content-type": "application/json" },
      body: JSON.stringify({ address }),
      signal,
    });
  } catch (error) {
    if (signal?.aborted || (error as Error)?.name === "AbortError") {
      throw new ScanError("cancelled", "Scan cancelled.");
    }
    throw new ScanError("server", "Could not reach the scan service.");
  }

  if (res.status === 400)
    throw new ScanError("invalid", "That doesn't look like a valid wallet address.");
  if (res.status === 429) throw new ScanError("rate_limited", "You're scanning a little too fast.");
  if (!res.ok) throw new ScanError("server", "The scan service returned an unexpected error.");

  let report: DiscoveryReport;
  try {
    report = (await res.json()) as DiscoveryReport;
  } catch {
    throw new ScanError("server", "The scan service returned an unreadable response.");
  }

  if (report.status === ScanStatus.FAILED) {
    const kind = failedReportKind(report);
    throw new ScanError(
      kind,
      kind === "timeout"
        ? "The scan timed out before any source responded."
        : "A blockchain data source was unavailable.",
    );
  }

  return report;
}
