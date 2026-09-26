import { CalendarDays, Clock, MapPin } from "lucide-react";

import type { NextMeeting } from "@/api/types";
import { formatDate } from "@/shared/lib/date";
import { EmptyState, Field, Input, Textarea } from "@/shared/ui";
import { useMinutesStore } from "@/stores/minutes";

export function NextMeetingSection({ next, editing }: { next: NextMeeting; editing: boolean }) {
  const updateNext = useMinutesStore((s) => s.updateNext);
  const empty = !next.date && !next.time && !next.place && !next.agenda;
  return (
    <div className="flex flex-col gap-6">
      <h2 className="font-sans text-3xl font-bold">Next meeting</h2>
      {editing ? (
        <div className="flex flex-col gap-4">
          <div className="grid gap-4 sm:grid-cols-[170px_130px_minmax(0,1fr)]">
            <Field label="Date">
              <Input type="date" value={next.date} onChange={(e) => updateNext({ date: e.target.value })} />
            </Field>
            <Field label="Time">
              <Input type="time" value={next.time} onChange={(e) => updateNext({ time: e.target.value })} />
            </Field>
            <Field label="Place">
              <Input
                value={next.place}
                onChange={(e) => updateNext({ place: e.target.value })}
                maxLength={200}
              />
            </Field>
          </div>
          <Field label="Agenda">
            <Textarea
              rows={4}
              value={next.agenda}
              onChange={(e) => updateNext({ agenda: e.target.value })}
              className="text-lg"
            />
          </Field>
        </div>
      ) : empty ? (
        <EmptyState>Not planned yet.</EmptyState>
      ) : (
        <div className="flex flex-col gap-5">
          <dl className="flex flex-wrap gap-x-8 gap-y-3 text-md">
            {[
              { icon: CalendarDays, label: "Date", value: next.date ? formatDate(next.date) : "—" },
              { icon: Clock, label: "Time", value: next.time || "—" },
              { icon: MapPin, label: "Place", value: next.place || "—" },
            ].map(({ icon: Icon, label, value }) => (
              <div key={label} className="flex items-center gap-2">
                <Icon aria-hidden className="size-4 text-muted" strokeWidth={1.75} />
                <dt className="sr-only">{label}</dt>
                <dd className="font-medium tabular-nums">{value}</dd>
              </div>
            ))}
          </dl>
          {next.agenda && (
            <p className="max-w-[68ch] text-xl text-pretty whitespace-pre-line">{next.agenda}</p>
          )}
        </div>
      )}
    </div>
  );
}
