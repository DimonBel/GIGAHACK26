import { Send } from "lucide-react";

import type { SuggestionKind } from "@/shared/types/domain";
import { Button, Segmented, Textarea } from "@/shared/ui";
import { useMinutesStore } from "@/stores/minutes";
import { useAccount } from "@/stores/session";

const KINDS: SuggestionKind[] = ["Point of view", "Task", "Attention point", "Diagnosis"];

/** Participant: propose an addition to the topic; the moderator accepts or declines it. */
export function SuggestForm() {
  const name = useAccount()?.name ?? "—";
  const { suggestionKind, suggestionText, suggestionsSent, setSuggestionKind, setSuggestionText, submitSuggestion } =
    useMinutesStore();
  return (
    <section className="mt-6 flex flex-col gap-4 rounded-lg border border-line bg-canvas p-5">
      <div className="flex flex-col gap-0.5">
        <h3 className="text-body font-semibold">Suggest an addition</h3>
        <p className="text-small text-muted">The moderator reviews it before it appears in the minutes.</p>
      </div>
      <Segmented
        label="Kind of suggestion"
        options={KINDS.map((k) => ({ value: k, label: k }))}
        value={suggestionKind}
        onChange={setSuggestionKind}
        className="self-start"
      />
      <Textarea
        rows={3}
        value={suggestionText}
        onChange={(e) => setSuggestionText(e.target.value)}
        aria-label="Suggestion"
        placeholder={
          suggestionKind === "Diagnosis" ? "ICD-10 code and term, e.g. N18.3 Chronic kidney disease" : "Write your addition…"
        }
      />
      <div className="flex flex-wrap items-center justify-between gap-3">
        <span className="text-caption text-muted">
          {suggestionsSent ? `${suggestionsSent} sent · waiting for the moderator` : `Sent as ${name}`}
        </span>
        <Button
          variant="primary"
          size="sm"
          icon={Send}
          disabled={!suggestionText.trim()}
          onClick={() => submitSuggestion(name)}
        >
          Send to moderator
        </Button>
      </div>
    </section>
  );
}
