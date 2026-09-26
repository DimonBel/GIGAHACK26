import { TEMPLATE_BLOCKS } from "@/mocks/admin";
import { useT } from "@/shared/i18n";
import { cn } from "@/shared/lib/cn";
import { MEETING_TYPES } from "@/shared/lib/tones";
import { Overline, PageHeader, Panel, PanelHeader, Segmented, Toggle } from "@/shared/ui";
import { useAdminStore } from "@/stores/admin";

export function TemplatesPage() {
  const t = useT();
  const { templates, templateType, setTemplateType, toggleBlock } = useAdminStore();
  const on = templates[templateType];
  const shown = TEMPLATE_BLOCKS.filter((_, i) => on[i]);
  return (
    <>
      <PageHeader
        title={t.templates}
        description="The blocks the local LLM fills in for every topic, per meeting type."
        actions={
          <Segmented
            label="Meeting type"
            options={MEETING_TYPES.map((type) => ({ value: type, label: type }))}
            value={templateType}
            onChange={setTemplateType}
          />
        }
      />
      <div className="grid items-start gap-6 lg:grid-cols-2">
        <Panel>
          <PanelHeader title={`${templateType} minutes`} description={`${shown.length} of ${TEMPLATE_BLOCKS.length} blocks on`} />
          <ul className="divide-y divide-line-soft px-5">
            {TEMPLATE_BLOCKS.map((block, i) => (
              <li key={block} className="flex items-center justify-between py-3">
                <span className={cn("text-md", on[i] ? "text-ink" : "text-subtle")}>{block}</span>
                <Toggle on={on[i] ?? false} onToggle={() => toggleBlock(i)} label={block} />
              </li>
            ))}
          </ul>
        </Panel>
        <Panel>
          <PanelHeader title="Preview" description="General sections always included: Participants, Next meeting." />
          <div className="flex flex-col gap-5 p-6">
            <div className="font-sans text-2xl font-semibold">Topic 1 · …</div>
            {shown.map((block) => (
              <div key={block} className="grid gap-x-6 gap-y-2 sm:grid-cols-[120px_minmax(0,1fr)]">
                <Overline>{block}</Overline>
                <div className="flex flex-col gap-1.5" aria-hidden>
                  <span className="h-2 w-[92%] rounded-full bg-sunken" />
                  <span className="h-2 w-[64%] rounded-full bg-sunken" />
                </div>
              </div>
            ))}
            {!shown.length && <p className="text-base text-subtle">All blocks are off.</p>}
          </div>
        </Panel>
      </div>
    </>
  );
}
