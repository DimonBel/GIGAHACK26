import { useForm } from '@mantine/form';
import { screen, within } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { afterEach, describe, expect, it, vi } from 'vitest';

import { meetingsApi, usersApi } from '../../api/endpoints';
import type { DirectoryEntry, Minutes } from '../../api/types';
import { toFormValues, type MinutesFormValues } from '../../lib/minutesForm';
import { renderWithProviders } from '../../test/render';
import { MinutesDocument } from './MinutesDocument';

const minutes: Minutes = {
  title: 'Medical board 26.09',
  summary: 'Two patients were discussed.',
  key_moments: [{ time: '04:12', moment: 'Transfer to ICU' }],
  topics: [
    { name: 'Bed 8', time: '00:03', status: 'Stable after surgery', findings: ['BP 120/80'] },
    { name: 'Bed 9', time: '06:10', status: 'Fever', findings: [] },
  ],
  decisions: [{ decision: 'Start amikacin', time: '01:32', patient: 'Bed 8' }],
  action_items: [
    {
      task: 'Order a chest X-ray',
      owner: 'Nurse',
      deadline: 'tomorrow',
      priority: 'low',
      time: '07:00',
      patient: 'Bed 9',
    },
    {
      task: 'Call urology',
      owner: 'Dr. Butnari',
      deadline: 'today',
      priority: 'high',
      time: '05:36',
      patient: 'Bed 8',
    },
  ],
  open_issues: ['Bed 9: culture pending'],
  warnings: ['[00:05] value(s) 120 not found in the transcript'],
  attendees: [],
  participants: { 'SPEAKER 1': { role: 'leads the round', name: 'Daniela', seconds: 312 } },
};

const values = toFormValues(minutes);

afterEach(() => vi.restoreAllMocks());

