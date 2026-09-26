import { create } from "zustand";

import * as authApi from "@/api/auth";
import { ApiError, setUnauthorizedHandler } from "@/api/client";
import type { User } from "@/api/types";
import type { Cabinet, Lang } from "@/shared/types/domain";

import { useMeetingsStore } from "./meetings";
import { useMinutesStore } from "./minutes";
import { useProcessingStore } from "./processing";

/** loading = asking the server whether this browser is still signed in. */
export type AuthStep = "loading" | "signin" | "pick" | "in";
export type HeaderMenu = "cabinet" | "user" | null;

const LAST_CABINET = "mom.cabinet";

function remembered(): Cabinet | null {
  try {
    return localStorage.getItem(LAST_CABINET) as Cabinet | null;
  } catch {
    return null;
  }
}

function remember(cabinet: Cabinet) {
  try {
    localStorage.setItem(LAST_CABINET, cabinet);
  } catch {
    // private window / storage blocked: the cabinet is simply not remembered
  }
}

/** The cabinet to open for a user: the one used last on this browser, if still allowed, else their first. */
function startCabinet(user: User): Cabinet {
  const last = remembered();
  return last && user.cabinets.includes(last) ? last : (user.cabinets[0] ?? "participant");
}

interface SessionState {
  step: AuthStep;
  user: User | null;
  email: string;
  password: string;
  error: string | null;
  busy: boolean;
  /** Cabinet last entered (the header shows the one in the URL). */
  cabinet: Cabinet;
  lang: Lang;
  menu: HeaderMenu;

  /** On start: restore the session from the cookie, if there is one. */
  restore: () => Promise<void>;
  setEmail: (email: string) => void;
  setPassword: (password: string) => void;
  /** Email + password; one cabinet is entered directly, several go to the cabinet picker. */
  signIn: () => Promise<void>;
  enterCabinet: (cabinet: Cabinet) => void;
  openCabinetPicker: () => void;
  signOut: () => Promise<void>;
  /** The server says the session is gone. */
  expire: () => void;
  setLang: (lang: Lang) => void;
  toggleMenu: (menu: Exclude<HeaderMenu, null>) => void;
  closeMenu: () => void;
}

export const useSessionStore = create<SessionState>()((set, get) => ({
  step: "loading",
  user: null,
  email: "",
  password: "",
  error: null,
  busy: false,
  cabinet: "moderator",
  lang: "en",
  menu: null,

  restore: async () => {
    try {
      const user = await authApi.me();
      set({ step: "in", user, email: user.email, cabinet: startCabinet(user) });
    } catch {
      set({ step: "signin", user: null });
    }
  },
  setEmail: (email) => set({ email, error: null }),
  setPassword: (password) => set({ password, error: null }),
  signIn: async () => {
    const { email, password, busy } = get();
    if (busy) return;
    if (!email.trim() || !password) return set({ error: "Enter your email and password." });
    set({ busy: true, error: null });
    try {
      const user = await authApi.login(email.trim(), password);
      set({ user, password: "", busy: false });
      if (user.cabinets.length === 1 && user.cabinets[0]) get().enterCabinet(user.cabinets[0]);
      else set({ step: "pick", cabinet: startCabinet(user) });
    } catch (e) {
      set({ busy: false, error: e instanceof ApiError ? e.message : "Sign-in failed. Try again." });
    }
  },
  enterCabinet: (cabinet) => {
    remember(cabinet);
    set({ step: "in", cabinet, menu: null });
  },
  openCabinetPicker: () => set({ step: "pick", menu: null }),
  signOut: async () => {
    set({ menu: null });
    try {
      await authApi.logout();
    } catch {
      // already signed out on the server: nothing left to do
    }
    get().expire();
  },
  expire: () => {
    // Nothing of the previous user stays in memory.
    useMinutesStore.getState().reset();
    useProcessingStore.getState().unwatch();
    useMeetingsStore.getState().reset();
    set({ step: "signin", user: null, password: "", menu: null, busy: false });
  },
  setLang: (lang) => set({ lang }),
  toggleMenu: (menu) => set((s) => ({ menu: s.menu === menu ? null : menu })),
  closeMenu: () => set({ menu: null }),
}));

setUnauthorizedHandler(() => {
  if (useSessionStore.getState().step !== "signin") {
    useSessionStore.getState().expire();
    useSessionStore.setState({ error: "Your session ended. Sign in again." });
  }
});

/** The signed-in user (null while signed out). */
export function useAccount() {
  return useSessionStore((s) => s.user);
}
