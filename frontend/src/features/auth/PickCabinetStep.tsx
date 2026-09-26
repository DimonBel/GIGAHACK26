import { ArrowRight } from "lucide-react";

import { CABINETS, CABINET_DESCRIPTION, cabinetAccess } from "@/shared/config/cabinets";
import { useT } from "@/shared/i18n";
import { cn } from "@/shared/lib/cn";
import { useAccount, useSessionStore } from "@/stores/session";

import { StepHeader } from "./StepHeader";

export function PickCabinetStep() {
  const t = useT();
  const account = useAccount();
  const enterCabinet = useSessionStore((s) => s.enterCabinet);
  const allowed = account?.cabinets ?? [];
  return (
    <div className="flex flex-col gap-5">
      <StepHeader title={t.chooseCabinet}>
        Signed in as {account?.name ?? "—"}. You can switch later from the header.
      </StepHeader>
      <ul className="flex flex-col gap-2">
        {CABINETS.map((cabinet) => {
          const open = cabinetAccess(cabinet, allowed, null) !== "none";
          return (
            <li key={cabinet}>
              <button
                type="button"
                disabled={!open}
                onClick={() => enterCabinet(cabinet)}
                className={cn(
                  "group flex w-full items-center gap-4 rounded-xl border p-4 text-left transition-all",
                  open
                    ? "border-line bg-white shadow-sm hover:border-primary/50 hover:shadow-lg"
                    : "cursor-not-allowed border-line-soft bg-transparent",
                )}
              >
                <span className="flex min-w-0 flex-1 flex-col gap-1">
                  <span className={cn("text-md font-semibold", !open && "text-subtle")}>{t[cabinet]}</span>
                  <span className={cn("text-base", open ? "text-muted" : "text-subtle")}>
                    {CABINET_DESCRIPTION[cabinet]}
                  </span>
                </span>
                {open ? (
                  <ArrowRight
                    aria-hidden
                    className="size-4 shrink-0 text-subtle transition-all group-hover:translate-x-0.5 group-hover:text-primary"
                    strokeWidth={1.75}
                  />
                ) : (
                  <span className="text-sm text-subtle">No access</span>
                )}
              </button>
            </li>
          );
        })}
      </ul>
    </div>
  );
}
