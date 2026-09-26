import { LoaderCircle } from "lucide-react";
import { Navigate, useParams } from "react-router";

import { AppShell } from "@/features/shell/AppShell";
import { TABS, cabinetPath, isCabinet } from "@/shared/config/cabinets";
import type { Screen } from "@/shared/types/domain";
import { Wordmark } from "@/shared/ui";
import { useAccount, useSessionStore } from "@/stores/session";

import { SCREENS } from "./screens";

/** Screens that open one meeting: /moderator/editor/42, /participant/read/42. */
const MEETING_SCREENS: Screen[] = ["editor", "read"];

/** While the server is asked whether this browser is still signed in. */
function Restoring() {
  return (
    <div role="status" className="flex min-h-screen flex-col items-center justify-center gap-4 text-muted">
      <Wordmark className="text-ink" />
      <span className="flex items-center gap-2 text-base">
        <LoaderCircle aria-hidden className="size-4 animate-spin" strokeWidth={1.75} />
        Connecting to the server…
      </span>
    </div>
  );
}

/** "/" -> the cabinet in use, or the sign-in. */
export function RootRedirect() {
  const step = useSessionStore((s) => s.step);
  const cabinet = useSessionStore((s) => s.cabinet);
  if (step === "loading") return <Restoring />;
  return <Navigate to={step === "in" ? cabinetPath(cabinet) : "/login"} replace />;
}

/** /:cabinet/* : signed in, and the account has access to that cabinet. */
export function CabinetRoute() {
  const { cabinet } = useParams();
  const step = useSessionStore((s) => s.step);
  const current = useSessionStore((s) => s.cabinet);
  const allowed = useAccount()?.cabinets ?? [];

  if (step === "loading") return <Restoring />;
  if (step !== "in") return <Navigate to="/login" replace />;
  if (!isCabinet(cabinet) || !allowed.includes(cabinet))
    return <Navigate to={cabinetPath(current)} replace />;
  return <AppShell />;
}

/** /:cabinet/:screen[/:meetingId] : a screen of that cabinet (or the account page); anything else goes home. */
export function ScreenRoute() {
  const { cabinet, screen, meetingId } = useParams();
  if (!isCabinet(cabinet)) return null;
  const valid = screen === "account" || TABS[cabinet].includes(screen as Screen);
  const validId =
    meetingId === undefined || (MEETING_SCREENS.includes(screen as Screen) && /^\d+$/.test(meetingId));
  if (!valid || !validId) return <Navigate to={cabinetPath(cabinet)} replace />;
  const Page = SCREENS[screen as Screen];
  return <Page key={`${cabinet}/${screen}`} />;
}
