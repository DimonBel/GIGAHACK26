import { Navigate, useParams } from "react-router";

import { AppShell } from "@/features/shell/AppShell";
import { TABS, cabinetPath, isCabinet } from "@/shared/config/cabinets";
import type { Screen } from "@/shared/types/domain";
import { useAccount, useSessionStore } from "@/stores/session";

import { SCREENS } from "./screens";

/** "/" -> the cabinet in use, or the sign-in. */
export function RootRedirect() {
  const step = useSessionStore((s) => s.step);
  const cabinet = useSessionStore((s) => s.cabinet);
  return <Navigate to={step === "in" ? cabinetPath(cabinet) : "/login"} replace />;
}

/** /:cabinet/* : signed in, and the account has access to that cabinet. */
export function CabinetRoute() {
  const { cabinet } = useParams();
  const step = useSessionStore((s) => s.step);
  const current = useSessionStore((s) => s.cabinet);
  const allowed = useAccount()?.cabinets ?? [];

  if (step !== "in") return <Navigate to="/login" replace />;
  if (!isCabinet(cabinet) || !allowed.includes(cabinet)) return <Navigate to={cabinetPath(current)} replace />;
  return <AppShell />;
}

/** /:cabinet/:screen : a screen of that cabinet (or the account page); anything else goes to its home. */
export function ScreenRoute() {
  const { cabinet, screen } = useParams();
  if (!isCabinet(cabinet)) return null;
  const valid = screen === "account" || TABS[cabinet].includes(screen as Screen);
  if (!valid) return <Navigate to={cabinetPath(cabinet)} replace />;
  const Page = SCREENS[screen as Screen];
  return <Page key={`${cabinet}/${screen}`} />;
}
