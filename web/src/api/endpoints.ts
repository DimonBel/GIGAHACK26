/** One typed function per endpoint of docs/api.md. */
import { apiUrl, request, upload, type UploadOptions } from './client';
import type {
  AuditEntry,
  DirectoryEntry,
  EmailPreview,
  DistributionList,
  DistributionListInput,
  LiveProcessing,
  Meeting,
  MeetingType,
  Minutes,
  MinutesLanguage,
  MinutesTemplate,
  Recipients,
  Session,
  Settings,
  TemplateInput,
  Transcript,
  User,
  UserCreate,
  UserUpdate,
} from './types';

export interface NewMeeting {
  file: File;
  meetingType: MeetingType;
  minutesLanguage: MinutesLanguage;
  title: string;
}

const meetingPath = (id: string, rest = '') => `/meetings/${encodeURIComponent(id)}${rest}`;

/** Minutes with every field present: they are written by an LLM, and a missing list must not break a page. */
function completeMinutes(minutes: Partial<Minutes>): Minutes {
  return {
    title: minutes.title ?? '',
    summary: minutes.summary ?? '',
    key_moments: minutes.key_moments ?? [],
    topics: minutes.topics ?? [],
    decisions: minutes.decisions ?? [],
    action_items: minutes.action_items ?? [],
    open_issues: minutes.open_issues ?? [],
    warnings: minutes.warnings ?? [],
    attendees: minutes.attendees ?? [],
    participants: minutes.participants ?? {},
  };
}

export const authApi = {
  login: (email: string, password: string) =>
    request<Session>('/auth/login', { method: 'POST', body: { email, password }, expectUnauthorized: true }),
  logout: () => request<void>('/auth/logout', { method: 'POST', expectUnauthorized: true }),
  me: () => request<Session>('/auth/me', { expectUnauthorized: true }),
  changePassword: (current: string, next: string) =>
    request<Session>('/auth/password', { method: 'POST', body: { current, new: next } }),
};

export const usersApi = {
  list: () => request<User[]>('/users'),
  create: (input: UserCreate) => request<User>('/users', { method: 'POST', body: input }),
  update: (id: number, input: UserUpdate) => request<User>(`/users/${id}`, { method: 'PATCH', body: input }),
  deactivate: (id: number) => request<void>(`/users/${id}`, { method: 'DELETE' }),
  directory: () => request<DirectoryEntry[]>('/directory'),
  recipientDomains: () => request<string[]>('/directory/domains'),
};

export const listsApi = {
  list: () => request<DistributionList[]>('/lists'),
  create: (input: DistributionListInput) => request<DistributionList>('/lists', { method: 'POST', body: input }),
  update: (id: number, input: DistributionListInput) =>
    request<DistributionList>(`/lists/${id}`, { method: 'PATCH', body: input }),
  remove: (id: number) => request<void>(`/lists/${id}`, { method: 'DELETE' }),
};

export const settingsApi = {
  get: () => request<Settings>('/settings'),
  update: (input: Settings) => request<Settings>('/settings', { method: 'PUT', body: input }),
};

export const meetingsApi = {
  list: () => request<Meeting[]>('/meetings'),
  get: (id: string) => request<Meeting>(meetingPath(id)),
  create: ({ file, meetingType, minutesLanguage, title }: NewMeeting, options?: UploadOptions) => {
    const form = new FormData();
    form.append('file', file, file.name);
    form.append('meeting_type', meetingType);
    form.append('minutes_language', minutesLanguage);
    if (title.trim()) form.append('title', title.trim());
    return upload<Meeting>('/meetings', form, options);
  },
  /** What has been heard and found so far, while the meeting is queued or processing; polled by useLiveProcessing. */
  live: (id: string) => request<LiveProcessing>(meetingPath(id, '/live')),
  transcript: (id: string) => request<Transcript>(meetingPath(id, '/transcript')),
  minutes: async (id: string) => completeMinutes(await request<Partial<Minutes>>(meetingPath(id, '/minutes'))),
  saveMinutes: async (id: string, minutes: Minutes) =>
    completeMinutes(await request<Partial<Minutes>>(meetingPath(id, '/minutes'), { method: 'PUT', body: minutes })),
  approve: (id: string) => request<Meeting>(meetingPath(id, '/approve'), { method: 'POST' }),
  reopen: (id: string) => request<Meeting>(meetingPath(id, '/reopen'), { method: 'POST' }),
  /** note: the moderator's own email text; empty for the default note. */
  send: (id: string, recipients: Recipients, note = '') =>
    request<Meeting>(meetingPath(id, '/send'), { method: 'POST', body: { ...recipients, note } }),
  remove: (id: string) => request<void>(meetingPath(id), { method: 'DELETE' }),
  audioUrl: (id: string) => apiUrl(meetingPath(id, '/audio')),
  /** The minutes as the PDF that is emailed (one page), or full: every topic with its details (the moderator's);
   *  opened in the browser's own viewer, or saved as a file (download). */
  pdfUrl: (id: string, { download = false, full = false } = {}) =>
    apiUrl(meetingPath(id, '/minutes.pdf'), { full: full ? 1 : undefined, download: download ? 1 : undefined }),
  emailPreview: (id: string) => request<EmailPreview>(meetingPath(id, '/email-preview')),
};

export const auditApi = {
  list: (meetingId?: string) => request<AuditEntry[]>('/audit', { query: { meeting_id: meetingId } }),
};

export const templatesApi = {
  list: () => request<MinutesTemplate[]>('/templates'),
  versions: (type: MeetingType) => request<MinutesTemplate[]>(`/templates/${type}/versions`),
  create: (type: MeetingType, input: TemplateInput) =>
    request<MinutesTemplate>(`/templates/${type}`, { method: 'POST', body: input }),
  restore: (type: MeetingType, version: number) =>
    request<MinutesTemplate>(`/templates/${type}/versions/${version}/restore`, { method: 'POST' }),
};
