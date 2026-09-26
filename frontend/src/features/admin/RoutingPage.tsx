import { Mail } from "lucide-react";

import { ROUTING, ROUTING_NOTE, SMTP_RELAY } from "@/mocks/admin";
import { useT } from "@/shared/i18n";
import { PageHeader, Panel, TypeBadge } from "@/shared/ui";

/** Who receives the minutes of each meeting type, and when. */
export function RoutingPage() {
  const t = useT();
  return (
    <>
      <PageHeader title={t.routing} description="Where approved minutes are delivered. Mail goes through the internal relay only." />
      <Panel className="overflow-hidden">
        <ul className="divide-y divide-line-soft">
          {ROUTING.map((r) => (
            <li key={r.type} className="grid items-start gap-x-6 gap-y-2 px-5 py-4 md:grid-cols-[150px_minmax(0,1fr)_260px]">
              <TypeBadge type={r.type} className="text-small md:pt-0.5" />
              <span className="flex min-w-0 flex-col gap-0.5">
                <span className="text-body font-medium">
                  {r.list} · <span className="tabular-nums">{r.recipients}</span> recipients
                </span>
                <span className="text-caption text-muted">{r.emails}</span>
              </span>
              <span className="text-small text-ink-2">{r.rule}</span>
            </li>
          ))}
        </ul>
      </Panel>
      <p className="flex flex-wrap items-center gap-2 text-small text-muted">
        <Mail aria-hidden className="size-4" strokeWidth={1.75} />
        <span className="font-medium text-ink-2">{SMTP_RELAY}</span>
        {ROUTING_NOTE}
      </p>
    </>
  );
}
