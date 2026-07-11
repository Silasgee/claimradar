import { Suspense } from "react";

import { ResultsView } from "@/components/results/results-view";
import { Skeleton } from "@/components/ui/skeleton";

export const metadata = {
  title: "Scan results",
  robots: { index: false, follow: false },
};

function ResultsFallback() {
  return (
    <div className="mx-auto w-full max-w-5xl px-4 py-12 sm:px-6">
      <Skeleton className="h-5 w-24" />
      <Skeleton className="mt-4 h-8 w-64" />
      <div className="mt-6 grid grid-cols-2 gap-3 lg:grid-cols-4">
        {Array.from({ length: 4 }).map((_, i) => (
          <Skeleton key={i} className="h-28 rounded-2xl" />
        ))}
      </div>
      <Skeleton className="mt-6 h-64 w-full rounded-2xl" />
    </div>
  );
}

export default function ResultsPage() {
  return (
    <Suspense fallback={<ResultsFallback />}>
      <ResultsView />
    </Suspense>
  );
}
