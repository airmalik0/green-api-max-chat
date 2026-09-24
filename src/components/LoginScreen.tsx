import { useState, type FormEvent } from 'react';
import {
  apiUrlFor,
  createGreenApiClient,
  GreenApiError,
  normalizeApiUrl,
  type GreenApiClient,
} from '../api/greenApi';
import { ensureReceiving } from '../lib/ensureReceiving';
import type { Credentials, InstanceState } from '../api/types';
import styles from './LoginScreen.module.css';

const STATE_MESSAGES: Partial<Record<InstanceState, string>> = {
  notAuthorized:
    'Инстанс не авторизован. Откройте его в личном кабинете GREEN-API и отсканируйте QR-код в приложении MAX.',
  starting: 'Инстанс запускается, это может занять до 5 минут. Попробуйте чуть позже.',
  blocked: 'Аккаунт мессенджера заблокирован.',
  pendingPassword:
    'Инстанс ждёт пароль двухфакторной аутентификации — завершите вход в личном кабинете.',
  sleepMode: 'Инстанс в спящем режиме: телефон офлайн.',
  yellowCard: 'На аккаунте временные ограничения мессенджера.',
};

interface Props {
  onLogin: (credentials: Credentials, notice: string | null) => void;
}

export function LoginScreen({ onLogin }: Props) {
  const [idInstance, setIdInstance] = useState('');
  const [apiTokenInstance, setApiTokenInstance] = useState('');
  // Пока пользователь не правил apiUrl руками, он вычисляется из idInstance.
  const [customApiUrl, setCustomApiUrl] = useState<string | null>(null);
  const apiUrl = customApiUrl ?? apiUrlFor(idInstance);
  const [error, setError] = useState<string | null>(null);
  const [checking, setChecking] = useState(false);

  async function handleSubmit(event: FormEvent) {
    event.preventDefault();
    const credentials: Credentials = {
      idInstance: idInstance.trim(),
      apiTokenInstance: apiTokenInstance.trim(),
      apiUrl: normalizeApiUrl(apiUrl),
    };
    const validationError = validate(credentials);
    if (validationError) {
      setError(validationError);
      return;
    }

    setChecking(true);
    setError(null);
    try {
      const client = createGreenApiClient(credentials);
      const state = await client.getStateInstance();
      // suspended — ограничение только на отправку незнакомым номерам, работать можно.
      if (state?.stateInstance === 'authorized' || state?.stateInstance === 'suspended') {
        onLogin(credentials, await prepareReceiving(client));
        return;
      }
      setError(
        (state && STATE_MESSAGES[state.stateInstance]) ??
          `Инстанс недоступен (состояние: ${state?.stateInstance ?? 'неизвестно'}).`,
      );
    } catch (err) {
      setError(err instanceof GreenApiError ? err.message : 'Не удалось проверить инстанс.');
    } finally {
      setChecking(false);
    }
  }

  return (
    <main className={styles.page}>
      <form className={styles.card} onSubmit={handleSubmit} noValidate>
        <div className={styles.logo} aria-hidden="true">
          <svg viewBox="0 0 24 24" width="28" height="28">
            <path
              fill="currentColor"
              d="M12 3C7 3 3 6.9 3 11.7c0 2.4 1 4.5 2.6 6.1L5 21l3.5-1.6c1.1.4 2.3.6 3.5.6 5 0 9-3.9 9-8.7S17 3 12 3Z"
            />
          </svg>
        </div>
        <h1 className={styles.title}>Вход в чат</h1>
        <p className={styles.subtitle}>
          Параметры инстанса из{' '}
          <a href="https://console.green-api.com" target="_blank" rel="noreferrer">
            личного кабинета GREEN-API
          </a>
        </p>

        <label className={styles.field}>
          <span>idInstance</span>
          <input
            name="idInstance"
            inputMode="numeric"
            autoComplete="username"
            placeholder="1101000001"
            value={idInstance}
            onChange={(e) => setIdInstance(e.target.value)}
            autoFocus
          />
        </label>

        <label className={styles.field}>
          <span>apiTokenInstance</span>
          <input
            name="apiTokenInstance"
            type="password"
            autoComplete="current-password"
            placeholder="Токен из личного кабинета"
            value={apiTokenInstance}
            onChange={(e) => setApiTokenInstance(e.target.value)}
          />
        </label>

        <label className={styles.field}>
          <span>apiUrl</span>
          <input
            name="apiUrl"
            type="url"
            placeholder="https://1103.api.green-api.com"
            value={apiUrl}
            onChange={(e) => setCustomApiUrl(e.target.value)}
          />
        </label>

        {error && (
          <p className={styles.error} role="alert">
            {error}
          </p>
        )}

        <button className={styles.submit} type="submit" disabled={checking}>
          {checking ? 'Проверяем…' : 'Войти'}
        </button>
      </form>
    </main>
  );
}

/** Включает в инстансе приём уведомлений, если он выключен, и объясняет пользователю, что произошло. */
async function prepareReceiving(client: GreenApiClient): Promise<string | null> {
  try {
    const result = await ensureReceiving(client);
    return result === 'enabled'
      ? 'Включили в настройках инстанса приём входящих сообщений и статусов. GREEN-API применяет настройки в течение нескольких минут.'
      : null;
  } catch {
    return 'Не удалось проверить настройки инстанса. Убедитесь, что в личном кабинете включено «Получать уведомления о входящих сообщениях».';
  }
}

function validate({ idInstance, apiTokenInstance, apiUrl }: Credentials): string | null {
  if (!/^\d+$/.test(idInstance)) return 'idInstance — это число из личного кабинета.';
  if (!apiTokenInstance) return 'Укажите apiTokenInstance.';
  if (!/^https?:\/\/[^\s/]+$/.test(apiUrl)) {
    return 'apiUrl — адрес вида https://1103.api.green-api.com, без пути.';
  }
  return null;
}
