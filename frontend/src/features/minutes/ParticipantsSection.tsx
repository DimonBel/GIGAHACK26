import type { Participant } from "@/api/types";
import { Dot, EmptyState, Input } from "@/shared/ui";
import { formatSeconds, useMinutesStore } from "@/stores/minutes";

import { AttendeesPicker } from "./AttendeesPicker";
import { speakerColor } from "./speakers";

export function ParticipantsSection({
  participants,
  editing,
}: {
  participants: Participant[];
  editing: boolean;
}) {
  const updateParticipant = useMinutesStore((s) => s.updateParticipant);
  const attendees = useMinutesStore((s) => s.attendeeList);
  return (
    <div className="flex flex-col gap-8">
      <h2 className="font-sans text-3xl font-bold">Participants</h2>
      <AttendeesPicker editing={editing} />
      <datalist id="attendee-names">
        {attendees.map((a) => (
          <option key={a.id} value={a.name} />
        ))}
      </datalist>
      <div className="flex flex-col gap-1 border-t border-line-soft pt-6">
        <h3 className="text-md font-semibold">Voices in the recording</h3>
        <p className="max-w-[64ch] text-base text-muted">
          Longest talk time first. Roles are the AI's guess from what each one says;
          {editing
            ? " name them from the attendees so the transcript shows who is who."
            : " the moderator can name them."}
        </p>
      </div>
      {participants.length ? (
        <ul className="flex flex-col divide-y divide-line-soft border-y border-line-soft">
          {participants.map((p) => (
            <li
              key={p.speaker}
              className="grid items-center gap-3 py-3.5 sm:grid-cols-[150px_minmax(0,1fr)_minmax(0,1fr)]"
            >
              <span className="flex items-center gap-2.5">
                <Dot className={speakerColor(p.speaker)} />
                <span className="flex flex-col">
                  <span className="text-md font-medium">{p.speaker.replace(/^SPEAKER/, "Speaker")}</span>
                  <span className="text-sm text-muted tabular-nums">talks {formatSeconds(p.seconds)}</span>
                </span>
              </span>
              {editing ? (
                <>
                  <Input
                    value={p.name}
                    onChange={(e) => updateParticipant(p.speaker, { name: e.target.value })}
                    list="attendee-names"
                    placeholder="Name, e.g. Dr. Elena Rusu"
                    aria-label={`Name of ${p.speaker}`}
                    maxLength={200}
                  />
                  <Input
                    value={p.role}
                    onChange={(e) => updateParticipant(p.speaker, { role: e.target.value })}
                    placeholder="Role"
                    aria-label={`Role of ${p.speaker}`}
                    maxLength={200}
                  />
                </>
              ) : (
                <>
                  <span className={p.name ? "text-md font-medium" : "text-md text-subtle"}>
                    {p.name || "Not named"}
                  </span>
                  <span className="text-md text-ink-2">{p.role || "—"}</span>
                </>
              )}
            </li>
          ))}
        </ul>
      ) : (
        <EmptyState>No speakers were detected.</EmptyState>
      )}
    </div>
  );
}
