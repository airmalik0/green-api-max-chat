import { useEffect, useRef, useState } from 'react';
import type { GreenApiClient } from '../api/greenApi';
import type { NotificationBody } from '../api/types';
import { runNotificationLoop, type PollingStatus } from '../lib/notificationLoop';

/**
 * Держит один цикл приёма уведомлений на всё время жизни компонента.
 * При размонтировании (в том числе при «Выйти») текущий long-polling запрос отменяется.
 */
export function useNotificationPolling(
  client: GreenApiClient,
  onNotification: (body: NotificationBody) => void,
): PollingStatus {
  const [status, setStatus] = useState<PollingStatus>({ kind: 'ok' });
  const handlerRef = useRef(onNotification);

  useEffect(() => {
    handlerRef.current = onNotification;
  }, [onNotification]);

  useEffect(() => {
    const controller = new AbortController();
    // Старт на следующем тике: StrictMode в dev монтирует эффект дважды подряд, и без этого
    // ушли бы два параллельных long-polling запроса (GREEN-API ответил бы на второй 429).
    const start = setTimeout(() => {
      void runNotificationLoop({
        client,
        onNotification: (body) => handlerRef.current(body),
        onStatus: setStatus,
        signal: controller.signal,
      });
    }, 0);
    return () => {
      clearTimeout(start);
      controller.abort();
    };
  }, [client]);

  return status;
}
