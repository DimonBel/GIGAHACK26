import { create } from "zustand";

interface AccountState {
  showBackupCodes: boolean;
  revoked: number[];
  toggleBackupCodes: () => void;
  revoke: (session: number) => void;
}

export const useAccountStore = create<AccountState>()((set) => ({
  showBackupCodes: false,
  revoked: [],
  toggleBackupCodes: () => set((s) => ({ showBackupCodes: !s.showBackupCodes })),
  revoke: (session) => set((s) => ({ revoked: s.revoked.includes(session) ? s.revoked : [...s.revoked, session] })),
}));
