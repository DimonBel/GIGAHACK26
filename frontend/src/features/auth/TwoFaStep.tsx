import { ArrowLeft, KeyRound } from "lucide-react";

import { useT } from "@/shared/i18n";
import { Button, Checkbox } from "@/shared/ui";
import { codeIsComplete, useSessionStore } from "@/stores/session";

import { CodeInput, StepHeader } from "./StepHeader";

export function TwoFaStep() {
  const t = useT();
  const { email, code, setCode, verify, backToSignIn, fillBackupCode } = useSessionStore();
  return (
    <form
      className="flex flex-col gap-5"
      onSubmit={(e) => {
        e.preventDefault();
        verify();
      }}
    >
      <StepHeader title={t.twoFa}>
        Enter the 6-digit code from your authenticator app for <b className="font-medium text-ink">{email}</b>.
      </StepHeader>
      <div className="flex flex-col gap-3">
        <CodeInput value={code} onChange={setCode} autoFocus />
        <label className="flex items-center gap-2.5 text-base text-ink-2">
          <Checkbox defaultChecked />
          Trust this workstation for 12 hours
        </label>
      </div>
      <Button type="submit" variant="primary" size="lg" disabled={!codeIsComplete(code)} className="w-full">
        {t.verify}
      </Button>
      <div className="flex justify-between">
        <Button variant="ghost" size="sm" icon={ArrowLeft} onClick={backToSignIn}>
          Back
        </Button>
        <Button variant="ghost" size="sm" icon={KeyRound} onClick={fillBackupCode}>
          Use a backup code
        </Button>
      </div>
    </form>
  );
}
