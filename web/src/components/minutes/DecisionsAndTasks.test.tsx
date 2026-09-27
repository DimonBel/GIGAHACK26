import { useForm } from '@mantine/form';
import { screen, within } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { afterEach, describe, expect, it, vi } from 'vitest';

import { usersApi } from '../../api/endpoints';
import type { Minutes } from '../../api/types';
import { fromFormValues, toFormValues, type MinutesFormValues } from '../../lib/minutesForm';
import { renderWithProviders } from '../../test/render';
import { MinutesDocument } from './MinutesDocument';

const minutes: Minutes = {
  title: 'Board',
  summary: '',
  key_moments: [],
  topics: [
    { name: 'Bed 8', time: '00:03', status: '', findings: [] },
    { name: 'Bed 9', time: '06:10', status: '', findings: [] },
  ],
  decisions: [
    { decision: 'Start ceftriaxone', time: '06:40', patient: 'Bed 9' },
    { decision: 'Start amikacin', time: '01:32', patient: 'Bed 8' },
    { decision: 'Order gloves', time: '', patient: '' },
  ],
  action_items: [
    { task: 'Call urology', owner: 'Dr. Butnari', deadline: '', priority: 'high', time: '', patient: 'Bed 8' },
    { task: 'Chest X-ray', owner: '', deadline: '', priority: 'low', time: '', patient: 'Bed 9' },
    { task: 'Recheck potassium', owner: 'dr. butnari', deadline: '', priority: 'medium', time: '', patient: 'Bed 8' },
  ],
  open_issues: [],
  warnings: [],
  attendees: [],
  participants: {},
};

const sidebar = () => within(screen.getByRole('navigation', { name: 'Minutes sections' }));

afterEach(() => vi.restoreAllMocks());

describe('decisions and action items', () => {
  it('lists every decision in the order it was taken, with its topic', async () => {
    renderWithProviders(<MinutesDocument values={toFormValues(minutes)} meetingType="medical" />);

    await userEvent.click(sidebar().getByRole('button', { name: /Decisions/ }));

    const texts = screen.getAllByText(/Start ceftriaxone|Start amikacin|Order gloves/).map((node) => node.textContent);
    expect(texts).toEqual(['Start amikacin', 'Start ceftriaxone', 'Order gloves']);
    await userEvent.click(screen.getByRole('button', { name: 'Bed 9' }));
    expect(screen.getByRole('heading', { name: 'Bed 9' })).toBeInTheDocument();
  });

  it('groups the action items by who does them', async () => {
    renderWithProviders(<MinutesDocument values={toFormValues(minutes)} meetingType="medical" />);

    await userEvent.click(sidebar().getByRole('button', { name: /Action items/ }));
    await userEvent.click(screen.getByRole('radio', { name: 'By owner' }));

    const owners = screen.getAllByRole('heading', { level: 3 }).map((node) => node.textContent);
    expect(owners).toEqual(['Dr. Butnari', 'No owner yet']);
  });

  it('assigns an action item to a user of the app picked as its owner', async () => {
    vi.spyOn(usersApi, 'directory').mockResolvedValue([
      {
        id: 7,
        full_name: 'Elena Ceban',
        email: 'elena@medpark.md',
        position: 'doctor',
        specialty: 'cardiologist',
        job_title: '',
      },
    ]);
    let values: MinutesFormValues | undefined;
    function Editor() {
      const form = useForm<MinutesFormValues>({ mode: 'controlled', initialValues: toFormValues(minutes) });
      values = form.values;
      return <MinutesDocument values={form.values} meetingType="medical" form={form} transcriptOf="m1" />;
    }
    renderWithProviders(<Editor />);

    await userEvent.click(sidebar().getByRole('button', { name: /Action items/ }));
    // The input, not its dropdown list, which carries the same label.
    const owner = screen.getAllByLabelText('Owner of action item 2').find((node) => node.tagName === 'INPUT')!;
    // Pasted, not typed key by key: every key re-renders the whole document, too slow for a loaded test run.
    await userEvent.click(owner);
    await userEvent.paste('Elena Ceban');

    expect(fromFormValues(values!).action_items[1]).toMatchObject({ owner: 'Elena Ceban', owner_user_id: 7 });
    await userEvent.paste(' (locum)');
    expect(fromFormValues(values!).action_items[1]).toMatchObject({
      owner: 'Elena Ceban (locum)',
      owner_user_id: null,
    });
  });
});
