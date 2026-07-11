"use client";

import { useSearchParams } from "next/navigation";
import { useRouter } from "next/navigation";
import { useCallback, useEffect, useRef, useState } from "react";

import { ScanError, runScan, type ScanErrorKind } from "@/lib/api/scan-client";
import { saveScan } from "@/lib/history";
import { isValidEvmAddress } from "@/lib/wallet";

import { ScanErrorState } from "./scan-error-state";
import { ScanProgress, type ProgressConnector } from "./scan-progress";

const ESTIMATED_MS = 9000;
const FALLBACK_CONNECTORS: ProgressConnector[] = [
  {
    id: "merkle-distributor",
    displayName: "Merkle Distributor",
    protocol: { name: "Merkle Distributor Airdrop" },
  },
];

export function ScanRunner() {
  const router = useRouter();
  const params = useSearchParams();
  const address = params.get("address") ?? "";

  const [connectors, setConnectors] = useState<ProgressConnector[]>([]);
  const [progress, setProgress] = useState(4);
  const [etaSeconds, setEtaSeconds] = useState<number | null>(Math.round(ESTIMATED_MS / 1000));
  const [errorKind, setErrorKind] = useState<Exclude<ScanErrorKind, "cancelled"> | null>(null);

  const controllerRef = useRef<AbortController | null>(null);
  const startedRef = useRef(false);

  const start = useCallback(() => {
    if (!isValidEvmAddress(address)) {
      setErrorKind("invalid");
      return;
    }
    setErrorKind(null);
    setProgress(4);
    const controller = new AbortController();
    controllerRef.current = controller;
    const startedAt = performance.now();

    // Progress affordance while the synchronous scan runs.
    const timer = window.setInterval(() => {
      const elapsed = performance.now() - startedAt;
      setProgress(Math.min(92, 4 + (elapsed / ESTIMATED_MS) * 88));
      setEtaSeconds(Math.max(0, Math.ceil((ESTIMATED_MS - elapsed) / 1000)));
    }, 200);

    runScan(address, controller.signal)
      .then((report) => {
        setProgress(100);
        setEtaSeconds(0);
        const scanId = saveScan(report);
        router.replace(`/results?scan=${scanId}`);
      })
      .catch((error: unknown) => {
        if (error instanceof ScanError) {
          if (error.kind === "cancelled") {
            router.push("/");
            return;
          }
          setErrorKind(error.kind);
        } else {
          setErrorKind("server");
        }
      })
      .finally(() => window.clearInterval(timer));
  }, [address, router]);

  useEffect(() => {
    // Load the live connector list for an honest progress display.
    let active = true;
    fetch("/api/connectors")
      .then((r) => (r.ok ? r.json() : null))
      .then((data: { connectors?: ProgressConnector[] } | null) => {
        if (active && data?.connectors?.length) setConnectors(data.connectors);
        else if (active) setConnectors(FALLBACK_CONNECTORS);
      })
      .catch(() => active && setConnectors(FALLBACK_CONNECTORS));
    return () => {
      active = false;
    };
  }, []);

  useEffect(() => {
    if (startedRef.current) return;
    startedRef.current = true;
    start();
    return () => controllerRef.current?.abort();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  if (errorKind) {
    return (
      <ScanErrorState
        kind={errorKind}
        onRetry={
          errorKind === "invalid"
            ? undefined
            : () => {
                startedRef.current = true;
                start();
              }
        }
      />
    );
  }

  const shown = connectors.length ? connectors : [];
  const activeIndex = Math.min(
    shown.length - 1,
    Math.floor((progress / 100) * (shown.length || 1)),
  );

  return (
    <ScanProgress
      address={address}
      connectors={shown}
      progress={progress}
      activeIndex={progress >= 100 ? shown.length : activeIndex}
      etaSeconds={etaSeconds}
      onCancel={() => controllerRef.current?.abort()}
    />
  );
}
