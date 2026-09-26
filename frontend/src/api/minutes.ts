import { request } from "./client";
import type { Attendee, Delivery, Line, MinutesDoc, Suggestion } from "./types";

export const getMinutes = (id: number) => request<MinutesDoc>("GET", `/meetings/${id}/minutes`);

/** Saves the document; 409 when the version is stale (edited elsewhere) or the minutes are approved. */
export const saveMinutes = (id: number, doc: MinutesDoc) =>
  request<{ version: number }>("PUT", `/meetings/${id}/minutes`, doc);

/** Locks the minutes and queues one email per attendee. */
export const approveMinutes = (id: number) =>
  request<{ version: number; deliveries: Delivery[] }>("POST", `/meetings/${id}/approve`);

export const listDeliveries = (id: number) => request<Delivery[]>("GET", `/meetings/${id}/deliveries`);

export const retryDeliveries = (id: number) =>
  request<Delivery[]>("POST", `/meetings/${id}/deliveries/retry`);

export const listAttendees = (id: number) => request<Attendee[]>("GET", `/meetings/${id}/attendees`);

export const getTranscript = (id: number) => request<Line[]>("GET", `/meetings/${id}/transcript`);

export const listSuggestions = (id: number) => request<Suggestion[]>("GET", `/meetings/${id}/suggestions`);

export const sendSuggestion = (id: number, topicId: string, kind: string, text: string) =>
  request<Suggestion>("POST", `/meetings/${id}/suggestions`, { topicId, kind, text });

export const resolveSuggestion = (id: number, suggestionId: number, accepted: boolean) =>
  request<void>("POST", `/meetings/${id}/suggestions/${suggestionId}/resolve`, { accepted });
