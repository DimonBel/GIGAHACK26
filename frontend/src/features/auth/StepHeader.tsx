import type { ReactNode } from "react";

export function StepHeader({ title, children }: { title: string; children: ReactNode }) {
  return (
    <div className="flex flex-col gap-2">
      <h1 className="font-sans text-3xl font-bold">{title}</h1>
      <p className="text-md text-muted">{children}</p>
    </div>
  );
}

export function CodeInput(props: { value: string; onChange: (value: string) => void; autoFocus?: boolean }) {
  return (
    <input
      value={props.value}
      onChange={(e) => props.onChange(e.target.value)}
      placeholder="000000"
      inputMode="numeric"
      autoComplete="one-time-code"
      aria-label="Verification code"
      autoFocus={props.autoFocus}
      className="h-14 w-full rounded-md border border-line-strong bg-white text-center text-2xl font-medium tracking-[0.5em] tabular-nums placeholder:text-line-strong hover:border-subtle focus:border-primary focus:ring-3 focus:ring-primary/15 focus:outline-none"
    />
  );
}
