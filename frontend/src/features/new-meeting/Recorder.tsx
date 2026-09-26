import { CircleAlert, Mic, Pause, Play, RotateCcw, Square } from "lucide-react";
import { useEffect, useMemo } from "react";

import { cn } from "@/shared/lib/cn";
import { formatClock } from "@/shared/lib/date";
import { useRecorder } from "@/shared/hooks/useRecorder";
import { Button } from "@/shared/ui";

import { FileCard } from "./DropZone";

const BARS = 24;

function LevelMeter({ level, active }: { level: number; active: boolean }) {
  return (
    <div aria-hidden className="flex h-8 items-end gap-[3px]">
      {Array.from({ length: BARS }, (_, i) => {
        const lit = active && level * BARS > i;
        return (
          <span
            key={i}
            style={{ height: `${30 + (i / BARS) * 70}%` }}
            className={cn(
              "w-1.5 rounded-full transition-colors duration-75",
              lit ? (i >= BARS - 3 ? "bg-warn" : "bg-primary") : "bg-line",
            )}
          />
        );
      })}
    </div>
  );
}

/** Record in the browser. The finished recording is handed to the form like an uploaded file. */
export function Recorder({ onFile }: { onFile: (file: File | null) => void }) {
  const { state, seconds, level, file, error, start, pause, resume, stop, discard } = useRecorder();
  const url = useMemo(() => (file ? URL.createObjectURL(file) : null), [file]);
  useEffect(() => () => void (url && URL.revokeObjectURL(url)), [url]);
  useEffect(() => onFile(file), [file, onFile]);

  const live = state === "recording" || state === "paused";
  // Warn before closing the tab in the middle of a recording.
  useEffect(() => {
    if (!live) return;
    const warn = (e: BeforeUnloadEvent) => e.preventDefault();
    window.addEventListener("beforeunload", warn);
    return () => window.removeEventListener("beforeunload", warn);
  }, [live]);

  if (state === "done" && file && url) {
    return (
      <div className="flex flex-col gap-3">
        <FileCard
          file={file}
          action={
            <Button size="sm" variant="ghost" icon={RotateCcw} onClick={discard}>
              Record again
            </Button>
          }
        />
        <audio controls src={url} className="w-full" aria-label="Play back the recording" />
      </div>
    );
  }

  return (
    <div
      className={cn(
        "flex flex-col items-center gap-5 rounded-lg border px-6 py-8 text-center transition-colors",
        live ? "border-danger/40 bg-danger-soft/40" : "border-line bg-canvas",
      )}
    >
      {live ? (
        <>
          <div className="flex items-center gap-2.5 text-sm font-medium text-danger">
            <span
              className={cn("size-2.5 rounded-full bg-danger", state === "recording" && "animate-pulse")}
            />
            {state === "recording" ? "Recording" : "Paused"}
          </div>
          <span className="text-4xl font-semibold text-ink tabular-nums" aria-live="off">
            {formatClock(seconds)}
          </span>
          <LevelMeter level={level} active={state === "recording"} />
          <div className="flex flex-wrap justify-center gap-2">
            {state === "recording" ? (
              <Button icon={Pause} onClick={pause}>
                Pause
              </Button>
            ) : (
              <Button icon={Play} onClick={resume}>
                Resume
              </Button>
            )}
            <Button variant="primary" icon={Square} onClick={stop} disabled={seconds < 1}>
              Stop
            </Button>
            <Button variant="ghost" onClick={discard}>
              Discard
            </Button>
          </div>
        </>
      ) : (
        <>
          <button
            type="button"
            onClick={() => void start()}
            disabled={state === "requesting"}
            aria-label="Start recording"
            className="flex size-16 items-center justify-center rounded-full bg-danger text-white shadow-md transition-transform hover:scale-105 disabled:opacity-60"
          >
            <Mic aria-hidden className="size-7" strokeWidth={1.75} />
          </button>
          <div className="flex flex-col gap-1">
            <span className="text-md font-medium">
              {state === "requesting" ? "Allow the microphone in your browser…" : "Start recording"}
            </span>
            <span className="max-w-[46ch] text-sm text-muted">
              Uses this computer's microphone. Place it in the middle of the table; you can pause and listen
              back before processing.
            </span>
          </div>
          {error && (
            <p role="alert" className="flex items-center gap-2 text-base text-danger">
              <CircleAlert aria-hidden className="size-4 shrink-0" strokeWidth={1.75} />
              {error}
            </p>
          )}
        </>
      )}
    </div>
  );
}
