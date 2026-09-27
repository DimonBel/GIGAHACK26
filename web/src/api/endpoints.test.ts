import { describe, expect, it, vi } from 'vitest';

import { upload } from './client';
import { meetingsApi } from './endpoints';

vi.mock('./client', () => ({
  apiUrl: (path: string) => path,
  request: vi.fn(),
  upload: vi.fn(() => Promise.resolve({})),
}));

describe('meetingsApi.create', () => {
  it('uploads the recording with the meeting type and the language the minutes are written in', async () => {
    const file = new File(['audio'], 'board.m4a', { type: 'audio/mp4' });

    await meetingsApi.create({ file, meetingType: 'medical', minutesLanguage: 'ru', title: ' Board ' });

    const [path, form] = vi.mocked(upload).mock.calls[0];
    expect(path).toBe('/meetings');
    expect((form.get('file') as File).name).toBe('board.m4a');
    expect(form.get('meeting_type')).toBe('medical');
    expect(form.get('minutes_language')).toBe('ru');
    expect(form.get('title')).toBe('Board');
  });
});
