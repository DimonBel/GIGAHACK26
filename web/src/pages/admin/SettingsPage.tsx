import {
  Accordion,
  Affix,
  Alert,
  Badge,
  Button,
  Container,
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
  Transition,
} from '@mantine/core';
import { useForm } from '@mantine/form';
import {
  IconAdjustmentsHorizontal,
  IconAlertTriangle,
  IconClock,
  IconDeviceFloppy,
  IconMailForward,
  IconMicrophone2,
  IconUpload,
} from '@tabler/icons-react';
import type { TFunction } from 'i18next';
import { useState, type ReactNode } from 'react';
import { useTranslation } from 'react-i18next';

import { useSaveSettings, useSettings } from '../../api/queries';
import type { Delivery, Settings } from '../../api/types';
import { PageHeader } from '../../components/PageHeader';
import { ErrorState, LoadingState } from '../../components/QueryState';
import { isDomain, isEmail } from '../../lib/email';
import { PAGE_WIDTH } from '../../lib/layout';
import { isLocalHost, urlHost } from '../../lib/network';
import { notifySuccess } from '../../lib/notify';

type Translate = TFunction<['admin', 'common']>;

const MAX_PORT = 65535;
const MAX_DURATION_MIN = 24 * 60;
const TEAL = 'var(--mantine-color-teal-6)';

function Section({
  icon,
  title,
  description,
  children,
}: {
  icon: ReactNode;
  title: string;
  description: string;
  children: ReactNode;
}) {
  return (
    <Paper withBorder p="lg">
      <Stack gap="sm">
        <div>
          <Group gap={8} wrap="nowrap" align="center">
            {icon}
            <Title order={4}>{title}</Title>
          </Group>
          <Text size="xs" c="dimmed">
            {description}
          </Text>
        </div>
        {children}
      </Stack>
    </Paper>
  );
}

/** A visible label and short help text around a control that has no `label`/`description` props of its own
 *  (e.g. `SegmentedControl`). */
function FieldHint({ label, hint, children }: { label: string; hint?: ReactNode; children: ReactNode }) {
  return (
    <Stack gap={6}>
      <Text size="sm" fw={500}>
        {label}
      </Text>
      {children}
      {hint && (
        <Text size="xs" c="dimmed">
          {hint}
        </Text>
      )}
    </Stack>
  );
}

/** Technical fields (paths, model names, hosts) that most admins never need to touch; collapsed by default, and
 *  opened when one of them is invalid, so its error shows. */
function AdvancedSection({ invalid, children }: { invalid: boolean; children: ReactNode }) {
  const { t } = useTranslation('admin');
  const [open, setOpen] = useState<string | null>(null);
  const [wasInvalid, setWasInvalid] = useState(invalid);
  if (invalid !== wasInvalid) {
    setWasInvalid(invalid);
    if (invalid) setOpen('advanced');
  }
  return (
    <Accordion variant="separated" keepMounted={false} value={open} onChange={setOpen}>
      <Accordion.Item value="advanced">
        <Accordion.Control icon={<IconAdjustmentsHorizontal size={16} />}>
          {t('settings.advanced', { ns: 'admin' })}
        </Accordion.Control>
        <Accordion.Panel>
          <Stack gap="sm">
            <Text size="xs" c="dimmed">
              {t('settings.advancedWarning', { ns: 'admin' })}
            </Text>
            {children}
          </Stack>
        </Accordion.Panel>
      </Accordion.Item>
    </Accordion>
  );
}

/** A warning under a host field that is not this machine. */
function hostWarning(t: Translate, host: string) {
  return host && !isLocalHost(host) ? (
    <Text size="xs" c="orange.8" component="span">
      <IconAlertTriangle size={12} style={{ verticalAlign: 'middle' }} />{' '}
      {t('settings.remoteHostWarning', { ns: 'admin' })}
    </Text>
  ) : undefined;
}

/** A sticky bar shown only while the settings form has unsaved edits. Floats above the page (a portal), so it
 *  works regardless of scroll position. */
function UnsavedChangesBar({
  dirty,
  saving,
  onDiscard,
  onSave,
}: {
  dirty: boolean;
  saving: boolean;
  onDiscard: () => void;
  onSave: () => void;
}) {
  const { t } = useTranslation('admin');
  return (
    <Affix position={{ bottom: 0, left: 0, right: 0 }} zIndex={150}>
      <Transition transition="slide-up" mounted={dirty}>
        {(styles) => (
          <Paper style={styles} withBorder shadow="lg" radius={0} py="sm" className="no-print">
            <Container size={PAGE_WIDTH} px={{ base: 'md', sm: 'lg' }}>
              <Group justify="space-between" gap="sm" wrap="wrap">
                <Badge size="lg" variant="light" color="yellow">
                  {t('settings.unsavedBadge', { ns: 'admin' })}
                </Badge>
                <Group gap="sm">
                  <Button variant="default" onClick={onDiscard} disabled={saving}>
                    {t('settings.discardChanges', { ns: 'admin' })}
                  </Button>
                  <Button leftSection={<IconDeviceFloppy size={16} />} onClick={onSave} loading={saving}>
                    {t('settings.save', { ns: 'admin' })}
                  </Button>
                </Group>
              </Group>
            </Container>
          </Paper>
        )}
      </Transition>
    </Affix>
  );
}

