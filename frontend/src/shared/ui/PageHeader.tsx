import type { ReactNode } from "react";

import { cn } from "@/shared/lib/cn";

interface PageHeaderProps {
  title: ReactNode;
  eyebrow?: ReactNode;
  description?: ReactNode;
  actions?: ReactNode;
  className?: string;
}

export function PageHeader({ title, eyebrow, description, actions, className }: PageHeaderProps) {
  return (
    <header className={cn("flex flex-wrap items-end justify-between gap-x-6 gap-y-4", className)}>
      <div className="flex min-w-0 flex-col gap-2">
        {eyebrow && <div className="flex flex-wrap items-center gap-x-3 gap-y-1 text-base text-muted">{eyebrow}</div>}
        <h1 className="font-sans font-bold text-3xl text-ink">{title}</h1>
        {description && <p className="max-w-[60ch] text-md text-muted">{description}</p>}
      </div>
      {actions && <div className="flex flex-wrap items-center gap-2">{actions}</div>}
    </header>
  );
}
