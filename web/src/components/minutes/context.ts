/** State shared by the parts of a minutes document: what it shows, which section is open, the form in edit mode. */
import type { UseFormReturnType } from '@mantine/form';
import { createContext, useContext, useState } from 'react';

import type { MeetingType } from '../../api/types';
import type { MinutesFormValues } from '../../lib/minutesForm';

export type MinutesForm = UseFormReturnType<MinutesFormValues>;

export type Section =
  | { kind: 'overview' }
  | { kind: 'topic'; key: string }
  | { kind: 'participants' }
  | { kind: 'decisions' }
  | { kind: 'tasks' };

/** A time clicked in the minutes: its topic's transcript opens at that line. */
export interface Focus {
  topic: string;
  seconds: number;
  /** Changes on every click, so clicking the same time again scrolls to it again. */
  at: number;
}

export interface MinutesNav {
  section: Section;
  setSection: (section: Section) => void;
  focus: Focus | null;
  setFocus: (focus: Focus | null) => void;
}

/** The open section and the focused time; owned by the page when it needs to open a section itself. */
export function useMinutesNav(): MinutesNav {
  const [section, setSection] = useState<Section>({ kind: 'overview' });
  const [focus, setFocus] = useState<Focus | null>(null);
  return { section, setSection, focus, setFocus };
}

export interface MinutesDocumentContext {
  values: MinutesFormValues;
  meetingType: MeetingType;
  /** The form that holds values, in edit mode; null when reading. */
  form: MinutesForm | null;
  /** The meeting whose transcript and recording can be opened (moderators, admins); null for recipients. */
  transcriptOf: string | null;
  focus: Focus | null;
  select: (section: Section) => void;
  /** Opens the topic discussed at a time ("04:12"), or the given topic, with its transcript at that line. */
  openTime: (time: string, topic?: string) => void;
  clearFocus: () => void;
}

export const DocumentContext = createContext<MinutesDocumentContext | null>(null);

export function useMinutesDocument(): MinutesDocumentContext {
  const context = useContext(DocumentContext);
  if (!context) throw new Error('useMinutesDocument is used outside MinutesDocument');
  return context;
}
