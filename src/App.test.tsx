import { render, screen, waitFor, within } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import App from './App';

interface Route {
  match: RegExp;
  reply: (
    init?: RequestInit,
  ) => { status?: number; body: unknown } | Promise<{ status?: number; body: unknown }>;
}

const settingsRoute: Route = {
  match: /getSettings/,
  reply: () => ({ body: { webhookUrl: '', incomingWebhook: 'yes', outgoingWebhook: 'yes' } }),
};

/** Подменяет fetch: отвечает по первому совпавшему маршруту. */
function installFetch(routes: Route[]) {
  const fetchMock = vi.fn(async (input: RequestInfo | URL, init?: RequestInit) => {
    const url = String(input);
    const route = [...routes, settingsRoute].find((r) => r.match.test(url));
    if (!route) throw new Error(`Неожиданный запрос ${url}`);
    const { status = 200, body } = await route.reply(init);
    return new Response(body === null ? 'null' : JSON.stringify(body), { status });
  });
  vi.stubGlobal('fetch', fetchMock);
  return fetchMock;
}

/** Long polling, который висит до отмены — как настоящий сервер без новых уведомлений. */
const hangingPoll: Route = {
  match: /receiveNotification/,
  reply: (init) =>
    new Promise<never>((_resolve, reject) => {
      init?.signal?.addEventListener('abort', () =>
        reject(new DOMException('Aborted', 'AbortError')),
      );
    }),
};

async function logIn(user: ReturnType<typeof userEvent.setup>) {
  await user.type(screen.getByLabelText('idInstance'), '3100123456');
  await user.type(screen.getByLabelText('apiTokenInstance'), 'secret-token');
  await user.click(screen.getByRole('button', { name: 'Войти' }));
}

beforeEach(() => localStorage.clear());
afterEach(() => vi.unstubAllGlobals());

describe('App', () => {
  it('показывает понятную ошибку при неверных кредах', async () => {
    installFetch([{ match: /getStateInstance/, reply: () => ({ status: 401, body: '' }) }]);
    const user = userEvent.setup();
    render(<App />);

    await logIn(user);

    expect(await screen.findByRole('alert')).toHaveTextContent(
      'Неверный idInstance или apiTokenInstance',
    );
  });

  it('не пускает с неавторизованным инстансом', async () => {
    installFetch([
      { match: /getStateInstance/, reply: () => ({ body: { stateInstance: 'notAuthorized' } }) },
    ]);
    const user = userEvent.setup();
    render(<App />);

    await logIn(user);

    expect(await screen.findByRole('alert')).toHaveTextContent('Инстанс не авторизован');
  });

  it('сценарий задания: вход → чат по номеру → отправка → ответ собеседника', async () => {
    // Очередь уведомлений «сервера»: long polling ждёт, пока в ней что-то появится.
    const queue: unknown[] = [];
    let wakeUp: (() => void) | null = null;
    const reply = {
      receiptId: 1,
      body: {
        typeWebhook: 'incomingMessageReceived',
        timestamp: Math.floor(Date.now() / 1000),
        idMessage: 'in-1',
        senderData: { chatId: '10000000', senderName: 'Иван' },
        messageData: {
          typeMessage: 'textMessage',
          textMessageData: { textMessage: 'Привет из MAX!' },
        },
      },
    };

    const fetchMock = installFetch([
      { match: /getStateInstance/, reply: () => ({ body: { stateInstance: 'authorized' } }) },
      { match: /checkAccount/, reply: () => ({ body: { exist: true, chatId: '10000000' } }) },
      {
        match: /sendMessage/,
        reply: () => {
          queue.push(reply); // собеседник «отвечает» сразу после отправки
          wakeUp?.();
          return { body: { idMessage: 'srv-1' } };
        },
      },
      { match: /deleteNotification/, reply: () => ({ body: { result: true } }) },
      {
        match: /receiveNotification/,
        reply: (init) =>
          new Promise((resolve, reject) => {
            const deliver = () => resolve({ body: queue.shift() });
            if (queue.length) return deliver();
            wakeUp = deliver;
            init?.signal?.addEventListener('abort', () =>
              reject(new DOMException('Aborted', 'AbortError')),
            );
          }),
      },
    ]);
    const user = userEvent.setup();
    render(<App />);

    await logIn(user);
    await user.type(await screen.findByLabelText('Номер получателя'), '8 (999) 123-45-67');
    await user.click(screen.getByRole('button', { name: 'Создать чат' }));

    const chat = await screen.findByRole('region', { name: 'Чат с +7 999 123-45-67' });
    await user.type(within(chat).getByLabelText('Сообщение'), 'Здравствуйте{Enter}');

    expect(await within(chat).findByText('Здравствуйте')).toBeInTheDocument();
    expect(await within(chat).findByText('Привет из MAX!')).toBeInTheDocument();
    expect(within(chat).getByLabelText('Отправлено')).toBeInTheDocument();

    const sendCall = fetchMock.mock.calls.find(([url]) => String(url).includes('sendMessage'));
    expect(JSON.parse(String(sendCall?.[1]?.body))).toEqual({
      chatId: '10000000',
      message: 'Здравствуйте',
    });
    await waitFor(() =>
      expect(
        fetchMock.mock.calls.some(([url]) =>
          String(url).endsWith('/deleteNotification/secret-token/1'),
        ),
      ).toBe(true),
    );
  });

  it('«Выйти» очищает сессию и возвращает на экран входа', async () => {
    installFetch([
      { match: /getStateInstance/, reply: () => ({ body: { stateInstance: 'authorized' } }) },
      hangingPoll,
    ]);
    const user = userEvent.setup();
    render(<App />);

    await logIn(user);
    await user.click(await screen.findByRole('button', { name: 'Выйти' }));

    expect(screen.getByRole('button', { name: 'Войти' })).toBeInTheDocument();
    expect(localStorage.length).toBe(0);
  });
});
