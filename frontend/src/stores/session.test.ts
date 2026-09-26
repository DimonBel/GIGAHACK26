import { beforeEach, describe, expect, it } from "vitest";

import { useMinutesStore } from "./minutes";
import { findAccount, useSessionStore } from "./session";

const initial = useSessionStore.getState();
const session = () => useSessionStore.getState();

describe("sign-in", () => {
  beforeEach(() => useSessionStore.setState(initial, true));

  it("rejects an email that is not in the directory", () => {
    session().setEmail("someone@else.md");
    session().signIn();
    expect(session().emailUnknown).toBe(true);
    expect(session().step).toBe("signin");
  });

  it("finds accounts regardless of case and spaces", () => {
    expect(findAccount("  Elena.Rusu@Medpark.md ")?.name).toBe("Dr. Elena Rusu");
  });

  it("sends an account without 2FA to setup, others to the code step", () => {
    session().setEmail("igor.munteanu@medpark.md");
    session().signIn();
    expect(session().step).toBe("setup");
    session().setEmail("elena.rusu@medpark.md");
    session().signIn();
    expect(session().step).toBe("2fa");
  });

  it("keeps only digits, at most 8, and needs 6 to verify", () => {
    session().setCode("12a34-56789");
    expect(session().code).toBe("12345678");
    session().setCode("123");
    session().verify();
    expect(session().step).toBe("signin");
  });

  it("enters the only cabinet directly, otherwise asks which one", () => {
    session().setEmail("natalia.popescu@medpark.md");
    session().signIn();
    session().setCode("123456");
    session().verify();
    expect(session()).toMatchObject({ step: "in", cabinet: "participant" });

    session().signOut();
    session().setEmail("elena.rusu@medpark.md");
    session().signIn();
    session().setCode("123456");
    session().verify();
    expect(session().step).toBe("pick");
  });

  it("stops editing the minutes when a cabinet is entered", () => {
    useMinutesStore.setState({ editing: true });
    session().enterCabinet("moderator");
    expect(useMinutesStore.getState().editing).toBe(false);
  });
});
