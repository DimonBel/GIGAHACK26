import { CircleAlert, LoaderCircle, Plus } from "lucide-react";
import { useEffect } from "react";
import { Navigate, useNavigate, useParams } from "react-router";

import { cabinetPath, minutesPath } from "@/shared/config/cabinets";
import { useCabinet } from "@/shared/hooks/useCabinet";
import { useT } from "@/shared/i18n";
import { Button, EmptyState, PageHeader, Panel } from "@/shared/ui";
import { isBusy, isReady, useMeetingsStore } from "@/stores/meetings";
import { canEdit, selectedTopic, useMinutesStore } from "@/stores/minutes";
import { useProcessingStore } from "@/stores/processing";

import { MinutesHeader } from "./MinutesHeader";
import { NextMeetingSection } from "./NextMeetingSection";
import { OverviewSection } from "./OverviewSection";
import { ParticipantsSection } from "./ParticipantsSection";
import { ProcessingView } from "./ProcessingView";
import { TopicSidebar } from "./TopicSidebar";
import { TopicView } from "./TopicView";

function Loading({ children }: { children: string }) {
  return (
    <EmptyState icon={LoaderCircle} className="py-16 [&_svg]:animate-spin">
      {children}
    </EmptyState>
  );
}

/** The minutes tab without a meeting: open the latest one (a draft first, for the moderator). */
function LatestMeeting() {
  const t = useT();
  const cabinet = useCabinet();
  const navigate = useNavigate();
  const { meetings, loaded, error, load } = useMeetingsStore();
  useEffect(() => {
    void load();
  }, [load]);

  if (!loaded) return <Loading>Loading…</Loading>;
  const latest =
    cabinet === "moderator"
      ? (meetings.find((m) => m.status === "draft") ?? meetings.find(isBusy) ?? meetings[0])
      : meetings.find(isReady);
  if (latest) return <Navigate to={minutesPath(cabinet, latest.id)} replace />;
  return (
    <>
      <PageHeader title={t.editor} description={error ?? "No minutes yet."} />
      {cabinet === "moderator" && (
        <Button
          variant="primary"
          icon={Plus}
          onClick={() => navigate(cabinetPath(cabinet, "new"))}
          className="self-start"
        >
          {t.new}
        </Button>
      )}
    </>
  );
}

function MeetingMinutes({ meetingId }: { meetingId: number }) {
  const isModerator = useCabinet() === "moderator";
  const { meeting, doc, loadError, section, editing, suggestions, save, load } = useMinutesStore();
  const progressStatus = useProcessingStore((s) =>
    s.watching === meetingId ? s.progress?.status : undefined,
  );

  useEffect(() => {
    void load(meetingId);
  }, [meetingId, load]);
  // Processing finished (or failed) while the page was open: load the result.
  useEffect(() => {
    if (progressStatus === "draft" || progressStatus === "failed") void load(meetingId);
  }, [progressStatus, meetingId, load]);
  // Don't lose edits that are not saved yet.
  useEffect(() => {
    if (save === "saved") return;
    const warn = (e: BeforeUnloadEvent) => e.preventDefault();
    window.addEventListener("beforeunload", warn);
    return () => window.removeEventListener("beforeunload", warn);
  }, [save]);

  if (loadError) {
    return (
      <p
        role="alert"
        className="flex items-center gap-2 rounded-lg bg-danger-soft px-4 py-3 text-base text-danger-ink"
      >
        <CircleAlert aria-hidden className="size-4 shrink-0" strokeWidth={1.75} />
        {loadError}
      </p>
    );
  }
  if (!meeting || meeting.id !== meetingId) return <Loading>Opening the meeting…</Loading>;
  if (!isReady(meeting)) {
    return isModerator ? (
      <ProcessingView meeting={meeting} />
    ) : (
      <EmptyState>These minutes are not ready yet.</EmptyState>
    );
  }
  if (!doc) return <Loading>Opening the minutes…</Loading>;

  const editable = canEdit({ meeting }, isModerator);
  const edit = editable && editing;
  const topic = selectedTopic({ doc, section });
  const showOverview = section.kind === "overview" || (section.kind === "topic" && !topic);

  return (
    <>
      <MinutesHeader meeting={meeting} doc={doc} isModerator={isModerator} />
      <div className="grid items-start gap-8 lg:grid-cols-[256px_minmax(0,1fr)]">
        <TopicSidebar
          doc={doc}
          section={section}
          suggestions={suggestions}
          isModerator={isModerator}
          canEdit={editable}
        />
        <Panel className="min-w-0 px-5 py-7 sm:px-10 sm:py-9">
          {topic && (
            <TopicView
              topic={topic}
              number={doc.topics.indexOf(topic) + 1}
              count={doc.topics.length}
              isModerator={isModerator}
              editing={edit}
              draft={meeting.status === "draft"}
            />
          )}
          {showOverview && <OverviewSection doc={doc} editing={edit} duration={meeting.duration} />}
          {section.kind === "participants" && (
            <ParticipantsSection participants={doc.participants} editing={edit} />
          )}
          {section.kind === "next" && <NextMeetingSection next={doc.next} editing={edit} />}
        </Panel>
      </div>
    </>
  );
}

export function MinutesPage() {
  const { meetingId } = useParams();
  if (!meetingId) return <LatestMeeting />;
  return <MeetingMinutes meetingId={Number(meetingId)} />;
}
