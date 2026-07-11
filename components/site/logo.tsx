import { cn } from "@/lib/utils";

/** ClaimRadar wordmark + radar mark. Pure SVG, no external assets. */
export function Logo({ className, withText = true }: { className?: string; withText?: boolean }) {
  return (
    <span className={cn("inline-flex items-center gap-2.5", className)}>
      <svg
        width="24"
        height="24"
        viewBox="0 0 24 24"
        fill="none"
        aria-hidden="true"
        className="shrink-0"
      >
        <circle cx="12" cy="12" r="9.25" stroke="var(--border)" strokeWidth="1.5" />
        <circle cx="12" cy="12" r="5" stroke="var(--border)" strokeWidth="1.5" />
        <path
          d="M12 12 L12 3.25 A8.75 8.75 0 0 1 19.5 8"
          fill="var(--brand)"
          fillOpacity="0.22"
          stroke="var(--brand)"
          strokeWidth="1.5"
          strokeLinejoin="round"
        />
        <circle cx="16.5" cy="7.5" r="1.6" fill="var(--brand)" />
      </svg>
      {withText && <span className="text-[15px] font-semibold tracking-tight">ClaimRadar</span>}
    </span>
  );
}
