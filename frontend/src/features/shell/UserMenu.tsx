import { LogOut, Repeat2, UserRound } from "lucide-react";
import { useNavigate } from "react-router";

import { cabinetPath } from "@/shared/config/cabinets";
import { useCabinet } from "@/shared/hooks/useCabinet";
import { LANGS, useT } from "@/shared/i18n";
import { Menu, MenuItem, MenuSeparator, Segmented } from "@/shared/ui";
import { useAccount, useSessionStore } from "@/stores/session";

export function UserMenu() {
  const t = useT();
  const cabinet = useCabinet();
  const account = useAccount();
  const open = useSessionStore((s) => s.menu === "user");
  const { toggleMenu, closeMenu, openCabinetPicker, signOut, lang, setLang } = useSessionStore();
  const navigate = useNavigate();

  return (
    <Menu
      open={open}
      onClose={closeMenu}
      panelClassName="right-0 w-64"
      trigger={
        <button
          type="button"
          aria-label="Account menu"
          aria-haspopup="menu"
          aria-expanded={open}
          onClick={() => toggleMenu("user")}
          className="flex size-8 items-center justify-center rounded-full bg-ink-line text-sm font-semibold text-on-ink transition-colors hover:bg-ink-hover hover:ring-1 hover:ring-on-ink-muted"
        >
          {account?.initials ?? "—"}
        </button>
      }
    >
      <div className="flex flex-col px-2.5 pt-2 pb-2.5">
        <span className="text-md font-medium">{account?.name ?? "—"}</span>
        <span className="truncate text-sm text-muted">{account?.email}</span>
      </div>
      <div className="px-2.5 pb-2.5 sm:hidden">
        <Segmented label="Language" options={LANGS} value={lang} onChange={setLang} size="sm" />
      </div>
      <MenuSeparator />
      <MenuItem
        icon={UserRound}
        onClick={() => {
          closeMenu();
          navigate(cabinetPath(cabinet, "account"));
        }}
      >
        {t.account}
      </MenuItem>
      <MenuItem icon={Repeat2} onClick={openCabinetPicker}>
        {t.chooseCabinet}
      </MenuItem>
      <MenuSeparator />
      <MenuItem icon={LogOut} onClick={() => void signOut()} className="text-danger [&_svg]:text-danger">
        {t.signOut}
      </MenuItem>
    </Menu>
  );
}
