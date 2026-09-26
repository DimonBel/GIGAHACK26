import type { ReactNode } from "react";

import { cn } from "@/shared/lib/cn";

interface PageHeaderProps {
  title: ReactNode;
  /** small line above the title (context: meeting number, date) */
  eyebrow?: ReactNode;
  description?: ReactNode;
  /** the view's actions, primary last */
  actions?: ReactNode;
  className?: string;
}

/** Every screen starts with where you are and what you can do here. */
export function PageHeader({ title, eyebrow, description, actions, className }: PageHeaderProps) {
  return (
    <header className={cn("flex flex-wrap items-end justify-between gap-x-6 gap-y-4", className)}>
      <div className="flex min-w-0 flex-col gap-1.5">
        {eyebrow && <div className="flex flex-wrap items-center gap-x-3 gap-y-1 text-small text-muted">{eyebrow}</div>}
        <h1 className="font-serif text-heading text-ink">{title}</h1>
        {description && <p className="max-w-[60ch] text-body text-muted">{description}</p>}
      </div>
      {actions && <div className="flex flex-wrap items-center gap-2">{actions}</div>}
    </header>
  );
}
