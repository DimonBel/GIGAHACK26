import { Check, X } from "lucide-react";

import type { ListBlock as ListBlockData } from "@/api/types";
import { Button, EmptyState, IconButton } from "@/shared/ui";
import { useMinutesStore } from "@/stores/minutes";

import { TimeLink, Unverified } from "./TimeLink";
import { useFocusNew } from "./useFocusNew";

const itemInput =
  "min-w-0 flex-1 rounded-md border border-transparent bg-transparent px-2 py-1.5 -mx-2 text-md text-ink hover:border-line focus:border-primary focus:bg-white focus:ring-3 focus:ring-primary/15 focus:outline-none";

export function ListBlock({
  topicId,
  block,
  editing,
}: {
  topicId: string;
  block: ListBlockData;
  editing: boolean;
}) {
  const { addItem, updateItem, removeItem } = useMinutesStore();
  const inputs = useFocusNew();

  const add = () => {
    const id = addItem(topicId, block.id);
    if (id) inputs.focus(id);
  };

  if (editing) {
    return (
      <>
        <ul className="flex flex-col gap-0.5">
          {block.items.map((item, i) => (
            <li key={item.id} className="flex items-center gap-2">
              <span aria-hidden className="size-1.5 shrink-0 rounded-full bg-line-strong" />
              <input
                ref={inputs.register(item.id)}
                value={item.text}
                onChange={(e) => updateItem(topicId, block.id, item.id, { text: e.target.value })}
                onKeyDown={(e) => {
                  if (e.key === "Enter") {
                    e.preventDefault();
                    add();
                  } else if (e.key === "Backspace" && !item.text) {
                    e.preventDefault();
                    removeItem(topicId, block.id, item.id);
                    const prev = block.items[i - 1];
                    if (prev) inputs.get(prev.id)?.focus();
                  }
                }}
                aria-label={`${block.label} item ${i + 1}`}
                placeholder="Write, Enter for the next one"
                className={itemInput}
              />
              {item.unverified && (
                <button
                  type="button"
                  title="Mark as checked against the recording"
                  onClick={() => updateItem(topicId, block.id, item.id, { unverified: null })}
                  className="inline-flex shrink-0 items-center gap-1 rounded-full bg-warn-soft px-2 py-0.5 text-xs font-medium text-warn hover:bg-warn-line/50"
                >
                  <Check aria-hidden className="size-3" strokeWidth={2.5} />
                  {item.unverified} checked
                </button>
              )}
              <TimeLink topicId={topicId} time={item.time} />
              <IconButton
                icon={X}
                label="Remove item"
                onClick={() => removeItem(topicId, block.id, item.id)}
              />
            </li>
          ))}
        </ul>
        <Button variant="ghost" size="sm" onClick={add} className="self-start text-muted">
          + Add item
        </Button>
      </>
    );
  }

  if (!block.items.length) return <EmptyState>Nothing here.</EmptyState>;
  return (
    <ul className="flex flex-col gap-2.5">
      {block.items.map((item) => (
        <li key={item.id} className="flex items-baseline gap-3">
          <span aria-hidden className="size-1.5 shrink-0 translate-y-[-2px] rounded-full bg-primary" />
          <span className="min-w-0 flex-1 text-md text-ink">
            {item.text}
            {item.who && <span className="text-muted"> — {item.who}</span>}
          </span>
          <Unverified values={item.unverified} />
          <TimeLink topicId={topicId} time={item.time} />
        </li>
      ))}
    </ul>
  );
}
