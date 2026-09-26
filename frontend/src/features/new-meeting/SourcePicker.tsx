import { Mic, Square, Upload } from "lucide-react";

import { cn } from "@/shared/lib/cn";
import { formatClock } from "@/shared/lib/date";
import { useProcessingStore } from "@/stores/processing";

const tile =
  "flex flex-col items-start gap-3 rounded-lg border p-4 text-left transition-colors focus-within:outline-2 focus-within:outline-offset-2 focus-within:outline-primary";

export function SourcePicker() {
  const { recording, recordedSeconds, start, toggleRecording } = useProcessingStore();
  return (
    <div className="grid gap-3 sm:grid-cols-2">
      <label className={cn(tile, "border-dashed border-line-strong bg-canvas hover:border-primary hover:bg-white")}>
        <Upload aria-hidden className="size-5 text-primary" strokeWidth={1.75} />
        <span className="flex flex-col gap-0.5">
          <span className="text-md font-medium">Upload audio</span>
          <span className="text-sm text-muted">.wav · .mp3 · .m4a, up to 2 hours</span>
        </span>
        <input
          type="file"
          accept=".wav,.mp3,.m4a,audio/*"
          className="sr-only"
          onChange={(e) => e.target.files?.length && start()}
        />
      </label>
      <button
        type="button"
        onClick={toggleRecording}
        aria-pressed={recording}
        className={cn(
          tile,
          recording ? "border-danger bg-danger-soft" : "border-line bg-white hover:border-line-strong",
        )}
      >
        {recording ? (
          <Square aria-hidden className="size-5 fill-danger text-danger" strokeWidth={1.75} />
        ) : (
          <Mic aria-hidden className="size-5 text-danger" strokeWidth={1.75} />
        )}
        <span className="flex flex-col gap-0.5">
          <span className="text-md font-medium">{recording ? "Stop and process" : "Record now"}</span>
          <span className={cn("text-sm tabular-nums", recording ? "text-danger" : "text-muted")}>
            {recording ? `Recording · ${formatClock(recordedSeconds)}` : "Uses this workstation's microphone"}
          </span>
        </span>
      </button>
    </div>
  );
}
