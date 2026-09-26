import { beforeEach, describe, expect, it, vi } from "vitest";

import * as authApi from "@/api/auth";
import { ApiError } from "@/api/client";
import { ELENA, NATALIA } from "@/test/fixtures";

import { useSessionStore } from "./session";

vi.mock("@/api/auth");

describe("session", () => {
  beforeEach(() => {
    vi.resetAllMocks();
    localStorage.clear();
    useSessionStore.setState(useSessionStore.getInitialState(), true);
  });

  it("restores a signed-in session from the cookie", async () => {
    vi.mocked(authApi.me).mockResolvedValue(ELENA);
    await useSessionStore.getState().restore();
    expect(useSessionStore.getState()).toMatchObject({ step: "in", user: ELENA, cabinet: "moderator" });
  });

  it("goes to the sign-in when there is no session", async () => {
    vi.mocked(authApi.me).mockRejectedValue(new ApiError(401, "Not signed in"));
    await useSessionStore.getState().restore();
    expect(useSessionStore.getState()).toMatchObject({ step: "signin", user: null });
  });

  it("shows the server's message for a wrong password", async () => {
    vi.mocked(authApi.login).mockRejectedValue(new ApiError(401, "Wrong email or password"));
    const s = useSessionStore.getState();
    s.setEmail("elena.rusu@medpark.md");
    s.setPassword("nope");
    await s.signIn();
    expect(useSessionStore.getState()).toMatchObject({
      step: "loading",
      error: "Wrong email or password",
      busy: false,
    });
  });

  it("asks for both fields before calling the server", async () => {
    await useSessionStore.getState().signIn();
    expect(authApi.login).not.toHaveBeenCalled();
    expect(useSessionStore.getState().error).toMatch(/email and password/);
  });

  it("enters the only cabinet directly, else asks which one", async () => {
    vi.mocked(authApi.login).mockResolvedValueOnce(NATALIA).mockResolvedValueOnce(ELENA);
    const s = useSessionStore.getState();
    s.setEmail(NATALIA.email);
    s.setPassword("demo");
    await s.signIn();
    expect(useSessionStore.getState()).toMatchObject({ step: "in", cabinet: "participant", password: "" });

    s.setPassword("demo");
    await s.signIn();
    expect(useSessionStore.getState().step).toBe("pick");
  });

  it("remembers the last cabinet for the next visit", async () => {
    useSessionStore.getState().enterCabinet("participant");
    vi.mocked(authApi.me).mockResolvedValue(ELENA);
    await useSessionStore.getState().restore();
    expect(useSessionStore.getState().cabinet).toBe("participant");
  });

  it("signs out even when the server is unreachable", async () => {
    vi.mocked(authApi.logout).mockRejectedValue(new ApiError(0, "down"));
    useSessionStore.setState({ step: "in", user: ELENA });
    await useSessionStore.getState().signOut();
    expect(useSessionStore.getState()).toMatchObject({ step: "signin", user: null });
  });
});
