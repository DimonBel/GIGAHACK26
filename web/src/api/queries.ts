/** React Query hooks over the API: cache keys, polling and the cache updates after each change. */
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';

import { isProcessing, LIVE_POLL_INTERVAL_MS, POLL_INTERVAL_MS } from '../lib/meeting';
import type { UploadOptions } from './client';
import { auditApi, listsApi, meetingsApi, settingsApi, templatesApi, usersApi, type NewMeeting } from './endpoints';
import type {
  DistributionListInput,
  Meeting,
  MeetingType,
  Minutes,
  MinutesTemplate,
  Recipients,
  Settings,
  TemplateInput,
  UserCreate,
  UserUpdate,
} from './types';

export const queryKeys = {
  session: ['session'] as const,
  meetings: ['meetings'] as const,
  meeting: (id: string) => ['meetings', id] as const,
  live: (id: string) => ['meetings', id, 'live'] as const,
  transcript: (id: string) => ['meetings', id, 'transcript'] as const,
  minutes: (id: string) => ['meetings', id, 'minutes'] as const,
  emailPreview: (id: string) => ['meetings', id, 'email-preview'] as const,
  users: ['users'] as const,
  directory: ['directory'] as const,
  recipientDomains: ['recipient-domains'] as const,
  lists: ['lists'] as const,
  settings: ['settings'] as const,
  audit: (meetingId: string) => ['audit', meetingId] as const,
  templates: ['templates'] as const,
  templateVersions: (type: MeetingType) => ['templates', type, 'versions'] as const,
};

export function useMeetings() {
  return useQuery({
    queryKey: queryKeys.meetings,
    queryFn: meetingsApi.list,
    refetchInterval: (query) =>
      query.state.data?.some((meeting) => isProcessing(meeting.status)) ? POLL_INTERVAL_MS : false,
  });
}

/** One meeting, polled while it is queued or processing. */
export function useMeeting(id: string) {
  return useQuery({
    queryKey: queryKeys.meeting(id),
    queryFn: () => meetingsApi.get(id),
    refetchInterval: (query) => (query.state.data && isProcessing(query.state.data.status) ? POLL_INTERVAL_MS : false),
  });
}

/** What has been heard and found so far: polled quickly while a meeting is queued or processing, and stopped as
 *  soon as it is not (`enabled` false), so it never keeps polling a finished meeting. */
export function useLiveProcessing(id: string, enabled: boolean) {
  return useQuery({
    queryKey: queryKeys.live(id),
    queryFn: () => meetingsApi.live(id),
    enabled,
    refetchInterval: enabled ? LIVE_POLL_INTERVAL_MS : false,
    staleTime: 0,
  });
}

/** The transcript never changes once written; every fetch is audited, so it is fetched once. */
export function useTranscript(id: string, enabled: boolean) {
  return useQuery({
    queryKey: queryKeys.transcript(id),
    queryFn: () => meetingsApi.transcript(id),
    enabled,
    staleTime: Infinity,
  });
}

export function useMinutes(id: string, enabled = true) {
  return useQuery({ queryKey: queryKeys.minutes(id), queryFn: () => meetingsApi.minutes(id), enabled });
}

/** The email the minutes are sent as (the note; the minutes are its PDF), as the server renders it now: never
 *  cached, it follows the minutes and who looks. */
export function useEmailPreview(id: string) {
  return useQuery({ queryKey: queryKeys.emailPreview(id), queryFn: () => meetingsApi.emailPreview(id), gcTime: 0 });
}

/** Minutes that were sent never change, and every read by a recipient is audited: fetched once. */
export function useSentMinutes(id: string) {
  return useQuery({ queryKey: queryKeys.minutes(id), queryFn: () => meetingsApi.minutes(id), staleTime: Infinity });
}

/** Stores a meeting returned by an action and refreshes the meetings list. */
function useStoreMeeting() {
  const queryClient = useQueryClient();
  return (meeting: Meeting) => {
    queryClient.setQueryData(queryKeys.meeting(meeting.id), meeting);
    void queryClient.invalidateQueries({ queryKey: queryKeys.meetings, exact: true });
  };
}

export function useCreateMeeting() {
  const storeMeeting = useStoreMeeting();
  return useMutation({
    mutationFn: ({ input, options }: { input: NewMeeting; options?: UploadOptions }) =>
      meetingsApi.create(input, options),
    onSuccess: storeMeeting,
  });
}

export function useSaveMinutes(id: string) {
  const queryClient = useQueryClient();
  return useMutation({
    mutationFn: (minutes: Minutes) => meetingsApi.saveMinutes(id, minutes),
    onSuccess: (minutes) => queryClient.setQueryData(queryKeys.minutes(id), minutes),
  });
}

export function useApproveMeeting(id: string) {
  const storeMeeting = useStoreMeeting();
  return useMutation({ mutationFn: () => meetingsApi.approve(id), onSuccess: storeMeeting });
}

export function useReopenMeeting(id: string) {
  const storeMeeting = useStoreMeeting();
  return useMutation({ mutationFn: () => meetingsApi.reopen(id), onSuccess: storeMeeting });
}

