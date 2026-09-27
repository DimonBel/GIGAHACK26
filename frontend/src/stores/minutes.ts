import { create } from "zustand";

import { ApiError } from "@/api/client";
import { getMeeting, redoMinutes, type Meeting } from "@/api/meetings";
import * as minutesApi from "@/api/minutes";
import type {
  Attendee,
  Block,
  BlockKind,
  CodeItem,
  Delivery,
  Line,
  ListItem,
  MinutesDoc,
  NextMeeting,
  Participant,
  Suggestion,
  TaskItem,
  Topic,
  User,
} from "@/api/types";
import { listUsers } from "@/api/users";
import type { MeetingType, MinutesSection } from "@/shared/types/domain";

const AUTOSAVE_MS = 800;

/** Fallback for selectors (`s.doc?.topics ?? NONE`): one shared empty array, so it never looks like a change. */
export const NONE: never[] = [];

export type SaveState = "saved" | "dirty" | "saving" | "error" | "conflict";
export type Item = ListItem | TaskItem | CodeItem;
type BlockFields = { label?: string; text?: string };

export const BLOCK_KINDS: { kind: BlockKind; label: string; hint: string }[] = [
  { kind: "text", label: "Text", hint: "A paragraph, e.g. status or conclusion" },
  { kind: "list", label: "List", hint: "Findings, decisions, open issues…" },
  { kind: "tasks", label: "Tasks", hint: "What must be done, by whom, by when" },
  { kind: "codes", label: "Codes", hint: "ICD-10 diagnoses and ACHI procedures" },
];

const DEFAULT_LABEL: Record<BlockKind, string> = {
  text: "Notes",
  list: "List",
  tasks: "Tasks",
  codes: "Diagnosis codes",
};

// --- pure helpers (exported for tests) ---

let seq = 0;
/** Ids for things created in the browser; unique enough next to the server's random hex ids. */
export function newId(prefix: string) {
  seq += 1;
  return `${prefix}${Date.now().toString(36)}${seq.toString(36)}`;
}

export function newBlock(kind: BlockKind, label = DEFAULT_LABEL[kind]): Block {
  const id = newId("b");
  if (kind === "text") return { id, kind, label, text: "" };
  return { id, kind, label, items: [] } as Block;
}

export function newItem(kind: Exclude<BlockKind, "text">): ListItem | TaskItem {
  const id = newId("i");
  if (kind === "tasks") return { id, text: "", owner: "", deadline: "", priority: "medium", done: false };
  return { id, text: "" };
}

export function move<T>(list: T[], index: number, by: -1 | 1): T[] {
  const to = index + by;
  if (index < 0 || to < 0 || to >= list.length) return list;
  const next = [...list];
  [next[index], next[to]] = [next[to] as T, next[index] as T];
  return next;
}

/** "03:52" / "01:03:52" -> seconds (null when empty or not a time). */
export function timeToSeconds(time: string | null | undefined): number | null {
  if (!time || !/^\d{1,2}(:\d{2}){1,2}$/.test(time)) return null;
  return time.split(":").reduce((total, part) => total * 60 + Number(part), 0);
}

export function formatSeconds(seconds: number) {
  const s = Math.floor(seconds);
  const h = Math.floor(s / 3600);
  const mmss = `${String(Math.floor((s % 3600) / 60)).padStart(2, "0")}:${String(s % 60).padStart(2, "0")}`;
  return h ? `${h}:${mmss}` : mmss;
}

/** The transcript lines of a topic: from its time to the next topic's (topics in time order). */
export function topicLines(lines: Line[], topics: Topic[], topicId: string): Line[] {
  const starts = topics
    .map((t) => ({ id: t.id, start: timeToSeconds(t.time) }))
    .filter((t): t is { id: string; start: number } => t.start !== null)
    .sort((a, b) => a.start - b.start);
  const i = starts.findIndex((t) => t.id === topicId);
  if (i < 0) return [];
  const from = starts[i]!.start;
  const to = starts[i + 1]?.start ?? Infinity;
  return lines.filter((l) => l.start >= from && l.start < to);
}