function SettingsForm({ settings }: { settings: Settings }) {
  const { t } = useTranslation(['admin', 'common']);
  const save = useSaveSettings();
  const form = useForm<Settings>({
    mode: 'controlled',
    initialValues: settings,
    validate: {
      asr_model: (value) => (value.trim() ? null : t('settings.validationText.modelPath', { ns: 'admin' })),
      llm_model: (value) => (value.trim() ? null : t('settings.validationText.llmModelName', { ns: 'admin' })),
      n8n_webhook_url: (value) => (urlHost(value) ? null : t('settings.validationText.webhookUrl', { ns: 'admin' })),
      smtp_host: (value) => (value.trim() ? null : t('settings.validationText.smtpHost', { ns: 'admin' })),
      smtp_port: (value) =>
        Number.isInteger(value) && value >= 1 && value <= MAX_PORT
          ? null
          : t('settings.validationText.smtpPort', { ns: 'admin', max: MAX_PORT }),
      mail_from: (value) => (isEmail(value) ? null : t('validation.email', { ns: 'admin' })),
      allowed_recipient_domains: (value) =>
        value.every(isDomain) ? null : t('settings.validationText.domains', { ns: 'admin' }),
      keep_audio_days: (value) =>
        Number.isInteger(value) && value >= 0 ? null : t('settings.validationText.keepAudioDays', { ns: 'admin' }),
      max_upload_mb: (value) =>
        Number.isInteger(value) && value >= 1
          ? null
          : t('settings.validationText.maxUploadMb', { ns: 'admin', min: 1 }),
      max_duration_min: (value) =>
        Number.isInteger(value) && value >= 1 && value <= MAX_DURATION_MIN
          ? null
          : t('settings.validationText.maxDurationMin', { ns: 'admin', min: 1, max: MAX_DURATION_MIN }),
    },
  });

  const submit = form.onSubmit((values) =>
    save.mutate(values, {
      onSuccess: (saved) => {
        form.setInitialValues(saved);
        form.setValues(saved);
        form.resetDirty(saved);
        notifySuccess(t('settings.notifySaved', { ns: 'admin' }));
      },
    }),
  );

  const { values } = form;
  const invalid = (...fields: (keyof Settings)[]) => fields.some((field) => Boolean(form.errors[field]));
  const dirty = form.isDirty();

  const engineOptions = [
    { value: 'mlx', label: t('settings.engineOptions.mlx', { ns: 'admin' }) },
    { value: 'whisper.cpp', label: t('settings.engineOptions.whisperCpp', { ns: 'admin' }) },
  ];
  const languageOptions = [
    { value: 'auto', label: t('settings.languageOptions.auto', { ns: 'admin' }) },
    { value: 'ro', label: t('settings.languageOptions.ro', { ns: 'admin' }) },
    { value: 'ru', label: t('settings.languageOptions.ru', { ns: 'admin' }) },
    { value: 'en', label: t('settings.languageOptions.en', { ns: 'admin' }) },
  ];
  const deliveryOptions: { value: Delivery; label: string }[] = [
    { value: 'n8n', label: t('settings.deliveryOptions.n8n', { ns: 'admin' }) },
    { value: 'smtp', label: t('settings.deliveryOptions.smtp', { ns: 'admin' }) },
  ];

  return (
    <>
      <form onSubmit={submit} noValidate>
        {/* Room at the bottom for the bar of unsaved changes, so it never covers the end of the page. */}
        <Stack gap="lg" pb={dirty ? 96 : undefined}>
          <SimpleGrid cols={{ base: 1, md: 2 }} spacing="lg">
            <Section
              icon={<IconMailForward size={18} color={TEAL} />}
              title={t('settings.sections.emailTitle', { ns: 'admin' })}
              description={t('settings.sections.emailDescription', { ns: 'admin' })}
            >
              <TextInput
                label={t('settings.fields.senderAddress', { ns: 'admin' })}
                description={t('settings.fields.senderAddressDescription', { ns: 'admin' })}
                type="email"
                {...form.getInputProps('mail_from')}
              />
              <FieldHint
                label={t('settings.fields.deliveryLabel', { ns: 'admin' })}
                hint={t('settings.fields.deliveryHint', { ns: 'admin' })}
              >
                <SegmentedControl
                  fullWidth
                  data={deliveryOptions}
                  value={values.delivery}
                  onChange={(value) => form.setFieldValue('delivery', value)}
                  aria-label={t('settings.fields.deliveryAria', { ns: 'admin' })}
                />
              </FieldHint>
              <TagsInput
                label={t('settings.fields.allowedDomains', { ns: 'admin' })}
                description={
                  values.allowed_recipient_domains.length > 0 ? (
                    t('settings.fields.allowedDomainsDescription', { ns: 'admin' })
                  ) : (
                    <Text size="xs" c="orange.8" component="span">
                      <IconAlertTriangle size={12} style={{ verticalAlign: 'middle' }} />{' '}
                      {t('settings.fields.allowedDomainsAnyWarning', { ns: 'admin' })}
                    </Text>
                  )
                }
                placeholder="medpark.md"
                splitChars={[',', ' ']}
                clearable
                {...form.getInputProps('allowed_recipient_domains')}
              />
              <AdvancedSection invalid={invalid('n8n_webhook_url', 'smtp_host', 'smtp_port')}>
                <TextInput
                  label={t('settings.fields.webhookUrl', { ns: 'admin' })}
                  disabled={values.delivery !== 'n8n'}
                  description={
                    hostWarning(t, urlHost(values.n8n_webhook_url)) ??
                    t('settings.fields.webhookUrlDescription', { ns: 'admin' })
                  }
                  {...form.getInputProps('n8n_webhook_url')}
                />
                <Group grow align="flex-start">
                  <TextInput
                    label={t('settings.fields.smtpHost', { ns: 'admin' })}
                    description={
                      hostWarning(t, values.smtp_host) ?? t('settings.fields.smtpHostDescription', { ns: 'admin' })
                    }
                    {...form.getInputProps('smtp_host')}
                  />
                  <NumberInput
                    label={t('settings.fields.smtpPort', { ns: 'admin' })}
                    min={1}
                    max={MAX_PORT}
                    allowDecimal={false}
                    {...form.getInputProps('smtp_port')}
                  />
                </Group>
              </AdvancedSection>
            </Section>

            <Section
              icon={<IconClock size={18} color={TEAL} />}
              title={t('settings.sections.privacyTitle', { ns: 'admin' })}
              description={t('settings.sections.privacyDescription', { ns: 'admin' })}
            >
              <NumberInput
                label={t('settings.fields.keepAudioDays', { ns: 'admin' })}
                description={t('settings.fields.keepAudioDaysDescription', { ns: 'admin' })}
                min={0}
                allowDecimal={false}
                {...form.getInputProps('keep_audio_days')}
              />
            </Section>

            <Section
              icon={<IconUpload size={18} color={TEAL} />}
              title={t('settings.sections.uploadsTitle', { ns: 'admin' })}
              description={t('settings.sections.uploadsDescription', { ns: 'admin' })}
            >
              <NumberInput
                label={t('settings.fields.maxUploadMb', { ns: 'admin' })}
                description={t('settings.fields.maxUploadMbDescription', { ns: 'admin' })}
                min={1}
                allowDecimal={false}
                {...form.getInputProps('max_upload_mb')}
              />
              <NumberInput
                label={t('settings.fields.maxDurationMin', { ns: 'admin' })}
                description={t('settings.fields.maxDurationMinDescription', { ns: 'admin' })}
                min={1}
                max={MAX_DURATION_MIN}
                allowDecimal={false}
                {...form.getInputProps('max_duration_min')}
              />
            </Section>

            <Section
              icon={<IconMicrophone2 size={18} color={TEAL} />}
              title={t('settings.sections.speechTitle', { ns: 'admin' })}
              description={t('settings.sections.speechDescription', { ns: 'admin' })}
            >
              <Select
                label={t('settings.fields.language', { ns: 'admin' })}
                data={languageOptions}
                allowDeselect={false}
                {...form.getInputProps('language')}
              />
              <AdvancedSection invalid={invalid('asr_engine', 'asr_model', 'llm_model')}>
                <Select
                  label={t('settings.fields.engine', { ns: 'admin' })}
                  data={engineOptions}
                  allowDeselect={false}
                  {...form.getInputProps('asr_engine')}
                />
                <TextInput
                  label={t('settings.fields.model', { ns: 'admin' })}
                  description={t('settings.fields.modelDescription', { ns: 'admin' })}
                  {...form.getInputProps('asr_model')}
                />
                <TextInput
                  label={t('settings.fields.llmModel', { ns: 'admin' })}
                  description={t('settings.fields.llmModelDescription', { ns: 'admin' })}
                  {...form.getInputProps('llm_model')}
                />
              </AdvancedSection>
            </Section>
          </SimpleGrid>

          {values.delivery === 'smtp' && (
            <Alert color="blue" variant="light">
              {t('settings.smtpFallbackAlert', { ns: 'admin' })}
            </Alert>
          )}
        </Stack>
      </form>
      <UnsavedChangesBar dirty={dirty} saving={save.isPending} onDiscard={() => form.reset()} onSave={() => submit()} />
    </>
  );
}

export function SettingsPage() {
  const { t } = useTranslation(['admin', 'common']);
  const settings = useSettings();
  return (
    <>
      <PageHeader title={t('common:nav.settings')} description={t('settings.description', { ns: 'admin' })} />
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
