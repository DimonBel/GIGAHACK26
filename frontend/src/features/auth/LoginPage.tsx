import { Navigate } from "react-router";

import { cabinetPath } from "@/shared/config/cabinets";
import { useSessionStore } from "@/stores/session";

import { AuthLayout } from "./AuthLayout";
import { AuthSteps } from "./AuthSteps";
import { PickCabinetStep } from "./PickCabinetStep";
import { SignInStep } from "./SignInStep";

/** /login: email + password -> cabinet (when the account has several). Once a cabinet is entered, go to it. */
export function LoginPage() {
  const step = useSessionStore((s) => s.step);
  const cabinet = useSessionStore((s) => s.cabinet);
  if (step === "in") return <Navigate to={cabinetPath(cabinet)} replace />;
  const pick = step === "pick";
  return (
    <AuthLayout wide={pick}>
      <AuthSteps step={pick ? "pick" : "signin"} />
      {pick ? <PickCabinetStep /> : <SignInStep />}
    </AuthLayout>
  );
}
