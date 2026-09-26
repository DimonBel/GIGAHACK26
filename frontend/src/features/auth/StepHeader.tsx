import type { ReactNode } from "react";

export function StepHeader({ title, children }: { title: string; children: ReactNode }) {
  return (
    <div className="flex flex-col gap-2">
      <h1 className="font-sans text-3xl font-bold">{title}</h1>
      <p className="text-md text-muted">{children}</p>
    </div>
  );
}
