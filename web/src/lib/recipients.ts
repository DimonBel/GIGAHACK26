/** Final To / CC of an email from distribution lists and extra people. */
import type { DistributionList, MeetingType, Recipients, RecipientKind } from '../api/types';
import { normalizeEmail } from './email';

export interface RecipientChoice {
  lists: DistributionList[];
  extraTo: string[];
  extraCc: string[];
  excluded: string[];
}

function unique(emails: string[]): string[] {
  return [...new Set(emails.map(normalizeEmail).filter(Boolean))];
}

function membersOf(lists: DistributionList[], kind: RecipientKind): string[] {
  return lists.flatMap((list) => list.members.filter((member) => member.kind === kind).map((member) => member.email));
}

/** Lists that apply to a meeting type: the ones for that type and the ones for any type. */
export function listsForType(lists: DistributionList[], type: MeetingType): DistributionList[] {
  return lists.filter((list) => list.meeting_type === type || list.meeting_type === null);
}

/** To and CC without duplicates or removed addresses; someone in To is not repeated in CC. */
export function buildRecipients({ lists, extraTo, extraCc, excluded }: RecipientChoice): Recipients {
  const skip = new Set(excluded.map(normalizeEmail));
  const to = unique([...membersOf(lists, 'to'), ...extraTo]).filter((email) => !skip.has(email));
  const inTo = new Set(to);
  const cc = unique([...membersOf(lists, 'cc'), ...extraCc]).filter((email) => !skip.has(email) && !inTo.has(email));
  return { to, cc };
}
