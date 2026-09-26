import type { TextBlock as TextBlockData } from "@/api/types";
import { EmptyState, Textarea } from "@/shared/ui";
import { useMinutesStore } from "@/stores/minutes";

export function TextBlock({
  topicId,
  block,
  editing,
}: {
  topicId: string;
  block: TextBlockData;
  editing: boolean;
}) {
  const updateBlock = useMinutesStore((s) => s.updateBlock);
  if (editing) {
    return (
      <Textarea
        rows={Math.min(10, Math.max(3, Math.ceil(block.text.length / 90)))}
        value={block.text}
        onChange={(e) => updateBlock(topicId, block.id, { text: e.target.value })}
        aria-label={block.label}
        placeholder="Write…"
        className="text-lg"
      />
    );
  }
  if (!block.text.trim()) return <EmptyState>Empty.</EmptyState>;
  // The server joins what several parts of the discussion said with "; ", one sentence each reads better.
  const parts = block.text.split(/;\s+/).filter(Boolean);
  return (
    <div className="flex max-w-[72ch] flex-col gap-2 text-lg text-ink">
      {parts.map((p, i) => (
        <p key={i} className="text-pretty">
          {p}
        </p>
      ))}
    </div>
  );
}
