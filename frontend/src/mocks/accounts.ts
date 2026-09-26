import type { Account } from "@/shared/types/domain";

/** Accounts that can sign in (the on-prem directory). */
export const ACCOUNTS: Account[] = [
  { email: "elena.rusu@medpark.md", name: "Dr. Elena Rusu", initials: "ER", dept: "Cardiologie", cabinets: ["moderator", "participant"], needsTwoFaSetup: false },
  { email: "ion.bivol@medpark.md", name: "Ion Bivol", initials: "IB", dept: "IT & Securitate", cabinets: ["admin", "moderator"], needsTwoFaSetup: false },
  { email: "natalia.popescu@medpark.md", name: "Dr. Natalia Popescu", initials: "NP", dept: "ATI", cabinets: ["participant"], needsTwoFaSetup: false },
  { email: "igor.munteanu@medpark.md", name: "Dr. Igor Munteanu", initials: "IM", dept: "Imagistică", cabinets: ["participant"], needsTwoFaSetup: true },
];

/** Quick-pick chips under the sign-in form. */
export const DEMO_ACCOUNTS = [
  { email: "elena.rusu@medpark.md", name: "Elena Rusu", cabinets: "Moderator + Participant" },
  { email: "ion.bivol@medpark.md", name: "Ion Bivol", cabinets: "Admin + Moderator" },
  { email: "natalia.popescu@medpark.md", name: "Natalia Popescu", cabinets: "Participant" },
  { email: "igor.munteanu@medpark.md", name: "Igor Munteanu", cabinets: "2FA not set up" },
];

export const DEFAULT_EMAIL = "elena.rusu@medpark.md";
export const BACKUP_CODE = "48219930";
export const TOTP_SETUP_KEY = "JBSW Y3DP EHPK 3PXP";
