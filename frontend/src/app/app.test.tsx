import { render, screen } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { RouterProvider, createMemoryRouter } from "react-router";
import { beforeEach, describe, expect, it, vi } from "vitest";

import * as authApi from "@/api/auth";
import * as meetingsApi from "@/api/meetings";
import * as minutesApi from "@/api/minutes";
import { doc, ELENA, meeting, NATALIA } from "@/test/fixtures";
import { useSessionStore } from "@/stores/session";

import { routes } from "./router";

vi.mock("@/api/auth");
vi.mock("@/api/meetings");
vi.mock("@/api/minutes");

function renderApp(path: string) {
  const router = createMemoryRouter(routes, { initialEntries: [path] });
  render(<RouterProvider router={router} />);
  return router;
}

describe("app", () => {
  beforeEach(() => {
    vi.resetAllMocks();
    localStorage.clear();
    useSessionStore.setState({ ...useSessionStore.getInitialState(), step: "signin" }, true);
    vi.mocked(meetingsApi.listMeetings).mockResolvedValue([meeting()]);
    vi.mocked(meetingsApi.getMeeting).mockResolvedValue(meeting());
    vi.mocked(minutesApi.getMinutes).mockResolvedValue(doc());
    vi.mocked(minutesApi.getTranscript).mockResolvedValue([]);
    vi.mocked(minutesApi.listSuggestions).mockResolvedValue([]);
    vi.mocked(minutesApi.listAttendees).mockResolvedValue([]);
  });

  it("sends a signed-out visitor to the sign-in", () => {
    const router = renderApp("/moderator/editor");
    expect(router.state.location.pathname).toBe("/login");
    expect(screen.getByRole("heading", { name: "Sign in" })).toBeInTheDocument();
  });

  it("signs in with the keyboard and opens the latest minutes", async () => {
    vi.mocked(authApi.login).mockResolvedValue(ELENA);
    const user = userEvent.setup();
    const router = renderApp("/login");
    await user.type(screen.getByLabelText("Email"), ELENA.email);
    await user.type(screen.getByLabelText("Password"), "demo{Enter}");
    expect(authApi.login).toHaveBeenCalledWith(ELENA.email, "demo");
    await user.click(screen.getByRole("button", { name: /Moderator/ }));
    expect(await screen.findByRole("heading", { level: 1, name: "ICU round" })).toBeInTheDocument();
    expect(router.state.location.pathname).toBe("/moderator/editor/7");
    expect(screen.getByRole("button", { name: /Approve/ })).toBeEnabled();
  });

  it("edits a topic's block in place", async () => {
    useSessionStore.setState({ step: "in", user: ELENA, cabinet: "moderator" });
    const user = userEvent.setup();
    renderApp("/moderator/editor/7");
    await user.click(await screen.findByRole("button", { name: /Patient 1/ }));
    expect(screen.getByText("Creatinine 240")).toBeInTheDocument();
    await user.click(screen.getByRole("button", { name: "Edit" }));
    const item = screen.getByLabelText("Findings item 1");
    await user.type(item, " µmol/l{Enter}");
    expect(screen.getByLabelText("Findings item 1")).toHaveValue("Creatinine 240 µmol/l");
    expect(screen.getByLabelText("Findings item 2")).toHaveFocus();
    expect(screen.getByText("Unsaved changes")).toBeInTheDocument();
  });

  it("shows the processing view while a meeting is transcribed", async () => {
    useSessionStore.setState({ step: "in", user: ELENA, cabinet: "moderator" });
    vi.mocked(meetingsApi.getMeeting).mockResolvedValue(meeting({ status: "processing" }));
    vi.mocked(meetingsApi.getProgress).mockResolvedValue({
      status: "processing",
      error: null,
      queuePosition: null,
      stages: [
        { name: "upload", state: "done" },
        { name: "convert", state: "done", seconds: 2 },
        { name: "speakers", state: "running" },
        { name: "transcribe", state: "running", percent: 42 },
        { name: "minutes", state: "running" },
      ],
      lines: [{ start: 3, end: 7, speaker: "SPEAKER 2", text: "Bună dimineața." }],
      nextLine: 1,
      topics: 1,
    });
    renderApp("/moderator/editor/7");
    expect(await screen.findByText("Bună dimineața.")).toBeInTheDocument();
    expect(screen.getByText("42%")).toBeInTheDocument();
    expect(screen.getByText("1 topic so far")).toBeInTheDocument();
  });
});

