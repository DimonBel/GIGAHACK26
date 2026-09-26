import {
  ArrowRight,
  AudioLines,
  CircleAlert,
  FileText,
  Mic,
  Upload,
  Users,
  type LucideIcon,
} from "lucide-react";
import { useState, type ReactNode } from "react";
import { useNavigate } from "react-router";

import type { Language } from "@/api/types";
import { minutesPath } from "@/shared/config/cabinets";
import { useT } from "@/shared/i18n";
import { MEETING_TYPES } from "@/shared/lib/tones";
import type { MeetingType } from "@/shared/types/domain";
import { Button, Field, Input, PageHeader, Panel, PanelHeader, Segmented, Select } from "@/shared/ui";
import { useProcessingStore } from "@/stores/processing";

import { DropZone } from "./DropZone";
import { Recorder } from "./Recorder";

type Source = "upload" | "record";

const LANGUAGES: { value: Language; label: string }[] = [
  { value: "auto", label: "Detect automatically (RO · RU · EN)" },
  { value: "ro", label: "Romanian" },
  { value: "ru", label: "Russian" },
  { value: "en", label: "English" },
];

const STEPS: { icon: LucideIcon; title: string; text: string }[] = [
  { icon: Upload, title: "Upload", text: "The recording goes to the hospital server only." },
  { icon: Users, title: "Speakers", text: "pyannote finds who speaks when." },
  { icon: AudioLines, title: "Transcript", text: "Whisper Large V3 writes it down, live as it goes." },
  { icon: FileText, title: "Minutes draft", text: "A local LLM files facts, decisions and tasks per topic." },
];

function Section({ number, title, children }: { number: number; title: string; children: ReactNode }) {
  return (
    <section className="flex flex-col gap-4">
      <h3 className="flex items-center gap-2.5 text-md font-semibold">
        <span className="flex size-6 items-center justify-center rounded-full bg-sunken text-sm font-semibold text-muted tabular-nums">
          {number}
        </span>
        {title}
      </h3>
      {children}
    </section>
  );
}

