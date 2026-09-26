import type { ReactNode } from "react";

/** Title and one line of explanation for a sign-in step. */
export function StepHeader({ title, children }: { title: string; children: ReactNode }) {
  return (
    <div className="flex flex-col gap-2">
      <h1 className="font-serif text-heading">{title}</h1>
      <p className="text-body text-muted">{children}</p>
    </div>
  );
}

/** The 6-digit code field of the 2FA steps. */
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
      className="h-14 w-full rounded-md border border-line-strong bg-white text-center text-title font-medium tracking-[0.5em] tabular-nums placeholder:text-line-strong hover:border-subtle focus:border-primary focus:ring-3 focus:ring-primary/15 focus:outline-none"
    />
  );
}
