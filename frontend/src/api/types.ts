/** Shapes of the HTTP API (server/api/schemas.py), as JSON. */
import type { Cabinet } from "@/shared/types/domain";

export type ApiMeetingType = "medical" | "executive" | "administrative";
export type Language = "auto" | "ro" | "ru" | "en";
export type MeetingStatus = "queued" | "processing" | "draft" | "approved" | "failed";
export type StageName = "upload" | "convert" | "speakers" | "transcribe" | "minutes";
export type StageState = "waiting" | "running" | "done" | "skipped" | "failed";

export interface User {
  id: number;
  email: string;
  name: string;
  initials: string;
  dept: string;
  cabinets: Cabinet[];
}

export interface ApiMeeting {
  id: number;
  title: string;
  type: ApiMeetingType;
  language: Language;
  speakers: number | null;
  status: MeetingStatus;
  error: string | null;
  /** Seconds of audio. */
  duration: number | null;
  topicCount: number | null;
  /** Unix seconds. */
  created: number;
  createdBy: string | null;
  approved: number | null;
  approvedBy: string | null;
  hasTranscript: boolean;
  queuePosition: number | null;
  /** Transcription progress in %, while processing. */
  progress: number | null;
}

export interface Stage {
  name: StageName;
  state: StageState;
  seconds?: number | null;
  percent?: number | null;
  detail?: string | null;
}

/** One line of the speaker dialog; start / end in seconds. */
export interface Line {
  start: number;
  end: number;
  speaker: string;
  text: string;
}

export interface Progress {
  status: MeetingStatus;
  error: string | null;
  queuePosition: number | null;
  stages: Stage[];
  lines: Line[];
  nextLine: number;
  topics: number;
}

// --- the minutes document ---

export interface ListItem {
  id: string;
  text: string;
  /** "03:52" — where it was said. */
  time?: string | null;
  who?: string | null;
  /** Values the transcript does not contain (checked by the server). */
  unverified?: string | null;
}

export type Priority = "high" | "medium" | "low";

export interface TaskItem {
  id: string;
  text: string;
  owner: string;
  deadline: string;
  priority: Priority;
  time?: string | null;
  unverified?: string | null;
  done: boolean;
}

export interface CodeItem {
  id: string;
  system: string;
  code: string;
  label: string;
}

export interface TextBlock {
  id: string;
  kind: "text";
  label: string;
  text: string;
}
export interface ListBlock {
  id: string;
  kind: "list";
  label: string;
  items: ListItem[];
}
export interface TasksBlock {
  id: string;
  kind: "tasks";
  label: string;
  items: TaskItem[];
}
export interface CodesBlock {
  id: string;
  kind: "codes";
  label: string;
  items: CodeItem[];
}
export type Block = TextBlock | ListBlock | TasksBlock | CodesBlock;
export type BlockKind = Block["kind"];

export interface Topic {
  id: string;
  title: string;
  time?: string | null;
  blocks: Block[];
}

export interface KeyMoment {
  time: string;
  text: string;
}

/** A detected voice, and who it is (the AI's guess until the moderator names them). */
export interface Participant {
  speaker: string;
  name: string;
  role: string;
  seconds: number;
}

export interface NextMeeting {
  date: string;
  time: string;
  place: string;
  agenda: string;
}

export interface MinutesDoc {
  version: number;
  title: string;
  summary: string;
  keyMoments: KeyMoment[];
  aiSuggestions: string[];
  warnings: string[];
  participants: Participant[];
  topics: Topic[];
  next: NextMeeting;
  /** Directory user ids of who attended; they get the minutes by email when approved. */
  attendees: number[];
}

/** A person who attended (names only; everyone who can open the minutes sees them). */
export interface Attendee {
  id: number;
  name: string;
  dept: string;
}

/** The email of the approved minutes to one attendee, sent through the local relay. */
export interface Delivery {
  id: number;
  userId: number | null;
  name: string | null;
  email: string;
  status: "queued" | "sent" | "failed";
  error: string | null;
  created: number;
  sent: number | null;
}

export interface Suggestion {
  id: number;
  topicId: string;
  author: string | null;
  kind: string;
  text: string;
  state: "open" | "accepted" | "declined";
  created: number;
}