describe('MinutesDocument', () => {
  it('opens on an overview with the counts, warnings and key moments', () => {
    renderWithProviders(<MinutesDocument values={values} meetingType="medical" />);

    expect(screen.getByRole('heading', { name: 'Medical board 26.09' })).toBeInTheDocument();
    expect(screen.getByText('1 value not found in the transcript')).toBeInTheDocument();
    expect(screen.getByText('Transfer to ICU')).toBeInTheDocument();
    expect(screen.queryByText(/AI suggestions/)).not.toBeInTheDocument();
  });

  it('opens the patient discussed at a key moment', async () => {
    renderWithProviders(<MinutesDocument values={values} meetingType="medical" />);

    await userEvent.click(screen.getByRole('button', { name: '04:12: open what was discussed' }));

    expect(screen.getByRole('heading', { name: 'Bed 8' })).toBeInTheDocument();
    expect(screen.getByText('Start amikacin')).toBeInTheDocument();
    expect(screen.getByText('BP 120/80')).toBeInTheDocument();
  });

  it('lists every action item most urgent first, with its topic', async () => {
    renderWithProviders(<MinutesDocument values={values} meetingType="medical" />);

    await userEvent.click(within(screen.getByRole('navigation')).getByRole('button', { name: /Action items/ }));

    const tasks = screen.getAllByText(/Order a chest X-ray|Call urology/).map((node) => node.textContent);
    expect(tasks).toEqual(['Call urology', 'Order a chest X-ray']);
    await userEvent.click(screen.getByRole('button', { name: 'Bed 9' }));
    expect(screen.getByRole('heading', { name: 'Bed 9' })).toBeInTheDocument();
  });

  it('lists patients and agenda items alike as topics', () => {
    renderWithProviders(<MinutesDocument values={values} meetingType="executive" />);

    const sidebar = within(screen.getByRole('navigation'));
    expect(sidebar.getByText('Topics')).toBeInTheDocument();
    expect(sidebar.queryByText(/Patients|Agenda items/)).not.toBeInTheDocument();
  });

  it("opens a decision's moment in the transcript", async () => {
    const transcript = vi.spyOn(meetingsApi, 'transcript').mockResolvedValue({
      language: 'ro',
      utterances: [
        { start: 3, end: 60, speaker: 'SPEAKER 1', languages: ['ro'], text: 'Patul opt, stabil.' },
        { start: 90, end: 99, speaker: 'SPEAKER 2', languages: ['ro', 'ru'], text: 'Începem amikacina, хорошо.' },
        { start: 370, end: 380, speaker: 'SPEAKER 1', languages: ['ro'], text: 'Patul nouă.' },
      ],
    });
    renderWithProviders(<MinutesDocument values={values} meetingType="medical" transcriptOf="m1" />);

    await userEvent.click(screen.getByRole('button', { name: /Bed 8/ }));
    await userEvent.click(screen.getByRole('button', { name: '01:32: show in the transcript' }));

    expect(await screen.findByText('Începem amikacina, хорошо.')).toBeInTheDocument();
    expect(screen.getByText('Patul opt, stabil.')).toBeInTheDocument();
    expect(screen.queryByText('Patul nouă.')).not.toBeInTheDocument();
    expect(screen.getByText('Daniela')).toBeInTheDocument();
    expect(transcript).toHaveBeenCalledOnce();
  });

  it('without the transcript, times inside a patient are plain text', async () => {
    renderWithProviders(<MinutesDocument values={values} meetingType="medical" />);

    await userEvent.click(screen.getByRole('button', { name: /Bed 8/ }));

    expect(screen.getByText('01:32')).toBeInTheDocument();
    expect(screen.queryByRole('button', { name: /01:32/ })).not.toBeInTheDocument();
  });

  it("shows a topic's decision said while another topic was discussed below that topic's lines", async () => {
    vi.spyOn(meetingsApi, 'transcript').mockResolvedValue({
      language: 'ro',
      utterances: [
        { start: 3, end: 60, speaker: 'SPEAKER 1', languages: ['ro'], text: 'Patul opt, stabil.' },
        { start: 370, end: 380, speaker: 'SPEAKER 1', languages: ['ro'], text: 'Patul nouă.' },
        { start: 548, end: 556, speaker: 'SPEAKER 2', languages: ['ro'], text: 'Revenim la patul opt: amikacină.' },
      ],
    });
    const late = toFormValues({
      ...minutes,
      decisions: [{ decision: 'Start amikacin', time: '09:10', patient: 'Bed 8' }],
    });
    renderWithProviders(<MinutesDocument values={late} meetingType="medical" transcriptOf="m1" />);

    await userEvent.click(within(screen.getByRole('navigation')).getByRole('button', { name: /Bed 8/ }));
    await userEvent.click(screen.getByRole('button', { name: '09:10: show in the transcript' }));

    expect(await screen.findByText('Said at 09:08, while another topic was discussed:')).toBeInTheDocument();
    expect(screen.getByText('Revenim la patul opt: amikacină.')).toBeInTheDocument();
    expect(screen.queryByText('Patul nouă.')).not.toBeInTheDocument();
  });
});

