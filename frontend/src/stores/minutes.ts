import { create } from "zustand";

import { CATALOG } from "@/mocks/catalog";
import { DEFAULT_DUE, DEFAULT_OWNER, NEXT_MEETING } from "@/mocks/people";
import { TOPICS } from "@/mocks/topics";
import { uid } from "@/shared/lib/id";
import type {
  ActionItem,
  AttentionPoint,
  CatalogCode,
  Code,
  MinutesSection,
  NextMeeting,
  PointOfView,
  Suggestion,
  SuggestionKind,
  Topic,
} from "@/shared/types/domain";

const ICD_RESULTS = 5;
/** "N18.3 Chronic kidney disease" -> code N18.3, label "Chronic kidney disease". */
const ICD_IN_TEXT = /^([A-Z]\d{2}(\.\d)?)\s*(.*)$/i;

type TopicFields = Pick<Topic, "title" | "tag" | "summary">;

interface MinutesState {
  topics: Topic[];
  section: MinutesSection;
  editing: boolean;
  showTranscript: boolean;
  icdQuery: string;
  sent: boolean;
  absent: string[];
  next: NextMeeting;
  suggestionKind: SuggestionKind;
  suggestionText: string;
  suggestionsSent: number;

  openFirstTopic: () => void;
  selectTopic: (id: string) => void;
  selectGeneral: (kind: "participants" | "next") => void;
  toggleEditing: () => void;
  stopEditing: () => void;
  send: () => void;

  addTopic: () => void;
  deleteTopic: (id: string) => void;
  updateTopic: (id: string, fields: Partial<TopicFields>) => void;

  addView: (id: string) => void;
  updateView: (id: string, viewId: string, fields: Partial<Omit<PointOfView, "id">>) => void;
  removeView: (id: string, viewId: string) => void;
  addAction: (id: string) => void;
  updateAction: (id: string, actionId: string, fields: Partial<Omit<ActionItem, "id">>) => void;
  removeAction: (id: string, actionId: string) => void;
  addAttention: (id: string) => void;
  updateAttention: (id: string, pointId: string, text: string) => void;
  removeAttention: (id: string, pointId: string) => void;
  addCode: (id: string, code: Code) => void;
  removeCode: (id: string, code: string) => void;
  setIcdQuery: (query: string) => void;

  acceptSuggestion: (id: string, suggestionId: string) => void;
  declineSuggestion: (id: string, suggestionId: string) => void;
  setSuggestionKind: (kind: SuggestionKind) => void;
  setSuggestionText: (text: string) => void;
  /** Participant: send the drafted suggestion for the open topic to the moderator. */
  submitSuggestion: (from: string) => void;

  toggleTranscript: () => void;
  toggleAbsent: (name: string) => void;
  updateNext: (fields: Partial<NextMeeting>) => void;
}

const firstTopic = (topics: Topic[]): MinutesSection => ({ kind: "topic", id: topics[0]?.id ?? "" });

function emptyTopic(): Topic {
  return {
    id: uid("t"),
    title: "",
    tag: "Medical",
    time: "—",
    summary: "",
    views: [],
    actions: [],
    attention: [],
    codes: [],
    drg: "",
    drgLabel: "",
    suggestions: [],
    transcript: [],
  };
}

/** A suggestion accepted by the moderator becomes a code, a view, an attention point or a task. */
export function applySuggestion(topic: Topic, suggestion: Suggestion): Topic {
  const t = { ...topic, suggestions: topic.suggestions.filter((s) => s.id !== suggestion.id) };
  if (suggestion.code) return { ...t, codes: [...t.codes, suggestion.code] };
  if (suggestion.kind === "Point of view")
    return { ...t, views: [...t.views, { id: uid("v"), name: suggestion.from, text: suggestion.text }] };
  if (suggestion.kind === "Attention point")
    return { ...t, attention: [...t.attention, { id: uid("x"), text: suggestion.text }] };
  return {
    ...t,
    actions: [...t.actions, { id: uid("a"), text: suggestion.text, owner: suggestion.from, due: DEFAULT_DUE }],
  };
}

/** Catalog codes matching the query (code, label or RO/RU terms) that the topic does not have yet. */
export function searchCatalog(query: string, topic: Topic | undefined): CatalogCode[] {
  const q = query.trim().toLowerCase();
  if (!q) return [];
  const have = new Set(topic?.codes.map((c) => c.code));
  return CATALOG.filter(
    (c) => !have.has(c.code) && [c.system, c.code, c.label, c.terms].join(" ").toLowerCase().includes(q),
  ).slice(0, ICD_RESULTS);
}

export function parseSuggestion(from: string, kind: SuggestionKind, text: string): Suggestion {
  const suggestion: Suggestion = { id: uid("s"), from, kind, text: text.trim() };
  const icd = text.match(ICD_IN_TEXT);
  if (kind === "Diagnosis" && icd?.[1])
    suggestion.code = { system: "ICD-10", code: icd[1].toUpperCase(), label: icd[3] ?? "" };
  return suggestion;
}

