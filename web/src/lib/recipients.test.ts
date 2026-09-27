import { describe, expect, it } from 'vitest';

import type { DistributionList } from '../api/types';
import { buildRecipients, listsForType } from './recipients';

const board: DistributionList = {
  id: 1,
  name: 'Medical board',
  meeting_type: 'medical',
  members: [
    { user_id: 1, email: 'ana@medpark.md', name: 'Ana Popescu', kind: 'to' },
    { user_id: 2, email: 'Ion@Medpark.md', name: 'Ion Rusu', kind: 'to' },
    { user_id: null, email: 'quality@medpark.md', name: '', kind: 'cc' },
  ],
};
const management: DistributionList = {
  id: 2,
  name: 'Management',
  meeting_type: null,
  members: [
    { user_id: 3, email: 'director@medpark.md', name: 'Director', kind: 'to' },
    { user_id: 1, email: 'ana@medpark.md', name: 'Ana Popescu', kind: 'cc' },
  ],
};
const finance: DistributionList = { id: 3, name: 'Finance', meeting_type: 'executive', members: [] };

describe('listsForType', () => {
  it('offers the lists of the meeting type and the lists for any type', () => {
    expect(listsForType([board, management, finance], 'medical')).toEqual([board, management]);
  });
});

describe('buildRecipients', () => {
  it('merges lists and extra people without duplicates; someone in To is not repeated in CC', () => {
    const recipients = buildRecipients({
      lists: [board, management],
      extraTo: ['ion@medpark.md', 'nurse@medpark.md'],
      extraCc: ['guest@medpark.md', ' Ana@medpark.md '],
      excluded: [],
    });
    expect(recipients).toEqual({
      to: ['ana@medpark.md', 'ion@medpark.md', 'director@medpark.md', 'nurse@medpark.md'],
      cc: ['quality@medpark.md', 'guest@medpark.md'],
    });
  });

  it('leaves out removed addresses', () => {
    const recipients = buildRecipients({
      lists: [board],
      extraTo: [],
      extraCc: [],
      excluded: ['ION@medpark.md', 'quality@medpark.md'],
    });
    expect(recipients).toEqual({ to: ['ana@medpark.md'], cc: [] });
  });
});
