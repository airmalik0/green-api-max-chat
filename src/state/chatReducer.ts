import type {
  IncomingMessageNotification,
  NotificationBody,
  OutgoingMessageStatusNotification,
} from '../api/types';

export type MessageStatus = 'pending' | 'sent' | 'delivered' | 'read' | 'failed';

export interface Message {
  /** idMessage из GREEN-API, а до ответа sendMessage — локальный id. */
  id: string;
  text: string;
  /** Unix-время в миллисекундах. */
  timestamp: number;
  direction: 'in' | 'out';
  status?: MessageStatus;
  error?: string;
}

export interface Chat {
  /** chatId в терминах GREEN-API: для MAX — числовой id из CheckAccount, для WhatsApp — 79991234567@c.us. */
  id: string;
  title: string;
  phone?: string;
  messages: Message[];
  updatedAt: number;
}

export interface ChatState {
  chats: Chat[];
  activeChatId: string | null;
}

export type ChatAction =
  | { type: 'chatOpened'; chat: { id: string; title: string; phone?: string }; now: number }
  | { type: 'chatSelected'; chatId: string | null }
  | { type: 'messageQueued'; chatId: string; localId: string; text: string; timestamp: number }
  | { type: 'messageSent'; chatId: string; localId: string; idMessage: string }
  | { type: 'messageFailed'; chatId: string; localId: string; error: string }
  | { type: 'notificationReceived'; body: NotificationBody };

export const initialChatState: ChatState = { chats: [], activeChatId: null };

const STATUS_RANK: Record<MessageStatus, number> = {
  pending: 0,
  sent: 1,
  delivered: 2,
  read: 3,
  failed: 4,
};

export function chatReducer(state: ChatState, action: ChatAction): ChatState {
  switch (action.type) {
    case 'chatOpened': {
      const existing = state.chats.find((chat) => chat.id === action.chat.id);
      if (existing) return { ...state, activeChatId: existing.id };
      const chat: Chat = { ...action.chat, messages: [], updatedAt: action.now };
      return { chats: [chat, ...state.chats], activeChatId: chat.id };
    }

    case 'chatSelected':
      return { ...state, activeChatId: action.chatId };

    case 'messageQueued':
      return updateChat(state, action.chatId, (chat) => ({
        ...chat,
        updatedAt: action.timestamp,
        messages: [
          ...chat.messages,
          {
            id: action.localId,
            text: action.text,
            timestamp: action.timestamp,
            direction: 'out',
            status: 'pending',
          },
        ],
      }));

    case 'messageSent':
      return updateMessage(state, action.chatId, action.localId, (message) => ({
        ...message,
        id: action.idMessage,
        status: message.status === 'pending' ? 'sent' : message.status,
      }));

    case 'messageFailed':
      return updateMessage(state, action.chatId, action.localId, (message) => ({
        ...message,
        status: 'failed',
        error: action.error,
      }));

    case 'notificationReceived':
      if (isIncomingText(action.body)) return applyIncoming(state, action.body);
      if (isOutgoingStatus(action.body)) return applyStatus(state, action.body);
      return state;
  }
}

/** Текст входящего сообщения или null, если это не текст (картинка, стикер и т. п.). */
export function extractText(body: IncomingMessageNotification): string | null {
  const { messageData } = body;
  if (messageData.typeMessage === 'textMessage') {
    return messageData.textMessageData?.textMessage ?? null;
  }
  if (messageData.typeMessage === 'extendedTextMessage') {
    return messageData.extendedTextMessageData?.text ?? null;
  }
  return null;
}

function isIncomingText(body: NotificationBody): body is IncomingMessageNotification {
  return (
    body.typeWebhook === 'incomingMessageReceived' &&
    extractText(body as IncomingMessageNotification) !== null
  );
}

function isOutgoingStatus(body: NotificationBody): body is OutgoingMessageStatusNotification {
  return body.typeWebhook === 'outgoingMessageStatus';
}

function applyIncoming(state: ChatState, body: IncomingMessageNotification): ChatState {
  const { senderData } = body;
  const phone = senderData.senderPhoneNumber ? String(senderData.senderPhoneNumber) : undefined;
  const message: Message = {
    id: body.idMessage,
    text: extractText(body) ?? '',
    timestamp: body.timestamp * 1000,
    direction: 'in',
  };

  // Чат, созданный по номеру, мог получить другой chatId — поэтому ищем ещё и по номеру.
  const chat =
    state.chats.find((c) => c.id === senderData.chatId) ??
    (phone ? state.chats.find((c) => c.phone === phone) : undefined);

  if (!chat) {
    const title =
      senderData.senderContactName ||
      senderData.chatName ||
      senderData.senderName ||
      (phone ? `+${phone}` : senderData.chatId);
    const created: Chat = {
      id: senderData.chatId,
      title,
      phone,
      messages: [message],
      updatedAt: message.timestamp,
    };
    return { ...state, chats: [created, ...state.chats] };
  }

  if (chat.messages.some((m) => m.id === message.id)) return state; // повторная доставка
  return updateChat(state, chat.id, (c) => ({
    ...c,
    updatedAt: Math.max(c.updatedAt, message.timestamp),
    messages: insertByTime(c.messages, message),
  }));
}

function applyStatus(state: ChatState, body: OutgoingMessageStatusNotification): ChatState {
  const chat = state.chats.find((c) => c.messages.some((m) => m.id === body.idMessage));
  if (!chat) return state;
  const next = toMessageStatus(body.status);
  const failed = next === 'failed';
  return updateMessage(state, chat.id, body.idMessage, (message) => {
    if (!failed && STATUS_RANK[next] <= STATUS_RANK[message.status ?? 'pending']) return message;
    return {
      ...message,
      status: next,
      error: failed ? describeFailure(body) : undefined,
    };
  });
}

function toMessageStatus(status: OutgoingMessageStatusNotification['status']): MessageStatus {
  if (status === 'sent' || status === 'delivered' || status === 'read') return status;
  return 'failed'; // failed, noAccount, notInGroup
}

function describeFailure(body: OutgoingMessageStatusNotification): string {
  if (body.status === 'noAccount') return 'У получателя нет аккаунта в мессенджере';
  return body.description || 'Сообщение не доставлено';
}

function insertByTime(messages: Message[], message: Message): Message[] {
  const index = messages.findIndex((m) => m.timestamp > message.timestamp);
  if (index === -1) return [...messages, message];
  return [...messages.slice(0, index), message, ...messages.slice(index)];
}

function updateChat(state: ChatState, chatId: string, update: (chat: Chat) => Chat): ChatState {
  if (!state.chats.some((chat) => chat.id === chatId)) return state;
  return {
    ...state,
    chats: state.chats.map((chat) => (chat.id === chatId ? update(chat) : chat)),
  };
}

function updateMessage(
  state: ChatState,
  chatId: string,
  messageId: string,
  update: (message: Message) => Message,
): ChatState {
  return updateChat(state, chatId, (chat) => ({
    ...chat,
    messages: chat.messages.map((m) => (m.id === messageId ? update(m) : m)),
  }));
}

/** Чаты для сайдбара: сверху — с самой свежей активностью. */
export function sortChats(chats: Chat[]): Chat[] {
  return [...chats].sort((a, b) => b.updatedAt - a.updatedAt);
}
