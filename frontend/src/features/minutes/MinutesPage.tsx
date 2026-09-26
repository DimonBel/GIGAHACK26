import { useCabinet } from "@/shared/hooks/useCabinet";
import { EmptyState, Panel } from "@/shared/ui";
import { selectedTopic, useMinutesStore } from "@/stores/minutes";

import { MinutesHeader } from "./MinutesHeader";
import { NextMeetingSection } from "./NextMeetingSection";
import { ParticipantsSection } from "./ParticipantsSection";
import { TopicSidebar } from "./TopicSidebar";
import { TopicView } from "./TopicView";

export function MinutesPage() {
  const isModerator = useCabinet() === "moderator";
  const topics = useMinutesStore((s) => s.topics);
  const section = useMinutesStore((s) => s.section);
  const editing = useMinutesStore((s) => s.editing);
  const topic = selectedTopic({ topics, section });

  return (
    <>
      <MinutesHeader isModerator={isModerator} />
      <div className="grid items-start gap-8 lg:grid-cols-[256px_minmax(0,1fr)]">
        <TopicSidebar isModerator={isModerator} />
        <Panel className="min-w-0 px-5 py-7 sm:px-10 sm:py-9">
          {topic && (
            <TopicView
              topic={topic}
              number={topics.indexOf(topic) + 1}
              count={topics.length}
              isModerator={isModerator}
              editing={isModerator && editing}
            />
          )}
          {section.kind === "topic" && !topic && (
            <EmptyState>{isModerator ? "No topics yet. Add one from the list." : "No topics in these minutes."}</EmptyState>
          )}
          {section.kind === "participants" && <ParticipantsSection isModerator={isModerator} />}
          {section.kind === "next" && <NextMeetingSection isModerator={isModerator} />}
        </Panel>
      </div>
    </>
  );
}
