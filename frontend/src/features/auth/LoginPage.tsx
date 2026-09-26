import { Navigate } from "react-router";

import { cabinetPath } from "@/shared/config/cabinets";
import { useSessionStore } from "@/stores/session";

import { AuthLayout } from "./AuthLayout";
import { AuthSteps } from "./AuthSteps";
import { PickCabinetStep } from "./PickCabinetStep";
import { SetupStep } from "./SetupStep";
import { SignInStep } from "./SignInStep";
import { TwoFaStep } from "./TwoFaStep";

const STEP_VIEW = { signin: SignInStep, "2fa": TwoFaStep, setup: SetupStep, pick: PickCabinetStep };

/** /login: account -> 2FA (or 2FA setup) -> cabinet. Once a cabinet is entered, go to it. */
export function LoginPage() {
  const step = useSessionStore((s) => s.step);
  const cabinet = useSessionStore((s) => s.cabinet);
  if (step === "in") return <Navigate to={cabinetPath(cabinet)} replace />;
  const View = STEP_VIEW[step];
  return (
    <AuthLayout wide={step === "pick"}>
      <AuthSteps step={step} />
      <View />
    </AuthLayout>
  );
}
