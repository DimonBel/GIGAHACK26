import type { HTMLAttributes, ReactNode } from "react";

import { cn } from "@/shared/lib/cn";

/** White surface with a hairline border. No shadow: depth comes from the canvas around it. */
export function Panel({ className, ...props }: HTMLAttributes<HTMLDivElement>) {
  return <div className={cn("rounded-lg border border-line bg-white", className)} {...props} />;
}

/** Title row of a panel, with optional description and actions on the right. */
export function PanelHeader({
  title,
  description,
  actions,
  className,
}: {
  title: ReactNode;
  description?: ReactNode;
  actions?: ReactNode;
  className?: string;
}) {
  return (
    <div className={cn("flex items-start justify-between gap-4 border-b border-line-soft px-5 py-4", className)}>
      <div className="flex min-w-0 flex-col gap-0.5">
        <h2 className="text-body font-semibold">{title}</h2>
        {description && <p className="text-small text-muted">{description}</p>}
      </div>
      {actions}
    </div>
  );
}
