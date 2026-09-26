import { ArrowRight, Check, LoaderCircle } from "lucide-react";

import { PIPELINE, PIPELINE_ESTIMATE, PIPELINE_TOTAL } from "@/mocks/meetings";
import { cn } from "@/shared/lib/cn";
import { Button, Panel, PanelHeader } from "@/shared/ui";
import { STAGE_COUNT, useProcessingStore } from "@/stores/processing";

export function PipelineCard({ onReview }: { onReview: () => void }) {
  const stage = useProcessingStore((s) => s.stage);
  const done = stage >= STAGE_COUNT;
  const status = stage < 0 ? PIPELINE_ESTIMATE : done ? `Done in ${PIPELINE_TOTAL}` : "Processing…";
  return (
    <Panel>
      <PanelHeader title="Processing" description={status} />
      <ol className="flex flex-col px-5 py-4" aria-live="polite">
        {PIPELINE.map((step, i) => {
          const finished = stage > i;
          const running = stage === i;
          const last = i === PIPELINE.length - 1;
          return (
            <li key={step.name} className="relative flex gap-3 pb-5 last:pb-0">
              {!last && (
                <span
                  aria-hidden
                  className={cn("absolute top-6 bottom-0 left-[11px] w-px", finished ? "bg-primary" : "bg-line")}
                />
              )}
              <span
                className={cn(
                  "relative flex size-6 shrink-0 items-center justify-center rounded-full border text-sm font-medium tabular-nums",
                  finished && "border-primary bg-primary text-white",
                  running && "border-warn bg-warn-bg text-warn",
                  !finished && !running && "border-line-strong bg-white text-subtle",
                )}
              >
                {finished ? (
                  <Check aria-hidden className="size-3.5" strokeWidth={2.5} />
                ) : running ? (
                  <LoaderCircle aria-hidden className="size-3.5 animate-spin" strokeWidth={2.5} />
                ) : (
                  i + 1
                )}
              </span>
              <span className="flex min-w-0 flex-1 items-baseline justify-between gap-3 pt-0.5">
                <span className={cn("text-md", stage >= i ? "font-medium text-ink" : "text-muted")}>{step.name}</span>
                <span className="text-sm text-muted tabular-nums">
                  {finished ? step.duration : running ? "running" : ""}
                </span>
              </span>
            </li>
          );
        })}
      </ol>
      {done && (
        <div className="border-t border-line-soft px-5 py-4">
          <Button variant="primary" trailingIcon={ArrowRight} onClick={onReview} className="w-full">
            Review minutes
          </Button>
        </div>
      )}
    </Panel>
  );
}
