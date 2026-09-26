import { CalendarDays, Clock, MapPin } from "lucide-react";

import { formatDate } from "@/shared/lib/date";
import { Field, Input, Textarea } from "@/shared/ui";
import { useMinutesStore } from "@/stores/minutes";

export function NextMeetingSection({ isModerator }: { isModerator: boolean }) {
  const { next, updateNext } = useMinutesStore();
  return (
    <div className="flex flex-col gap-6">
      <h2 className="font-sans text-3xl font-semibold">Next meeting</h2>
      {isModerator ? (
        <div className="flex flex-col gap-4">
          <div className="grid gap-4 sm:grid-cols-[160px_120px_minmax(0,1fr)]">
            <Field label="Date">
              <Input type="date" value={next.date} onChange={(e) => updateNext({ date: e.target.value })} />
            </Field>
            <Field label="Time">
              <Input type="time" value={next.time} onChange={(e) => updateNext({ time: e.target.value })} />
            </Field>
            <Field label="Place">
              <Input value={next.place} onChange={(e) => updateNext({ place: e.target.value })} />
            </Field>
          </div>
          <Field label="Agenda">
            <Textarea
              rows={4}
              value={next.agenda}
              onChange={(e) => updateNext({ agenda: e.target.value })}
              className="font-sans text-lg"
            />
          </Field>
        </div>
      ) : (
        <div className="flex flex-col gap-5">
          <dl className="flex flex-wrap gap-x-8 gap-y-3 text-md">
            {[
              { icon: CalendarDays, label: "Date", value: formatDate(next.date) },
              { icon: Clock, label: "Time", value: next.time },
              { icon: MapPin, label: "Place", value: next.place },
            ].map(({ icon: Icon, label, value }) => (
              <div key={label} className="flex items-center gap-2">
                <Icon aria-hidden className="size-4 text-muted" strokeWidth={1.75} />
                <dt className="sr-only">{label}</dt>
                <dd className="font-medium tabular-nums">{value}</dd>
              </div>
            ))}
          </dl>
          <p className="max-w-[68ch] font-sans text-xl font-semibold text-pretty">{next.agenda}</p>
        </div>
      )}
    </div>
  );
}
