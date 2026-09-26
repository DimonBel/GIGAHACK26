import { create } from "zustand";

import type { MeetingType } from "@/shared/types/domain";

export type MeetingFilter = "All" | MeetingType;

interface MeetingsState {
  filter: MeetingFilter;
  newType: MeetingType;
  setFilter: (filter: MeetingFilter) => void;
  setNewType: (type: MeetingType) => void;
}

export const useMeetingsStore = create<MeetingsState>()((set) => ({
  filter: "All",
  newType: "Medical",
  setFilter: (filter) => set({ filter }),
  setNewType: (newType) => set({ newType }),
}));
