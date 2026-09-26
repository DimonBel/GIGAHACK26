import type { Topic } from "@/shared/types/domain";

import { ActionsBlock } from "./ActionsBlock";
import { AttentionBlock } from "./AttentionBlock";
import { CodesBlock } from "./CodesBlock";
import { SuggestForm } from "./SuggestForm";
import { SuggestionsInbox } from "./SuggestionsInbox";
import { SummaryBlock } from "./SummaryBlock";
import { TopicHeader } from "./TopicHeader";
import { TranscriptToggle } from "./TranscriptToggle";
import { ViewsBlock } from "./ViewsBlock";

interface TopicViewProps {
  topic: Topic;
  number: number;
  count: number;
  isModerator: boolean;
  editing: boolean;
}

export function TopicView({ topic, number, count, isModerator, editing }: TopicViewProps) {
  return (
    <article>
      <TopicHeader key={topic.id} topic={topic} number={number} count={count} isModerator={isModerator} editing={editing} />
      {isModerator && <SuggestionsInbox topic={topic} />}
      <SummaryBlock topic={topic} editing={editing} />
      <ViewsBlock topic={topic} editing={editing} />
      <ActionsBlock topic={topic} editing={editing} />
      <AttentionBlock topic={topic} editing={editing} />
      {topic.tag === "Medical" && <CodesBlock topic={topic} editing={editing} />}
      <TranscriptToggle topic={topic} />
      {!isModerator && <SuggestForm />}
    </article>
  );
}
