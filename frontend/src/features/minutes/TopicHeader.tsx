import { Check, Pencil, Trash2 } from "lucide-react";
import { useState } from "react";

import { MEETING_TYPES } from "@/shared/lib/tones";
import type { MeetingType, Topic } from "@/shared/types/domain";
import { Button, Input, Select, TypeBadge } from "@/shared/ui";
import { useMinutesStore } from "@/stores/minutes";

interface TopicHeaderProps {
  topic: Topic;
  number: number;
  count: number;
  isModerator: boolean;
  editing: boolean;
}

export function TopicHeader({ topic, number, count, isModerator, editing }: TopicHeaderProps) {
  const { updateTopic, deleteTopic, toggleEditing } = useMinutesStore();
  const [confirmDelete, setConfirmDelete] = useState(false);

  return (
    <div className="flex flex-col gap-4 pb-6">
      <div className="flex flex-wrap items-center justify-between gap-3">
        <div className="flex items-center gap-3 text-sm text-muted">
          <span className="tabular-nums">
            Topic {number} of {count}
          </span>
          <span aria-hidden>·</span>
          <span className="tabular-nums">{topic.time}</span>
          <span aria-hidden>·</span>
          <TypeBadge type={topic.tag} className="font-normal" />
        </div>
        {isModerator && (
          <div className="flex items-center gap-2">
            {editing && !confirmDelete && (
              <Button variant="danger" size="sm" icon={Trash2} onClick={() => setConfirmDelete(true)}>
                Delete
              </Button>
            )}
            {editing && confirmDelete && (
              <span role="alert" className="flex items-center gap-1 rounded-md bg-danger-soft py-0.5 pr-0.5 pl-2.5 text-base text-danger-ink">
                Delete this topic?
                <Button variant="ghost" size="sm" onClick={() => setConfirmDelete(false)}>
                  Cancel
                </Button>
                <Button
                  size="sm"
                  className="border-danger bg-danger text-white hover:border-danger hover:bg-danger-ink"
                  onClick={() => {
                    setConfirmDelete(false);
                    deleteTopic(topic.id);
                  }}
                >
                  Delete
                </Button>
              </span>
            )}
            <Button
              variant={editing ? "primary" : "secondary"}
              size="sm"
              icon={editing ? Check : Pencil}
              aria-pressed={editing}
              onClick={() => {
                setConfirmDelete(false);
                toggleEditing();
              }}
            >
              {editing ? "Done" : "Edit topic"}
            </Button>
          </div>
        )}
      </div>
      {editing ? (
        <div className="flex flex-wrap gap-2">
          <Input
            value={topic.title}
            onChange={(e) => updateTopic(topic.id, { title: e.target.value })}
            placeholder="Topic title"
            aria-label="Topic title"
            autoFocus={!topic.title}
            className="h-12 min-w-[240px] flex-1 font-sans text-2xl font-semibold"
          />
          <Select
            value={topic.tag}
            onChange={(e) => updateTopic(topic.id, { tag: e.target.value as MeetingType })}
            aria-label="Meeting type"
            className="h-12 w-44"
          >
            {MEETING_TYPES.map((type) => (
              <option key={type} value={type}>
                {type}
              </option>
            ))}
          </Select>
        </div>
      ) : (
        <h2 className="font-sans text-3xl font-semibold text-balance">{topic.title || "Untitled topic"}</h2>
      )}
    </div>
  );
}
