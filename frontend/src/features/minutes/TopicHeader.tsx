import { ArrowDown, ArrowUp, Trash2 } from "lucide-react";
import { useState } from "react";

import type { Topic } from "@/api/types";
import { Button, IconButton, Input } from "@/shared/ui";
import { useMinutesStore } from "@/stores/minutes";

import { TimeLink } from "./blocks/TimeLink";

interface TopicHeaderProps {
  topic: Topic;
  number: number;
  count: number;
  editing: boolean;
}

export function TopicHeader({ topic, number, count, editing }: TopicHeaderProps) {
  const { updateTopic, deleteTopic, moveTopic } = useMinutesStore();
  const [confirmDelete, setConfirmDelete] = useState(false);

  return (
    <div className="flex flex-col gap-3 pb-6">
      <div className="flex flex-wrap items-center justify-between gap-3">
        <div className="flex items-center gap-2 text-sm text-muted">
          <span className="tabular-nums">
            Topic {number} of {count}
          </span>
          {topic.time && (
            <>
              <span aria-hidden>·</span>
              <span className="flex items-center gap-1">
                from <TimeLink topicId={topic.id} time={topic.time} />
              </span>
            </>
          )}
        </div>
        {editing && (
          <div className="flex items-center gap-1">
            {confirmDelete ? (
              <span
                role="alert"
                className="flex items-center gap-1 rounded-md bg-danger-soft py-0.5 pr-0.5 pl-2.5 text-base text-danger-ink"
              >
                Delete this topic and its blocks?
                <Button variant="ghost" size="sm" onClick={() => setConfirmDelete(false)}>
                  Cancel
                </Button>
                <Button
                  size="sm"
                  className="bg-danger text-white hover:bg-danger-ink"
                  onClick={() => deleteTopic(topic.id)}
                >
                  Delete
                </Button>
              </span>
            ) : (
              <>
                <IconButton
                  icon={ArrowUp}
                  label="Move topic up"
                  disabled={number === 1}
                  onClick={() => moveTopic(topic.id, -1)}
                  className="disabled:opacity-30"
                />
                <IconButton
                  icon={ArrowDown}
                  label="Move topic down"
                  disabled={number === count}
                  onClick={() => moveTopic(topic.id, 1)}
                  className="disabled:opacity-30"
                />
                <Button variant="danger" size="sm" icon={Trash2} onClick={() => setConfirmDelete(true)}>
                  Delete topic
                </Button>
              </>
            )}
          </div>
        )}
      </div>
      {editing ? (
        <Input
          value={topic.title}
          onChange={(e) => updateTopic(topic.id, { title: e.target.value })}
          placeholder="Topic title, e.g. Bed 9"
          aria-label="Topic title"
          autoFocus={!topic.title}
          maxLength={200}
          className="h-12 text-2xl font-semibold"
        />
      ) : (
        <h2 className="font-sans text-3xl font-bold text-balance">{topic.title || "Untitled topic"}</h2>
      )}
    </div>
  );
}
