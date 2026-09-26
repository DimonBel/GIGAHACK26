import { create } from "zustand";

import { ACCOUNTS, BACKUP_CODE, DEFAULT_EMAIL } from "@/mocks/accounts";
import type { Account, Cabinet, Lang } from "@/shared/types/domain";

import { useMinutesStore } from "./minutes";

export type AuthStep = "signin" | "2fa" | "setup" | "pick" | "in";
export type HeaderMenu = "cabinet" | "user" | null;

const CODE_MIN = 6;
const CODE_MAX = 8;

interface SessionState {
  step: AuthStep;
  email: string;
  code: string;
  emailUnknown: boolean;
  /** Cabinet last entered (the header shows the one in the URL). */
  cabinet: Cabinet;
  lang: Lang;
  menu: HeaderMenu;

  setEmail: (email: string) => void;
  signIn: () => void;
  setCode: (raw: string) => void;
  fillBackupCode: () => void;
  backToSignIn: () => void;
  /** Checks the code; one cabinet is entered directly, several go to the cabinet picker. */
  verify: () => void;
  enterCabinet: (cabinet: Cabinet) => void;
  openCabinetPicker: () => void;
  signOut: () => void;
  setLang: (lang: Lang) => void;
  toggleMenu: (menu: Exclude<HeaderMenu, null>) => void;
  closeMenu: () => void;
}

export function findAccount(email: string): Account | undefined {
  const key = email.trim().toLowerCase();
  return ACCOUNTS.find((a) => a.email === key);
}

export function codeIsComplete(code: string) {
  return code.length >= CODE_MIN;
}

export const useSessionStore = create<SessionState>()((set, get) => ({
  step: "signin",
  email: DEFAULT_EMAIL,
  code: "",
  emailUnknown: false,
  cabinet: "moderator",
  lang: "en",
  menu: null,

  setEmail: (email) => set({ email, emailUnknown: false }),
  signIn: () => {
    const account = findAccount(get().email);
    if (!account) return set({ emailUnknown: true });
    set({ step: account.needsTwoFaSetup ? "setup" : "2fa", code: "" });
  },
  setCode: (raw) => set({ code: raw.replace(/\D/g, "").slice(0, CODE_MAX) }),
  fillBackupCode: () => set({ code: BACKUP_CODE }),
  backToSignIn: () => set({ step: "signin" }),
  verify: () => {
    const { code, email } = get();
    if (!codeIsComplete(code)) return;
    const cabinets = findAccount(email)?.cabinets ?? [];
    if (cabinets.length === 1 && cabinets[0]) get().enterCabinet(cabinets[0]);
    else set({ step: "pick" });
  },
  enterCabinet: (cabinet) => {
    useMinutesStore.getState().stopEditing();
    set({ step: "in", cabinet, menu: null });
  },
  openCabinetPicker: () => set({ step: "pick", menu: null }),
  signOut: () => set({ step: "signin", menu: null, code: "" }),
  setLang: (lang) => set({ lang }),
  toggleMenu: (menu) => set((s) => ({ menu: s.menu === menu ? null : menu })),
  closeMenu: () => set({ menu: null }),
}));

/** The signed-in account (undefined while the email is unknown). */
export function useAccount() {
  return findAccount(useSessionStore((s) => s.email));
}
