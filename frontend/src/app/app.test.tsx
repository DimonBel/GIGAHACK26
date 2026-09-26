import { render, screen } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { RouterProvider, createMemoryRouter } from "react-router";
import { describe, expect, it } from "vitest";

import { LoginPage } from "@/features/auth/LoginPage";

import { CabinetRoute, RootRedirect, ScreenRoute } from "./guards";

function renderApp(path: string) {
  const router = createMemoryRouter(
    [
      { path: "/", element: <RootRedirect /> },
      { path: "/login", element: <LoginPage /> },
      {
        path: "/:cabinet",
        element: <CabinetRoute />,
        children: [
          { index: true, element: <ScreenRoute /> },
          { path: ":screen", element: <ScreenRoute /> },
        ],
      },
    ],
    { initialEntries: [path] },
  );
  render(<RouterProvider router={router} />);
  return router;
}

describe("app", () => {
  it("sends a signed-out visitor to the sign-in", () => {
    const router = renderApp("/moderator/editor");
    expect(router.state.location.pathname).toBe("/login");
    expect(screen.getByRole("heading", { name: "Sign in" })).toBeInTheDocument();
  });

  it("signs in with the keyboard and opens the moderator's minutes", async () => {
    const user = userEvent.setup();
    const router = renderApp("/login");
    await user.click(screen.getByRole("button", { name: /Continue/ }));
    await user.type(screen.getByLabelText("Verification code"), "123456{Enter}");
    await user.click(screen.getByRole("button", { name: /Moderator/ }));
    expect(router.state.location.pathname).toBe("/moderator/editor");
    expect(screen.getByRole("heading", { level: 1, name: "Consiliu medical — Cardiologie" })).toBeInTheDocument();
    expect(screen.getByRole("button", { name: /Approve & send/ })).toBeEnabled();
  });
});
