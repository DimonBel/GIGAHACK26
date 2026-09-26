import { create } from "zustand";

import { PIPELINE } from "@/mocks/meetings";

const STAGE_MS = 900;
const TICK_MS = 1000;

interface ProcessingState {
  /** -1 = not started, 0..n-1 = running that stage, n = done. */
  stage: number;
  recording: boolean;
  recordedSeconds: number;
  /** Simulated processing: one stage every 900 ms. */
  start: () => void;
  /** Start recording, or stop it and process the recording. */
  toggleRecording: () => void;
  stop: () => void;
}

// Timers live with the store, not a component: processing keeps running while you look at another screen.
let stageTimer: ReturnType<typeof setInterval> | undefined;
let recordTimer: ReturnType<typeof setInterval> | undefined;

export const STAGE_COUNT = PIPELINE.length;

export const useProcessingStore = create<ProcessingState>()((set, get) => ({
  stage: -1,
  recording: false,
  recordedSeconds: 0,

  start: () => {
    clearInterval(stageTimer);
    set({ stage: 0 });
    stageTimer = setInterval(() => {
      const { stage } = get();
      if (stage >= STAGE_COUNT) clearInterval(stageTimer);
      else set({ stage: stage + 1 });
    }, STAGE_MS);
  },
  toggleRecording: () => {
    if (get().recording) {
      clearInterval(recordTimer);
      set({ recording: false });
      get().start();
      return;
    }
    set({ recording: true, recordedSeconds: 0 });
    recordTimer = setInterval(() => set((s) => ({ recordedSeconds: s.recordedSeconds + 1 })), TICK_MS);
  },
  stop: () => {
    clearInterval(stageTimer);
    clearInterval(recordTimer);
  },
}));
