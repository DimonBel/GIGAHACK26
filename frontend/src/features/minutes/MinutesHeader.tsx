import { Check, Pencil, RotateCcw, Send, ShieldCheck } from "lucide-react";
import { useState } from "react";

import type { Meeting } from "@/api/meetings";
import type { MinutesDoc } from "@/api/types";
import { formatDay, formatDuration, formatTimeOfDay } from "@/shared/lib/date";
import type { MeetingType } from "@/shared/types/domain";
import { Button, PageHeader, StatusBadge, TypeBadge } from "@/shared/ui";
import { useMinutesStore } from "@/stores/minutes";

import { DeliveryStatus } from "./DeliveryStatus";
import { MeetingTypeMenu } from "./MeetingTypeMenu";
import { SaveIndicator } from "./SaveIndicator";

interface MinutesHeaderProps {
  meeting: Meeting;
  doc: MinutesDoc;
  isModerator: boolean;
}

export function MinutesHeader({ meeting, doc, isModerator }: MinutesHeaderProps) {
  const { editing, toggleEditing, approve, approving, saveError, save, attendeeList, select, redo } =
    useMinutesStore();
  const [confirm, setConfirm] = useState(false);
  const [redoAs, setRedoAs] = useState<MeetingType | null>(null);
  const [redoing, setRedoing] = useState(false);
  const draft = meeting.status === "draft";

  const eyebrow = (
    <>
      {isModerator && draft ? (
        <MeetingTypeMenu
          value={meeting.type}
          onPick={(type) => {
            setConfirm(false);
            setRedoAs(type);
          }}
        />
      ) : (
        <TypeBadge type={meeting.type} />
      )}
      <span className="tabular-nums">
        {formatDay(meeting.created)} · {formatDuration(meeting.duration)}
      </span>
      {meeting.createdBy && <span>by {meeting.createdBy}</span>}
    </>
  );

  let actions;
  if (!draft) {
    actions = (
      <>
        {isModerator && <DeliveryStatus />}
        <StatusBadge tone="ok">
          {`Approved${meeting.approved ? ` ${formatDay(meeting.approved)} ${formatTimeOfDay(meeting.approved)}` : ""}${meeting.approvedBy ? ` by ${meeting.approvedBy}` : ""}`}
        </StatusBadge>
      </>
    );
  } else if (!isModerator) {
    actions = <StatusBadge tone="warn">Draft · suggestions open</StatusBadge>;
  } else if (redoAs) {
    actions = (
      <span
        role="alert"
        className="flex max-w-[600px] flex-wrap items-center gap-2 rounded-lg bg-warn-bg py-1.5 pr-1.5 pl-3 text-base text-ink ring-1 ring-warn-line"
      >
        <span className="min-w-0 flex-1">
          Make the minutes again as <span className="font-medium">{redoAs}</span>? The transcript is kept;
          edits to the minutes are replaced (attendees and next meeting stay).
        </span>
        <Button variant="ghost" size="sm" onClick={() => setRedoAs(null)}>
          Cancel
        </Button>
        <Button
          variant="primary"
          size="sm"
          icon={RotateCcw}
          disabled={redoing}
          onClick={() => {
            setRedoing(true);
            void redo(redoAs).then(() => {
              setRedoing(false);
              setRedoAs(null);
            });
          }}
        >
          {redoing ? "Starting…" : "Redo minutes"}
        </Button>
      </span>
    );
  } else if (confirm) {
    const names = attendeeList.map((a) => a.name);
    actions = (
      <span
        role="alert"
        className="flex max-w-[560px] flex-wrap items-center gap-2 rounded-lg bg-primary-soft py-1.5 pr-1.5 pl-3 text-base text-ink"
      >
        <span className="min-w-0 flex-1">
          {names.length ? (
            <>
              Approve, lock and email {names.length} attendee{names.length === 1 ? "" : "s"}:{" "}
              <span className="font-medium">{names.join(", ")}</span>
            </>
          ) : (
            <>Nobody is ticked as an attendee, so no one will be emailed.</>
          )}
        </span>
        {!names.length && (
          <Button
            variant="ghost"
            size="sm"
            onClick={() => {
              setConfirm(false);
              select({ kind: "participants" });
              if (!editing) toggleEditing();
            }}
          >
            Choose attendees
          </Button>
        )}
        <Button variant="ghost" size="sm" onClick={() => setConfirm(false)}>
          Cancel
        </Button>
        <Button
          variant="primary"
          size="sm"
          icon={names.length ? Send : ShieldCheck}
          disabled={approving}
          onClick={() => void approve().then((ok) => ok && setConfirm(false))}
        >
          {approving ? "Approving…" : names.length ? "Approve & send" : "Approve anyway"}
        </Button>
      </span>
    );
  } else {
    actions = (
      <>
        <SaveIndicator />
        <Button icon={editing ? Check : Pencil} aria-pressed={editing} onClick={toggleEditing}>
          {editing ? "Done editing" : "Edit"}
        </Button>
        <Button
          variant="primary"
          icon={ShieldCheck}
          disabled={save === "conflict"}
          onClick={() => setConfirm(true)}
        >
          Approve
        </Button>
      </>
    );
  }

  return (
    <div className="flex flex-col gap-3">
      <PageHeader eyebrow={eyebrow} title={doc.title || meeting.title} actions={actions} />
      {saveError && draft && isModerator && save !== "error" && save !== "conflict" && (
        <p role="alert" className="text-base text-danger">
          {saveError}
        </p>
      )}
    </div>
  );
}
