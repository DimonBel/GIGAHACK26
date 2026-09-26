import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

import { ApiError } from "@/api/client";
import * as meetingsApi from "@/api/meetings";
import * as minutesApi from "@/api/minutes";
import type { Line, Suggestion } from "@/api/types";
import { doc, meeting } from "@/test/fixtures";

import { acceptInto, move, searchCatalog, timeToSeconds, topicLines, useMinutesStore } from "./minutes";

vi.mock("@/api/meetings");
vi.mock("@/api/minutes");

const state = () => useMinutesStore.getState();

async function open(status: "draft" | "approved" = "draft") {
  vi.mocked(meetingsApi.getMeeting).mockResolvedValue(meeting({ status }));
  vi.mocked(minutesApi.getMinutes).mockResolvedValue(doc());
  vi.mocked(minutesApi.getTranscript).mockResolvedValue([]);
  vi.mocked(minutesApi.listSuggestions).mockResolvedValue([]);
  vi.mocked(minutesApi.listAttendees).mockResolvedValue([]);
  await state().load(7);
}

describe("minutes helpers", () => {
  it("reads times and slices the transcript per topic", () => {
    expect(timeToSeconds("03:52")).toBe(232);
    expect(timeToSeconds("01:00:05")).toBe(3605);
    expect(timeToSeconds("soon")).toBeNull();
    const lines: Line[] = [0, 100, 180, 400].map((start) => ({
      start,
      end: start + 5,
      speaker: "SPEAKER 1",
      text: `at ${start}`,
    }));
    const topics = doc().topics;
    expect(topicLines(lines, topics, "t1").map((l) => l.start)).toEqual([0, 100]);
    expect(topicLines(lines, topics, "t2").map((l) => l.start)).toEqual([180, 400]);
  });

  it("moves an entry and ignores moves past the ends", () => {
    expect(move([1, 2, 3], 0, 1)).toEqual([2, 1, 3]);
    expect(move([1, 2, 3], 0, -1)).toEqual([1, 2, 3]);
  });

  it("searches the catalog without codes the block has", () => {
    expect(searchCatalog("", [])).toEqual([]);
    const hits = searchCatalog("I21", []);
    expect(hits[0]?.code).toBe("I21.4");
    expect(
      searchCatalog("I21", [{ id: "c", system: "ICD-10", code: "I21.4", label: "" }]).map((c) => c.code),
    ).not.toContain("I21.4");
  });

  it("files an accepted suggestion into the chosen block, or a new one", () => {
    const s: Suggestion = {
      id: 1,
      topicId: "t1",
      author: "Dr. N",
      kind: "Addition",
      text: "Call family",
      state: "open",
      created: 0,
    };
    const into = acceptInto(doc(), s, "b2").topics[0]!.blocks[1]!;
    expect(into.kind === "list" && into.items.at(-1)).toMatchObject({ text: "Call family", who: "Dr. N" });
    const task = acceptInto(doc(), { ...s, kind: "Task" }, null).topics[0]!.blocks.at(-1)!;
    expect(task.kind).toBe("tasks");
  });
});

describe("minutes store", () => {
  beforeEach(() => {
    vi.resetAllMocks();
    vi.useFakeTimers();
    state().reset();
  });
  afterEach(() => vi.useRealTimers());

  it("edits blocks and autosaves once, 800 ms after the last change", async () => {
    await open();
    vi.mocked(minutesApi.saveMinutes).mockResolvedValue({ version: 2 });
    const blockId = state().addBlock("t1", "tasks");
    const itemId = state().addItem("t1", blockId)!;
    state().updateItem("t1", blockId, itemId, { text: "Echo tomorrow", priority: "high" });
    state().moveBlock("t1", blockId, -1);
    expect(state().save).toBe("dirty");
    await vi.advanceTimersByTimeAsync(800);
    expect(minutesApi.saveMinutes).toHaveBeenCalledTimes(1);
    const saved = vi.mocked(minutesApi.saveMinutes).mock.calls[0]![1];
    expect(saved.topics[0]!.blocks.map((b) => b.kind)).toEqual(["text", "tasks", "list"]);
    expect(state()).toMatchObject({ save: "saved" });
    expect(state().doc?.version).toBe(2);
  });

  it("stops saving on a version conflict", async () => {
    await open();
    vi.mocked(minutesApi.saveMinutes).mockRejectedValue(new ApiError(409, "changed elsewhere"));
    state().updateDoc({ summary: "New" });
    await vi.advanceTimersByTimeAsync(800);
    expect(state().save).toBe("conflict");
    state().updateDoc({ summary: "Newer" });
    expect(state().doc?.summary).toBe("New");
  });

  it("does not edit approved minutes", async () => {
    await open("approved");
    state().updateDoc({ summary: "Changed" });
    expect(state().doc?.summary).toBe("Two patients reviewed.");
    expect(state().save).toBe("saved");
  });

  it("ticks attendees from the directory and autosaves them", async () => {
    await open();
    useMinutesStore.setState({
      directory: [
        {
          id: 3,
          email: "n@medpark.md",
          name: "Dr. Natalia Popescu",
          initials: "NP",
          dept: "ATI",
          cabinets: ["participant"],
        },
        {
          id: 4,
          email: "i@medpark.md",
          name: "Dr. Igor Munteanu",
          initials: "IM",
          dept: "Imagistică",
          cabinets: ["participant"],
        },
      ],
    });
    vi.mocked(minutesApi.saveMinutes).mockResolvedValue({ version: 2 });
    state().setAttendees([4, 3, 4]);
    expect(state().attendeeList.map((a) => a.id)).toEqual([3, 4]);
    await vi.advanceTimersByTimeAsync(800);
    expect(vi.mocked(minutesApi.saveMinutes).mock.calls[0]![1].attendees).toEqual([4, 3]);
  });

  it("keeps the emails queued by the approval", async () => {
    await open();
    const delivery = {
      id: 1,
      userId: 3,
      name: "Dr. N",
      email: "n@medpark.md",
      status: "queued" as const,
      error: null,
      created: 0,
      sent: null,
    };
    vi.mocked(minutesApi.approveMinutes).mockResolvedValue({ version: 1, deliveries: [delivery] });
    vi.mocked(meetingsApi.getMeeting).mockResolvedValue(meeting({ status: "approved" }));
    expect(await state().approve()).toBe(true);
    expect(state().deliveries).toEqual([delivery]);
    vi.mocked(minutesApi.retryDeliveries).mockResolvedValue([{ ...delivery, status: "sent" }]);
    await state().retryDeliveries();
    expect(state().deliveries[0]?.status).toBe("sent");
  });

  it("saves pending edits before approving", async () => {
    await open();
    vi.mocked(minutesApi.saveMinutes).mockResolvedValue({ version: 2 });
    vi.mocked(minutesApi.approveMinutes).mockResolvedValue({ version: 2, deliveries: [] });
    state().updateTopic("t1", { title: "Bed 3" });
    vi.mocked(meetingsApi.getMeeting).mockResolvedValue(meeting({ status: "approved" }));
    expect(await state().approve()).toBe(true);
    expect(minutesApi.saveMinutes).toHaveBeenCalledTimes(1);
    expect(state().meeting?.status).toBe("approved");
  });
});
