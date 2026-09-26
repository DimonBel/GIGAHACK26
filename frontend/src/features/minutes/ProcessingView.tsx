import { Check, CircleAlert, LoaderCircle, RotateCcw, Trash2 } from "lucide-react";
import { useEffect, useRef, useState } from "react";
import { useNavigate } from "react-router";

import { deleteMeeting, type Meeting } from "@/api/meetings";
import type { Stage, StageName } from "@/api/types";
import { cabinetPath } from "@/shared/config/cabinets";
import { cn } from "@/shared/lib/cn";
import { formatDay } from "@/shared/lib/date";
import { Button, Dot, PageHeader, Panel, PanelHeader, TypeBadge } from "@/shared/ui";
import { formatSeconds } from "@/stores/minutes";
import { useProcessingStore } from "@/stores/processing";

import { speakerColor } from "./speakers";

const LABEL: Record<StageName, string> = {
  upload: "Upload",
  convert: "Prepare audio",
  speakers: "Detect speakers",
  transcribe: "Transcribe",
  minutes: "Draft the minutes",
};

const ORDER: StageName[] = ["upload", "convert", "speakers", "transcribe", "minutes"];

/** How long a stage took: "<1 s", "15 s", "3 min 20 s". */
function took(seconds: number) {
  if (seconds < 1) return "<1 s";
  if (seconds < 60) return `${Math.round(seconds)} s`;
  return `${Math.floor(seconds / 60)} min ${String(Math.round(seconds % 60)).padStart(2, "0")} s`;
}

function StageRow({
  stage,
  last,
  topics,
  transcribed,
}: {
  stage: Stage;
  last: boolean;
  topics: number;
  transcribed: boolean;
}) {
  const done = stage.state === "done" || stage.state === "skipped";
  const running = stage.state === "running";
  const failed = stage.state === "failed";
  let detail = "";
  if (stage.name === "speakers" && stage.detail) detail = stage.detail;
  if (stage.name === "speakers" && stage.state === "skipped") detail = "unavailable";
  if (stage.name === "minutes" && running) {
    const found = topics ? `${topics} topic${topics === 1 ? "" : "s"} so far` : "";
    detail = transcribed
      ? ["Writing the minutes…", found].filter(Boolean).join(" · ")
      : found || "starts with the transcript";
  }
  return (
    <li className="relative flex gap-3 pb-6 last:pb-0">
      {!last && (
        <span
          aria-hidden
          className={cn("absolute top-7 bottom-1 left-[11px] w-px", done ? "bg-primary" : "bg-line")}
        />
      )}
      <span
        className={cn(
          "relative flex size-6 shrink-0 items-center justify-center rounded-full border",
          done && "border-primary bg-primary text-white",
          running && "border-info bg-info-soft text-info",
          failed && "border-danger bg-danger-soft text-danger",
          stage.state === "waiting" && "border-line-strong bg-white",
        )}
      >
        {done && <Check aria-hidden className="size-3.5" strokeWidth={2.5} />}
        {running && <LoaderCircle aria-hidden className="size-3.5 animate-spin" strokeWidth={2.5} />}
        {failed && <CircleAlert aria-hidden className="size-3.5" strokeWidth={2.5} />}
      </span>
      <span className="flex min-w-0 flex-1 flex-col gap-1.5 pt-0.5">
        <span className="flex items-baseline justify-between gap-3">
          <span className={cn("text-md", stage.state === "waiting" ? "text-muted" : "font-medium text-ink")}>
            {LABEL[stage.name]}
          </span>
          <span className="text-sm text-muted tabular-nums">
            {done && stage.seconds != null
              ? took(stage.seconds)
              : running && stage.percent != null
                ? `${Math.round(stage.percent)}%`
                : ""}
          </span>
        </span>
        {running && stage.name === "transcribe" && (
          <span className="h-1.5 overflow-hidden rounded-full bg-sunken">
            <span
              className="block h-full rounded-full bg-info transition-[width] duration-700"
              style={{ width: `${stage.percent ?? 0}%` }}
            />
          </span>
        )}
        {detail && <span className="text-sm text-muted">{detail}</span>}
      </span>
    </li>
  );
}

