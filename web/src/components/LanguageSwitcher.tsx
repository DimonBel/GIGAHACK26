import { Button, Menu } from '@mantine/core';
import { IconCheck, IconChevronDown, IconWorld } from '@tabler/icons-react';
import { useTranslation } from 'react-i18next';

import { LANGUAGES, setLanguage } from '../i18n';

/** The app's language: a dropdown of Română, Русский and English, each named in its own language. */
export function LanguageSwitcher() {
  const { t, i18n } = useTranslation();
  const current = LANGUAGES.find((language) => language.value === i18n.language) ?? LANGUAGES[0];
  return (
    <Menu position="bottom-end" width={160} withinPortal>
      <Menu.Target>
        <Button
          variant="subtle"
          color="gray"
          size="compact-md"
          leftSection={<IconWorld size={18} stroke={1.6} />}
          rightSection={<IconChevronDown size={14} />}
          aria-label={`${t('language.label')}: ${current.name}`}
        >
          <span lang={current.value}>{current.label}</span>
        </Button>
      </Menu.Target>
      <Menu.Dropdown>
        <Menu.Label>{t('language.label')}</Menu.Label>
        {LANGUAGES.map((language) => (
          <Menu.Item
            key={language.value}
            lang={language.value}
            onClick={() => setLanguage(language.value)}
            rightSection={language.value === current.value ? <IconCheck size={14} /> : null}
            fw={language.value === current.value ? 600 : undefined}
          >
            {language.name}
          </Menu.Item>
        ))}
      </Menu.Dropdown>
    </Menu>
  );
}
