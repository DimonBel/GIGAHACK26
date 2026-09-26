import { create } from "zustand";

import { ApiError } from "@/api/client";
import { listMeetings, type Meeting } from "@/api/meetings";
import type { MeetingType } from "@/shared/types/domain";

export type MeetingFilter = "All" | MeetingType;

interface MeetingsState {
  meetings: Meeting[];
  loaded: boolean;
  error: string | null;
  filter: MeetingFilter;
  load: () => Promise<void>;
  setFilter: (filter: MeetingFilter) => void;
  reset: () => void;
}

export const useMeetingsStore = create<MeetingsState>()((set) => ({
  meetings: [],
  loaded: false,
  error: null,
  filter: "All",

  load: async () => {
    try {
      set({ meetings: await listMeetings(), loaded: true, error: null });
    } catch (e) {
      set({ loaded: true, error: e instanceof ApiError ? e.message : "Could not load the meetings." });
    }
  },
  setFilter: (filter) => set({ filter }),
  reset: () => set({ meetings: [], loaded: false, error: null }),
}));

/** Still queued or being processed: the list keeps refreshing while one of these is shown. */
export const isBusy = (m: Pick<Meeting, "status">) => m.status === "queued" || m.status === "processing";

/** Minutes exist (draft or approved). */
export const isReady = (m: Pick<Meeting, "status">) => m.status === "draft" || m.status === "approved";
