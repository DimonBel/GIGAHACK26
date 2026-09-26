import { ArrowDown, ArrowUp, Trash2 } from "lucide-react";
import { useState, type ReactNode } from "react";

import type { Block } from "@/api/types";
import { Button, IconButton } from "@/shared/ui";
import { useMinutesStore } from "@/stores/minutes";

interface BlockFrameProps {
  topicId: string;
  block: Block;
  index: number;
  count: number;
  editing: boolean;
  children: ReactNode;
}

const hasContent = (b: Block) => (b.kind === "text" ? b.text.trim() !== "" : b.items.length > 0);

/** One block of a topic: its label on the left, content on the right; in edit mode rename / move / delete. */
export function BlockFrame({ topicId, block, index, count, editing, children }: BlockFrameProps) {
  const { updateBlock, moveBlock, removeBlock } = useMinutesStore();
  const [confirm, setConfirm] = useState(false);

  return (
    <section
      aria-label={block.label}
      className="group/block grid gap-x-8 gap-y-3 border-t border-line-soft py-6 md:grid-cols-[148px_minmax(0,1fr)]"
    >
      {editing ? (
        <div className="flex flex-col gap-2 md:pt-0.5">
          <input
            value={block.label}
            onChange={(e) => updateBlock(topicId, block.id, { label: e.target.value })}
            aria-label="Block name"
            placeholder="Block name"
            maxLength={60}
            className="-ml-1.5 w-full rounded-md border border-transparent bg-transparent px-1.5 py-1 text-xs font-semibold tracking-wider text-muted uppercase hover:border-line focus:border-primary focus:bg-white focus:outline-none"
          />
          {confirm ? (
            <span role="alert" className="flex flex-wrap items-center gap-1 text-sm text-danger-ink">
              Delete block?
              <Button variant="ghost" size="sm" onClick={() => setConfirm(false)}>
                No
              </Button>
              <Button variant="danger" size="sm" onClick={() => removeBlock(topicId, block.id)}>
                Delete
              </Button>
            </span>
          ) : (
            <div className="flex gap-0.5">
              <IconButton
                icon={ArrowUp}
                label="Move block up"
                disabled={index === 0}
                onClick={() => moveBlock(topicId, block.id, -1)}
                className="disabled:opacity-30"
              />
              <IconButton
                icon={ArrowDown}
                label="Move block down"
                disabled={index === count - 1}
                onClick={() => moveBlock(topicId, block.id, 1)}
                className="disabled:opacity-30"
              />
              <IconButton
                icon={Trash2}
                label="Delete block"
                onClick={() => (hasContent(block) ? setConfirm(true) : removeBlock(topicId, block.id))}
                className="hover:text-danger"
              />
            </div>
          )}
        </div>
      ) : (
        <h3 className="text-xs font-semibold tracking-wider text-muted uppercase md:pt-1">
          {block.label || "Untitled"}
        </h3>
      )}
      <div className="flex min-w-0 flex-col gap-3">{children}</div>
    </section>
  );
}