export function NewMeetingPage() {
  const t = useT();
  const navigate = useNavigate();
  const { create, upload, uploadError } = useProcessingStore();

  const [source, setSource] = useState<Source>("upload");
  const [uploaded, setUploaded] = useState<File | null>(null);
  const [recorded, setRecorded] = useState<File | null>(null);
  const [fileError, setFileError] = useState<string | null>(null);
  const [title, setTitle] = useState("");
  const [type, setType] = useState<MeetingType>("Medical");
  const [language, setLanguage] = useState<Language>("auto");
  const [speakers, setSpeakers] = useState("");

  const file = source === "upload" ? uploaded : recorded;
  const uploading = upload !== null;

  async function submit() {
    if (!file || uploading) return;
    const count = Number.parseInt(speakers, 10);
    const meeting = await create({
      file,
      title: title.trim(),
      type,
      language,
      speakers: Number.isFinite(count) && count > 0 ? count : null,
    });
    if (meeting) navigate(minutesPath("moderator", meeting.id));
  }

  return (
    <>
      <PageHeader
        title={t.new}
        description="Upload or record the meeting. Speakers, transcript and a draft of the minutes are made on the hospital server; you review everything before it is approved."
      />
      <div className="grid items-start gap-6 lg:grid-cols-[minmax(0,1fr)_340px]">
        <Panel>
          <form
            className="flex flex-col gap-8 p-6"
            onSubmit={(e) => {
              e.preventDefault();
              void submit();
            }}
          >
            <Section number={1} title="Recording">
              <Segmented
                label="Source"
                options={[
                  { value: "upload", label: "Upload a file" },
                  { value: "record", label: "Record now" },
                ]}
                value={source}
                onChange={setSource}
                className="self-start"
              />
              {/* Both stay mounted: switching tabs never loses a chosen file or a running recording. */}
              <div hidden={source !== "upload"}>
                <DropZone file={uploaded} onFile={setUploaded} onError={setFileError} />
              </div>
              <div hidden={source !== "record"}>
                <Recorder onFile={setRecorded} />
              </div>
              {fileError && source === "upload" && (
                <p role="alert" className="flex items-center gap-2 text-base text-danger">
                  <CircleAlert aria-hidden className="size-4 shrink-0" strokeWidth={1.75} />
                  {fileError}
                </p>
              )}
            </Section>

            <Section number={2} title="Details">
              <Field label="Title" hint="Leave empty and the minutes are titled from what was discussed.">
                <Input
                  value={title}
                  onChange={(e) => setTitle(e.target.value)}
                  placeholder="e.g. Consiliu medical — Cardiologie"
                  maxLength={200}
                />
              </Field>
              <div className="flex flex-col gap-1.5">
                <span className="text-base font-medium text-ink-2">Meeting type</span>
                <Segmented
                  label="Meeting type"
                  options={MEETING_TYPES.map((m) => ({ value: m, label: m }))}
                  value={type}
                  onChange={setType}
                  className="self-start"
                />
                <span className="text-sm text-muted">
                  Decides how the minutes are organised: per patient, or per agenda item.
                </span>
              </div>
              <div className="grid gap-4 sm:grid-cols-[minmax(0,1fr)_180px]">
                <Field label="Language">
                  <Select value={language} onChange={(e) => setLanguage(e.target.value as Language)}>
                    {LANGUAGES.map((l) => (
                      <option key={l.value} value={l.value}>
                        {l.label}
                      </option>
                    ))}
                  </Select>
                </Field>
                <Field label="Speakers" hint="Leave empty to detect.">
                  <Input
                    type="number"
                    min={1}
                    max={20}
                    inputMode="numeric"
                    value={speakers}
                    onChange={(e) => setSpeakers(e.target.value)}
                    placeholder="Auto"
                  />
                </Field>
              </div>
            </Section>

            <div className="flex flex-col gap-3 border-t border-line-soft pt-6">
              {upload && (
                <div className="flex flex-col gap-1.5" role="status">
                  <div className="flex justify-between text-sm text-muted tabular-nums">
                    <span className="truncate">Uploading {upload.name}</span>
                    <span>{Math.round(upload.fraction * 100)}%</span>
                  </div>
                  <div className="h-1.5 overflow-hidden rounded-full bg-sunken">
                    <div
                      className="h-full rounded-full bg-primary transition-[width]"
                      style={{ width: `${upload.fraction * 100}%` }}
                    />
                  </div>
                </div>
              )}
              {uploadError && (
                <p role="alert" className="flex items-center gap-2 text-base text-danger">
                  <CircleAlert aria-hidden className="size-4 shrink-0" strokeWidth={1.75} />
                  {uploadError}
                </p>
              )}
              <div className="flex flex-wrap items-center justify-between gap-3">
                <span className="text-sm text-muted">
                  {file
                    ? "Ready to process."
                    : source === "upload"
                      ? "Choose a recording first."
                      : "Record the meeting first."}
                </span>
                <Button
                  type="submit"
                  variant="primary"
                  trailingIcon={ArrowRight}
                  disabled={!file || uploading}
                >
                  {uploading ? "Uploading…" : "Process meeting"}
                </Button>
              </div>
            </div>
          </form>
        </Panel>

        <Panel className="lg:sticky lg:top-[88px]">
          <PanelHeader
            title="What happens next"
            description="About 17 minutes per hour of audio on this server."
          />
          <ol className="flex flex-col gap-4 px-6 py-5">
            {STEPS.map(({ icon: Icon, title: stepTitle, text }) => (
              <li key={stepTitle} className="flex gap-3">
                <span className="flex size-8 shrink-0 items-center justify-center rounded-md bg-sunken text-muted">
                  <Icon aria-hidden className="size-4" strokeWidth={1.75} />
                </span>
                <span className="flex flex-col gap-0.5">
                  <span className="text-base font-medium">{stepTitle}</span>
                  <span className="text-sm text-muted">{text}</span>
                </span>
              </li>
            ))}
          </ol>
          <p className="flex items-center gap-2 border-t border-line-soft px-6 py-4 text-sm text-muted">
            <Mic aria-hidden className="size-4 shrink-0" strokeWidth={1.75} />
            You can leave the page while it runs; the meetings list shows the progress.
          </p>
        </Panel>
      </div>
    </>
  );
}
