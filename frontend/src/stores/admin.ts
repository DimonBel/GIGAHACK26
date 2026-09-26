import { create } from "zustand";

import { PERMISSION_MATRIX, TEMPLATES, TWO_FA_METHODS_ON } from "@/mocks/admin";
import { USERS } from "@/mocks/users";
import type { Cabinet, DirectoryUser, MeetingType, TwoFaPolicy } from "@/shared/types/domain";

interface AdminState {
  users: DirectoryUser[];
  permissions: boolean[][];
  policy: TwoFaPolicy;
  methods: boolean[];
  templates: Record<MeetingType, boolean[]>;
  templateType: MeetingType;

  toggleCabinet: (email: string, cabinet: Cabinet) => void;
  resetTwoFa: (email: string) => void;
  togglePermission: (row: number, column: number) => void;
  setPolicy: (policy: TwoFaPolicy) => void;
  toggleMethod: (index: number) => void;
  setTemplateType: (type: MeetingType) => void;
  toggleBlock: (index: number) => void;
}

const flip = (list: boolean[], index: number) => list.map((on, i) => (i === index ? !on : on));

export const useAdminStore = create<AdminState>()((set) => ({
  users: USERS,
  permissions: PERMISSION_MATRIX,
  policy: "all",
  methods: TWO_FA_METHODS_ON,
  templates: TEMPLATES,
  templateType: "Medical",

  toggleCabinet: (email, cabinet) =>
    set((s) => ({
      users: s.users.map((u) =>
        u.email !== email
          ? u
          : {
              ...u,
              cabinets: u.cabinets.includes(cabinet)
                ? u.cabinets.filter((c) => c !== cabinet)
                : [...u.cabinets, cabinet],
            },
      ),
    })),
  resetTwoFa: (email) =>
    set((s) => ({ users: s.users.map((u) => (u.email === email ? { ...u, twoFa: "setup" } : u)) })),
  togglePermission: (row, column) =>
    set((s) => ({ permissions: s.permissions.map((r, i) => (i === row ? flip(r, column) : r)) })),
  setPolicy: (policy) => set({ policy }),
  toggleMethod: (index) => set((s) => ({ methods: flip(s.methods, index) })),
  setTemplateType: (templateType) => set({ templateType }),
  toggleBlock: (index) =>
    set((s) => ({ templates: { ...s.templates, [s.templateType]: flip(s.templates[s.templateType], index) } })),
}));
