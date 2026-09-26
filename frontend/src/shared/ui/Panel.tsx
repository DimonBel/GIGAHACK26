import type { HTMLAttributes, ReactNode } from "react";

import { cn } from "@/shared/lib/cn";

export function Panel({ className, ...props }: HTMLAttributes<HTMLDivElement>) {
  return <div className={cn("rounded-xl border border-line bg-white", className)} {...props} />;
}

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
    <div className={cn("flex items-start justify-between gap-4 border-b border-line-soft px-6 py-5", className)}>
      <div className="flex min-w-0 flex-col gap-0.5">
        <h2 className="text-md font-semibold">{title}</h2>
        {description && <p className="text-base text-muted">{description}</p>}
      </div>
      {actions}
    </div>
  );
}
