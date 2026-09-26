import { cn } from "@/shared/lib/cn";

const STEPS = ["Account", "Cabinet"];

export function AuthSteps({ step }: { step: "signin" | "pick" }) {
  const order = step === "signin" ? 0 : 1;
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
