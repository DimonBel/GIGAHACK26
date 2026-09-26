import { FileAudio, Upload, X } from "lucide-react";
import { useEffect, useState, type ReactNode } from "react";

import { cn } from "@/shared/lib/cn";
import { formatDuration } from "@/shared/lib/date";
import { Button, IconButton } from "@/shared/ui";

const ACCEPT = ".wav,.mp3,.m4a,.mp4,.ogg,.opus,.webm,.flac,.aac,.mov,audio/*,video/*";
const SUFFIX = /\.(wav|mp3|m4a|mp4|ogg|oga|opus|webm|flac|aac|mov)$/i;

function isAudioFile(file: File) {
  return SUFFIX.test(file.name);
}

function formatSize(bytes: number) {
  return bytes < 1024 * 1024
    ? `${Math.max(1, Math.round(bytes / 1024))} KB`
    : `${(bytes / 1024 / 1024).toFixed(1)} MB`;
}

/** Length of an audio / video file, read by the browser from its header (null if it cannot tell). */
function useMediaDuration(file: File | null) {
  const [read, setRead] = useState<{ file: File; seconds: number } | null>(null);
  useEffect(() => {
    if (!file) return;
    const url = URL.createObjectURL(file);
    const media = document.createElement("audio");
    media.preload = "metadata";
    media.onloadedmetadata = () =>
      Number.isFinite(media.duration) && setRead({ file, seconds: media.duration });
    media.src = url;
    return () => {
      media.removeAttribute("src");
      URL.revokeObjectURL(url);
    };
  }, [file]);
  return read && read.file === file ? read.seconds : null;
}

export function FileCard({
  file,
  onRemove,
  action,
}: {
  file: File;
  onRemove?: () => void;
  action?: ReactNode;
}) {
  const duration = useMediaDuration(file);
  return (
    <div className="flex items-center gap-3 rounded-lg border border-line bg-white p-3.5">
      <span className="flex size-10 shrink-0 items-center justify-center rounded-md bg-primary-soft text-primary">
        <FileAudio aria-hidden className="size-5" strokeWidth={1.75} />
      </span>
      <span className="flex min-w-0 flex-1 flex-col gap-0.5">
        <span className="truncate text-md font-medium">{file.name}</span>
        <span className="text-sm text-muted tabular-nums">
          {formatSize(file.size)}
          {duration ? ` · ${formatDuration(duration)}` : ""}
        </span>
      </span>
      {action}
      {onRemove && <IconButton icon={X} label="Remove file" onClick={onRemove} />}
    </div>
  );
}

export function DropZone({
  file,
  onFile,
  onError,
}: {
  file: File | null;
  onFile: (file: File | null) => void;
  onError: (message: string | null) => void;
}) {
  const [over, setOver] = useState(false);

  const take = (f: File | undefined) => {
    if (!f) return;
    if (!isAudioFile(f)) return onError(`“${f.name}” is not an audio or video file.`);
    onError(null);
    onFile(f);
  };
  const picker = (
    <input
      type="file"
      accept={ACCEPT}
      className="sr-only"
      onChange={(e) => take(e.target.files?.[0] ?? undefined)}
    />
  );

  if (file) {
    return (
      <FileCard
        file={file}
        onRemove={() => onFile(null)}
        action={
          <label>
            <Button size="sm" className="pointer-events-none" tabIndex={-1}>
              Replace
            </Button>
            {picker}
          </label>
        }
      />
    );
  }
  return (
    <label
      onDragOver={(e) => {
        e.preventDefault();
        setOver(true);
      }}
      onDragLeave={() => setOver(false)}
      onDrop={(e) => {
        e.preventDefault();
        setOver(false);
        take(e.dataTransfer.files[0]);
      }}
      className={cn(
        "flex flex-col items-center justify-center gap-3 rounded-lg border border-dashed px-6 py-10 text-center transition-colors",
        "focus-within:outline-2 focus-within:outline-offset-2 focus-within:outline-primary",
        over
          ? "border-primary bg-primary-soft"
          : "border-line-strong bg-canvas hover:border-primary hover:bg-white",
      )}
    >
      <span className="flex size-10 items-center justify-center rounded-full bg-white text-primary shadow-sm">
        <Upload aria-hidden className="size-5" strokeWidth={1.75} />
      </span>
      <span className="flex flex-col gap-1">
        <span className="text-md font-medium">
          Drop the recording here, or{" "}
          <span className="text-primary underline underline-offset-2">choose a file</span>
        </span>
        <span className="text-sm text-muted">
          mp3 · m4a · wav · webm · mp4 and other audio / video, up to 2 GB
        </span>
      </span>
      {picker}
    </label>
  );
}
