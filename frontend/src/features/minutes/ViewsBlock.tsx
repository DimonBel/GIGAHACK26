import { X } from "lucide-react";

import type { Topic } from "@/shared/types/domain";
import { EmptyState, IconButton, Textarea } from "@/shared/ui";
import { useMinutesStore } from "@/stores/minutes";

import { AddButton, Block } from "./Block";
import { PeopleSelect } from "./PeopleSelect";

/** Who said what about the topic. */
export function ViewsBlock({ topic, editing }: { topic: Topic; editing: boolean }) {
  const { addView, updateView, removeView } = useMinutesStore();
  return (
    <Block label="Points of view">
      {editing ? (
        <>
          {topic.views.map((v) => (
            <div key={v.id} className="grid items-start gap-2 sm:grid-cols-[190px_minmax(0,1fr)_auto]">
              <PeopleSelect
                value={v.name}
                onChange={(e) => updateView(topic.id, v.id, { name: e.target.value })}
                aria-label="Speaker"
              />
              <Textarea
                rows={2}
                value={v.text}
                onChange={(e) => updateView(topic.id, v.id, { text: e.target.value })}
                aria-label={`Point of view of ${v.name}`}
                className="font-serif text-reading"
              />
              <IconButton icon={X} label="Remove point of view" onClick={() => removeView(topic.id, v.id)} className="mt-1" />
            </div>
          ))}
          <AddButton onClick={() => addView(topic.id)}>Add point of view</AddButton>
        </>
      ) : topic.views.length ? (
        <ul className="flex flex-col divide-y divide-line-soft">
          {topic.views.map((v) => (
            <li key={v.id} className="flex flex-col gap-1 py-3 first:pt-0 last:pb-0">
              <span className="text-small font-semibold text-ink-2">{v.name}</span>
              <p className="max-w-[68ch] font-serif text-reading text-ink">{v.text}</p>
            </li>
          ))}
        </ul>
      ) : (
        <EmptyState>No points of view recorded.</EmptyState>
      )}
    </Block>
  );
}
