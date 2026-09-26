import {
  Alert,
  Button,
  Group,
  NumberInput,
  Paper,
  SegmentedControl,
  Select,
  SimpleGrid,
  Stack,
  TagsInput,
  Text,
  TextInput,
  Title,
} from '@mantine/core';
import { useForm } from '@mantine/form';
import { IconAlertTriangle, IconDeviceFloppy } from '@tabler/icons-react';
import type { ReactNode } from 'react';

import { useSaveSettings, useSettings } from '../../api/queries';
import type { Delivery, Settings } from '../../api/types';
import { PageHeader } from '../../components/PageHeader';
import { ErrorState, LoadingState } from '../../components/QueryState';
import { isDomain, isEmail } from '../../lib/email';
import { isLocalHost, urlHost } from '../../lib/network';
import { notifySuccess } from '../../lib/notify';

const ENGINE_OPTIONS = [
  { value: 'mlx', label: 'MLX (Apple Silicon GPU)' },
  { value: 'whisper.cpp', label: 'whisper.cpp (CPU / CUDA)' },
];
const LANGUAGE_OPTIONS = [
  { value: 'auto', label: 'Automatic, per sentence (ro / ru / en)' },
  { value: 'ro', label: 'Romanian only' },
  { value: 'ru', label: 'Russian only' },
  { value: 'en', label: 'English only' },
];
const DELIVERY_OPTIONS: { value: Delivery; label: string }[] = [
  { value: 'n8n', label: 'n8n workflow' },
  { value: 'smtp', label: 'Direct SMTP' },
];
const MAX_PORT = 65535;
const MAX_DURATION_MIN = 24 * 60;
const REMOTE_HOST_WARNING =
  'Not this machine: the server refuses it unless remote delivery was enabled by the operator. Meeting data must stay on-premises.';

function Section({ title, description, children }: { title: string; description: string; children: ReactNode }) {
  return (
    <Paper withBorder p="lg">
      <Stack gap="sm">
        <div>
          <Title order={4}>{title}</Title>
          <Text size="xs" c="dimmed">
            {description}
          </Text>
        </div>
        {children}
      </Stack>
    </Paper>
  );
}

/** A warning under a host field that is not this machine. */
function hostWarning(host: string) {
  return host && !isLocalHost(host) ? (
    <Text size="xs" c="orange.8" component="span">
      <IconAlertTriangle size={12} style={{ verticalAlign: 'middle' }} /> {REMOTE_HOST_WARNING}
    </Text>
  ) : undefined;
}

