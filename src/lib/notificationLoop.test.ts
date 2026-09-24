import { describe, expect, it, vi } from 'vitest';
import { GreenApiError } from '../api/greenApi';
import type { ReceivedNotification } from '../api/types';
import { runNotificationLoop, type PollingStatus } from './notificationLoop';

type Step = ReceivedNotification | null | Error;

/** Клиент-заглушка: отдаёт шаги по очереди, после последнего — отменяет цикл. */
function scriptedClient(steps: Step[], controller: AbortController) {
  let index = 0;
  return {
    receiveNotification: vi.fn(async () => {
      if (index >= steps.length) {
        controller.abort();
        throw new DOMException('Aborted', 'AbortError');
      }
      const step = steps[index++];
      if (step instanceof Error) throw step;
      return step;
    }),
    deleteNotification: vi.fn(async (_receiptId: number, _signal?: AbortSignal) => ({
      result: true,
    })),
  };
}

const notification = (receiptId: number, typeWebhook = 'incomingMessageReceived') => ({
  receiptId,
  body: { typeWebhook },
});

describe('runNotificationLoop', () => {
  it('обрабатывает и удаляет каждое уведомление, пустой ответ пропускает', async () => {
    const controller = new AbortController();
    const client = scriptedClient(
      [notification(1), null, notification(2, 'stateInstanceChanged')],
      controller,
    );
    const onNotification = vi.fn();

    await runNotificationLoop({
      client,
      onNotification,
      onStatus: () => {},
      signal: controller.signal,
    });

    expect(onNotification).toHaveBeenCalledTimes(2);
    expect(client.deleteNotification.mock.calls.map((c) => c[0])).toEqual([1, 2]);
  });

  it('удаляет уведомление, даже если обработчик упал', async () => {
    const controller = new AbortController();
    const client = scriptedClient([notification(7)], controller);
    const sleep = vi.fn<(ms: number, signal: AbortSignal) => Promise<void>>(async () => {});

    await runNotificationLoop({
      client,
      onNotification: () => {
        throw new Error('boom');
      },
      onStatus: () => {},
      signal: controller.signal,
      sleep,
    });

    expect(client.deleteNotification).toHaveBeenCalledWith(7, controller.signal);
  });

  it('при сетевых ошибках ждёт с растущей паузой и сообщает статус', async () => {
    const controller = new AbortController();
    const netError = new GreenApiError(0, 'Нет соединения');
    const client = scriptedClient([netError, netError, netError, null], controller);
    const sleep = vi.fn<(ms: number, signal: AbortSignal) => Promise<void>>(async () => {});
    const statuses: PollingStatus[] = [];

    await runNotificationLoop({
      client,
      onNotification: () => {},
      onStatus: (s) => statuses.push(s),
      signal: controller.signal,
      sleep,
    });

    expect(sleep.mock.calls.map((c) => c[0])).toEqual([1000, 2000, 4000]);
    expect(statuses[0]).toMatchObject({ kind: 'retrying', message: 'Нет соединения' });
    expect(statuses.at(-1)).toEqual({ kind: 'ok' });
  });

  it('на 429 ждёт не меньше 5 секунд', async () => {
    const controller = new AbortController();
    const client = scriptedClient([new GreenApiError(429, 'Too many')], controller);
    const sleep = vi.fn<(ms: number, signal: AbortSignal) => Promise<void>>(async () => {});

    await runNotificationLoop({
      client,
      onNotification: () => {},
      onStatus: () => {},
      signal: controller.signal,
      sleep,
    });

    expect(sleep).toHaveBeenCalledWith(5000, controller.signal);
  });

  it('на 401 останавливается и больше не опрашивает', async () => {
    const controller = new AbortController();
    const client = scriptedClient([new GreenApiError(401, 'Неверный токен'), null], controller);
    const onStatus = vi.fn();

    await runNotificationLoop({
      client,
      onNotification: () => {},
      onStatus,
      signal: controller.signal,
    });

    expect(client.receiveNotification).toHaveBeenCalledTimes(1);
    expect(onStatus).toHaveBeenCalledWith({ kind: 'stopped', message: 'Неверный токен' });
  });

  it('отмена сигнала прерывает ожидание long polling', async () => {
    const controller = new AbortController();
    const client = {
      receiveNotification: vi.fn(
        (_timeout: number, signal?: AbortSignal) =>
          new Promise<null>((_resolve, reject) => {
            signal?.addEventListener('abort', () =>
              reject(new DOMException('Aborted', 'AbortError')),
            );
          }),
      ),
      deleteNotification: vi.fn(),
    };

    const loop = runNotificationLoop({
      client,
      onNotification: () => {},
      onStatus: () => {},
      signal: controller.signal,
    });
    controller.abort();

    await expect(loop).resolves.toBeUndefined();
    expect(client.receiveNotification).toHaveBeenCalledTimes(1);
  });
});
