import { Check, Pencil, Send, ShieldCheck } from "lucide-react";
import { useState } from "react";

import type { Meeting } from "@/api/meetings";
import type { MinutesDoc } from "@/api/types";
import { formatDay, formatDuration, formatTimeOfDay } from "@/shared/lib/date";
import { Button, PageHeader, StatusBadge, TypeBadge } from "@/shared/ui";
import { useMinutesStore } from "@/stores/minutes";

import { DeliveryStatus } from "./DeliveryStatus";
import { SaveIndicator } from "./SaveIndicator";

interface MinutesHeaderProps {
  meeting: Meeting;
  doc: MinutesDoc;
  isModerator: boolean;
}

export function MinutesHeader({ meeting, doc, isModerator }: MinutesHeaderProps) {
  const { editing, toggleEditing, approve, approving, saveError, save, attendeeList, select } =
    useMinutesStore();
  const [confirm, setConfirm] = useState(false);
  const draft = meeting.status === "draft";

  const eyebrow = (
    <>
      <TypeBadge type={meeting.type} />
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
