import { X } from "lucide-react";

import type { Priority, TasksBlock as TasksBlockData } from "@/api/types";
import { cn } from "@/shared/lib/cn";
import { Button, Checkbox, EmptyState, IconButton, Input, Select } from "@/shared/ui";
import { useMinutesStore } from "@/stores/minutes";

import { TimeLink, Unverified } from "./TimeLink";
import { useFocusNew } from "./useFocusNew";

const PRIORITY: Record<Priority, { label: string; className: string }> = {
  high: { label: "High", className: "bg-danger-soft text-danger" },
  medium: { label: "Medium", className: "bg-sunken text-ink-2" },
  low: { label: "Low", className: "bg-sunken text-muted" },
};

interface TasksBlockProps {
  topicId: string;
  block: TasksBlockData;
  editing: boolean;
  /** Names offered as owners (the participants the moderator named). */
  people: string[];
}

export function TasksBlock({ topicId, block, editing, people }: TasksBlockProps) {
  const { addItem, updateItem, removeItem } = useMinutesStore();
  const inputs = useFocusNew();
  const listId = `owners-${block.id}`;

  const add = () => {
    const id = addItem(topicId, block.id);
    if (id) inputs.focus(id);
  };

  if (editing) {
    return (
      <>
        <datalist id={listId}>
          {people.map((p) => (
            <option key={p} value={p} />
          ))}
        </datalist>
        <ul className="flex flex-col divide-y divide-line-soft">
          {block.items.map((task) => (
            <li
              key={task.id}
              className="grid grid-cols-[auto_minmax(0,1fr)_auto] items-start gap-x-3 gap-y-2 py-3 first:pt-0"
            >
              <Checkbox
                checked={task.done}
                onChange={(e) => updateItem(topicId, block.id, task.id, { done: e.target.checked })}
                aria-label="Done"
                className="mt-3"
              />
              <Input
                ref={inputs.register(task.id)}
                value={task.text}
                onChange={(e) => updateItem(topicId, block.id, task.id, { text: e.target.value })}
                onKeyDown={(e) => {
                  if (e.key === "Enter") {
                    e.preventDefault();
                    add();
                  }
                }}
                placeholder="What must be done"
                aria-label="Task"
              />
              <IconButton
                icon={X}
                label="Remove task"
                onClick={() => removeItem(topicId, block.id, task.id)}
                className="mt-1"
              />
              <div className="col-start-2 grid grid-cols-2 gap-2 xl:grid-cols-[minmax(0,1fr)_140px_150px]">
                <Input
                  className="col-span-2 h-9 xl:col-span-1"
                  list={listId}
                  value={task.owner}
                  onChange={(e) => updateItem(topicId, block.id, task.id, { owner: e.target.value })}
                  placeholder="Owner"
                  aria-label="Owner"
                />
                <Input
                  value={task.deadline}
                  onChange={(e) => updateItem(topicId, block.id, task.id, { deadline: e.target.value })}
                  placeholder="Deadline"
                  aria-label="Deadline"
                  className="h-9"
                />
                <Select
                  value={task.priority}
                  onChange={(e) =>
                    updateItem(topicId, block.id, task.id, { priority: e.target.value as Priority })
                  }
                  aria-label="Priority"
                  className="h-9"
                >
                  {(Object.keys(PRIORITY) as Priority[]).map((p) => (
                    <option key={p} value={p}>
                      {PRIORITY[p].label} priority
                    </option>
                  ))}
                </Select>
              </div>
            </li>
          ))}
        </ul>
        <Button variant="ghost" size="sm" onClick={add} className="self-start text-muted">
          + Add task
        </Button>
      </>
    );
  }

  if (!block.items.length) return <EmptyState>No tasks.</EmptyState>;
  return (
    <ul className="flex flex-col divide-y divide-line-soft">
      {block.items.map((task) => (
        <li key={task.id} className="flex flex-wrap items-baseline gap-x-4 gap-y-1 py-3 first:pt-0 last:pb-0">
          <span className="flex min-w-0 flex-1 flex-col gap-1">
            <span className={cn("text-md font-medium", task.done ? "text-subtle line-through" : "text-ink")}>
              {task.text || "—"}
            </span>
            <span className="flex flex-wrap items-center gap-x-3 gap-y-1 text-sm text-muted">
              <span>{task.owner || "No owner"}</span>
              {task.deadline && <span className="text-ink-2">{task.deadline}</span>}
            </span>
          </span>
          <span className="flex items-center gap-2">
            <Unverified values={task.unverified} />
            <span
              className={cn(
                "rounded-full px-2 py-0.5 text-xs font-medium",
                PRIORITY[task.priority].className,
              )}
            >
              {PRIORITY[task.priority].label}
            </span>
            <TimeLink topicId={topicId} time={task.time} />
          </span>
        </li>
      ))}
    </ul>
  );
}
