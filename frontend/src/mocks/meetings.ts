import type { Meeting, PipelineStep } from "@/shared/types/domain";

export const MEETINGS: Meeting[] = [
  { id: "m-214", title: "Consiliu medical — Cardiologie", type: "Medical", date: "24.09.2026", length: "58 min", topicCount: 3, status: "Awaiting approval", statusTone: "warn", processing: false, langs: "RO · RU · EN" },
  { id: "m-215", title: "Comitet executiv — buget T4", type: "Executive", date: "26.09.2026", length: "72 min", topicCount: 4, status: "Transcribing 42%", statusTone: "info", processing: true, langs: "RO · EN" },
  { id: "m-213", title: "Ședință administrativă — ture ATI", type: "Administrative", date: "25.09.2026", length: "31 min", topicCount: 2, status: "Sent", statusTone: "ok", processing: false, langs: "RO · RU" },
  { id: "m-212", title: "Consiliu medical — Oncologie", type: "Medical", date: "23.09.2026", length: "65 min", topicCount: 5, status: "Sent", statusTone: "ok", processing: false, langs: "RO · EN" },
  { id: "m-211", title: "Comitet executiv — acreditare JCI", type: "Executive", date: "22.09.2026", length: "45 min", topicCount: 3, status: "Sent", statusTone: "ok", processing: false, langs: "RO · RU · EN" },
];

/** The meeting open in the minutes editor. */
export const CURRENT_MINUTES = {
  type: "Medical" as const,
  reference: "Proces-verbal nr. 214 · 24.09.2026 · 58 min",
  title: "Consiliu medical — Cardiologie",
  recipients: 9,
  approvedOn: "24.09",
};

/** Processing stages of a new meeting, with the time each took on the demo recording. */
export const PIPELINE: PipelineStep[] = [
  { name: "Upload to internal storage", duration: "0:04" },
  { name: "Transcription · Whisper, RO/RU/EN", duration: "6:10" },
  { name: "Speaker labels · pyannote", duration: "1:35" },
  { name: "Topics & minutes · local LLM", duration: "3:20" },
  { name: "Routing · n8n", duration: "0:02" },
];

export const PIPELINE_TOTAL = "11:11";
export const PIPELINE_ESTIMATE = "≈ 11 min per hour of audio";

export const NEW_MEETING_DEFAULTS = {
  title: "Consiliu medical — Cardiologie",
  agenda: "Caz clinic NSTEMI\nProtocol protecție renală\nGrafic ture ATI",
};
