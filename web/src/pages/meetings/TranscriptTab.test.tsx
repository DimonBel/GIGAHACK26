import { screen } from '@testing-library/react';
import { afterEach, describe, expect, it, vi } from 'vitest';

import { meetingsApi } from '../../api/endpoints';
import { renderWithProviders } from '../../test/render';
import { TranscriptTab } from './TranscriptTab';

function renderTab(hasAudio: boolean) {
  vi.spyOn(meetingsApi, 'transcript').mockResolvedValue({
    language: 'ro',
    utterances: [{ start: 3, end: 9, speaker: 'SPEAKER 1', languages: ['ro'], text: 'Patul opt, stabil.' }],
  });
  vi.spyOn(meetingsApi, 'minutes').mockResolvedValue({
    title: '',
    summary: '',
    key_moments: [],
    topics: [],
    decisions: [],
    action_items: [],
    open_issues: [],
    warnings: [],
    attendees: [],
    participants: {},
  });
  return renderWithProviders(<TranscriptTab meetingId="m1" active hasAudio={hasAudio} />);
}

afterEach(() => vi.restoreAllMocks());

describe('TranscriptTab', () => {
  it('plays the recording from any line while it is kept', async () => {
    const { container } = renderTab(true);

    expect(await screen.findByRole('button', { name: 'Play from 00:03' })).toBeInTheDocument();
    expect(container.querySelector('audio')).not.toBeNull();
  });

  it('shows no player at all once the recording is deleted', async () => {
    const { container } = renderTab(false);

    expect(await screen.findByText('Patul opt, stabil.')).toBeInTheDocument();
    expect(container.querySelector('audio')).toBeNull();
    expect(screen.queryByRole('button', { name: /Play from/ })).not.toBeInTheDocument();
    expect(screen.queryByText(/not kept/)).not.toBeInTheDocument();
  });
});
