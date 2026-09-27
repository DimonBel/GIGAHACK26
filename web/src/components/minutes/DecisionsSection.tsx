import { Anchor, Box, Group, Stack, Text, Title } from '@mantine/core';
import { useTranslation } from 'react-i18next';

import { timeToSeconds } from '../../lib/minutesDoc';
import { useMinutesDocument } from './context';
import { DecisionEditRows, TimeLink } from './parts';

const HAIRLINE = '1px solid var(--mantine-color-gray-2)';

/** Every decision of the meeting in the order they were taken, each with its topic. */
export function DecisionsSection() {
  const { t } = useTranslation('minutes');
  const { values, form, select } = useMinutesDocument();
  const decisions = [...values.decisions].sort(
    (a, b) => (timeToSeconds(a.time) ?? Infinity) - (timeToSeconds(b.time) ?? Infinity),
  );
  return (
    <Stack gap="lg">
      <Stack gap={6}>
        <Title order={2}>{t('labels.decisions')}</Title>
        <Text size="sm" c="dimmed">
          {form ? t('decisions.descriptionEdit') : t('decisions.descriptionView')}
        </Text>
      </Stack>
      {form ? (
        <DecisionEditRows which={() => true} newTopic="" />
      ) : decisions.length ? (
        <Stack gap={0}>
          {decisions.map((row, index) => {
            const topic = values.topics.find((candidate) => candidate.key === row.topic);
            return (
              <Group
                key={index}
                gap="sm"
                wrap="nowrap"
                align="flex-start"
                py="xs"
                style={index ? { borderTop: HAIRLINE } : undefined}
              >
                <Box w={52} style={{ flexShrink: 0 }}>
                  <TimeLink time={row.time} topic={row.topic || undefined} />
                </Box>
                <Stack gap={2} style={{ flex: 1, minWidth: 0 }}>
                  <Text size="sm">{row.decision}</Text>
                  {topic ? (
                    <Anchor
                      component="button"
                      type="button"
                      size="xs"
                      ta="left"
                      onClick={() => select({ kind: 'topic', key: topic.key })}
                    >
                      {topic.name.trim() || t('labels.topic')}
                    </Anchor>
                  ) : (
                    row.patient && (
                      <Text size="xs" c="dimmed">
                        {row.patient}
                      </Text>
                    )
                  )}
                </Stack>
              </Group>
            );
          })}
        </Stack>
      ) : (
        <Text size="sm" c="dimmed">
          {t('decisions.empty')}
        </Text>
      )}
    </Stack>
  );
}