describe('attendees', () => {
  const directoryEntry: DirectoryEntry = {
    id: 5,
    full_name: 'Dr. Elena Rusu',
    position: 'Doctor',
    specialty: 'Cardiology',
    job_title: 'Head of cardiology',
    email: 'elena@medpark.md',
  };

  /** The document in edit mode, holding its own form (as MinutesEditor would). */
  function EditableDocument({ initial }: { initial: MinutesFormValues }) {
    const form = useForm<MinutesFormValues>({ mode: 'controlled', initialValues: initial });
    return <MinutesDocument values={form.values} meetingType="medical" form={form} />;
  }

  const openParticipants = () =>
    userEvent.click(within(screen.getByRole('navigation')).getByRole('button', { name: /^Participants/ }));

  afterEach(() => vi.restoreAllMocks());

  it('reads who attended, above the voices in the recording', async () => {
    const withAttendee = toFormValues({
      ...minutes,
      attendees: [
        {
          user_id: 5,
          name: 'Dr. Elena Rusu',
          job_title: 'Head of cardiology',
          position: 'Doctor',
          specialty: 'Cardiology',
        },
      ],
    });
    renderWithProviders(<MinutesDocument values={withAttendee} meetingType="medical" />);

    await openParticipants();

    expect(screen.getByText('Present at the meeting (1)')).toBeInTheDocument();
    expect(screen.getByText('Dr. Elena Rusu')).toBeInTheDocument();
    expect(screen.getByText('Head of cardiology · Doctor · Cardiology')).toBeInTheDocument();
    expect(screen.getByText('Voices in the recording')).toBeInTheDocument();
  });

  it('adds an attendee from the directory, then does not offer them again', async () => {
    vi.spyOn(usersApi, 'directory').mockResolvedValue([directoryEntry]);
    renderWithProviders(<EditableDocument initial={toFormValues(minutes)} />);

    await openParticipants();
    await userEvent.click(screen.getByRole('combobox', { name: 'Add from the directory' }));
    await userEvent.click(await screen.findByText(/Dr\. Elena Rusu/));

    expect(screen.getByText('Present at the meeting (1)')).toBeInTheDocument();
    expect(screen.getByText('Head of cardiology · Doctor · Cardiology')).toBeInTheDocument();

    await userEvent.click(screen.getByRole('combobox', { name: 'Add from the directory' }));
    expect(await screen.findByText('Nobody found')).toBeInTheDocument();
  });

  it('adds someone from outside the directory', async () => {
    vi.spyOn(usersApi, 'directory').mockResolvedValue([]);
    renderWithProviders(<EditableDocument initial={toFormValues(minutes)} />);

    await openParticipants();
    await userEvent.click(screen.getByRole('button', { name: 'Add someone outside the directory' }));
    await userEvent.type(screen.getByRole('combobox', { name: 'Name of attendee 1' }), 'Ion Vasile');
    await userEvent.type(screen.getByLabelText('Function or role of attendee 1'), 'Family member');

    expect(screen.getByText('Present at the meeting (1)')).toBeInTheDocument();
    expect(screen.getByDisplayValue('Ion Vasile')).toBeInTheDocument();
    expect(screen.getByDisplayValue('Family member')).toBeInTheDocument();
  });

  it('links a visitor whose name is a user of the directory to that user', async () => {
    vi.spyOn(usersApi, 'directory').mockResolvedValue([directoryEntry]);
    renderWithProviders(<EditableDocument initial={toFormValues(minutes)} />);

    await openParticipants();
    await userEvent.click(screen.getByRole('button', { name: 'Add someone outside the directory' }));
    await userEvent.type(screen.getByRole('combobox', { name: 'Name of attendee 1' }), 'elena rusu');
    await userEvent.tab();

    // Now the user of the directory: their details, no longer fields to type in.
    expect(await screen.findByText('Head of cardiology · Doctor · Cardiology')).toBeInTheDocument();
    expect(screen.queryByRole('combobox', { name: 'Name of attendee 1' })).not.toBeInTheDocument();
  });

  it('names a voice after a user of the directory: added as present, with their function', async () => {
    vi.spyOn(usersApi, 'directory').mockResolvedValue([directoryEntry]);
    renderWithProviders(<EditableDocument initial={toFormValues(minutes)} />);

    await openParticipants();
    const name = screen.getByRole('combobox', { name: 'Name of SPEAKER 1' });
    await userEvent.clear(name);
    await userEvent.type(name, 'Elena');
    await userEvent.click(await screen.findByRole('option', { name: 'Dr. Elena Rusu' }));

    expect(screen.getByText('Present at the meeting (1)')).toBeInTheDocument();
    expect(screen.getByRole('combobox', { name: 'Name of SPEAKER 1' })).toHaveValue('Dr. Elena Rusu');
    expect(screen.getByLabelText('Role of SPEAKER 1')).toHaveValue('Head of cardiology');
  });

  it('removes an attendee', async () => {
    const withAttendee = toFormValues({
      ...minutes,
      attendees: [{ user_id: null, name: 'Ion Vasile', job_title: '', position: '', specialty: '' }],
    });
    vi.spyOn(usersApi, 'directory').mockResolvedValue([]);
    renderWithProviders(<EditableDocument initial={withAttendee} />);

    await openParticipants();
    await userEvent.click(screen.getByRole('button', { name: 'Remove Ion Vasile' }));

    expect(screen.getByText('Present at the meeting (0)')).toBeInTheDocument();
  });
});
