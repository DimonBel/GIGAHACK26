import { screen } from '@testing-library/react';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';

import { meetingsApi } from '../../api/endpoints';
import type { LiveProcessing, Meeting } from '../../api/types';
import { renderWithProviders } from '../../test/render';
import { ProcessingCard } from './ProcessingCard';

// The count-up animation and the transcript's auto-scroll both check useReducedMotion(): forcing it to true keeps
// the numbers and the scroll call synchronous and deterministic, without touching real timers or rAF.
vi.mock('@mantine/hooks', async (importOriginal) => {
  const actual = await importOriginal<typeof import('@mantine/hooks')>();
  return { ...actual, useReducedMotion: () => true };
});

const EMPTY_LIVE: LiveProcessing = { lines: [], total: 0, speakers: false, topics: [], decisions: 0, tasks: 0 };

function meeting(overrides: Partial<Meeting> = {}): Meeting {
  return {
    id: 'm1',
    title: 'Medical board',
    meeting_type: 'medical',
    status: 'processing',
    progress: { stage: 'transcribing', done: 3, total: 10, message: '' },
    created_by: { id: 2, full_name: 'Ion Rusu' },
    created_at: new Date().toISOString(),
    duration_s: null,
    language: null,
    minutes_language: 'ro',
    has_audio: false,
    error: null,
    approved_by: null,
    approved_at: null,
    sent_at: null,
    timings: null,
    ...overrides,
  };
}

describe('ProcessingCard', () => {
  beforeEach(() => {
    vi.spyOn(meetingsApi, 'live').mockResolvedValue(EMPTY_LIVE);
  });

  afterEach(() => vi.restoreAllMocks());

  it('shows a calm waiting state while queued, with no live panels', () => {
    renderWithProviders(<ProcessingCard meeting={meeting({ status: 'queued', progress: null })} />);

    expect(screen.getByText('Waiting to start')).toBeInTheDocument();
    expect(screen.getByText('Processing starts as soon as the meeting before it is done.')).toBeVisible();
    expect(screen.queryByText('Live transcript')).not.toBeInTheDocument();
  });

  it('shows the chunk progress bar and the transcript lines heard so far, with a placeholder before speakers are known', async () => {
    vi.spyOn(meetingsApi, 'live').mockResolvedValue({
      lines: [
        { start: 12.4, end: 15.1, speaker: '', languages: ['ro'], text: 'Pacientul din patul 8 este stabil.' },
        { start: 15.1, end: 18.0, speaker: '', languages: ['ro'], text: 'Continuăm cu tratamentul.' },
      ],
      total: 2,
      speakers: false,
      topics: [],
      decisions: 0,
      tasks: 0,
    });

    const { container } = renderWithProviders(<ProcessingCard meeting={meeting()} />);

    // The stage tracker, what is happening now (in the app's language) and the chunk-progress bar.
    expect(screen.getByText('Turning speech into text, sentence by sentence…')).toBeInTheDocument();
    expect(screen.getByText('3 / 10')).toBeInTheDocument();

    // The lines arrive from the (polled) live endpoint.
    expect(await screen.findByText('Pacientul din patul 8 este stabil.')).toBeInTheDocument();
    expect(screen.getByText('Continuăm cu tratamentul.')).toBeInTheDocument();
    expect(screen.getByText('2 lines so far')).toBeInTheDocument();

    // Speakers aren't known yet: a neutral, accessible placeholder instead of a name. Queried by class rather
    // than through RTL's text matchers: the "…" text sits on Mantine's inner label span, while the aria-label
    // this checks lives one level up, on the badge root that carries this class.
    const placeholders = container.querySelectorAll('.live-identifying-badge');
    expect(placeholders).toHaveLength(2);
    expect(placeholders[0]).toHaveTextContent('…');
    expect(placeholders[0]).toHaveAttribute('aria-label', 'identifying…');
    expect(screen.queryByText('Speaker 1')).not.toBeInTheDocument();
  });

  it('shows colored speaker chips once speakers are known', async () => {
    vi.spyOn(meetingsApi, 'live').mockResolvedValue({
      lines: [{ start: 12.4, end: 15.1, speaker: 'SPEAKER 1', languages: ['ro', 'ru'], text: 'Mulțumesc, doctore.' }],
      total: 6,
      speakers: true,
      topics: [],
      decisions: 0,
      tasks: 0,
    });

    renderWithProviders(<ProcessingCard meeting={meeting()} />);

    expect(await screen.findByText('Speaker 1')).toBeInTheDocument();
    // LanguageBadges renders the raw language code as its text ("ro", "ru"), same as elsewhere in the app.
    expect(screen.getByText('ro')).toBeInTheDocument();
    expect(screen.getByText('ru')).toBeInTheDocument();
    expect(screen.queryByText('…')).not.toBeInTheDocument();
  });

  it('shows a calm placeholder before any topics, decisions or tasks are found', async () => {
    renderWithProviders(<ProcessingCard meeting={meeting()} />);

    expect(await screen.findByText('Topics appear here as they are identified.')).toBeInTheDocument();
  });

  it('shows topics popping in as chips, and decision/task counts', async () => {
    vi.spyOn(meetingsApi, 'live').mockResolvedValue({
      lines: [],
      total: 0,
      speakers: false,
      topics: ['Patul 8', 'Patul 9'],
      // Double digits so they can't collide with the stage tracker's own 1-5 step numerals.
      decisions: 12,
      tasks: 27,
    });

    renderWithProviders(<ProcessingCard meeting={meeting()} />);

    expect(await screen.findByText('Patul 8')).toBeInTheDocument();
    expect(screen.getByText('Patul 9')).toBeInTheDocument();
    expect(screen.getByText('12')).toBeInTheDocument();
    expect(screen.getByText('27')).toBeInTheDocument();
    expect(screen.queryByText('Topics appear here as they are identified.')).not.toBeInTheDocument();
  });

  it('plays a brief success beat instead of the live view once processing has finished', async () => {
    renderWithProviders(<ProcessingCard meeting={meeting({ status: 'ready' })} done />);

    // "Ready!" also appears in a visually-hidden aria-live announcer (for screen readers, alongside this heading);
    // the heading role picks out the one visible title unambiguously.
    expect(await screen.findByRole('heading', { name: 'Ready!' })).toBeInTheDocument();
    expect(screen.getByText('Opening the minutes…')).toBeInTheDocument();
    expect(screen.queryByText('Live transcript')).not.toBeInTheDocument();
    expect(
      screen.queryByText('This page updates by itself. You can leave it: the processing continues on the server.'),
    ).not.toBeInTheDocument();
    // Stopped polling: processing is over, nothing new is coming.
    expect(meetingsApi.live).not.toHaveBeenCalled();
  });
});
