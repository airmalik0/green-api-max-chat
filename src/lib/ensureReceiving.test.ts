import { describe, expect, it, vi } from 'vitest';
import { GreenApiError } from '../api/greenApi';
import type { InstanceSettings } from '../api/types';
import { ensureReceiving } from './ensureReceiving';

function client(settings: InstanceSettings) {
  return {
    getSettings: vi.fn(async () => settings),
    setSettings: vi.fn(async () => ({ saveSettings: true })),
  };
}

describe('ensureReceiving', () => {
  it('ничего не меняет, если приём уже настроен', async () => {
    const c = client({ webhookUrl: '', incomingWebhook: 'yes', outgoingWebhook: 'yes' });
    await expect(ensureReceiving(c)).resolves.toBe('ok');
    expect(c.setSettings).not.toHaveBeenCalled();
  });

  it('включает входящие и статусы на новом инстансе', async () => {
    const c = client({ webhookUrl: '', incomingWebhook: 'no', outgoingWebhook: 'no' });
    await expect(ensureReceiving(c)).resolves.toBe('enabled');
    expect(c.setSettings).toHaveBeenCalledWith({
      webhookUrl: '',
      incomingWebhook: 'yes',
      outgoingWebhook: 'yes',
    });
  });

  it('очищает webhookUrl — иначе HTTP API не отдаёт уведомления', async () => {
    const c = client({
      webhookUrl: 'https://example.com/hook',
      incomingWebhook: 'yes',
      outgoingWebhook: 'yes',
    });
    await expect(ensureReceiving(c)).resolves.toBe('enabled');
    expect(c.setSettings).toHaveBeenCalledWith(expect.objectContaining({ webhookUrl: '' }));
  });

  it('на 429 повторяет запрос', async () => {
    const c = client({ webhookUrl: '', incomingWebhook: 'yes', outgoingWebhook: 'yes' });
    c.getSettings.mockRejectedValueOnce(new GreenApiError(429, 'Too many'));
    const wait = vi.fn(async () => {});
    await expect(ensureReceiving(c, wait)).resolves.toBe('ok');
    expect(c.getSettings).toHaveBeenCalledTimes(2);
    expect(wait).toHaveBeenCalledTimes(1);
  });
});
