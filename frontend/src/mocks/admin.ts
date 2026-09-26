import type { AuditEvent, MeetingType, RoutingRule, Session, TwoFaMethod, TwoFaPolicy } from "@/shared/types/domain";

/** Rows of the permission matrix; columns are admin / moderator / participant. */
export const PERMISSIONS = [
  "Manage users & cabinet access",
  "Upload or record meetings",
  "Edit minutes by topic",
  "Approve & send minutes",
  "Read minutes",
  "Suggest additions",
  "View transcripts",
  "Configure templates & routing",
  "View security log",
];

export const PERMISSION_MATRIX: boolean[][] = [
  [true, false, false],
  [true, true, false],
  [true, true, false],
  [true, true, false],
  [true, true, true],
  [true, true, true],
  [true, true, false],
  [true, false, false],
  [true, false, false],
];

export const TWO_FA_POLICIES: { value: TwoFaPolicy; label: string }[] = [
  { value: "all", label: "All users" },
  { value: "staff", label: "Admins & moderators" },
  { value: "optional", label: "Optional" },
];

export const TWO_FA_METHODS: TwoFaMethod[] = [
  { label: "Authenticator app (TOTP)", hint: "Works offline" },
  { label: "Backup codes", hint: "8 single-use codes per user" },
  { label: "Hardware key (FIDO2)", hint: "USB keys issued by IT" },
];

export const TWO_FA_METHODS_ON = [true, true, false];

export const SESSION_TIMEOUTS = ["30 minutes", "1 hour", "4 hours"];
export const LOCKOUT_OPTIONS = ["5 failed attempts", "3 failed attempts"];

export const AUDIT_LOG: AuditEvent[] = [
  { time: "10:21", text: "N. Popescu signed in · TOTP", tone: "default" },
  { time: "09:40", text: "E. Rusu signed in · TOTP", tone: "default" },
  { time: "08:12", text: "I. Bivol granted Moderator to V. Ciobanu", tone: "default" },
  { time: "08:11", text: "Failed 2FA · igor.munteanu · WS-B214", tone: "danger" },
  { time: "08:10", text: "Failed 2FA · igor.munteanu · WS-B214", tone: "danger" },
  { time: "07:55", text: "A. Cebotari signed in · backup code", tone: "warn" },
];

/** Blocks the LLM fills inside every topic, and which are on per meeting type. */
export const TEMPLATE_BLOCKS = [
  "Summary",
  "Points of view",
  "Decisions & tasks",
  "Needs attention",
  "Diagnosis · procedures · DRG",
  "Budget impact",
];

export const TEMPLATES: Record<MeetingType, boolean[]> = {
  Medical: [true, true, true, true, true, false],
  Executive: [true, true, true, true, false, true],
  Administrative: [true, false, true, true, false, false],
};

export const ROUTING: RoutingRule[] = [
  { type: "Medical", list: "Consiliu medical", recipients: 9, emails: "consiliu.medical@ · sef.sectie.*@ · attendees", rule: "Send after moderator approval" },
  { type: "Executive", list: "Comitet executiv", recipients: 7, emails: "board@ · cfo@ · director.medical@", rule: "Send after approval · no transcript attached" },
  { type: "Administrative", list: "Administrație", recipients: 14, emails: "admin.staff@ · hr@ · attendees", rule: "Auto-send 15 min after draft" },
];

export const SMTP_RELAY = "smtp://127.0.0.1:1025";
export const ROUTING_NOTE = "· local Mailpit (inbox http://127.0.0.1:8025) · external SMTP blocked";

export const SESSIONS: Session[] = [
  { label: "This workstation · WS-C102 · now", current: true },
  { label: "Tablet · Sala de consilii · 2 h ago", current: false },
];

export const BACKUP_CODES = ["4821-9930", "7712-0458", "3306-8124", "9051-6677", "1289-4410", "6634-2071"];
export const TWO_FA_ADDED = "Authenticator app · added 12.03.2026";
