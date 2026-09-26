import { cn } from "@/shared/lib/cn";
import type { AuthStep } from "@/stores/session";

const STEPS = ["Account", "Verification", "Cabinet"];
const ORDER: Record<Exclude<AuthStep, "in">, number> = { signin: 0, "2fa": 1, setup: 1, pick: 2 };

/** Progress through sign-in: three bars and "Step n of 3 · name". */
export function AuthSteps({ step }: { step: Exclude<AuthStep, "in"> }) {
  const order = ORDER[step];
  return (
    <div className="flex flex-col gap-2.5">
      <div className="flex gap-1.5" aria-hidden>
        {STEPS.map((label, i) => (
          <span key={label} className={cn("h-1 flex-1 rounded-full", i <= order ? "bg-primary" : "bg-line")} />
        ))}
      </div>
      <p className="text-caption text-muted">
        Step {order + 1} of {STEPS.length} · <span className="font-medium text-ink-2">{STEPS[order]}</span>
      </p>
    </div>
  );
}
