import {
  Autocomplete,
  Button,
  ColorSwatch,
  Group,
  Select,
  SimpleGrid,
  Stack,
  Text,
  TextInput,
  Title,
} from '@mantine/core';
import { useTranslation } from 'react-i18next';

import { useDirectory } from '../../api/queries';
import type { Attendee, DirectoryEntry } from '../../api/types';
import { formatDuration } from '../../lib/format';
import { attendeeDetails, directoryUser, speakerColor, speakerLabel, speakerName } from '../../lib/minutesDoc';
import { useMinutesDocument, type MinutesForm } from './context';
import { Block, HAIRLINE, RemoveButton } from './parts';

/** A user of the directory as an attendee: linked to their account, with what the directory knows of them. */
function asAttendee(entry: DirectoryEntry): Attendee {
  return {
    user_id: entry.id,
    name: entry.full_name,
    job_title: entry.job_title,
    position: entry.position,
    specialty: entry.specialty,
  };
}

/** Read mode: everyone present, whether or not they spoke. */
function AttendeesList({ attendees }: { attendees: Attendee[] }) {
  return (
    <Stack gap={0}>
      {attendees.map((attendee, index) => {
        const details = attendeeDetails(attendee);
        return (
          <Stack key={index} gap={0} py="xs" style={index ? { borderTop: HAIRLINE } : undefined}>
            <Text size="sm" fw={600}>
              {attendee.name}
            </Text>
            {details && (
              <Text size="xs" c="dimmed">
                {details}
              </Text>
            )}
          </Stack>
        );
      })}
    </Stack>
  );
}

/** Edit mode: add attendees from the directory or from outside it, and remove any of them. */
function AttendeesEditor({ form, attendees }: { form: MinutesForm; attendees: Attendee[] }) {
  const { t } = useTranslation('minutes');
  const directory = useDirectory();

  // People already added (by their user id) are not offered again.
  const available = (directory.data ?? []).filter(
    (entry) => !attendees.some((attendee) => attendee.user_id === entry.id),
  );
  const options = available.map((entry) => ({
    value: String(entry.id),
    label: [entry.full_name, attendeeDetails(entry)].filter(Boolean).join(' — '),
  }));

  const addFromDirectory = (value: string | null) => {
    const entry = available.find((candidate) => String(candidate.id) === value);
    if (entry) form.insertListItem('attendees', asAttendee(entry));
  };

  // Someone added from outside whose name is a user's (picked from the suggestions or typed in full): that user.
  const linkIfUser = (index: number, name: string) => {
    const entry = directoryUser(name, available);
    if (entry) form.replaceListItem('attendees', index, asAttendee(entry));
  };

  const addOutside = () =>
    form.insertListItem('attendees', { user_id: null, name: '', job_title: '', position: '', specialty: '' });

  return (
    <Stack gap="xs">
      {attendees.map((attendee, index) => {
        const fromDirectory = attendee.user_id !== null;
        const details = attendeeDetails(attendee);
        return (
          <Group key={index} gap="xs" wrap="nowrap" align="flex-start">
            {fromDirectory ? (
              <Stack gap={0} style={{ flex: 1 }}>
                <Text size="sm" fw={600}>
                  {attendee.name}
                </Text>
                {details && (
                  <Text size="xs" c="dimmed">
                    {details}
                  </Text>
                )}
              </Stack>
            ) : (
              <Group gap="xs" wrap="nowrap" align="flex-start" style={{ flex: 1 }}>
                <Autocomplete
                  style={{ flex: 1 }}
                  placeholder={t('participants.outsideNamePlaceholder')}
                  aria-label={t('participants.outsideNameAria', { index: index + 1 })}
                  data={[...new Set(available.map((entry) => entry.full_name))]}
                  {...form.getInputProps(`attendees.${index}.name`)}
                  onOptionSubmit={(name) => linkIfUser(index, name)}
                  onBlur={(event) => linkIfUser(index, event.currentTarget.value)}
                />
                <TextInput
                  style={{ flex: 1 }}
                  placeholder={t('participants.outsideRolePlaceholder')}
                  aria-label={t('participants.outsideRoleAria', { index: index + 1 })}
                  {...form.getInputProps(`attendees.${index}.job_title`)}
                />
              </Group>
            )}
            <RemoveButton
              label={t('participants.removeAttendee', { name: attendee.name.trim() || t('participants.unnamed') })}
              onClick={() => form.removeListItem('attendees', index)}
            />
          </Group>
        );
      })}
      <Group gap="xs" align="flex-end" wrap="wrap">
        <Select
          style={{ flex: 1, minWidth: 220 }}
          searchable
          value={null}
          data={options}
          label={t('participants.addFromDirectory')}
          placeholder={t('participants.addFromDirectoryPlaceholder')}
          nothingFoundMessage={t('participants.nothingFound')}
          onChange={addFromDirectory}
        />
        <Button variant="default" onClick={addOutside}>
          {t('participants.addOutside')}
        </Button>
      </Group>
    </Stack>
  );
}

