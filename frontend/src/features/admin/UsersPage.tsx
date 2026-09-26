import { Check, Plus, RotateCcw, Search } from "lucide-react";
import { useState } from "react";

import { CABINETS } from "@/shared/config/cabinets";
import { useT } from "@/shared/i18n";
import { cn } from "@/shared/lib/cn";
import { Button, Dot, EmptyState, PageHeader, Panel } from "@/shared/ui";
import { useAdminStore } from "@/stores/admin";

const COLUMNS = "md:grid-cols-[minmax(0,1fr)_minmax(0,300px)_120px_112px]";

/** Directory users: cabinet access (toggle per cabinet) and 2FA state. */
export function UsersPage() {
  const t = useT();
  const { users, toggleCabinet, resetTwoFa } = useAdminStore();
  const [query, setQuery] = useState("");
  const q = query.trim().toLowerCase();
  const shown = q ? users.filter((u) => [u.name, u.email, u.dept].join(" ").toLowerCase().includes(q)) : users;

  return (
    <>
      <PageHeader
        title={t.users}
        description="Who can open which cabinet. Changes apply at the person's next sign-in."
        actions={
          <Button variant="primary" icon={Plus}>
            Add from directory
          </Button>
        }
      />
      <div className="flex flex-col gap-3">
        <label className="flex h-10 w-full max-w-sm items-center gap-2 rounded-md border border-line-strong bg-white px-3 focus-within:border-primary focus-within:ring-3 focus-within:ring-primary/15">
          <Search aria-hidden className="size-4 text-subtle" strokeWidth={1.75} />
          <input
            value={query}
            onChange={(e) => setQuery(e.target.value)}
            placeholder="Search by name, email or department"
            aria-label="Search people"
            className="h-full flex-1 bg-transparent outline-none placeholder:text-subtle"
          />
        </label>
        <Panel className="overflow-hidden">
          <div className={`hidden gap-6 border-b border-line-soft bg-canvas px-5 py-2.5 text-caption font-medium text-muted md:grid ${COLUMNS}`}>
            <span>Person</span>
            <span>Cabinet access</span>
            <span>2FA</span>
            <span aria-hidden />
          </div>
          {shown.length === 0 && <EmptyState className="px-5 py-10">Nobody matches “{query}”.</EmptyState>}
          <ul className="divide-y divide-line-soft">
            {shown.map((u) => (
              <li key={u.email} className={`grid items-center gap-x-6 gap-y-3 px-5 py-3.5 ${COLUMNS}`}>
                <span className="flex min-w-0 flex-col">
                  <span className="text-body font-medium">{u.name}</span>
                  <span className="truncate text-caption text-muted">
                    {u.email} · {u.dept}
                  </span>
                </span>
                <span className="flex flex-wrap gap-1.5" role="group" aria-label={`Cabinets of ${u.name}`}>
                  {CABINETS.map((cabinet) => {
                    const on = u.cabinets.includes(cabinet);
                    return (
                      <button
                        key={cabinet}
                        type="button"
                        aria-pressed={on}
                        onClick={() => toggleCabinet(u.email, cabinet)}
                        className={cn(
                          "inline-flex h-7 items-center gap-1 rounded-full border px-2.5 text-caption font-medium transition-colors",
                          on
                            ? "border-primary/30 bg-primary-soft text-primary"
                            : "border-line text-subtle hover:border-line-strong hover:text-ink-2",
                        )}
                      >
                        {on && <Check aria-hidden className="size-3" strokeWidth={2.5} />}
                        {t[cabinet]}
                      </button>
                    );
                  })}
                </span>
                <span
                  className={cn(
                    "flex items-center gap-1.5 text-small",
                    u.twoFa === "on" ? "text-ink-2" : "text-warn",
                  )}
                >
                  <Dot className={u.twoFa === "on" ? "bg-ok" : "bg-warn"} />
                  {u.twoFa === "on" ? "Enabled" : "Setup pending"}
                </span>
                <Button
                  variant="ghost"
                  size="sm"
                  icon={RotateCcw}
                  disabled={u.twoFa !== "on"}
                  onClick={() => resetTwoFa(u.email)}
                  className="justify-self-start md:justify-self-end"
                >
                  Reset 2FA
                </Button>
              </li>
            ))}
          </ul>
        </Panel>
      </div>
    </>
  );
}
