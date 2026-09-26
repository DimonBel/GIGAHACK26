/** Domain model of the Verbal minutes app. The backend will serve these shapes; for now src/mocks does. */

export type Cabinet = "admin" | "moderator" | "participant";
export type Lang = "en" | "ro" | "ru";
export type MeetingType = "Medical" | "Executive" | "Administrative";

export type ModeratorScreen = "meetings" | "new" | "editor";
export type ParticipantScreen = "moms" | "read" | "tasks";
export type AdminScreen = "users" | "roles" | "security" | "templates" | "routing";
export type Screen = ModeratorScreen | ParticipantScreen | AdminScreen | "account";

/** A directory account that can sign in. */
export interface Account {
  email: string;
  name: string;
  initials: string;
  dept: string;
  cabinets: Cabinet[];
  /** 2FA not set up yet: sign-in continues with the setup step instead of the code step. */
  needsTwoFaSetup: boolean;
}

/** A person in the user administration list. */
export interface DirectoryUser {
  name: string;
  email: string;
  dept: string;
  cabinets: Cabinet[];
  twoFa: "on" | "setup";
}

export type MeetingStatusTone = "warn" | "info" | "ok";

export interface Meeting {
  id: string;
  title: string;
  type: MeetingType;
  date: string;
  length: string;
  topicCount: number;
  status: string;
  statusTone: MeetingStatusTone;
  /** Still being transcribed: only moderators see it. */
  processing: boolean;
  langs: string;
}

export type CodeSystem = "ICD-10" | "ACHI";

export interface Code {
  system: CodeSystem;
  code: string;
  label: string;
}

/** A catalog entry: a code plus search terms in RO / RU. */
export interface CatalogCode extends Code {
  terms: string;
}

export interface PointOfView {
  id: string;
  name: string;
  text: string;
}

export interface ActionItem {
  id: string;
  text: string;
  owner: string;
  /** ISO date, yyyy-mm-dd */
  due: string;
}

export interface AttentionPoint {
  id: string;
  text: string;
}

export type SuggestionKind = "Point of view" | "Task" | "Attention point" | "Diagnosis";

export interface Suggestion {
  id: string;
  from: string;
  kind: SuggestionKind;
  text: string;
  code?: Code;
}

export interface TranscriptLine {
  who: string;
  ts: string;
  langs: string;
  text: string;
}

export interface Topic {
  id: string;
  title: string;
  tag: MeetingType;
  time: string;
  summary: string;
  views: PointOfView[];
  actions: ActionItem[];
  attention: AttentionPoint[];
  codes: Code[];
  drg: string;
  drgLabel: string;
  suggestions: Suggestion[];
  transcript: TranscriptLine[];
}

/** Minutes navigation: a topic id, or one of the general sections. */
export type MinutesSection = { kind: "topic"; id: string } | { kind: "participants" } | { kind: "next" };

export interface Attendee {
  name: string;
  dept: string;
  role: "Moderator" | "Participant";
}

export interface NextMeeting {
  date: string;
  time: string;
  place: string;
  agenda: string;
}

export interface Task {
  id: string;
  text: string;
  from: string;
  due: string;
}

export interface PipelineStep {
  name: string;
  duration: string;
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