export function itemCount(topic: Topic) {
  return topic.blocks.reduce((n, b) => n + (b.kind === "text" ? (b.text.trim() ? 1 : 0) : b.items.length), 0);
}

function editTopic(doc: MinutesDoc, topicId: string, fn: (t: Topic) => Topic): MinutesDoc {
  return { ...doc, topics: doc.topics.map((t) => (t.id === topicId ? fn(t) : t)) };
}

function editBlock(doc: MinutesDoc, topicId: string, blockId: string, fn: (b: Block) => Block): MinutesDoc {
  return editTopic(doc, topicId, (t) => ({
    ...t,
    blocks: t.blocks.map((b) => (b.id === blockId ? fn(b) : b)),
  }));
}

function editItems(block: Block, fn: (items: Item[]) => Item[]): Block {
  return block.kind === "text" ? block : ({ ...block, items: fn(block.items) } as Block);
}

/** Block a suggestion goes into by default: a tasks block for tasks, a list otherwise (null: a new one). */
export function defaultTarget(topic: Topic, suggestion: Pick<Suggestion, "kind">): string | null {
  const kind = suggestion.kind === "Task" ? "tasks" : "list";
  return topic.blocks.find((b) => b.kind === kind)?.id ?? null;
}

/** The document with an accepted suggestion added to block `target` (null: a new block for it). */
export function acceptInto(doc: MinutesDoc, suggestion: Suggestion, target: string | null): MinutesDoc {
  const author = suggestion.author ?? "";
  return editTopic(doc, suggestion.topicId, (topic) => {
    let blocks = topic.blocks;
    let id = target;
    if (!id || !blocks.some((b) => b.id === id && b.kind !== "text" && b.kind !== "codes")) {
      const block = suggestion.kind === "Task" ? newBlock("tasks") : newBlock("list", "From participants");
      blocks = [...blocks, block];
      id = block.id;
    }
    return {
      ...topic,
      blocks: blocks.map((b) => {
        if (b.id !== id) return b;
        if (b.kind === "tasks")
          return { ...b, items: [...b.items, { ...(newItem("tasks") as TaskItem), text: suggestion.text }] };
        if (b.kind === "list")
          return { ...b, items: [...b.items, { id: newId("i"), text: suggestion.text, who: author }] };
        return b;
      }),
    };
  });
}

// --- the store ---

interface MinutesState {
  meetingId: number | null;
  meeting: Meeting | null;
  doc: MinutesDoc | null;
  transcript: Line[];
  suggestions: Suggestion[];
  loading: boolean;
  loadError: string | null;
  section: MinutesSection;
  editing: boolean;
  save: SaveState;
  savedAt: number | null;
  saveError: string | null;
  approving: boolean;
  /** A time clicked in the minutes: the topic's transcript opens at that line. */
  focus: { topicId: string; seconds: number } | null;
  /** Hospital directory (moderator), to choose attendees. */
  directory: User[];
  /** Who attended, by name (as saved on the server). */
  attendeeList: Attendee[];
  /** Emails of the approved minutes (moderator). */
  deliveries: Delivery[];

  load: (meetingId: number) => Promise<void>;
  reset: () => void;
  select: (section: MinutesSection) => void;
  toggleEditing: () => void;
  focusTime: (topicId: string, time: string | null | undefined) => void;
  clearFocus: () => void;

  updateDoc: (fields: Partial<Pick<MinutesDoc, "title" | "summary">>) => void;
  addTopic: () => void;
  deleteTopic: (topicId: string) => void;
  updateTopic: (topicId: string, fields: Partial<Pick<Topic, "title" | "time">>) => void;
  moveTopic: (topicId: string, by: -1 | 1) => void;
  addBlock: (topicId: string, kind: BlockKind) => string;
  updateBlock: (topicId: string, blockId: string, fields: BlockFields) => void;
  removeBlock: (topicId: string, blockId: string) => void;
  moveBlock: (topicId: string, blockId: string, by: -1 | 1) => void;
  addItem: (topicId: string, blockId: string, item?: Item) => string | null;
  updateItem: (
    topicId: string,
    blockId: string,
    itemId: string,
    fields: Partial<TaskItem & ListItem & CodeItem>,
  ) => void;
  removeItem: (topicId: string, blockId: string, itemId: string) => void;
  updateParticipant: (speaker: string, fields: Partial<Pick<Participant, "name" | "role">>) => void;
  updateNext: (fields: Partial<NextMeeting>) => void;
  setAttendees: (userIds: number[]) => void;
  loadDirectory: () => Promise<void>;
  loadDeliveries: () => Promise<void>;
  retryDeliveries: () => Promise<void>;

