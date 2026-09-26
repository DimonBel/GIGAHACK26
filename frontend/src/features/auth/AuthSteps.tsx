import { cn } from "@/shared/lib/cn";
import type { AuthStep } from "@/stores/session";

const STEPS = ["Account", "Verification", "Cabinet"];
const ORDER: Record<Exclude<AuthStep, "in">, number> = { signin: 0, "2fa": 1, setup: 1, pick: 2 };

export function AuthSteps({ step }: { step: Exclude<AuthStep, "in"> }) {
  const order = ORDER[step];
  return (
    <div className="flex flex-col gap-2">
      <div className="flex gap-1.5" aria-hidden>
        {STEPS.map((label, i) => (
          <span
            key={label}
            className={cn(
              "h-1.5 flex-1 rounded-full transition-colors",
              i <= order ? "bg-primary" : "bg-line",
            )}
          />
        ))}
      </div>
      <p className="text-sm text-muted">
        Step {order + 1} of {STEPS.length} · <span className="font-medium text-ink-2">{STEPS[order]}</span>
      </p>
    </div>
  );
}
