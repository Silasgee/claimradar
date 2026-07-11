import * as React from "react";

import { cn } from "@/lib/utils";

const Input = React.forwardRef<HTMLInputElement, React.ComponentProps<"input">>(
  ({ className, type, ...props }, ref) => (
    <input
      type={type}
      ref={ref}
      className={cn(
        "border-input flex h-11 w-full rounded-lg border bg-transparent px-3.5 py-2 text-base shadow-sm transition-colors",
        "placeholder:text-muted-foreground/70",
        "focus-visible:border-ring/40 focus-visible:ring-ring/60 focus-visible:ring-2 focus-visible:ring-offset-0 focus-visible:outline-none",
        "disabled:cursor-not-allowed disabled:opacity-50",
        "aria-[invalid=true]:border-danger/60 aria-[invalid=true]:ring-danger/30",
        className,
      )}
      {...props}
    />
  ),
);
Input.displayName = "Input";

export { Input };
