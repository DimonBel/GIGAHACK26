/** Models of the Secure MOM API (docs/api.md). */

export type Role = 'admin' | 'moderator' | 'user';

export interface User {
  id: number;
  email: string;
  full_name: string;
  position: string;
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
  role: Role;
  password: string;
}

export type UserUpdate = Partial<Pick<User, 'full_name' | 'position' | 'role' | 'active'>> & {
  password?: string;
};

export interface DirectoryEntry {
  id: number;
  full_name: string;
  position: string;
  email: string;
}

export type MeetingType = 'medical' | 'executive' | 'administrative';
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
  deadline: string;
  priority: Priority;
  time: string;
  patient: string;
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
  suggestions: string[];
  key_moments: KeyMoment[];
  topics: Topic[];
  decisions: Decision[];
  action_items: ActionItem[];
  open_issues: string[];
  warnings: string[];
  participants: Record<string, Participant>;
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
