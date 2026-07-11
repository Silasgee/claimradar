import type { BreakdownRow } from "@/lib/results";

function BreakdownCard({ title, rows }: { title: string; rows: BreakdownRow[] }) {
  const max = Math.max(1, ...rows.map((r) => r.count));
  return (
    <div className="border-border bg-card rounded-2xl border p-5">
      <h3 className="text-sm font-medium">{title}</h3>
      <ul className="mt-4 space-y-3">
        {rows.map((row) => (
          <li key={row.label}>
            <div className="mb-1.5 flex items-center justify-between text-sm">
              <span className="truncate">{row.label}</span>
              <span className="text-muted-foreground tabular-nums">{row.count}</span>
            </div>
            <div className="bg-muted h-1.5 w-full overflow-hidden rounded-full">
              <div
                className="bg-brand/70 h-full rounded-full"
                style={{ width: `${(row.count / max) * 100}%` }}
              />
            </div>
          </li>
        ))}
      </ul>
    </div>
  );
}

export function Breakdowns({
  byProtocol,
  byChain,
}: {
  byProtocol: BreakdownRow[];
  byChain: BreakdownRow[];
}) {
  return (
    <div className="grid gap-3 sm:grid-cols-2">
      <BreakdownCard title="By protocol" rows={byProtocol} />
      <BreakdownCard title="By chain" rows={byChain} />
    </div>
  );
}
