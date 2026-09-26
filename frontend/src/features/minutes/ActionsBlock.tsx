import { X } from "lucide-react";

import { cn } from "@/shared/lib/cn";
import { DUE_TEXT, dueLabel, dueTone } from "@/shared/lib/date";
import type { Topic } from "@/shared/types/domain";
import { EmptyState, IconButton, Input } from "@/shared/ui";
import { useMinutesStore } from "@/stores/minutes";

import { AddButton, Block } from "./Block";
import { PeopleSelect } from "./PeopleSelect";

export function ActionsBlock({ topic, editing }: { topic: Topic; editing: boolean }) {
  const { addAction, updateAction, removeAction } = useMinutesStore();
  return (
    <Block label="Decisions & tasks">
      {editing ? (
        <>
          <ul className="flex flex-col divide-y divide-line-soft">
            {topic.actions.map((a) => (
              <li key={a.id} className="grid grid-cols-[minmax(0,1fr)_auto] gap-2 py-3 first:pt-0">
                <Input
                  value={a.text}
                  onChange={(e) => updateAction(topic.id, a.id, { text: e.target.value })}
                  placeholder="Decision or task"
                  aria-label="Decision or task"
                />
                <IconButton icon={X} label="Remove task" onClick={() => removeAction(topic.id, a.id)} className="mt-1" />
                <div className="grid gap-2 sm:grid-cols-[minmax(0,1fr)_170px]">
                  <PeopleSelect
                    value={a.owner}
                    onChange={(e) => updateAction(topic.id, a.id, { owner: e.target.value })}
                    aria-label="Owner"
                  />
                  <Input
                    type="date"
                    value={a.due}
                    onChange={(e) => updateAction(topic.id, a.id, { due: e.target.value })}
                    aria-label="Due date"
                  />
                </div>
              </li>
            ))}
          </ul>
          <AddButton onClick={() => addAction(topic.id)}>Add task</AddButton>
        </>
      ) : topic.actions.length ? (
        <ul className="flex flex-col divide-y divide-line-soft">
          {topic.actions.map((a) => (
            <li key={a.id} className="flex flex-wrap items-baseline justify-between gap-x-6 gap-y-1 py-3 first:pt-0 last:pb-0">
              <span className="flex min-w-0 flex-col gap-0.5">
                <span className="text-md font-medium text-ink">{a.text}</span>
                <span className="text-sm text-muted">{a.owner}</span>
              </span>
              <span className={cn("text-base whitespace-nowrap tabular-nums", DUE_TEXT[dueTone(a.due)])}>
                {dueLabel(a.due)}
              </span>
            </li>
          ))}
        </ul>
      ) : (
        <EmptyState>No decisions or tasks.</EmptyState>
      )}
    </Block>
  );
}
