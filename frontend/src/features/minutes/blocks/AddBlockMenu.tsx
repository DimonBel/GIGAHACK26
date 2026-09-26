import { AlignLeft, Hash, List, ListChecks, Plus, type LucideIcon } from "lucide-react";
import { useState } from "react";

import type { BlockKind } from "@/api/types";
import { Button, Menu } from "@/shared/ui";
import { BLOCK_KINDS, useMinutesStore } from "@/stores/minutes";

const ICON: Record<BlockKind, LucideIcon> = { text: AlignLeft, list: List, tasks: ListChecks, codes: Hash };

export function AddBlockMenu({ topicId }: { topicId: string }) {
  const addBlock = useMinutesStore((s) => s.addBlock);
  const [open, setOpen] = useState(false);
  return (
    <div className="pt-2 pb-6">
      <Menu
        open={open}
        onClose={() => setOpen(false)}
        panelClassName="left-0 w-80"
        trigger={
          <Button icon={Plus} aria-haspopup="menu" aria-expanded={open} onClick={() => setOpen((o) => !o)}>
            Add block
          </Button>
        }
      >
        {BLOCK_KINDS.map(({ kind, label, hint }) => {
          const Icon = ICON[kind];
          return (
            <button
              key={kind}
              type="button"
              role="menuitem"
              onClick={() => {
                addBlock(topicId, kind);
                setOpen(false);
              }}
              className="flex w-full items-start gap-3 rounded-md px-2.5 py-2 text-left transition-colors hover:bg-sunken"
            >
              <Icon aria-hidden className="mt-0.5 size-4 shrink-0 text-muted" strokeWidth={1.75} />
              <span className="flex flex-col gap-0.5">
                <span className="text-md font-medium">{label}</span>
                <span className="text-sm text-muted">{hint}</span>
              </span>
            </button>
          );
        })}
      </Menu>
    </div>
  );
}
