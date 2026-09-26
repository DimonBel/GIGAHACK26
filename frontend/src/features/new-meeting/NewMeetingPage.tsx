import { useNavigate } from "react-router";

import { NEW_MEETING_DEFAULTS } from "@/mocks/meetings";
import { cabinetPath } from "@/shared/config/cabinets";
import { useT } from "@/shared/i18n";
import { MEETING_TYPES } from "@/shared/lib/tones";
import { Button, Field, Input, PageHeader, Panel, PanelHeader, Segmented, Textarea } from "@/shared/ui";
import { useMeetingsStore } from "@/stores/meetings";
import { useMinutesStore } from "@/stores/minutes";
import { useProcessingStore } from "@/stores/processing";

import { PipelineCard } from "./PipelineCard";
import { SourcePicker } from "./SourcePicker";

export function NewMeetingPage() {
  const t = useT();
  const { newType, setNewType } = useMeetingsStore();
  const start = useProcessingStore((s) => s.start);
  const openFirstTopic = useMinutesStore((s) => s.openFirstTopic);
  const navigate = useNavigate();

  return (
    <>
      <PageHeader
        title={t.new}
        description="Upload or record the meeting. Transcription, speakers and minutes run on the hospital server; you review everything before it is sent."
      />
      <div className="grid items-start gap-6 lg:grid-cols-[minmax(0,1fr)_380px]">
        <Panel>
          <PanelHeader title="Recording" description="One file per meeting. Romanian, Russian and English are detected automatically." />
          <form
            className="flex flex-col gap-5 p-5"
            onSubmit={(e) => {
              e.preventDefault();
              start();
            }}
          >
            <SourcePicker />
            <div className="flex flex-col gap-1.5">
              <span className="text-base font-medium text-ink-2">Meeting type</span>
              <Segmented
                label="Meeting type"
                options={MEETING_TYPES.map((type) => ({ value: type, label: type }))}
                value={newType}
                onChange={setNewType}
                className="self-start"
              />
              <span className="text-sm text-muted">Decides the minutes template and who receives them.</span>
            </div>
            <Field label="Title">
              <Input defaultValue={NEW_MEETING_DEFAULTS.title} />
            </Field>
            <Field
              label="Agenda topics"
              hint="Optional, one per line. Leave empty and topics are detected from the transcript."
            >
              <Textarea rows={3} defaultValue={NEW_MEETING_DEFAULTS.agenda} />
            </Field>
            <div className="flex justify-end border-t border-line-soft pt-5">
              <Button type="submit" variant="primary">
                Process meeting
              </Button>
            </div>
          </form>
        </Panel>
        <PipelineCard
          onReview={() => {
            openFirstTopic();
            navigate(cabinetPath("moderator", "editor"));
          }}
        />
      </div>
    </>
  );
}
