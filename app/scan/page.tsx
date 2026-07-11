import { Suspense } from "react";

import { ScanRunner } from "@/components/scan/scan-runner";
import { Skeleton } from "@/components/ui/skeleton";

export const metadata = {
  title: "Scanning wallet",
  robots: { index: false, follow: false },
};

function ScanFallback() {
  return (
    <div className="mx-auto w-full max-w-xl px-4 py-24">
      <div className="flex flex-col items-center gap-4">
        <Skeleton className="size-16 rounded-full" />
        <Skeleton className="h-6 w-40" />
        <Skeleton className="h-4 w-32" />
      </div>
    </div>
  );
}

export default function ScanPage() {
  return (
    <Suspense fallback={<ScanFallback />}>
      <ScanRunner />
    </Suspense>
  );
}
