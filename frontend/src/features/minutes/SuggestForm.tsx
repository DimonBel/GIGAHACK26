import { Send } from "lucide-react";
import { useState } from "react";

import { Button, Segmented, Textarea } from "@/shared/ui";
import { useMinutesStore } from "@/stores/minutes";
import { useAccount } from "@/stores/session";

const KINDS = ["Addition", "Correction", "Task"] as const;
type Kind = (typeof KINDS)[number];

/** Participant: suggest an addition to a topic while the minutes are a draft. */
export function SuggestForm({ topicId }: { topicId: string }) {
  const name = useAccount()?.name ?? "—";
  const sendSuggestion = useMinutesStore((s) => s.sendSuggestion);
  const suggestions = useMinutesStore((s) => s.suggestions);
  const sent = suggestions.filter((x) => x.topicId === topicId);
  const [kind, setKind] = useState<Kind>("Addition");
  const [text, setText] = useState("");
  const [busy, setBusy] = useState(false);

  async function submit() {
    setBusy(true);
    if (await sendSuggestion(topicId, kind, text)) setText("");
    setBusy(false);
  }

  return (
    <section className="mt-6 flex flex-col gap-4 rounded-lg border border-line bg-canvas p-5">
      <div className="flex flex-col gap-0.5">
        <h3 className="text-md font-semibold">Suggest an addition</h3>
        <p className="text-base text-muted">The moderator reviews it before it appears in the minutes.</p>
      </div>
      <Segmented
        label="Kind of suggestion"
        options={KINDS.map((k) => ({ value: k, label: k }))}
        value={kind}
        onChange={setKind}
        className="self-start"
      />
      <Textarea
        rows={3}
        value={text}
        onChange={(e) => setText(e.target.value)}
        aria-label="Suggestion"
        maxLength={2000}
        placeholder={
          kind === "Correction" ? "What is wrong, and what it should say…" : "Write your addition…"
        }
      />
      <div className="flex flex-wrap items-center justify-between gap-3">
        <span className="text-sm text-muted">
          {sent.length
            ? `${sent.length} sent · ${sent.filter((s) => s.state === "accepted").length} added by the moderator`
            : `Sent as ${name}`}
        </span>
        <Button
          variant="primary"
          size="sm"
          icon={Send}
          disabled={!text.trim() || busy}
          onClick={() => void submit()}
        >
          Send to moderator
        </Button>
      </div>
    </section>
  );
}
