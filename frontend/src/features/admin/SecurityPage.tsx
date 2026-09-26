import { AUDIT_LOG, LOCKOUT_OPTIONS, SESSION_TIMEOUTS, TWO_FA_METHODS, TWO_FA_POLICIES } from "@/mocks/admin";
import { useT } from "@/shared/i18n";
import { cn } from "@/shared/lib/cn";
import type { AuditEvent } from "@/shared/types/domain";
import { Dot, Field, PageHeader, Panel, PanelHeader, Segmented, Select, Toggle } from "@/shared/ui";
import { useAdminStore } from "@/stores/admin";

const EVENT_DOT: Record<AuditEvent["tone"], string> = { default: "bg-line-strong", danger: "bg-danger", warn: "bg-warn" };

export function SecurityPage() {
  const t = useT();
  const { policy, setPolicy, methods, toggleMethod } = useAdminStore();
  return (
    <>
      <PageHeader title={t.security} description="Two-factor policy and sessions for everyone on this server." />
      <div className="grid items-start gap-6 lg:grid-cols-2">
        <Panel>
          <PanelHeader title="Two-factor authentication" />
          <div className="flex flex-col gap-6 p-5">
            <div className="flex flex-col gap-1.5">
              <span className="text-base font-medium text-ink-2">Required for</span>
              <Segmented label="Required for" options={TWO_FA_POLICIES} value={policy} onChange={setPolicy} className="self-start" />
            </div>
            <div className="flex flex-col">
              <span className="pb-1 text-base font-medium text-ink-2">Allowed methods</span>
              <ul className="divide-y divide-line-soft">
                {TWO_FA_METHODS.map((m, i) => (
                  <li key={m.label} className="flex items-center justify-between gap-4 py-3">
                    <span className="flex flex-col">
                      <span className="text-md">{m.label}</span>
                      <span className="text-sm text-muted">{m.hint}</span>
                    </span>
                    <Toggle on={methods[i] ?? false} onToggle={() => toggleMethod(i)} label={m.label} />
                  </li>
                ))}
              </ul>
            </div>
            <div className="grid gap-4 sm:grid-cols-2">
              <Field label="Session timeout">
                <Select>
                  {SESSION_TIMEOUTS.map((o) => (
                    <option key={o}>{o}</option>
                  ))}
                </Select>
              </Field>
              <Field label="Lock account after">
                <Select>
                  {LOCKOUT_OPTIONS.map((o) => (
                    <option key={o}>{o}</option>
                  ))}
                </Select>
              </Field>
            </div>
          </div>
        </Panel>
        <Panel>
          <PanelHeader title="Security events" description="Today" />
          <ol className="divide-y divide-line-soft px-5">
            {AUDIT_LOG.map((e, i) => (
              <li key={i} className="grid grid-cols-[48px_12px_minmax(0,1fr)] items-center gap-2 py-3 text-base">
                <span className="text-muted tabular-nums">{e.time}</span>
                <Dot className={EVENT_DOT[e.tone]} />
                <span className={cn(e.tone === "danger" ? "text-danger" : e.tone === "warn" ? "text-warn" : "text-ink-2")}>
                  {e.text}
                </span>
              </li>
            ))}
          </ol>
        </Panel>
      </div>
    </>
  );
}