describe("participant", () => {
  beforeEach(() => {
    vi.resetAllMocks();
    useSessionStore.setState({ step: "in", user: NATALIA, cabinet: "participant" });
    vi.mocked(meetingsApi.getMeeting).mockResolvedValue(meeting());
    vi.mocked(minutesApi.getMinutes).mockResolvedValue(doc());
    vi.mocked(minutesApi.getTranscript).mockResolvedValue([]);
    vi.mocked(minutesApi.listSuggestions).mockResolvedValue([]);
    vi.mocked(minutesApi.listAttendees).mockResolvedValue([]);
  });

  it("reads a draft topic and sends a suggestion", async () => {
    vi.mocked(minutesApi.sendSuggestion).mockResolvedValue({
      id: 1,
      topicId: "t1",
      author: NATALIA.name,
      kind: "Addition",
      text: "Call the family",
      state: "open",
      created: 0,
    });
    const user = userEvent.setup();
    renderApp("/participant/read/7");
    await user.click(await screen.findByRole("button", { name: /Patient 1/ }));
    expect(screen.queryByRole("button", { name: "Edit" })).not.toBeInTheDocument();
    await user.type(screen.getByLabelText("Suggestion"), "Call the family");
    await user.click(screen.getByRole("button", { name: /Send to moderator/ }));
    expect(minutesApi.sendSuggestion).toHaveBeenCalledWith(7, "t1", "Addition", "Call the family");
    expect(await screen.findByText(/1 sent/)).toBeInTheDocument();
  });
});

describe("approve and email", () => {
  beforeEach(() => {
    vi.resetAllMocks();
    useSessionStore.setState({ step: "in", user: ELENA, cabinet: "moderator" });
    vi.mocked(meetingsApi.getMeeting).mockResolvedValue(meeting());
    vi.mocked(minutesApi.getMinutes).mockResolvedValue({ ...doc(), attendees: [3] });
    vi.mocked(minutesApi.getTranscript).mockResolvedValue([]);
    vi.mocked(minutesApi.listSuggestions).mockResolvedValue([]);
    vi.mocked(minutesApi.listAttendees).mockResolvedValue([
      { id: 3, name: "Dr. Natalia Popescu", dept: "ATI" },
    ]);
  });

  it("lists who will be emailed, then follows the sending until done", async () => {
    const queued = {
      id: 1,
      userId: 3,
      name: "Dr. Natalia Popescu",
      email: "natalia.popescu@medpark.md",
      status: "queued" as const,
      error: null,
      created: 0,
      sent: null,
    };
    vi.mocked(minutesApi.approveMinutes).mockResolvedValue({ version: 1, deliveries: [queued] });
    vi.mocked(minutesApi.listDeliveries)
      .mockResolvedValueOnce([queued])
      .mockResolvedValue([{ ...queued, status: "sent", sent: 1 }]);
    const user = userEvent.setup();
    renderApp("/moderator/editor/7");
    await user.click(await screen.findByRole("button", { name: "Approve" }));
    expect(screen.getByText(/email 1 attendee/)).toBeInTheDocument();
    expect(screen.getByText("Dr. Natalia Popescu")).toBeInTheDocument();
    vi.mocked(meetingsApi.getMeeting).mockResolvedValue(
      meeting({ status: "approved", approved: 1790000000 }),
    );
    await user.click(screen.getByRole("button", { name: /Approve & send/ }));
    expect(
      await screen.findByText(/Emailed to 1 attendee/, undefined, { timeout: 4000 }),
    ).toBeInTheDocument();
  });
});
