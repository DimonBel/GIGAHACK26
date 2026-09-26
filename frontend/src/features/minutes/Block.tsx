import { Plus } from "lucide-react";
import type { ReactNode } from "react";

import { Button } from "@/shared/ui";

export function Block({ label, children }: { label: string; children: ReactNode }) {
  return (
    <section className="grid gap-x-8 gap-y-3 border-t border-line-soft py-6 md:grid-cols-[132px_minmax(0,1fr)]">
      <h3 className="text-xs font-semibold text-muted uppercase tracking-wider md:pt-1">{label}</h3>
      <div className="flex min-w-0 flex-col gap-3">{children}</div>
    </section>
  );
}

export function AddButton({ onClick, children }: { onClick: () => void; children: ReactNode }) {
  return (
    <Button variant="ghost" size="sm" icon={Plus} onClick={onClick} className="self-start text-muted">
      {children}
    </Button>
  );
}
