import { GreenApiError, type GreenApiClient } from '../api/greenApi';
import type { NotificationBody } from '../api/types';

export type PollingStatus =
  | { kind: 'ok' }
  | { kind: 'retrying'; message: string; retryInSec: number }
  | { kind: 'stopped'; message: string };

export interface NotificationLoopOptions {
  client: Pick<GreenApiClient, 'receiveNotification' | 'deleteNotification'>;
  onNotification: (body: NotificationBody) => void;
  onStatus: (status: PollingStatus) => void;
  signal: AbortSignal;
  /** Сколько секунд сервер держит long-polling запрос (5–60). */
  receiveTimeoutSec?: number;
  sleep?: (ms: number, signal: AbortSignal) => Promise<void>;
}

export const INITIAL_BACKOFF_MS = 1_000;
export const MAX_BACKOFF_MS = 30_000;
export const RATE_LIMIT_BACKOFF_MS = 5_000;

/**
 * Цикл приёма уведомлений по HTTP API: ReceiveNotification → обработка → DeleteNotification.
 * Уведомление удаляется всегда, даже если это тип, который интерфейс не показывает, —
 * иначе очередь встанет на нём навсегда. Ошибки сети и 429 — повтор с экспоненциальной
 * паузой; 401/403 — остановка (креды больше не действуют). Выход — по `signal`.
 */
export async function runNotificationLoop({
  client,
  onNotification,
  onStatus,
  signal,
  receiveTimeoutSec = 20,
  sleep = abortableSleep,
}: NotificationLoopOptions): Promise<void> {
  let backoff = INITIAL_BACKOFF_MS;
  let healthy: boolean | null = null;

  while (!signal.aborted) {
    try {
      const notification = await client.receiveNotification(receiveTimeoutSec, signal);
      if (healthy !== true) {
        healthy = true;
        onStatus({ kind: 'ok' });
      }
      backoff = INITIAL_BACKOFF_MS;
      if (!notification) continue;

      try {
        onNotification(notification.body);
      } finally {
        await client.deleteNotification(notification.receiptId, signal);
      }
    } catch (error) {
      if (signal.aborted || isAbortError(error)) return;
      if (error instanceof GreenApiError && error.isUnauthorized) {
        onStatus({ kind: 'stopped', message: error.message });
        return;
      }
      const wait =
        error instanceof GreenApiError && error.isRateLimited
          ? Math.max(backoff, RATE_LIMIT_BACKOFF_MS)
          : backoff;
      healthy = false;
      onStatus({
        kind: 'retrying',
        message: error instanceof Error ? error.message : 'Ошибка получения сообщений',
        retryInSec: Math.round(wait / 1000),
      });
      try {
        await sleep(wait, signal);
      } catch {
        return;
      }
      backoff = Math.min(backoff * 2, MAX_BACKOFF_MS);
    }
  }
}

function isAbortError(error: unknown): boolean {
  return error instanceof DOMException && error.name === 'AbortError';
}

export function abortableSleep(ms: number, signal: AbortSignal): Promise<void> {
  return new Promise((resolve, reject) => {
    if (signal.aborted) {
      reject(new DOMException('Aborted', 'AbortError'));
      return;
    }
    const timer = setTimeout(() => {
      signal.removeEventListener('abort', onAbort);
      resolve();
    }, ms);
    function onAbort() {
      clearTimeout(timer);
      reject(new DOMException('Aborted', 'AbortError'));
    }
    signal.addEventListener('abort', onAbort, { once: true });
  });
}
