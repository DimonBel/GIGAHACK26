import { TOTP_SETUP_KEY } from "@/mocks/accounts";
import { Button } from "@/shared/ui";
import { codeIsComplete, useSessionStore } from "@/stores/session";

import { CodeInput, StepHeader } from "./StepHeader";

export function SetupStep() {
  const { code, setCode, verify } = useSessionStore();
  return (
    <form
      className="flex flex-col gap-5"
      onSubmit={(e) => {
        e.preventDefault();
        verify();
      }}
    >
      <StepHeader title="Set up two-factor authentication">
        Required by hospital policy. Scan the code with an authenticator app, then enter the 6 digits it shows.
      </StepHeader>
      <div className="flex items-center gap-5 rounded-xl border border-line bg-sunken/50 p-4">
        <div className="flex size-28 shrink-0 items-center justify-center rounded-lg bg-[repeating-linear-gradient(45deg,var(--color-sunken)_0_6px,var(--color-white)_6px_12px)] text-sm text-muted ring-1 ring-line">
          QR code
        </div>
        <div className="flex min-w-0 flex-col gap-1.5">
          <span className="text-sm text-muted">Or enter this key manually</span>
          <code className="text-md font-medium tracking-wide tabular-nums select-all">{TOTP_SETUP_KEY}</code>
        </div>
      </div>
      <CodeInput value={code} onChange={setCode} autoFocus />
      <Button type="submit" variant="primary" size="lg" disabled={!codeIsComplete(code)} className="w-full">
        Activate 2FA
      </Button>
    </form>
  );
}
