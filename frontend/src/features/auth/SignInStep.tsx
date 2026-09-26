import { ArrowRight, Check, CircleAlert } from "lucide-react";

import { DEMO_ACCOUNTS } from "@/mocks/accounts";
import { useT } from "@/shared/i18n";
import { cn } from "@/shared/lib/cn";
import { Button, Field, Input, Overline } from "@/shared/ui";
import { useSessionStore } from "@/stores/session";

import { StepHeader } from "./StepHeader";

export function SignInStep() {
  const t = useT();
  const { email, emailUnknown, setEmail, signIn } = useSessionStore();
  return (
    <form
      className="flex flex-col gap-6"
      onSubmit={(e) => {
        e.preventDefault();
        signIn();
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
            aria-invalid={emailUnknown}
            className={cn(emailUnknown && "border-danger")}
          />
        </Field>
        <Field label="Password">
          <Input type="password" defaultValue="password123" autoComplete="current-password" />
        </Field>
        {emailUnknown && (
          <p role="alert" className="flex items-center gap-2 text-small text-danger">
            <CircleAlert aria-hidden className="size-4" strokeWidth={1.75} />
            This account is not in the hospital directory.
          </p>
        )}
      </div>
      <Button type="submit" variant="primary" size="lg" trailingIcon={ArrowRight} className="w-full">
        {t.continue}
      </Button>

      <div className="flex flex-col gap-2.5 pt-2">
        <Overline>Demo accounts</Overline>
        <ul className="divide-y divide-line-soft overflow-hidden rounded-lg border border-line bg-white">
          {DEMO_ACCOUNTS.map((d) => {
            const on = email === d.email;
            return (
              <li key={d.email}>
                <button
                  type="button"
                  aria-pressed={on}
                  onClick={() => setEmail(d.email)}
                  className="flex w-full items-center gap-3 px-3.5 py-2.5 text-left transition-colors hover:bg-canvas"
                >
                  <span className="flex min-w-0 flex-1 flex-col">
                    <span className="text-body font-medium">{d.name}</span>
                    <span className="text-caption text-muted">{d.cabinets}</span>
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
