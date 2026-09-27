import { screen, waitFor } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { afterEach, describe, expect, it, vi } from 'vitest';

import { settingsApi } from '../../api/endpoints';
import type { Settings } from '../../api/types';
import { renderWithProviders } from '../../test/render';
import { SettingsPage } from './SettingsPage';

function sampleSettings(overrides: Partial<Settings> = {}): Settings {
  return {
    asr_engine: 'mlx',
    asr_model: 'models/ggml-large-v3-turbo-q8_0.bin',
    llm_model: 'gemma4:e4b',
    language: 'auto',
    delivery: 'n8n',
    n8n_webhook_url: 'http://127.0.0.1:5678/webhook/secure-mom',
    smtp_host: '127.0.0.1',
    smtp_port: 1025,
    mail_from: 'secure-mom@medpark.local',
    allowed_recipient_domains: ['medpark.md'],
    keep_audio_days: 0,
    max_upload_mb: 500,
    max_duration_min: 240,
    ...overrides,
  };
}

describe('SettingsPage', () => {
  afterEach(() => vi.restoreAllMocks());

  it('shows the unsaved-changes bar only after a change, and saves', async () => {
    vi.spyOn(settingsApi, 'get').mockResolvedValue(sampleSettings());
    const saved = sampleSettings({ keep_audio_days: 30 });
    const update = vi.spyOn(settingsApi, 'update').mockResolvedValue(saved);

    renderWithProviders(<SettingsPage />);

    const keepDays = await screen.findByLabelText('Keep recordings (days)');
    expect(screen.queryByText('Unsaved changes')).not.toBeInTheDocument();
    expect(screen.queryByRole('button', { name: 'Save' })).not.toBeInTheDocument();

    await userEvent.clear(keepDays);
    await userEvent.type(keepDays, '30');

    const saveBar = await screen.findByText('Unsaved changes');
    await userEvent.click(screen.getByRole('button', { name: 'Save' }));

    await waitFor(() => expect(update).toHaveBeenCalledTimes(1));
    expect(update.mock.calls[0][0]).toMatchObject({ keep_audio_days: 30 });
    await waitFor(() => expect(saveBar).not.toBeInTheDocument());
  });

  it('discards changes back to the saved values without saving', async () => {
    vi.spyOn(settingsApi, 'get').mockResolvedValue(sampleSettings());
    const update = vi.spyOn(settingsApi, 'update');

    renderWithProviders(<SettingsPage />);

    const keepDays = await screen.findByLabelText('Keep recordings (days)');
    await userEvent.clear(keepDays);
    await userEvent.type(keepDays, '45');
    await screen.findByText('Unsaved changes');

    await userEvent.click(screen.getByRole('button', { name: 'Discard' }));

    await waitFor(() => expect(screen.queryByText('Unsaved changes')).not.toBeInTheDocument());
    expect(keepDays).toHaveValue('0');
    expect(update).not.toHaveBeenCalled();
  });

  it('opens Advanced to show why a technical field stops the save', async () => {
    vi.spyOn(settingsApi, 'get').mockResolvedValue(sampleSettings({ smtp_host: ' ' }));
    const update = vi.spyOn(settingsApi, 'update');

    renderWithProviders(<SettingsPage />);

    const keepDays = await screen.findByLabelText('Keep recordings (days)');
    expect(screen.queryByLabelText('SMTP host')).not.toBeInTheDocument();
    await userEvent.clear(keepDays);
    await userEvent.type(keepDays, '30');
    await userEvent.click(await screen.findByRole('button', { name: 'Save' }));

    expect(await screen.findByText('Enter the SMTP host')).toBeInTheDocument();
    expect(screen.getByLabelText('SMTP host')).toBeInTheDocument();
    expect(update).not.toHaveBeenCalled();
  });

  it('keeps technical fields collapsed under Advanced until opened', async () => {
    vi.spyOn(settingsApi, 'get').mockResolvedValue(sampleSettings());

    renderWithProviders(<SettingsPage />);
    await screen.findByText('Email delivery');

    expect(screen.queryByLabelText('n8n webhook URL')).not.toBeInTheDocument();

    await userEvent.click(screen.getAllByRole('button', { name: 'Advanced' })[0]);

    expect(await screen.findByLabelText('n8n webhook URL')).toBeInTheDocument();
  });
});
