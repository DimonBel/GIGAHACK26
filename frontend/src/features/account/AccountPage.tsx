import { Eye, EyeOff } from "lucide-react";

import { BACKUP_CODES, SESSIONS, TWO_FA_ADDED } from "@/mocks/admin";
import { useT } from "@/shared/i18n";
import { Button, Dot, PageHeader, Panel, PanelHeader } from "@/shared/ui";
import { useAccountStore } from "@/stores/account";
import { useAccount, useSessionStore } from "@/stores/session";

/** Own profile, 2FA with backup codes, and active sessions. */
export function AccountPage() {
  const t = useT();
  const account = useAccount();
  const email = useSessionStore((s) => s.email);
  const { showBackupCodes, toggleBackupCodes, revoked, revoke } = useAccountStore();
  const profile = [
    ["Name", account?.name ?? "—"],
    ["Email", email],
    ["Department", account?.dept ?? "—"],
    ["Cabinets", (account?.cabinets ?? []).map((c) => t[c]).join(", ")],
  ];

  return (
    <>
      <PageHeader title={t.account} description="Your directory profile and how you sign in." />
      <div className="grid max-w-[1000px] items-start gap-6 lg:grid-cols-2">
        <Panel>
          <PanelHeader title="Profile" description="Managed in the hospital directory." />
          <dl className="grid grid-cols-[110px_minmax(0,1fr)] gap-x-4 gap-y-3 p-5 text-body">
            {profile.map(([label, value]) => (
              <div key={label} className="contents">
                <dt className="text-muted">{label}</dt>
                <dd className="min-w-0 truncate">{value}</dd>
              </div>
            ))}
          </dl>
        </Panel>
        <Panel>
          <PanelHeader
            title="Two-factor authentication"
            description={TWO_FA_ADDED}
            actions={
              <span className="flex items-center gap-1.5 text-small text-ink-2">
                <Dot className="bg-ok" />
                Enabled
              </span>
            }
          />
          <div className="flex flex-col gap-5 p-5">
            <div className="flex flex-col gap-3">
              <Button
                size="sm"
                icon={showBackupCodes ? EyeOff : Eye}
                aria-expanded={showBackupCodes}
                onClick={toggleBackupCodes}
                className="self-start"
              >
                {showBackupCodes ? "Hide backup codes" : "Show backup codes"}
              </Button>
              {showBackupCodes && (
                <ul className="grid grid-cols-2 gap-x-6 gap-y-1.5 rounded-md bg-sunken p-4 text-body font-medium tracking-wide tabular-nums select-all">
                  {BACKUP_CODES.map((code) => (
                    <li key={code}>{code}</li>
                  ))}
                </ul>
              )}
            </div>
            <div className="flex flex-col">
              <span className="pb-1 text-small font-medium text-ink-2">Active sessions</span>
              <ul className="divide-y divide-line-soft">
                {SESSIONS.map((s, i) => {
                  const isRevoked = revoked.includes(i);
                  return (
                    <li key={s.label} className="flex items-center justify-between gap-3 py-2.5 text-small">
                      <span className={isRevoked ? "text-subtle line-through" : "text-ink-2"}>{s.label}</span>
                      {s.current ? (
                        <span className="text-caption text-muted">This device</span>
                      ) : isRevoked ? (
                        <span className="text-caption text-muted">Revoked</span>
                      ) : (
                        <Button variant="danger" size="sm" onClick={() => revoke(i)}>
                          Revoke
                        </Button>
                      )}
                    </li>
                  );
                })}
              </ul>
            </div>
          </div>
        </Panel>
      </div>
    </>
  );
}
