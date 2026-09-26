import { Outlet } from "react-router";

import { LANGS } from "@/shared/i18n";
import { Dot, Segmented, Wordmark } from "@/shared/ui";
import { useSessionStore } from "@/stores/session";

import { CabinetSwitcher } from "./CabinetSwitcher";
import { TabNav } from "./TabNav";
import { UserMenu } from "./UserMenu";

/** Signed-in frame: ink header (brand, cabinet, screens, language, account), then the screen. */
export function AppShell() {
  const lang = useSessionStore((s) => s.lang);
  const setLang = useSessionStore((s) => s.setLang);
  return (
    <div className="flex min-h-screen flex-col">
      <a
        href="#content"
        className="sr-only z-50 rounded-md bg-white px-3 py-2 focus:not-sr-only focus:absolute focus:top-2 focus:left-2"
      >
        Skip to content
      </a>
      <header className="sticky top-0 z-20 bg-ink text-on-ink">
        <div className="mx-auto flex max-w-[1240px] flex-wrap items-center gap-x-3 px-4 sm:px-6 md:h-14 md:flex-nowrap">
          <Wordmark className="flex h-14 items-center pr-1 text-white md:h-auto" />
          <span aria-hidden className="hidden h-5 w-px bg-ink-line sm:block" />
          <CabinetSwitcher />
          <TabNav />
          <div className="ml-auto flex shrink-0 items-center gap-3">
            <span className="hidden items-center gap-1.5 text-caption text-on-ink-muted md:flex">
              <Dot className="bg-ok" />
              Offline · local
            </span>
            <Segmented
              label="Language"
              options={LANGS}
              value={lang}
              onChange={setLang}
              tone="inverse"
              size="sm"
              className="hidden sm:inline-flex"
            />
            <UserMenu />
          </div>
        </div>
      </header>
      <main id="content" className="mx-auto flex w-full max-w-[1240px] flex-col gap-8 px-4 pt-8 pb-20 sm:px-6">
        <Outlet />
      </main>
    </div>
  );
}
