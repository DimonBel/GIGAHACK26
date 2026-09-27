import { screen } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { afterEach, describe, expect, it } from 'vitest';

import i18n from '../i18n';
import { renderWithProviders } from '../test/render';
import { LanguageSwitcher } from './LanguageSwitcher';

afterEach(() => void i18n.changeLanguage('en'));

describe('LanguageSwitcher', () => {
  it('shows the current language and switches the app from the dropdown', async () => {
    renderWithProviders(<LanguageSwitcher />);

    await userEvent.click(screen.getByRole('button', { name: 'Language of the app: English' }));
    await userEvent.click(await screen.findByRole('menuitem', { name: 'Русский' }));

    expect(i18n.language).toBe('ru');
    expect(document.documentElement.lang).toBe('ru');
    expect(screen.getByRole('button', { name: 'Язык приложения: Русский' })).toHaveTextContent('RU');
  });
});
