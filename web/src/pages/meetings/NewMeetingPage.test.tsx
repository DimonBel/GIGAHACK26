import { ModalsProvider } from '@mantine/modals';
import { fireEvent, screen } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { createMemoryRouter, RouterProvider } from 'react-router';
import { afterEach, beforeEach, describe, expect, it } from 'vitest';

import { renderWithProviders } from '../../test/render';
import { NewMeetingPage } from './NewMeetingPage';

describe('NewMeetingPage', () => {
  // jsdom has no object URLs: the preview only needs one to exist.
  beforeEach(() => {
    Object.assign(URL, { createObjectURL: () => 'blob:recording', revokeObjectURL: () => undefined });
  });
  afterEach(() => {
    Reflect.deleteProperty(URL, 'createObjectURL');
    Reflect.deleteProperty(URL, 'revokeObjectURL');
  });

  it("says the file can't be previewed when the browser can't play it, instead of a player that does nothing", async () => {
    // A data router: the page asks before leaving with a recording chosen.
    const router = createMemoryRouter([{ path: '/', element: <NewMeetingPage /> }]);
    const { container } = renderWithProviders(
      <ModalsProvider>
        <RouterProvider router={router} />
      </ModalsProvider>,
    );

    const input = container.querySelector<HTMLInputElement>('input[type="file"]');
    await userEvent.upload(input!, new File(['alac'], 'Medpark_audio.m4a', { type: 'audio/mp4' }));
    expect(screen.getByText('Medpark_audio.m4a')).toBeInTheDocument();
    const player = container.querySelector('audio');
    expect(player).toBeInTheDocument();

    fireEvent.error(player!); // Chrome can't decode Apple Lossless
    expect(screen.getByText(/can't play this file's format/)).toBeInTheDocument();
    expect(container.querySelector('audio')).not.toBeInTheDocument();
  });
});
