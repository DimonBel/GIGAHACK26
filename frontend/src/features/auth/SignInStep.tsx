import { ArrowRight, Check, CircleAlert, LoaderCircle } from "lucide-react";
import { useRef } from "react";

import { DEMO_ACCOUNTS } from "@/mocks/accounts";
import { useT } from "@/shared/i18n";
import { cn } from "@/shared/lib/cn";
import { Button, Field, Input, Overline } from "@/shared/ui";
import { useSessionStore } from "@/stores/session";

import { StepHeader } from "./StepHeader";

export function SignInStep() {
  const t = useT();
  const { email, password, error, busy, setEmail, setPassword, signIn } = useSessionStore();
  const passwordRef = useRef<HTMLInputElement>(null);
  return (
    <form
      className="flex flex-col gap-5"
      onSubmit={(e) => {
        e.preventDefault();
        void signIn();
      }}
    >
      <StepHeader title={t.signIn}>Use your hospital directory account.</StepHeader>
      <div className="flex flex-col gap-4">
        <Field label="Email">
          <Input
            type="email"
            value={email}
            onChange={(e) => setEmail(e.target.value)}
            autoComplete="username"
            autoFocus={!email}
            required
            aria-invalid={!!error}
            className={cn(error && "border-danger")}
          />
        </Field>
        <Field label="Password">
          <Input
            ref={passwordRef}
            type="password"
            value={password}
            onChange={(e) => setPassword(e.target.value)}
            autoComplete="current-password"
            required
            aria-invalid={!!error}
            className={cn(error && "border-danger")}
          />
        </Field>
        {error && (
          <p role="alert" className="flex items-center gap-2 text-base text-danger">
            <CircleAlert aria-hidden className="size-4 shrink-0" strokeWidth={1.75} />
            {error}
          </p>
        )}
      </div>
      <Button
        type="submit"
        variant="primary"
        size="lg"
        disabled={busy}
        icon={busy ? LoaderCircle : undefined}
        trailingIcon={busy ? undefined : ArrowRight}
        className={cn("w-full", busy && "[&_svg]:animate-spin")}
      >
        {busy ? "Signing in…" : t.signIn}
      </Button>

      <div className="flex flex-col gap-2.5 pt-1">
        <Overline>Demo accounts</Overline>
        <ul className="divide-y divide-line-soft overflow-hidden rounded-lg border border-line bg-white">
          {DEMO_ACCOUNTS.map((d) => {
            const on = email === d.email;
            return (
              <li key={d.email}>
                <button
                  type="button"
                  aria-pressed={on}
                  onClick={() => {
                    setEmail(d.email);
                    passwordRef.current?.focus();
                  }}
                  className="flex w-full items-center gap-3 px-3.5 py-2.5 text-left transition-colors hover:bg-canvas"
                >
                  <span className="flex min-w-0 flex-1 flex-col">
                    <span className="text-md font-medium">{d.name}</span>
                    <span className="text-sm text-muted">{d.cabinets}</span>
                  </span>
                  {on && <Check aria-hidden className="size-4 text-primary" strokeWidth={2} />}
                </button>
              </li>
            );
          })}
        </ul>
      </div>
    </form>
  );
}
