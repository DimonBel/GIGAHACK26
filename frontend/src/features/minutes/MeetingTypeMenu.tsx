import { Check, ChevronDown } from "lucide-react";
import { useState } from "react";

import { MEETING_TYPE_TONE, MEETING_TYPES } from "@/shared/lib/tones";
import type { MeetingType } from "@/shared/types/domain";
import { Dot, Menu } from "@/shared/ui";

/** Moderator, draft: the meeting type, changeable (the minutes are then made again for the new type). */
export function MeetingTypeMenu({
  value,
  onPick,
}: {
  value: MeetingType;
  onPick: (type: MeetingType) => void;
}) {
  const [open, setOpen] = useState(false);
  return (
    <Menu
      open={open}
      onClose={() => setOpen(false)}
      panelClassName="left-0 w-72"
      trigger={
        <button
          type="button"
          aria-haspopup="menu"
          aria-expanded={open}
          aria-label={`Meeting type: ${value}. Change it`}
          onClick={() => setOpen((o) => !o)}
          className="-mx-1.5 inline-flex items-center gap-1.5 rounded-md px-1.5 py-0.5 text-sm font-medium text-ink-2 transition-colors hover:bg-sunken"
        >
          <Dot className={MEETING_TYPE_TONE[value].dot} />
          {value}
          <ChevronDown aria-hidden className="size-3.5 text-muted" strokeWidth={2} />
        </button>
      }
    >
      <div className="px-2.5 pt-1.5 pb-1 text-sm text-muted">Wrong type? The minutes are made again.</div>
      {MEETING_TYPES.map((type) => (
        <button
          key={type}
          type="button"
          role="menuitemradio"
          aria-checked={type === value}
          onClick={() => {
            setOpen(false);
            onPick(type);
          }}
          className="flex items-center gap-2.5 rounded-md px-2.5 py-2 text-left text-md transition-colors hover:bg-sunken"
        >
          <Dot className={MEETING_TYPE_TONE[type].dot} />
          <span className="flex-1">{type}</span>
          {type === value && <Check aria-hidden className="size-4 text-primary" strokeWidth={2} />}
        </button>
      ))}
    </Menu>
  );
}
