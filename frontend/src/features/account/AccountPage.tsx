import { LogOut } from "lucide-react";

import { useT } from "@/shared/i18n";
import { Button, Dot, PageHeader, Panel, PanelHeader } from "@/shared/ui";
import { useAccount, useSessionStore } from "@/stores/session";

export function AccountPage() {
  const t = useT();
  const account = useAccount();
  const signOut = useSessionStore((s) => s.signOut);
  const profile = [
    ["Name", account?.name ?? "—"],
    ["Email", account?.email ?? "—"],
    ["Department", account?.dept ?? "—"],
    ["Cabinets", (account?.cabinets ?? []).map((c) => t[c]).join(", ")],
  ];

  return (
    <>
      <PageHeader title={t.account} description="Your directory profile and this sign-in." />
      <div className="grid max-w-[1000px] items-start gap-6 lg:grid-cols-2">
        <Panel>
          <PanelHeader title="Profile" description="Managed in the hospital directory." />
          <dl className="grid grid-cols-[110px_minmax(0,1fr)] gap-x-4 gap-y-3 p-5 text-md">
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
            title="Sign-in"
            description="Email and password, checked by the hospital server."
            actions={
              <span className="flex items-center gap-1.5 text-base text-ink-2">
                <Dot className="bg-ok" />
                Signed in
              </span>
            }
          />
          <div className="flex flex-col gap-4 p-5">
            <p className="text-base text-muted">
              This browser stays signed in for 12 hours after your last action. Sign out on shared
              workstations.
            </p>
            <Button variant="secondary" icon={LogOut} onClick={() => void signOut()} className="self-start">
              {t.signOut}
            </Button>
          </div>
        </Panel>
      </div>
    </>
  );
}
