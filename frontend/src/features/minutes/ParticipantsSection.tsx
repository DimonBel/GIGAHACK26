import { Check } from "lucide-react";

import { ATTENDEES } from "@/mocks/people";
import { cn } from "@/shared/lib/cn";
import { useMinutesStore } from "@/stores/minutes";

export function ParticipantsSection({ isModerator }: { isModerator: boolean }) {
  const { absent, toggleAbsent } = useMinutesStore();
  const present = ATTENDEES.length - absent.length;
  return (
    <div className="flex flex-col gap-6">
      <div className="flex flex-col gap-1">
        <h2 className="font-sans text-3xl font-semibold">Participants</h2>
        <p className="text-base text-muted tabular-nums">
          {present} of {ATTENDEES.length} present
          {isModerator && " · click a status to change it"}
        </p>
      </div>
      <ul className="flex flex-col divide-y divide-line-soft border-y border-line-soft">
        {ATTENDEES.map((p) => {
          const away = absent.includes(p.name);
          const status = (
            <>
              {!away && <Check aria-hidden className="size-3.5" strokeWidth={2.5} />}
              {away ? "Absent" : "Present"}
            </>
          );
          const pill = cn(
            "inline-flex h-7 items-center gap-1 rounded-full px-2.5 text-sm font-medium",
            away ? "bg-sunken text-muted" : "bg-primary-soft text-primary",
          );
          return (
            <li key={p.name} className="flex items-center justify-between gap-3 py-3">
              <span className="flex flex-col">
                <span className="text-md font-medium">{p.name}</span>
                <span className="text-sm text-muted">
                  {p.dept} · {p.role}
                </span>
              </span>
              {isModerator ? (
                <button
                  type="button"
                  aria-pressed={!away}
                  aria-label={`${p.name}: ${away ? "absent" : "present"}`}
                  onClick={() => toggleAbsent(p.name)}
                  className={cn(pill, "transition-colors hover:ring-1 hover:ring-line-strong")}
                >
                  {status}
                </button>
              ) : (
                <span className={pill}>{status}</span>
              )}
            </li>
          );
        })}
      </ul>
    </div>
  );
}
