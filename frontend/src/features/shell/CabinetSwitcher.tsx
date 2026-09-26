import { Check, ChevronDown } from "lucide-react";
import { useNavigate } from "react-router";

import { CABINETS, CABINET_DESCRIPTION, cabinetAccess, cabinetPath } from "@/shared/config/cabinets";
import { useCabinet } from "@/shared/hooks/useCabinet";
import { useT } from "@/shared/i18n";
import { cn } from "@/shared/lib/cn";
import { CABINET_DOT } from "@/shared/lib/tones";
import { Dot, Menu } from "@/shared/ui";
import { useAccount, useSessionStore } from "@/stores/session";

export function CabinetSwitcher() {
  const t = useT();
  const cabinet = useCabinet();
  const allowed = useAccount()?.cabinets ?? [];
  const open = useSessionStore((s) => s.menu === "cabinet");
  const { toggleMenu, closeMenu, enterCabinet } = useSessionStore();
  const navigate = useNavigate();

  return (
    <Menu
      open={open}
      onClose={closeMenu}
      panelClassName="left-0 w-72"
      trigger={
        <button
          type="button"
          aria-haspopup="menu"
          aria-expanded={open}
          onClick={() => toggleMenu("cabinet")}
          className="flex h-8 items-center gap-2 rounded-md px-2.5 text-base font-medium text-on-ink transition-colors hover:bg-ink-hover"
        >
          <Dot className={CABINET_DOT[cabinet]} />
          {t[cabinet]}
          <ChevronDown aria-hidden className="size-3.5 text-on-ink-muted" strokeWidth={2} />
        </button>
      }
    >
      <div className="px-2.5 pt-1.5 pb-1 text-sm text-muted">Switch cabinet</div>
      {CABINETS.map((c) => {
        const access = cabinetAccess(c, allowed, cabinet);
        return (
          <button
            key={c}
            type="button"
            role="menuitemradio"
            aria-checked={access === "current"}
            disabled={access === "none"}
            onClick={() => {
              enterCabinet(c);
              navigate(cabinetPath(c));
            }}
            className="flex items-start gap-3 rounded-md px-2.5 py-2 text-left transition-colors hover:bg-sunken disabled:pointer-events-none"
          >
            <span className="flex min-w-0 flex-1 flex-col gap-0.5">
              <span className={cn("text-md font-medium", access === "none" && "text-subtle")}>{t[c]}</span>
              <span className="text-sm text-muted">
                {access === "none" ? "No access" : CABINET_DESCRIPTION[c]}
              </span>
            </span>
            {access === "current" && <Check aria-hidden className="mt-0.5 size-4 text-primary" strokeWidth={2} />}
          </button>
        );
      })}
    </Menu>
  );
}
