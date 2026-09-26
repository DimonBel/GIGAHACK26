import type { LucideIcon } from "lucide-react";
import type { HTMLAttributes, ReactNode } from "react";

import { cn } from "@/shared/lib/cn";

/** Small caps label above or beside a group ("Summary", "Topics"). */
export function Overline({ className, ...props }: HTMLAttributes<HTMLDivElement>) {
  return <div className={cn("text-overline font-semibold text-muted uppercase", className)} {...props} />;
}

/** Quiet message for an empty list, optionally with an icon. */
export function EmptyState({ icon: Icon, children, className }: { icon?: LucideIcon; children: ReactNode; className?: string }) {
  return (
    <div className={cn("flex items-center gap-2 text-small text-subtle", className)}>
      {Icon && <Icon aria-hidden className="size-4" strokeWidth={1.75} />}
      {children}
    </div>
  );
}

/** "Verbal" wordmark (serif accent). */
export function Wordmark({ className }: { className?: string }) {
  return <span className={cn("font-serif text-title tracking-tight", className)}>Verbal</span>;
}
