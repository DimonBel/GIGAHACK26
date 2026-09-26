import { createBrowserRouter } from "react-router";

import { LoginPage } from "@/features/auth/LoginPage";

import { CabinetRoute, RootRedirect, ScreenRoute } from "./guards";

export const router = createBrowserRouter([
  { path: "/", element: <RootRedirect /> },
  { path: "/login", element: <LoginPage /> },
  {
    path: "/:cabinet",
    element: <CabinetRoute />,
    // No screen (/moderator) redirects to the cabinet's home screen.
    children: [
      { index: true, element: <ScreenRoute /> },
      { path: ":screen", element: <ScreenRoute /> },
    ],
  },
  { path: "*", element: <RootRedirect /> },
]);