function SettingsForm({ settings }: { settings: Settings }) {
  const save = useSaveSettings();
  const form = useForm<Settings>({
    mode: 'controlled',
    initialValues: settings,
    validate: {
      asr_model: (value) => (value.trim() ? null : 'Enter the model path'),
      llm_model: (value) => (value.trim() ? null : 'Enter the Ollama model name'),
      n8n_webhook_url: (value) => (urlHost(value) ? null : 'Enter an http(s) URL'),
      smtp_host: (value) => (value.trim() ? null : 'Enter the SMTP host'),
      smtp_port: (value) => (Number.isInteger(value) && value >= 1 && value <= MAX_PORT ? null : 'Port 1–65535'),
      mail_from: (value) => (isEmail(value) ? null : 'Enter a valid email address'),
      allowed_recipient_domains: (value) =>
        value.every(isDomain) ? null : 'Enter domain names such as medpark.md, without @',
      keep_audio_days: (value) => (Number.isInteger(value) && value >= 0 ? null : '0 or more days'),
      max_upload_mb: (value) => (Number.isInteger(value) && value >= 1 ? null : 'At least 1 MB'),
      max_duration_min: (value) =>
        Number.isInteger(value) && value >= 1 && value <= MAX_DURATION_MIN ? null : `1–${MAX_DURATION_MIN} minutes`,
    },
  });

  const submit = form.onSubmit((values) =>
    save.mutate(values, {
      onSuccess: (saved) => {
        form.setInitialValues(saved);
        form.setValues(saved);
        form.resetDirty(saved);
        notifySuccess('Settings saved.');
      },
    }),
  );

  const { values } = form;

  return (
    <form onSubmit={submit} noValidate>
      <Stack gap="lg">
        <SimpleGrid cols={{ base: 1, md: 2 }} spacing="lg">
          <Section title="Speech recognition" description="Whisper, running on this server.">
            <Select label="Engine" data={ENGINE_OPTIONS} allowDeselect={false} {...form.getInputProps('asr_engine')} />
            <TextInput
              label="Model"
              description="Path of the Whisper model, relative to the project folder."
              {...form.getInputProps('asr_model')}
            />
            <Select
              label="Language"
              data={LANGUAGE_OPTIONS}
              allowDeselect={false}
              {...form.getInputProps('language')}
            />
          </Section>

          <Section title="Minutes" description="The local LLM served by Ollama on this machine.">
            <TextInput
              label="LLM model"
              description="Ollama model name, e.g. gemma4:e4b."
              {...form.getInputProps('llm_model')}
            />
          </Section>

          <Section
            title="Email delivery"
            description="Minutes are emailed through the hospital's own mail server only."
          >
            <SegmentedControl
              data={DELIVERY_OPTIONS}
              value={values.delivery}
              onChange={(value) => form.setFieldValue('delivery', value)}
              aria-label="Delivery"
            />
            <TextInput
              label="n8n webhook URL"
              disabled={values.delivery !== 'n8n'}
              description={
                hostWarning(urlHost(values.n8n_webhook_url)) ?? 'The workflow that routes and sends the email.'
              }
              {...form.getInputProps('n8n_webhook_url')}
            />
            <Group grow align="flex-start">
              <TextInput
                label="SMTP host"
                description={hostWarning(values.smtp_host) ?? 'Used for direct delivery (MailHog: 127.0.0.1).'}
                {...form.getInputProps('smtp_host')}
              />
              <NumberInput
                label="SMTP port"
                min={1}
                max={MAX_PORT}
                allowDecimal={false}
                {...form.getInputProps('smtp_port')}
              />
            </Group>
            <TextInput label="Sender address" type="email" {...form.getInputProps('mail_from')} />
            <TagsInput
              label="Allowed recipient domains"
              description={
                values.allowed_recipient_domains.length > 0 ? (
                  'Minutes can only be sent to addresses at these domains (exactly; add subdomains separately).'
                ) : (
                  <Text size="xs" c="orange.8" component="span">
                    <IconAlertTriangle size={12} style={{ verticalAlign: 'middle' }} /> Any domain: minutes can be
                    emailed outside the hospital.
                  </Text>
                )
              }
              placeholder="medpark.md"
              splitChars={[',', ' ']}
              clearable
              {...form.getInputProps('allowed_recipient_domains')}
            />
          </Section>

          <Section title="Privacy and limits" description="How long recordings are kept, and how large they may be.">
            <NumberInput
              label="Keep recordings (days)"
              description="0 deletes the recording as soon as it is processed; the transcript and minutes stay."
              min={0}
              allowDecimal={false}
              {...form.getInputProps('keep_audio_days')}
            />
            <NumberInput
              label="Largest upload (MB)"
              min={1}
              allowDecimal={false}
              {...form.getInputProps('max_upload_mb')}
            />
            <NumberInput
              label="Longest recording (minutes)"
              description="Longer recordings are refused at upload."
              min={1}
              max={MAX_DURATION_MIN}
              allowDecimal={false}
              {...form.getInputProps('max_duration_min')}
            />
          </Section>
        </SimpleGrid>

        {values.delivery === 'smtp' && (
          <Alert color="blue" variant="light">
            Direct SMTP skips the n8n workflow (routing per meeting type). Use it as a fallback.
          </Alert>
        )}

        <Group justify="flex-end">
          <Button variant="default" onClick={() => form.reset()} disabled={!form.isDirty() || save.isPending}>
            Discard changes
          </Button>
          <Button
            type="submit"
            leftSection={<IconDeviceFloppy size={16} />}
            loading={save.isPending}
            disabled={!form.isDirty()}
          >
            Save settings
          </Button>
        </Group>
      </Stack>
    </form>
  );
}

export function SettingsPage() {
  const settings = useSettings();
  return (
    <>
      <PageHeader
        title="Settings"
        description="Models, email delivery and retention. Changes apply to the next meeting."
      />
      {settings.isPending ? (
        <LoadingState />
      ) : settings.isError ? (
        <ErrorState error={settings.error} onRetry={() => void settings.refetch()} />
      ) : (
        <SettingsForm settings={settings.data} />
      )}
    </>
  );
}
