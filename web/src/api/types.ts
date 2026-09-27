/** Models of the Secure MOM API (docs/api.md). */

export type Role = 'admin' | 'moderator' | 'user';

export interface User {
  id: number;
  email: string;
  full_name: string;
  /** e.g. "doctor". */
  position: string;
  /** e.g. "neurologist". */
  specialty: string;
  /** The function, e.g. "vice president". */
  job_title: string;
  role: Role;
  active: boolean;
  /** Someone else (an admin) chose the password: the user must change it before anything else. */
  must_change_password: boolean;
  created_at: string;
}

export interface Session {
  user: User;
  csrf_token: string;
}

export interface UserCreate {
  email: string;
  full_name: string;
  position: string;
  specialty: string;
  job_title: string;
  role: Role;
  password: string;
}

export type UserUpdate = Partial<
  Pick<User, 'full_name' | 'position' | 'specialty' | 'job_title' | 'role' | 'active'>
> & {
  password?: string;
};

export interface DirectoryEntry {
  id: number;
  full_name: string;
  position: string;
  specialty: string;
  job_title: string;
  email: string;
}

export type MeetingType = 'medical' | 'executive' | 'administrative';
/** The language the minutes are written in. */
export type MinutesLanguage = 'ro' | 'ru' | 'en';
export type RecipientKind = 'to' | 'cc';

export interface ListMember {
  user_id: number | null;
  email: string;
  name: string;
  kind: RecipientKind;
}

export interface DistributionList {
  id: number;
  name: string;
  meeting_type: MeetingType | null;
  members: ListMember[];
}

export interface ListMemberInput {
  user_id?: number;
  email?: string;
  kind: RecipientKind;
}

export interface DistributionListInput {
  name: string;
  meeting_type: MeetingType | null;
  members: ListMemberInput[];
}

export type AsrEngine = 'mlx' | 'whisper.cpp';
export type Delivery = 'n8n' | 'smtp';

export interface Settings {
  asr_engine: AsrEngine;
  asr_model: string;
  llm_model: string;
  language: string;
  delivery: Delivery;
  n8n_webhook_url: string;
  smtp_host: string;
  smtp_port: number;
  mail_from: string;
  /** The domains minutes may be sent to; empty: any. */
  allowed_recipient_domains: string[];
  keep_audio_days: number;
  max_upload_mb: number;
  max_duration_min: number;
}

export type MeetingStatus = 'queued' | 'processing' | 'ready' | 'approved' | 'sent' | 'failed';
export type ProgressStage = 'queued' | 'converting' | 'transcribing' | 'speakers' | 'minutes' | 'done';

export interface Progress {
  stage: ProgressStage;
  done: number;
  total: number;
  message: string;
}

export interface Timings {
  transcription_s: number | null;
  minutes_s: number | null;
  total_s: number | null;
}

/** One line of the transcript as it is heard live, before the transcript is final. */
export interface LiveLine {
  start: number;
  end: number;
  /** "" until speakers are known. */
  speaker: string;
  languages: string[];
  /** English accent ("American"), when the server detected one. */
  accent?: string;
  text: string;
}

/** What the server has heard and found so far while a meeting is queued or processing. */
export interface LiveProcessing {
  /** The newest lines, at most 40, oldest first. */
  lines: LiveLine[];
  /** Lines heard so far (can be more than lines.length): for the counter. */
  total: number;
  /** Speaker labels are known; before that every line's speaker is "". */
  speakers: boolean;
  /** Topic names the minutes found so far, in order. */
  topics: string[];
  decisions: number;
  tasks: number;
}

export interface PersonRef {
  id: number;
  full_name: string;
}

export interface Recipients {
  to: string[];
  cc: string[];
}

export interface Meeting {
  id: string;
  title: string;
  meeting_type: MeetingType;
  status: MeetingStatus;
  progress: Progress | null;
  created_by: PersonRef;
  created_at: string;
  duration_s: number | null;
  language: string | null;
  minutes_language: MinutesLanguage;
  /** The recording is kept on the server and can be played. */
  has_audio: boolean;
  error: string | null;
  approved_by: PersonRef | null;
  approved_at: string | null;
  sent_at: string | null;
  timings: Timings | null;
  /** Who the minutes were sent to; optional, shown when the server provides it. */
  recipients?: Recipients | null;
}

export interface Utterance {
  start: number;
  end: number;
  speaker: string;
  role?: string;
  languages: string[];
  /** English accent ("American"), when the server detected one. */
  accent?: string;
  text: string;
}

export interface Transcript {
  language: string;
  utterances: Utterance[];
}

export interface KeyMoment {
  time: string;
  moment: string;
}

export interface Topic {
  name: string;
  time: string;
  status: string;
  findings: string[];
}

export interface Decision {
  decision: string;
  time: string;
  patient: string;
}

export type Priority = 'high' | 'medium' | 'low';

export interface ActionItem {
  task: string;
  owner: string;
  /** The owner when the moderator assigned it to one of the app's users. */
  owner_user_id?: number | null;
  deadline: string;
  priority: Priority;
  time: string;
  patient: string;
}

/** Someone present at the meeting, also if they did not speak; user_id null: not a user of the app. */
export interface Attendee {
  user_id: number | null;
  name: string;
  job_title: string;
  position: string;
  specialty: string;
}

export interface Participant {
  role: string;
  name: string;
  seconds: number;
  evidence?: string;
}

export interface Minutes {
  title: string;
  summary: string;
  key_moments: KeyMoment[];
  topics: Topic[];
  decisions: Decision[];
  action_items: ActionItem[];
  open_issues: string[];
  warnings: string[];
  /** Everyone present; the moderator adds them (the recording only knows the voices). */
  attendees: Attendee[];
  participants: Record<string, Participant>;
}

/** The email the minutes are sent as, rendered by the server from the minutes as they are now. */
export interface EmailPreview {
  subject: string;
  language: MinutesLanguage;
  html: string;
  text: string;
  /** File name of the minutes' PDF the email carries. */
  attachment: string;
}

/** A part of the minutes (in the email, the preview and the print), in the order a template lists them. */
export type TemplateSection =
  | 'summary'
  | 'key_moments'
  | 'topics'
  | 'other_decisions'
  | 'action_items'
  | 'open_issues'
  | 'attendees'
  | 'participants'
  | 'warnings';

/** How the minutes of one meeting type are written and shown; every save is a new version. Version 0 is the
 *  built-in default (created_by and created_at null). */
export interface MinutesTemplate {
  meeting_type: MeetingType;
  version: number;
  /** Every section exactly once, in display order. */
  sections: { key: TemplateSection; enabled: boolean }[];
  /** What each topic shows. */
  topic_fields: { status: boolean; findings: boolean; decisions: boolean };
  /** Extra instructions for the local AI that writes the minutes (at most 1000 characters). */
  instructions: string;
  /** What changed in this version. */
  note: string;
  created_by: PersonRef | null;
  created_at: string | null;
}

export interface TemplateInput {
  sections: MinutesTemplate['sections'];
  topic_fields: MinutesTemplate['topic_fields'];
  instructions: string;
  note: string;
}

export interface AuditEntry {
  id: number;
  at: string;
  /** Email of who did it (for a failed login, the email that was tried). */
  user: string | null;
  action: string;
  meeting_id: string | null;
  detail: string;
}