  saveNow: () => Promise<void>;
  /** Make the minutes again as `type` from the saved transcript; the page shows the processing until done. */
  redo: (type: MeetingType) => Promise<boolean>;
  approve: () => Promise<boolean>;
  acceptSuggestion: (suggestionId: number, target: string | null) => void;
  declineSuggestion: (suggestionId: number) => void;
  sendSuggestion: (topicId: string, kind: string, text: string) => Promise<boolean>;
}

const EMPTY = {
  meetingId: null,
  meeting: null,
  doc: null,
  transcript: [],
  suggestions: [],
  loading: false,
  loadError: null,
  section: { kind: "overview" } as MinutesSection,
  editing: false,
  save: "saved" as SaveState,
  savedAt: null,
  saveError: null,
  approving: false,
  focus: null,
  directory: [] as User[],
  attendeeList: [] as Attendee[],
  deliveries: [] as Delivery[],
};

// Autosave: 800 ms after the last edit; one request at a time, and again if edits came in meanwhile.
let saveTimer: ReturnType<typeof setTimeout> | undefined;
let saveRunning: Promise<void> | null = null;

const message = (e: unknown, fallback: string) => (e instanceof ApiError ? e.message : fallback);

export const useMinutesStore = create<MinutesState>()((set, get) => {
  /** Apply an edit to the document (moderator, draft only) and schedule the autosave. */
  function edit(fn: (doc: MinutesDoc) => MinutesDoc) {
    const { doc, meeting, save } = get();
    if (!doc || meeting?.status !== "draft" || save === "conflict") return;
    set({ doc: fn(doc), save: "dirty" });
    clearTimeout(saveTimer);
    saveTimer = setTimeout(() => void get().saveNow(), AUTOSAVE_MS);
  }

  async function runSave() {
    const { doc, meetingId } = get();
    if (!doc || meetingId === null) return;
    set({ save: "saving" });
    try {
      const { version } = await minutesApi.saveMinutes(meetingId, doc);
      if (get().meetingId !== meetingId) return;
      const changed = get().doc !== doc; // edited while the request ran
      set((s) => ({
        doc: s.doc && { ...s.doc, version },
        save: changed ? "dirty" : "saved",
        savedAt: Date.now(),
        saveError: null,
      }));
    } catch (e) {
      if (get().meetingId !== meetingId) return;
      const conflict = e instanceof ApiError && e.status === 409;
      set({
        save: conflict ? "conflict" : "error",
        saveError: message(e, "Not saved. Check the connection."),
      });
    }
  }

  return {
    ...EMPTY,

    load: async (meetingId) => {
      if (get().meetingId !== meetingId) {
        clearTimeout(saveTimer);
        set({ ...EMPTY, meetingId });
      }
      set({ loading: true, loadError: null });
      try {
        const meeting = await getMeeting(meetingId);
        if (get().meetingId !== meetingId) return;
        set({ meeting });
        if (meeting.status === "draft" || meeting.status === "approved") {
          const [doc, transcript, suggestions, attendeeList] = await Promise.all([
            minutesApi.getMinutes(meetingId),
            minutesApi.getTranscript(meetingId),
            minutesApi.listSuggestions(meetingId),
            minutesApi.listAttendees(meetingId).catch(() => []),
          ]);
          if (get().meetingId !== meetingId) return;
          set({
            doc: { ...doc, attendees: doc.attendees ?? [] },
            transcript,
            suggestions,
            attendeeList,
            save: "saved",
            saveError: null,
          });
        }
        set({ loading: false });
      } catch (e) {
        if (get().meetingId === meetingId)
          set({ loading: false, loadError: message(e, "Could not open the meeting.") });
      }
    },
    reset: () => {
      clearTimeout(saveTimer);
      set({ ...EMPTY });
    },
    select: (section) => set({ section, focus: null }),
    toggleEditing: () => set((s) => ({ editing: !s.editing })),
    focusTime: (topicId, time) => {
      const seconds = timeToSeconds(time);
      if (seconds !== null) set({ focus: { topicId, seconds } });
    },
    clearFocus: () => set({ focus: null }),

    updateDoc: (fields) => edit((d) => ({ ...d, ...fields })),
    addTopic: () => {
      const topic: Topic = { id: newId("t"), title: "", time: null, blocks: [newBlock("list", "Notes")] };
      edit((d) => ({ ...d, topics: [...d.topics, topic] }));
      if (get().doc?.topics.some((t) => t.id === topic.id))
        set({ section: { kind: "topic", id: topic.id }, editing: true });
    },
    deleteTopic: (topicId) => {
      edit((d) => ({ ...d, topics: d.topics.filter((t) => t.id !== topicId) }));
      set({ section: { kind: "overview" } });
    },
    updateTopic: (topicId, fields) => edit((d) => editTopic(d, topicId, (t) => ({ ...t, ...fields }))),
    moveTopic: (topicId, by) =>
      edit((d) => ({
        ...d,
        topics: move(
          d.topics,
          d.topics.findIndex((t) => t.id === topicId),
          by,
        ),
      })),

    addBlock: (topicId, kind) => {
      const block = newBlock(kind);
      edit((d) => editTopic(d, topicId, (t) => ({ ...t, blocks: [...t.blocks, block] })));
      return block.id;
    },
    updateBlock: (topicId, blockId, fields) =>
      edit((d) =>
        editBlock(d, topicId, blockId, (b) => ({
          ...b,
          ...(b.kind === "text" ? fields : { label: fields.label ?? b.label }),
        })),
      ),
    removeBlock: (topicId, blockId) =>
      edit((d) => editTopic(d, topicId, (t) => ({ ...t, blocks: t.blocks.filter((b) => b.id !== blockId) }))),
    moveBlock: (topicId, blockId, by) =>
      edit((d) =>
        editTopic(d, topicId, (t) => ({
          ...t,
          blocks: move(
            t.blocks,
            t.blocks.findIndex((b) => b.id === blockId),
            by,
          ),
        })),
      ),

    addItem: (topicId, blockId, item) => {
      const block = get()
        .doc?.topics.find((t) => t.id === topicId)
        ?.blocks.find((b) => b.id === blockId);
      if (!block || block.kind === "text" || (block.kind === "codes" && !item)) return null;
      const added = item ?? newItem(block.kind === "codes" ? "list" : block.kind);
      edit((d) => editBlock(d, topicId, blockId, (b) => editItems(b, (items) => [...items, added])));
      return added.id;
    },
    updateItem: (topicId, blockId, itemId, fields) =>
      edit((d) =>
        editBlock(d, topicId, blockId, (b) =>
          editItems(b, (items) => items.map((i) => (i.id === itemId ? ({ ...i, ...fields } as Item) : i))),
        ),
      ),
    removeItem: (topicId, blockId, itemId) =>
      edit((d) =>
        editBlock(d, topicId, blockId, (b) => editItems(b, (items) => items.filter((i) => i.id !== itemId))),
      ),

    updateParticipant: (speaker, fields) =>
      edit((d) => ({
        ...d,
        participants: d.participants.map((p) => (p.speaker === speaker ? { ...p, ...fields } : p)),
      })),
    updateNext: (fields) => edit((d) => ({ ...d, next: { ...d.next, ...fields } })),
    setAttendees: (userIds) => {
      edit((d) => ({ ...d, attendees: [...new Set(userIds)] }));
      const { directory } = get();
      set({
        attendeeList: directory
          .filter((u) => userIds.includes(u.id))
          .map((u) => ({ id: u.id, name: u.name, dept: u.dept })),
      });
    },
    loadDirectory: async () => {
      if (get().directory.length) return;
      try {
        set({ directory: await listUsers() });
      } catch {
        // not a moderator, or offline: the picker stays empty
      }
    },
    loadDeliveries: async () => {
      const { meetingId } = get();
      if (meetingId === null) return;
      try {
        const deliveries = await minutesApi.listDeliveries(meetingId);
        if (get().meetingId === meetingId) set({ deliveries });
      } catch {
        // participants cannot see deliveries; nothing to show
      }
    },
    retryDeliveries: async () => {
      const { meetingId } = get();
      if (meetingId === null) return;
      try {
        set({ deliveries: await minutesApi.retryDeliveries(meetingId) });
      } catch (e) {
        set({ saveError: message(e, "Could not retry the emails.") });
      }
    },

    saveNow: async () => {
      clearTimeout(saveTimer);
      while (saveRunning) await saveRunning;
      if (get().save !== "dirty" && get().save !== "error") return;
      saveRunning = runSave().finally(() => (saveRunning = null));
      await saveRunning;
      if (get().save === "dirty") await get().saveNow();
    },
    redo: async (type) => {
      const { meetingId } = get();
      if (meetingId === null) return false;
      clearTimeout(saveTimer); // the edits are replaced anyway: nothing left to save
      try {
        await redoMinutes(meetingId, type);
      } catch (e) {
        set({ saveError: message(e, "Could not make the minutes again.") });
        return false;
      }
      set({ editing: false, save: "saved", saveError: null, section: { kind: "overview" } });
      await get().load(meetingId);
      return true;
    },
    approve: async () => {
      const { meetingId } = get();
      if (meetingId === null) return false;
      set({ approving: true });
      await get().saveNow();
      if (get().save !== "saved") {
        set({ approving: false });
        return false;
      }
      try {
        const { deliveries } = await minutesApi.approveMinutes(meetingId);
        const meeting = await getMeeting(meetingId);
        set({ meeting, deliveries, editing: false, approving: false });
        return true;
      } catch (e) {
        set({ approving: false, saveError: message(e, "Could not approve the minutes.") });
        return false;
      }
    },

    acceptSuggestion: (suggestionId, target) => {
      const { suggestions, meetingId } = get();
      const s = suggestions.find((x) => x.id === suggestionId);
      if (!s || meetingId === null) return;
      edit((d) => acceptInto(d, s, target));
      set({ suggestions: suggestions.filter((x) => x.id !== suggestionId) });
      void minutesApi.resolveSuggestion(meetingId, suggestionId, true).catch(() => undefined);
    },
    declineSuggestion: (suggestionId) => {
      const { suggestions, meetingId } = get();
      if (meetingId === null) return;
      set({ suggestions: suggestions.filter((x) => x.id !== suggestionId) });
      void minutesApi.resolveSuggestion(meetingId, suggestionId, false).catch(() => undefined);
    },
    sendSuggestion: async (topicId, kind, text) => {
      const { meetingId } = get();
      if (meetingId === null || !text.trim()) return false;
      try {
        const s = await minutesApi.sendSuggestion(meetingId, topicId, kind, text.trim());
        set((st) => ({ suggestions: [...st.suggestions, s] }));
        return true;
      } catch (e) {
        set({ saveError: message(e, "Could not send the suggestion.") });
        return false;
      }
    },
  };
});

/** The topic open in the minutes, if a topic (not a general section) is selected. */
export function selectedTopic(s: Pick<MinutesState, "doc" | "section">): Topic | undefined {
  const { section } = s;
  return section.kind === "topic" ? s.doc?.topics.find((t) => t.id === section.id) : undefined;
}

/** Moderator of a draft: the document can be edited. */
export function canEdit(s: Pick<MinutesState, "meeting">, isModerator: boolean) {
  return isModerator && s.meeting?.status === "draft";
}
