import { Check, FileDown, Send } from "lucide-react";

import { CURRENT_MINUTES } from "@/mocks/meetings";
import { Button, PageHeader, StatusBadge, TypeBadge } from "@/shared/ui";
import { useMinutesStore } from "@/stores/minutes";

export function MinutesHeader({ isModerator }: { isModerator: boolean }) {
  const sent = useMinutesStore((s) => s.sent);
  const send = useMinutesStore((s) => s.send);
  const status = sent
    ? `Sent to ${CURRENT_MINUTES.recipients} recipients`
    : isModerator
      ? "Draft · auto-saved"
      : `Approved ${CURRENT_MINUTES.approvedOn}`;
  return (
    <PageHeader
      eyebrow={
        <>
          <TypeBadge type={CURRENT_MINUTES.type} />
          <span className="tabular-nums">{CURRENT_MINUTES.reference}</span>
        </>
      }
      title={CURRENT_MINUTES.title}
      actions={
        <>
          <StatusBadge tone={sent || !isModerator ? "ok" : "warn"}>{status}</StatusBadge>
          {isModerator ? (
            <Button variant="primary" icon={sent ? Check : Send} disabled={sent} onClick={send}>
              {sent ? "Sent" : "Approve & send"}
            </Button>
          ) : (
            <Button icon={FileDown}>Download PDF</Button>
          )}
        </>
      }
    />
  );
}
