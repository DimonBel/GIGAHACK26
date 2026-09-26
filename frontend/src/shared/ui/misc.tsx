import type { LucideIcon } from "lucide-react";
import type { HTMLAttributes, ReactNode } from "react";

import { cn } from "@/shared/lib/cn";

export function Overline({ className, ...props }: HTMLAttributes<HTMLDivElement>) {
  return <div className={cn("text-xs font-semibold uppercase tracking-wider text-muted", className)} {...props} />;
}

export function EmptyState({ icon: Icon, children, className }: { icon?: LucideIcon; children: ReactNode; className?: string }) {
  return (
    <div className={cn("flex items-center gap-2 text-base text-subtle", className)}>
      {Icon && <Icon aria-hidden className="size-4" strokeWidth={1.75} />}
      {children}
    </div>
  );
}

export function Wordmark({ className }: { className?: string }) {
  return <span className={cn("font-sans font-bold text-2xl tracking-tight", className)}>Verbal</span>;
}