/** Live transcript while Whisper runs; follows the newest line unless the reader scrolled up. */
function LiveTranscript({ minutesOnly }: { minutesOnly: boolean }) {
  const lines = useProcessingStore((s) => s.lines);
  const box = useRef<HTMLOListElement>(null);
  const follow = useRef(true);
  useEffect(() => {
    if (follow.current && box.current) box.current.scrollTop = box.current.scrollHeight;
  }, [lines.length]);

  return (
    <Panel className="flex min-h-[420px] flex-col overflow-hidden">
      <PanelHeader title="Live transcript" description={lines.length ? `${lines.length} lines` : undefined} />
      {lines.length ? (
        <ol
          ref={box}
          onScroll={(e) => {
            const el = e.currentTarget;
            follow.current = el.scrollHeight - el.scrollTop - el.clientHeight < 40;
          }}
          className="flex max-h-[560px] flex-1 flex-col gap-3 overflow-y-auto px-6 py-5"
          aria-live="polite"
        >
          {lines.map((l, i) => (
            <li key={i} className="grid gap-x-4 gap-y-0.5 text-base sm:grid-cols-[130px_minmax(0,1fr)]">
              <span className="flex items-center gap-2">
                <Dot className={speakerColor(l.speaker)} />
                <span className="font-medium">{l.speaker.replace(/^SPEAKER/, "Speaker")}</span>
                <span className="text-sm text-muted tabular-nums">{formatSeconds(l.start)}</span>
              </span>
              <p className="text-ink-2">{l.text}</p>
            </li>
          ))}
        </ol>
      ) : (
        <p className="flex flex-1 items-center justify-center px-6 py-10 text-center text-base text-muted">
          {minutesOnly
            ? "The transcript is saved; only the minutes are being drafted again."
            : "Lines appear here as soon as the first speakers are known and Whisper has transcribed them."}
        </p>
      )}
    </Panel>
  );
}

export function ProcessingView({ meeting }: { meeting: Meeting }) {
  const { watch, unwatch, progress, pollError, retry } = useProcessingStore();
  const navigate = useNavigate();
  const [confirmDelete, setConfirmDelete] = useState(false);

  useEffect(() => {
    watch(meeting.id);
    return () => unwatch();
  }, [meeting.id, watch, unwatch]);

  const status = progress?.status ?? meeting.status;
  const stages = ORDER.map(
    (name) => progress?.stages.find((s) => s.name === name) ?? { name, state: "waiting" as const },
  );
  const transcribed = stages.find((s) => s.name === "transcribe")?.state === "done";
  const error = progress?.error ?? meeting.error;
  const description =
    status === "queued"
      ? progress?.queuePosition
        ? `Waiting for the server: ${progress.queuePosition} meeting${progress.queuePosition === 1 ? "" : "s"} ahead.`
        : "Waiting for the server…"
      : status === "failed"
        ? "Processing stopped."
        : "Running on the hospital server. You can leave this page; the minutes open here when they are ready.";

  return (
    <>
      <PageHeader
        eyebrow={
          <>
            <TypeBadge type={meeting.type} />
            <span className="tabular-nums">Uploaded {formatDay(meeting.created)}</span>
            {meeting.createdBy && <span>by {meeting.createdBy}</span>}
          </>
        }
        title={meeting.title}
        description={description}
      />
      {status === "failed" && (
        <div
          role="alert"
          className="flex flex-col gap-3 rounded-lg border border-danger/30 bg-danger-soft px-5 py-4 sm:flex-row sm:items-center sm:justify-between"
        >
          <div className="flex items-start gap-2.5 text-base text-danger-ink">
            <CircleAlert aria-hidden className="mt-0.5 size-4 shrink-0" strokeWidth={1.75} />
            <span className="flex flex-col gap-0.5">
              <span className="font-medium">{error ?? "Something went wrong."}</span>
              {meeting.hasTranscript && (
                <span>The transcript is saved: a retry only drafts the minutes again.</span>
              )}
            </span>
          </div>
          <div className="flex shrink-0 gap-2">
            {confirmDelete ? (
              <>
                <Button variant="ghost" size="sm" onClick={() => setConfirmDelete(false)}>
                  Keep
                </Button>
                <Button
                  size="sm"
                  className="bg-danger text-white hover:bg-danger-ink"
                  onClick={() =>
                    void deleteMeeting(meeting.id).then(() => navigate(cabinetPath("moderator", "meetings")))
                  }
                >
                  Delete meeting
                </Button>
              </>
            ) : (
              <>
                <Button variant="danger" size="sm" icon={Trash2} onClick={() => setConfirmDelete(true)}>
                  Delete
                </Button>
                <Button variant="primary" size="sm" icon={RotateCcw} onClick={() => void retry(meeting.id)}>
                  Retry
                </Button>
              </>
            )}
          </div>
        </div>
      )}
      {pollError && (
        <p role="alert" className="text-base text-danger">
          {pollError}
        </p>
      )}
      <div className="grid items-start gap-6 lg:grid-cols-[320px_minmax(0,1fr)]">
        <Panel>
          <PanelHeader title="Progress" />
          <ol className="flex flex-col px-6 py-5">
            {stages.map((stage, i) => (
              <StageRow
                key={stage.name}
                stage={stage}
                last={i === stages.length - 1}
                topics={progress?.topics ?? 0}
                transcribed={transcribed}
              />
            ))}
          </ol>
        </Panel>
        <LiveTranscript
          minutesOnly={transcribed && !(progress?.lines.length || useProcessingStore.getState().lines.length)}
        />
      </div>
    </>
  );
}
