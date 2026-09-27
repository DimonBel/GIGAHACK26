import { ModalsProvider } from '@mantine/modals';
import { screen } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';

import { renderWithProviders } from '../../test/render';
import { ListsPage } from './ListsPage';

const ANSWERS: Record<string, unknown> = {
  '/api/lists': [],
  '/api/directory': [],
  '/api/directory/domains': ['medpark.md', 'medpark.local'],
};

describe('ListsPage', () => {
  beforeEach(() => {
    vi.stubGlobal(
      'fetch',
      vi.fn((url: string) => Promise.resolve(new Response(JSON.stringify(ANSWERS[url]), { status: 200 }))),
    );
  });

  afterEach(() => vi.unstubAllGlobals());

  it('takes outside addresses from the allowed recipient domains only', async () => {
    renderWithProviders(
      <ModalsProvider>
        <ListsPage />
      </ModalsProvider>,
    );
    await userEvent.click(await screen.findByRole('button', { name: 'New list' }));
    expect(screen.getByText('At medpark.md or medpark.local (the allowed recipient domains).')).toBeInTheDocument();

    const address = screen.getByLabelText('Email address');
    await userEvent.type(address, 'guest@gmail.com');
    await userEvent.click(screen.getByLabelText('Add the address'));
    expect(screen.getByText('Only addresses at medpark.md or medpark.local')).toBeInTheDocument();

    await userEvent.clear(address);
    await userEvent.type(address, 'quality@medpark.local');
    await userEvent.click(screen.getByLabelText('Add the address'));
    expect(screen.getByText('quality@medpark.local')).toBeInTheDocument();
  });
});
