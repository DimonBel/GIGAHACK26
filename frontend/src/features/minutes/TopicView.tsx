import type { Block, Topic } from "@/api/types";
import { EmptyState } from "@/shared/ui";
import { NONE, useMinutesStore } from "@/stores/minutes";

import { AddBlockMenu } from "./blocks/AddBlockMenu";
import { BlockFrame } from "./blocks/BlockFrame";
import { CodesBlock } from "./blocks/CodesBlock";
import { ListBlock } from "./blocks/ListBlock";
import { TasksBlock } from "./blocks/TasksBlock";
import { TextBlock } from "./blocks/TextBlock";
import { SuggestForm } from "./SuggestForm";
import { SuggestionsInbox } from "./SuggestionsInbox";
import { TopicHeader } from "./TopicHeader";
import { TopicTranscript } from "./TopicTranscript";

interface TopicViewProps {
  topic: Topic;
  number: number;
  count: number;
  isModerator: boolean;
  editing: boolean;
  draft: boolean;
}

function BlockContent({
  topicId,
  block,
  editing,
  people,
}: {
  topicId: string;
  block: Block;
  editing: boolean;
  people: string[];
}) {
  switch (block.kind) {
    case "text":
      return <TextBlock topicId={topicId} block={block} editing={editing} />;
    case "list":
      return <ListBlock topicId={topicId} block={block} editing={editing} />;
    case "tasks":
      return <TasksBlock topicId={topicId} block={block} editing={editing} people={people} />;
    case "codes":
      return <CodesBlock topicId={topicId} block={block} editing={editing} />;
  }
}

export function TopicView({ topic, number, count, isModerator, editing, draft }: TopicViewProps) {
  const participants = useMinutesStore((s) => s.doc?.participants ?? NONE);
  const people = participants.map((p) => p.name.trim()).filter(Boolean);
  return (
    <article>
      <TopicHeader key={topic.id} topic={topic} number={number} count={count} editing={editing} />
      {isModerator && draft && <SuggestionsInbox topic={topic} />}
      {topic.blocks.map((block, i) => (
        <BlockFrame
          key={block.id}
          topicId={topic.id}
          block={block}
          index={i}
          count={topic.blocks.length}
          editing={editing}
        >
          <BlockContent topicId={topic.id} block={block} editing={editing} people={people} />
        </BlockFrame>
      ))}
      {!topic.blocks.length && (
        <EmptyState className="border-t border-line-soft py-6">
          {editing ? "No blocks yet. Add the first one below." : "Nothing recorded for this topic."}
        </EmptyState>
      )}
      {editing && <AddBlockMenu topicId={topic.id} />}
      <TopicTranscript topic={topic} />
      {!isModerator && draft && <SuggestForm topicId={topic.id} />}
    </article>
  );
}
