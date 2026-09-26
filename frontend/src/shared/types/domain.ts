/** Domain model of the app. Meetings and minutes come from the API (src/api/types.ts); the admin screens still use
 * src/mocks. */

export type Cabinet = "admin" | "moderator" | "participant";
export type Lang = "en" | "ro" | "ru";
export type MeetingType = "Medical" | "Executive" | "Administrative";

export type ModeratorScreen = "meetings" | "new" | "editor";
export type ParticipantScreen = "moms" | "read" | "tasks";
export type AdminScreen = "users" | "roles" | "security" | "templates" | "routing";
export type Screen = ModeratorScreen | ParticipantScreen | AdminScreen | "account";

/** A person in the user administration list. */
export interface DirectoryUser {
  name: string;
  email: string;
  dept: string;
  cabinets: Cabinet[];
  twoFa: "on" | "setup";
}

export type MeetingStatusTone = "warn" | "info" | "ok" | "danger";

export type CodeSystem = "ICD-10" | "ACHI";

/** A catalog entry: a code plus search terms in RO / RU. */
export interface CatalogCode {
  system: CodeSystem;
  code: string;
  label: string;
  terms: string;
}

/** Minutes navigation: the overview, a topic, or one of the general sections. */
export type MinutesSection =
  | { kind: "overview" }
  | { kind: "topic"; id: string }
  | { kind: "participants" }
  | { kind: "next" };

export interface Task {
  id: string;
  text: string;
  from: string;
  due: string;
}

export interface AuditEvent {
  time: string;
  text: string;
  tone: "default" | "danger" | "warn";
}

export interface RoutingRule {
  type: MeetingType;
  list: string;
  recipients: number;
  emails: string;
  rule: string;
}

export type TwoFaPolicy = "all" | "staff" | "optional";

export interface TwoFaMethod {
  label: string;
  hint: string;
}

export interface Session {
  label: string;
  current: boolean;
}