export const useMinutesStore = create<MinutesState>()((set, get) => {
  /** Replace one topic (by id) with fn(topic). */
  const edit = (id: string, fn: (t: Topic) => Topic) =>
    set((s) => ({ topics: s.topics.map((t) => (t.id === id ? fn(t) : t)) }));

  return {
    topics: TOPICS,
    section: firstTopic(TOPICS),
    editing: false,
    showTranscript: false,
    icdQuery: "",
    sent: false,
    absent: [],
    next: NEXT_MEETING,
    suggestionKind: "Point of view",
    suggestionText: "",
    suggestionsSent: 0,

    openFirstTopic: () => set((s) => ({ section: firstTopic(s.topics) })),
    selectTopic: (id) => set({ section: { kind: "topic", id }, editing: false, showTranscript: false }),
    selectGeneral: (kind) => set({ section: { kind }, editing: false }),
    toggleEditing: () => set((s) => ({ editing: !s.editing, icdQuery: "" })),
    stopEditing: () => set({ editing: false }),
    send: () => set({ sent: true, editing: false }),

    addTopic: () => {
      const topic = emptyTopic();
      set((s) => ({ topics: [...s.topics, topic], section: { kind: "topic", id: topic.id }, editing: true }));
    },
    deleteTopic: (id) =>
      set((s) => {
        const topics = s.topics.filter((t) => t.id !== id);
        return { topics, section: firstTopic(topics), editing: false };
      }),
    updateTopic: (id, fields) => edit(id, (t) => ({ ...t, ...fields })),

    addView: (id) =>
      edit(id, (t) => ({ ...t, views: [...t.views, { id: uid("v"), name: DEFAULT_OWNER, text: "" }] })),
    updateView: (id, viewId, fields) =>
      edit(id, (t) => ({ ...t, views: t.views.map((v) => (v.id === viewId ? { ...v, ...fields } : v)) })),
    removeView: (id, viewId) => edit(id, (t) => ({ ...t, views: t.views.filter((v) => v.id !== viewId) })),

    addAction: (id) =>
      edit(id, (t) => ({
        ...t,
        actions: [...t.actions, { id: uid("a"), text: "", owner: DEFAULT_OWNER, due: DEFAULT_DUE }],
      })),
    updateAction: (id, actionId, fields) =>
      edit(id, (t) => ({ ...t, actions: t.actions.map((a) => (a.id === actionId ? { ...a, ...fields } : a)) })),
    removeAction: (id, actionId) =>
      edit(id, (t) => ({ ...t, actions: t.actions.filter((a) => a.id !== actionId) })),

    addAttention: (id) => edit(id, (t) => ({ ...t, attention: [...t.attention, { id: uid("x"), text: "" }] })),
    updateAttention: (id, pointId, text) =>
      edit(id, (t) => ({
        ...t,
        attention: t.attention.map((p): AttentionPoint => (p.id === pointId ? { ...p, text } : p)),
      })),
    removeAttention: (id, pointId) =>
      edit(id, (t) => ({ ...t, attention: t.attention.filter((p) => p.id !== pointId) })),

    addCode: (id, code) => {
      edit(id, (t) => ({ ...t, codes: [...t.codes, { system: code.system, code: code.code, label: code.label }] }));
      set({ icdQuery: "" });
    },
    removeCode: (id, code) => edit(id, (t) => ({ ...t, codes: t.codes.filter((c) => c.code !== code) })),
    setIcdQuery: (icdQuery) => set({ icdQuery }),

    acceptSuggestion: (id, suggestionId) =>
      edit(id, (t) => {
        const suggestion = t.suggestions.find((s) => s.id === suggestionId);
        return suggestion ? applySuggestion(t, suggestion) : t;
      }),
    declineSuggestion: (id, suggestionId) =>
      edit(id, (t) => ({ ...t, suggestions: t.suggestions.filter((s) => s.id !== suggestionId) })),
    setSuggestionKind: (suggestionKind) => set({ suggestionKind }),
    setSuggestionText: (suggestionText) => set({ suggestionText }),
    submitSuggestion: (from) => {
      const { suggestionText, suggestionKind, section, suggestionsSent } = get();
      const topic = selectedTopic(get());
      if (!suggestionText.trim() || !topic || section.kind !== "topic") return;
      const suggestion = parseSuggestion(from, suggestionKind, suggestionText);
      edit(topic.id, (t) => ({ ...t, suggestions: [...t.suggestions, suggestion] }));
      set({ suggestionText: "", suggestionsSent: suggestionsSent + 1 });
    },

    toggleTranscript: () => set((s) => ({ showTranscript: !s.showTranscript })),
    toggleAbsent: (name) =>
      set((s) => ({ absent: s.absent.includes(name) ? s.absent.filter((n) => n !== name) : [...s.absent, name] })),
    updateNext: (fields) => set((s) => ({ next: { ...s.next, ...fields } })),
  };
});

/** The topic open in the minutes, if a topic (not a general section) is selected. */
export function selectedTopic(s: Pick<MinutesState, "topics" | "section">): Topic | undefined {
  const { section } = s;
  return section.kind === "topic" ? s.topics.find((t) => t.id === section.id) : undefined;
}