export function useSendMinutes(id: string) {
  const storeMeeting = useStoreMeeting();
  return useMutation({
    mutationFn: ({ recipients, note }: { recipients: Recipients; note: string }) =>
      meetingsApi.send(id, recipients, note),
    onSuccess: storeMeeting,
  });
}

export function useDeleteMeeting(id: string) {
  const queryClient = useQueryClient();
  return useMutation({
    mutationFn: () => meetingsApi.remove(id),
    onSuccess: () => {
      queryClient.removeQueries({ queryKey: queryKeys.meeting(id) });
      void queryClient.invalidateQueries({ queryKey: queryKeys.meetings, exact: true });
    },
  });
}

export function useUsers() {
  return useQuery({ queryKey: queryKeys.users, queryFn: usersApi.list });
}

export function useDirectory(enabled = true) {
  return useQuery({ queryKey: queryKeys.directory, queryFn: usersApi.directory, enabled });
}

/** The domains minutes may be sent to (empty: any), from the admin's settings. */
export function useRecipientDomains(enabled = true) {
  return useQuery({ queryKey: queryKeys.recipientDomains, queryFn: usersApi.recipientDomains, enabled });
}

/** Refreshes the user table and the recipient directory after a user change. */
function useRefreshUsers() {
  const queryClient = useQueryClient();
  return () => {
    void queryClient.invalidateQueries({ queryKey: queryKeys.users });
    void queryClient.invalidateQueries({ queryKey: queryKeys.directory });
  };
}

export function useCreateUser() {
  const refreshUsers = useRefreshUsers();
  return useMutation({ mutationFn: (input: UserCreate) => usersApi.create(input), onSuccess: refreshUsers });
}

export function useUpdateUser() {
  const refreshUsers = useRefreshUsers();
  return useMutation({
    mutationFn: ({ id, input }: { id: number; input: UserUpdate }) => usersApi.update(id, input),
    onSuccess: refreshUsers,
  });
}

export function useDeactivateUser() {
  const refreshUsers = useRefreshUsers();
  return useMutation({ mutationFn: (id: number) => usersApi.deactivate(id), onSuccess: refreshUsers });
}

export function useLists(enabled = true) {
  return useQuery({ queryKey: queryKeys.lists, queryFn: listsApi.list, enabled });
}

function useRefreshLists() {
  const queryClient = useQueryClient();
  return () => void queryClient.invalidateQueries({ queryKey: queryKeys.lists });
}

/** Creates a list, or updates it when an id is given. */
export function useSaveList() {
  const refreshLists = useRefreshLists();
  return useMutation({
    mutationFn: ({ id, input }: { id?: number; input: DistributionListInput }) =>
      id === undefined ? listsApi.create(input) : listsApi.update(id, input),
    onSuccess: refreshLists,
  });
}

export function useDeleteList() {
  const refreshLists = useRefreshLists();
  return useMutation({ mutationFn: (id: number) => listsApi.remove(id), onSuccess: refreshLists });
}

export function useSettings() {
  return useQuery({ queryKey: queryKeys.settings, queryFn: settingsApi.get });
}

export function useSaveSettings() {
  const queryClient = useQueryClient();
  return useMutation({
    mutationFn: (settings: Settings) => settingsApi.update(settings),
    onSuccess: (settings) => {
      queryClient.setQueryData(queryKeys.settings, settings);
      queryClient.setQueryData(queryKeys.recipientDomains, settings.allowed_recipient_domains);
    },
  });
}

export function useAudit(meetingId: string) {
  return useQuery({ queryKey: queryKeys.audit(meetingId), queryFn: () => auditApi.list(meetingId || undefined) });
}

/** The active template of each meeting type; any signed-in user (drives MinutesView). */
export function useTemplates() {
  return useQuery({ queryKey: queryKeys.templates, queryFn: templatesApi.list });
}

/** Every version of a meeting type's template, newest first, version 0 last (admin). */
export function useTemplateVersions(type: MeetingType) {
  return useQuery({ queryKey: queryKeys.templateVersions(type), queryFn: () => templatesApi.versions(type) });
}

/** Prepends a newly created version to the cached history, and refreshes the active templates list. */
function useStoreTemplateVersion(type: MeetingType) {
  const queryClient = useQueryClient();
  return (created: MinutesTemplate) => {
    queryClient.setQueryData(queryKeys.templateVersions(type), (existing?: MinutesTemplate[]) =>
      existing ? [created, ...existing] : [created],
    );
    void queryClient.invalidateQueries({ queryKey: queryKeys.templates, exact: true });
  };
}

export function useCreateTemplateVersion(type: MeetingType) {
  const storeVersion = useStoreTemplateVersion(type);
  return useMutation({
    mutationFn: (input: TemplateInput) => templatesApi.create(type, input),
    onSuccess: storeVersion,
  });
}

export function useRestoreTemplateVersion(type: MeetingType) {
  const storeVersion = useStoreTemplateVersion(type);
  return useMutation({
    mutationFn: (version: number) => templatesApi.restore(type, version),
    onSuccess: storeVersion,
  });
}
