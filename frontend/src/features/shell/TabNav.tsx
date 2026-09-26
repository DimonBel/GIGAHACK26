import { NavLink } from "react-router";

import { TABS, cabinetPath } from "@/shared/config/cabinets";
import { useCabinet } from "@/shared/hooks/useCabinet";
import { useT } from "@/shared/i18n";
import { cn } from "@/shared/lib/cn";
import { useSessionStore } from "@/stores/session";

/** The cabinet's screens; the active one is white with a green underline. */
export function TabNav() {
  const t = useT();
  const cabinet = useCabinet();
  const closeMenu = useSessionStore((s) => s.closeMenu);
  return (
    <nav
      aria-label="Screens"
      className="order-last -mx-4 flex h-11 w-[calc(100%+2rem)] gap-1 overflow-x-auto border-t border-ink-line px-2 sm:-mx-6 sm:w-[calc(100%+3rem)] sm:px-4 md:order-none md:mx-0 md:h-full md:w-auto md:min-w-0 md:border-0 md:px-0"
    >
      {TABS[cabinet].map((screen) => (
        <NavLink
          key={screen}
          to={cabinetPath(cabinet, screen)}
          onClick={closeMenu}
          className={({ isActive }) =>
            cn(
              "relative flex items-center px-3 text-small font-medium whitespace-nowrap transition-colors",
              "after:absolute after:inset-x-3 after:bottom-0 after:h-0.5 after:rounded-full",
              isActive ? "text-white after:bg-ok" : "text-on-ink-muted after:bg-transparent hover:text-white",
            )
          }
        >
          {t[screen]}
        </NavLink>
      ))}
    </nav>
  );
}
