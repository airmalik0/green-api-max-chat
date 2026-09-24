import type {
  CheckAccountResponse,
  Credentials,
  DeleteNotificationResponse,
  InstanceSettings,
  ReceivedNotification,
  SendMessageResponse,
  StateInstanceResponse,
} from './types';

/** Ошибка вызова GREEN-API. `status` = 0 — сеть недоступна или запрос не дошёл. */
export class GreenApiError extends Error {
  readonly status: number;

  constructor(status: number, message: string) {
    super(message);
    this.name = 'GreenApiError';
    this.status = status;
  }

  /** Неверные idInstance / apiTokenInstance. */
  get isUnauthorized(): boolean {
    return this.status === 401 || this.status === 403;
  }

  get isRateLimited(): boolean {
    return this.status === 429;
  }
}

/**
 * Хост API инстанса: https://{первые 4 цифры idInstance}.api.green-api.com
 * (так он указан в личном кабинете). Общий api.green-api.com для инстансов MAX
 * отвечает пустым телом, поэтому подставляем адрес по номеру инстанса.
 */
export function apiUrlFor(idInstance: string): string {
  const prefix = idInstance.trim().slice(0, 4);
  return /^\d{4}$/.test(prefix) ? `https://${prefix}.api.green-api.com` : '';
}

export function normalizeApiUrl(apiUrl: string): string {
  return apiUrl.trim().replace(/\/+$/, '');
}

/**
 * Тонкий клиент HTTP API GREEN-API. Формат адреса одинаков для MAX, WhatsApp и Telegram:
 * {apiUrl}/waInstance{idInstance}/{method}/{apiTokenInstance}
 * CORS на стороне GREEN-API открыт, поэтому запросы идут прямо из браузера, без прокси.
 */
export function createGreenApiClient(credentials: Credentials, fetchImpl: typeof fetch = fetch) {
  const base = `${normalizeApiUrl(credentials.apiUrl)}/waInstance${credentials.idInstance.trim()}`;
  const token = encodeURIComponent(credentials.apiTokenInstance.trim());

  async function request<T>(
    method: 'GET' | 'POST' | 'DELETE',
    apiMethod: string,
    options: {
      body?: unknown;
      suffix?: string;
      signal?: AbortSignal;
      emptyOnTimeout?: boolean;
    } = {},
  ): Promise<T | null> {
    const url = `${base}/${apiMethod}/${token}${options.suffix ?? ''}`;
    let response: Response;
    try {
      response = await fetchImpl(url, {
        method,
        headers: options.body === undefined ? undefined : { 'Content-Type': 'application/json' },
        body: options.body === undefined ? undefined : JSON.stringify(options.body),
        signal: options.signal,
      });
    } catch (error) {
      if (error instanceof DOMException && error.name === 'AbortError') throw error;
      throw new GreenApiError(0, 'Нет соединения с сервером GREEN-API. Проверьте apiUrl и сеть.');
    }

    const text = await response.text();
    if (response.status === 408 && options.emptyOnTimeout) return null;
    if (!response.ok) {
      throw new GreenApiError(response.status, describeHttpError(response.status, text));
    }
    if (!text || text === 'null') return null;
    try {
      return JSON.parse(text) as T;
    } catch {
      throw new GreenApiError(response.status, 'Сервер вернул ответ не в формате JSON.');
    }
  }

  return {
    getStateInstance: (signal?: AbortSignal) =>
      request<StateInstanceResponse>('GET', 'getStateInstance', { signal }),

    getSettings: () => request<InstanceSettings>('GET', 'getSettings'),

    setSettings: (settings: Partial<InstanceSettings>) =>
      request<{ saveSettings: boolean }>('POST', 'setSettings', { body: settings }),

    sendMessage: (chatId: string, message: string) =>
      request<SendMessageResponse>('POST', 'sendMessage', { body: { chatId, message } }),

    checkAccount: (phoneNumber: string) =>
      request<CheckAccountResponse>('POST', 'checkAccount', {
        body: { phoneNumber: Number(phoneNumber) },
      }),

    /**
     * Long polling: сервер держит запрос до `timeoutSec` секунд. Пустая очередь — это `null`
     * либо 408 (инстансы MAX отвечают 408 по истечении таймаута) — оба случая значат «ждём дальше».
     */
    receiveNotification: (timeoutSec: number, signal?: AbortSignal) =>
      request<ReceivedNotification>('GET', 'receiveNotification', {
        suffix: `?receiveTimeout=${timeoutSec}`,
        signal,
        emptyOnTimeout: true,
      }),

    deleteNotification: (receiptId: number, signal?: AbortSignal) =>
      request<DeleteNotificationResponse>('DELETE', 'deleteNotification', {
        suffix: `/${receiptId}`,
        signal,
      }),
  };
}

export type GreenApiClient = ReturnType<typeof createGreenApiClient>;

function describeHttpError(status: number, body: string): string {
  if (status === 401 || status === 403) return 'Неверный idInstance или apiTokenInstance.';
  if (status === 429) return 'Слишком много запросов к GREEN-API, повторим чуть позже.';
  if (status === 466) return 'Исчерпан лимит тарифа инстанса.';
  if (status >= 500) return `Сервер GREEN-API временно недоступен (${status}).`;
  const detail = extractMessage(body);
  if (detail.includes('not authorized')) {
    return 'Инстанс не авторизован — отсканируйте QR-код в личном кабинете GREEN-API.';
  }
  return detail ? `Ошибка GREEN-API (${status}): ${detail}` : `Ошибка GREEN-API (${status}).`;
}

function extractMessage(body: string): string {
  if (!body) return '';
  try {
    const parsed: unknown = JSON.parse(body);
    if (parsed && typeof parsed === 'object') {
      const record = parsed as Record<string, unknown>;
      for (const key of ['message', 'reason', 'error']) {
        if (typeof record[key] === 'string' && record[key]) return record[key];
      }
    }
  } catch {
    // тело не JSON — вернём как есть
  }
  return body.slice(0, 200);
}
