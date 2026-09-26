import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

import { useAdminStore } from "./admin";
import { STAGE_COUNT, useProcessingStore } from "./processing";

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

describe("processing", () => {
  beforeEach(() => vi.useFakeTimers());
  afterEach(() => {
    useProcessingStore.getState().stop();
    vi.useRealTimers();
  });

  it("runs one stage every 900 ms and stops when done", () => {
    useProcessingStore.getState().start();
    expect(useProcessingStore.getState().stage).toBe(0);
    vi.advanceTimersByTime(900 * 2);
    expect(useProcessingStore.getState().stage).toBe(2);
    vi.advanceTimersByTime(900 * 10);
    expect(useProcessingStore.getState().stage).toBe(STAGE_COUNT);
  });

  it("stopping a recording starts processing", () => {
    useProcessingStore.setState({ stage: -1, recording: false, recordedSeconds: 0 });
    useProcessingStore.getState().toggleRecording();
    vi.advanceTimersByTime(3000);
    expect(useProcessingStore.getState().recordedSeconds).toBe(3);
    useProcessingStore.getState().toggleRecording();
    expect(useProcessingStore.getState()).toMatchObject({ recording: false, stage: 0 });
  });
});
