import { create } from "zustand";

import { MY_TASKS_DONE } from "@/mocks/tasks";

interface TasksState {
  done: string[];
  toggle: (id: string) => void;
}

export const useTasksStore = create<TasksState>()((set) => ({
  done: MY_TASKS_DONE,
  toggle: (id) => set((s) => ({ done: s.done.includes(id) ? s.done.filter((d) => d !== id) : [...s.done, id] })),
}));
