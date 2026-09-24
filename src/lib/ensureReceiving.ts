import { GreenApiError, type GreenApiClient } from '../api/greenApi';

export type ReceivingCheck = 'ok' | 'enabled';

/**
 * У нового инстанса все уведомления выключены, а для HTTP API поле webhookUrl должно быть пустым —
 * иначе ReceiveNotification ничего не отдаст. Включаем входящие сообщения и статусы отправленных,
 * только если они ещё не включены: SetSettings перезапускает инстанс.
 * 'enabled' — настройки пришлось поменять (GREEN-API применяет их в течение нескольких минут).
 */
export async function ensureReceiving(
  client: Pick<GreenApiClient, 'getSettings' | 'setSettings'>,
  wait: (ms: number) => Promise<void> = (ms) => new Promise((r) => setTimeout(r, ms)),
): Promise<ReceivingCheck> {
  const settings = await retryOnRateLimit(() => client.getSettings(), wait);
  if (
    settings &&
    settings.incomingWebhook === 'yes' &&
    settings.outgoingWebhook === 'yes' &&
    !settings.webhookUrl
  ) {
    return 'ok';
  }
  await retryOnRateLimit(
    () => client.setSettings({ webhookUrl: '', incomingWebhook: 'yes', outgoingWebhook: 'yes' }),
    wait,
  );
  return 'enabled';
}

/** Методы настроек GREEN-API ограничены по частоте — на 429 пробуем ещё пару раз. */
async function retryOnRateLimit<T>(call: () => Promise<T>, wait: (ms: number) => Promise<void>) {
  for (let attempt = 1; ; attempt++) {
    try {
      return await call();
    } catch (error) {
      if (!(error instanceof GreenApiError && error.isRateLimited) || attempt >= 3) throw error;
      await wait(1000 * attempt);
    }
  }
}
