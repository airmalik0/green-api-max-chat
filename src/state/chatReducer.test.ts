import { describe, expect, it } from 'vitest';
import type { IncomingMessageNotification, OutgoingMessageStatusNotification } from '../api/types';
import { chatReducer, initialChatState, sortChats, type ChatState } from './chatReducer';

const incoming = (
  overrides: Partial<IncomingMessageNotification> = {},
): IncomingMessageNotification => ({
  typeWebhook: 'incomingMessageReceived',
  timestamp: 1_763_115_112,
  idMessage: 'in-1',
  senderData: {
    chatId: '10000000',
    senderName: 'Иван',
    senderPhoneNumber: 79991234567,
  },
  messageData: { typeMessage: 'textMessage', textMessageData: { textMessage: 'Привет!' } },
  ...overrides,
});

const status = (
  value: OutgoingMessageStatusNotification['status'],
  idMessage = 'srv-1',
): OutgoingMessageStatusNotification => ({
  typeWebhook: 'outgoingMessageStatus',
  chatId: '10000000',
  timestamp: 1_763_115_200,
  idMessage,
  status: value,
});

function withChat(): ChatState {
  return chatReducer(initialChatState, {
    type: 'chatOpened',
    chat: { id: '10000000', title: '+7 999 123-45-67', phone: '79991234567' },
    now: 1000,
  });
}

function withSentMessage(): ChatState {
  let state = withChat();
  state = chatReducer(state, {
    type: 'messageQueued',
    chatId: '10000000',
    localId: 'local-1',
    text: 'Здравствуйте',
    timestamp: 2000,
  });
  return chatReducer(state, {
    type: 'messageSent',
    chatId: '10000000',
    localId: 'local-1',
    idMessage: 'srv-1',
  });
}

describe('chatReducer', () => {
  it('создаёт чат и делает его активным; повторное открытие не дублирует', () => {
    const state = withChat();
    expect(state.chats).toHaveLength(1);
    expect(state.activeChatId).toBe('10000000');

    const again = chatReducer(
      { ...state, activeChatId: null },
      {
        type: 'chatOpened',
        chat: { id: '10000000', title: 'другое имя' },
        now: 5000,
      },
    );
    expect(again.chats).toHaveLength(1);
    expect(again.chats[0].title).toBe('+7 999 123-45-67');
    expect(again.activeChatId).toBe('10000000');
  });

  it('исходящее: pending → sent с заменой локального id на idMessage', () => {
    let state = withChat();
    state = chatReducer(state, {
      type: 'messageQueued',
      chatId: '10000000',
      localId: 'local-1',
      text: 'Здравствуйте',
      timestamp: 2000,
    });
    expect(state.chats[0].messages[0]).toMatchObject({ id: 'local-1', status: 'pending' });

    state = chatReducer(state, {
      type: 'messageSent',
      chatId: '10000000',
      localId: 'local-1',
      idMessage: 'srv-1',
    });
    expect(state.chats[0].messages[0]).toMatchObject({ id: 'srv-1', status: 'sent' });
  });

  it('ошибка отправки помечает сообщение failed с текстом', () => {
    let state = withChat();
    state = chatReducer(state, {
      type: 'messageQueued',
      chatId: '10000000',
      localId: 'local-1',
      text: 'x',
      timestamp: 2000,
    });
    state = chatReducer(state, {
      type: 'messageFailed',
      chatId: '10000000',
      localId: 'local-1',
      error: 'Нет соединения',
    });
    expect(state.chats[0].messages[0]).toMatchObject({ status: 'failed', error: 'Нет соединения' });
  });

  it('входящее текстовое сообщение попадает в существующий чат', () => {
    const state = chatReducer(withChat(), { type: 'notificationReceived', body: incoming() });
    expect(state.chats).toHaveLength(1);
    expect(state.chats[0].messages).toEqual([
      { id: 'in-1', text: 'Привет!', timestamp: 1_763_115_112_000, direction: 'in' },
    ]);
  });

  it('чат, созданный с другим chatId, находится по номеру отправителя', () => {
    const state = chatReducer(
      chatReducer(initialChatState, {
        type: 'chatOpened',
        chat: { id: '79991234567@c.us', title: '+7 999 123-45-67', phone: '79991234567' },
        now: 1000,
      }),
      { type: 'notificationReceived', body: incoming() },
    );
    expect(state.chats).toHaveLength(1);
    expect(state.chats[0].messages).toHaveLength(1);
  });

  it('сообщение от незнакомого номера создаёт новый чат, не переключая активный', () => {
    const state = chatReducer(withChat(), {
      type: 'notificationReceived',
      body: incoming({
        senderData: { chatId: '20000000', senderName: 'Мария', senderPhoneNumber: 79990000000 },
      }),
    });
    expect(state.chats).toHaveLength(2);
    expect(state.chats[0]).toMatchObject({ id: '20000000', title: 'Мария', phone: '79990000000' });
    expect(state.activeChatId).toBe('10000000');
  });

  it('повторная доставка того же уведомления не дублирует сообщение', () => {
    const once = chatReducer(withChat(), { type: 'notificationReceived', body: incoming() });
    const twice = chatReducer(once, { type: 'notificationReceived', body: incoming() });
    expect(twice).toBe(once);
  });

  it('extendedTextMessage тоже считается текстом', () => {
    const state = chatReducer(withChat(), {
      type: 'notificationReceived',
      body: incoming({
        messageData: {
          typeMessage: 'extendedTextMessage',
          extendedTextMessageData: { text: 'https://green-api.com' },
        },
      }),
    });
    expect(state.chats[0].messages[0].text).toBe('https://green-api.com');
  });

  it('нетекстовые и прочие уведомления не меняют состояние', () => {
    const state = withChat();
    const image = incoming({ messageData: { typeMessage: 'imageMessage' } });
    expect(chatReducer(state, { type: 'notificationReceived', body: image })).toBe(state);
    expect(
      chatReducer(state, {
        type: 'notificationReceived',
        body: { typeWebhook: 'stateInstanceChanged' },
      }),
    ).toBe(state);
  });

  it('статусы доставки продвигают сообщение вперёд, но не назад', () => {
    let state = withSentMessage();
    state = chatReducer(state, { type: 'notificationReceived', body: status('delivered') });
    expect(state.chats[0].messages[0].status).toBe('delivered');
    state = chatReducer(state, { type: 'notificationReceived', body: status('read') });
    expect(state.chats[0].messages[0].status).toBe('read');
    state = chatReducer(state, { type: 'notificationReceived', body: status('delivered') });
    expect(state.chats[0].messages[0].status).toBe('read');
  });

  it('noAccount помечает сообщение как недоставленное с пояснением', () => {
    const state = chatReducer(withSentMessage(), {
      type: 'notificationReceived',
      body: status('noAccount'),
    });
    expect(state.chats[0].messages[0]).toMatchObject({
      status: 'failed',
      error: expect.stringMatching(/нет аккаунта/),
    });
  });

  it('sortChats ставит сверху чат с последней активностью', () => {
    const state = chatReducer(withChat(), {
      type: 'notificationReceived',
      body: incoming({ senderData: { chatId: '20000000', senderName: 'Мария' } }),
    });
    const older = { ...state.chats[0], updatedAt: 1 };
    expect(sortChats([older, state.chats[1]]).map((c) => c.id)).toEqual(['10000000', '20000000']);
  });
});
