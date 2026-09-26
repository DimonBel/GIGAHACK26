import { beforeEach, describe, expect, it } from "vitest";

import { useAdminStore } from "./admin";

describe("admin", () => {
  beforeEach(() => useAdminStore.setState(useAdminStore.getInitialState(), true));

  it("grants and removes cabinet access", () => {
    const { toggleCabinet } = useAdminStore.getState();
    toggleCabinet("olga.sirbu@medpark.md", "moderator");
    expect(useAdminStore.getState().users.find((u) => u.email === "olga.sirbu@medpark.md")?.cabinets).toEqual([
      "participant",
      "moderator",
    ]);
    toggleCabinet("olga.sirbu@medpark.md", "participant");
    expect(useAdminStore.getState().users.find((u) => u.email === "olga.sirbu@medpark.md")?.cabinets).toEqual([
      "moderator",
    ]);
  });

  it("flips one permission cell and one template block", () => {
    useAdminStore.getState().togglePermission(0, 2);
    expect(useAdminStore.getState().permissions[0]).toEqual([true, false, true]);
    useAdminStore.getState().setTemplateType("Executive");
    useAdminStore.getState().toggleBlock(5);
    expect(useAdminStore.getState().templates.Executive[5]).toBe(false);
    expect(useAdminStore.getState().templates.Medical[5]).toBe(false);
  });
});