/** Who was at the meeting (the attendees the moderator added) and the voices in the recording. */
export function ParticipantsSection() {
  const { t } = useTranslation('minutes');
  const { values, form } = useMinutesDocument();
  const directory = useDirectory();
  const voices = values.participants
    .map((participant, index) => ({ participant, index }))
    .sort((a, b) => b.participant.seconds - a.participant.seconds);
  const attendeeNames = [...new Set(values.attendees.map((attendee) => attendee.name.trim()).filter(Boolean))];
  const users = (directory.data ?? []).filter((entry) => !attendeeNames.includes(entry.full_name));
  const nameOptions = [
    { group: t('participants.groupPresent'), items: attendeeNames },
    { group: t('participants.groupDirectory'), items: [...new Set(users.map((entry) => entry.full_name))] },
  ].filter((group) => group.items.length);

  // A voice named after a user of the directory: that user is at the meeting (added once), and the role the AI
  // guessed gives way to what the directory knows.
  const nameVoice = (index: number, name: string) => {
    if (!form) return;
    const entry = directoryUser(name, directory.data ?? []);
    if (!entry) return;
    if (!values.attendees.some((attendee) => attendee.user_id === entry.id)) {
      form.insertListItem('attendees', asAttendee(entry));
    }
    const role = entry.job_title || entry.position;
    if (role) form.setFieldValue(`participants.${index}.role`, role);
  };

  return (
    <Stack gap="lg">
      <Title order={2}>{t('labels.participants')}</Title>

      <Block title={t('participants.presentTitle', { count: values.attendees.length })}>
        {form ? (
          <AttendeesEditor form={form} attendees={values.attendees} />
        ) : values.attendees.length === 0 ? (
          <Text size="sm" c="dimmed">
            {t('participants.noAttendees')}
          </Text>
        ) : (
          <AttendeesList attendees={values.attendees} />
        )}
      </Block>

      <Block
        title={t('participants.voicesTitle')}
        note={form ? t('participants.voicesDescriptionEdit') : t('participants.voicesDescriptionView')}
      >
        {voices.length === 0 && (
          <Text size="sm" c="dimmed">
            {t('participants.noSpeakers')}
          </Text>
        )}
        <Stack gap={0}>
          {voices.map(({ participant, index }) => (
            <SimpleGrid
              key={participant.speaker}
              cols={{ base: 1, sm: 3 }}
              spacing="md"
              verticalSpacing={6}
              py="sm"
              style={{ borderTop: HAIRLINE }}
            >
              <Group gap="sm" wrap="nowrap" align="flex-start">
                <ColorSwatch
                  size={10}
                  mt={6}
                  color={`var(--mantine-color-${speakerColor(participant.speaker)}-6)`}
                  withShadow={false}
                />
                <Stack gap={0}>
                  <Text size="sm" fw={600}>
                    {speakerLabel(participant.speaker)}
                  </Text>
                  <Text size="xs" c="dimmed">
                    {t('participants.talks', { duration: formatDuration(participant.seconds) })}
                  </Text>
                </Stack>
              </Group>
              {form ? (
                <>
                  <Autocomplete
                    data={nameOptions}
                    placeholder={t('participants.namePlaceholder')}
                    aria-label={t('participants.nameLabel', { speaker: participant.speaker })}
                    {...form.getInputProps(`participants.${index}.name`)}
                    onOptionSubmit={(name) => nameVoice(index, name)}
                  />
                  <TextInput
                    placeholder={t('participants.rolePlaceholder')}
                    aria-label={t('participants.roleLabel', { speaker: participant.speaker })}
                    {...form.getInputProps(`participants.${index}.role`)}
                  />
                </>
              ) : (
                <>
                  <Text size="sm" fw={participant.name ? 600 : undefined} c={participant.name ? undefined : 'dimmed'}>
                    {participant.name
                      ? speakerName(values.participants, participant.speaker)
                      : t('participants.notNamed')}
                  </Text>
                  <Stack gap={2}>
                    <Text size="sm">{participant.role || '—'}</Text>
                    {participant.evidence && (
                      <Text size="xs" c="dimmed">
                        {participant.evidence}
                      </Text>
                    )}
                  </Stack>
                </>
              )}
            </SimpleGrid>
          ))}
        </Stack>
      </Block>
    </Stack>
  );
}
