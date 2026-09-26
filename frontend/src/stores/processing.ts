import { create } from "zustand";

import { ApiError } from "@/api/client";
import { createMeeting, getProgress, retryMeeting, type Meeting, type NewMeeting } from "@/api/meetings";
import type { Line, Progress } from "@/api/types";

const POLL_MS = 1000;
const RETRY_MS = 3000;

interface ProcessingState {
  /** The upload of a new meeting, while it runs. */
  upload: { name: string; fraction: number } | null;
  uploadError: string | null;
  /** The meeting whose processing is followed (the processing view), its progress and transcript so far. */
  watching: number | null;
  progress: Progress | null;
  lines: Line[];
  pollError: string | null;

  /** Uploads the recording; the server queues it. Returns the new meeting, or null on failure. */
  create: (meeting: NewMeeting) => Promise<Meeting | null>;
  watch: (meetingId: number) => void;
  unwatch: () => void;
  retry: (meetingId: number) => Promise<void>;
}

// One poll loop at a time; a new watch() (or unwatch) makes an older loop stop at its next step.
let timer: ReturnType<typeof setTimeout> | undefined;
let generation = 0;

const finished = (p: Progress) => p.status !== "queued" && p.status !== "processing";

export const useProcessingStore = create<ProcessingState>()((set, get) => {
  async function poll(meetingId: number, gen: number) {
    try {
      const p = await getProgress(meetingId, get().lines.length);
      if (gen !== generation) return;
      set((s) => ({
        progress: p,
        lines: p.lines.length ? [...s.lines, ...p.lines] : s.lines,
        pollError: null,
      }));
      if (!finished(p)) timer = setTimeout(() => void poll(meetingId, gen), POLL_MS);
    } catch (e) {
      if (gen !== generation) return;
      set({ pollError: e instanceof ApiError ? e.message : "Lost the connection to the server." });
      timer = setTimeout(() => void poll(meetingId, gen), RETRY_MS);
    }
  }

  return {
    upload: null,
    uploadError: null,
    watching: null,
    progress: null,
    lines: [],
    pollError: null,

    create: async (meeting) => {
      set({ upload: { name: meeting.file.name, fraction: 0 }, uploadError: null });
      try {
        const created = await createMeeting(meeting, (fraction) =>
          set({ upload: { name: meeting.file.name, fraction } }),
        );
        set({ upload: null });
        return created;
      } catch (e) {
        set({ upload: null, uploadError: e instanceof ApiError ? e.message : "The upload failed." });
        return null;
      }
    },
    watch: (meetingId) => {
      const { watching, progress } = get();
      if (watching === meetingId && (!progress || !finished(progress))) return; // already following it
      clearTimeout(timer);
      generation += 1;
      set({ watching: meetingId, progress: null, lines: [], pollError: null });
      void poll(meetingId, generation);
    },
    unwatch: () => {
      clearTimeout(timer);
      timer = undefined;
      generation += 1;
      set({ watching: null, progress: null, lines: [], pollError: null });
    },
    retry: async (meetingId) => {
      try {
        await retryMeeting(meetingId);
      } catch (e) {
        set({ pollError: e instanceof ApiError ? e.message : "Could not retry." });
        return;
      }
      clearTimeout(timer);
      timer = undefined;
      set({ watching: null });
      get().watch(meetingId);
    },
  };
});
