import type { MeetingType } from "@/shared/types/domain";

import { request, upload } from "./client";
import type { ApiMeeting, ApiMeetingType, Language, Progress } from "./types";

const TO_API: Record<MeetingType, ApiMeetingType> = {
  Medical: "medical",
  Executive: "executive",
  Administrative: "administrative",
};
const FROM_API = Object.fromEntries(Object.entries(TO_API).map(([k, v]) => [v, k])) as Record<
  ApiMeetingType,
  MeetingType
>;

/** A meeting as the app uses it: the API's, with the meeting type as shown ("Medical"). */
export type Meeting = Omit<ApiMeeting, "type"> & { type: MeetingType };

const fromApi = (m: ApiMeeting): Meeting => ({ ...m, type: FROM_API[m.type] });

export interface NewMeeting {
  file: File;
  title: string;
  type: MeetingType;
  language: Language;
  speakers: number | null;
}

export const listMeetings = () => request<ApiMeeting[]>("GET", "/meetings").then((ms) => ms.map(fromApi));

export const getMeeting = (id: number) => request<ApiMeeting>("GET", `/meetings/${id}`).then(fromApi);

export function createMeeting(m: NewMeeting, onProgress: (fraction: number) => void) {
  const form = new FormData();
  form.append("file", m.file, m.file.name);
  form.append("title", m.title);
  form.append("type", TO_API[m.type]);
  form.append("language", m.language);
  if (m.speakers) form.append("speakers", String(m.speakers));
  return upload<ApiMeeting>("/meetings", form, onProgress).then(fromApi);
}

export const getProgress = (id: number, after: number) =>
  request<Progress>("GET", `/meetings/${id}/progress?after=${after}`);

export const retryMeeting = (id: number) =>
  request<ApiMeeting>("POST", `/meetings/${id}/retry`).then(fromApi);

/** Make the minutes again from the saved transcript, as this meeting type (edits to the minutes are replaced). */
export const redoMinutes = (id: number, type: MeetingType) =>
  request<ApiMeeting>("POST", `/meetings/${id}/redo-minutes`, { type: TO_API[type] }).then(fromApi);

export const deleteMeeting = (id: number) => request<void>("DELETE", `/meetings/${id}`);
