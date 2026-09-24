import type { Credentials } from '../api/types';
import type { Chat } from '../state/chatReducer';

const CREDENTIALS_KEY = 'green-api-chat:v1:credentials';
const chatsKey = (idInstance: string) => `green-api-chat:v1:chats:${idInstance}`;

// localStorage может быть недоступен (приватный режим, запрет cookies) — тогда просто не сохраняем.
function read<T>(key: string): T | null {
  try {
    const raw = localStorage.getItem(key);
    return raw ? (JSON.parse(raw) as T) : null;
  } catch {
    return null;
  }
}

function write(key: string, value: unknown): void {
  try {
    localStorage.setItem(key, JSON.stringify(value));
  } catch {
    // квота или запрет доступа — работаем без сохранения
  }
}

function remove(key: string): void {
  try {
    localStorage.removeItem(key);
  } catch {
    // см. выше
  }
}

export function loadCredentials(): Credentials | null {
  const value = read<Credentials>(CREDENTIALS_KEY);
  if (!value?.apiUrl || !value.idInstance || !value.apiTokenInstance) return null;
  return value;
}

export function saveCredentials(credentials: Credentials): void {
  write(CREDENTIALS_KEY, credentials);
}

export function loadChats(idInstance: string): Chat[] {
  const chats = read<Chat[]>(chatsKey(idInstance));
  if (!Array.isArray(chats)) return [];
  // Сообщение, которое «висело» в отправке при закрытии вкладки, считаем неотправленным.
  return chats.map((chat) => ({
    ...chat,
    messages: chat.messages.map((m) =>
      m.status === 'pending' ? { ...m, status: 'failed', error: 'Отправка прервана' } : m,
    ),
  }));
}

export function saveChats(idInstance: string, chats: Chat[]): void {
  write(chatsKey(idInstance), chats);
}

/** «Выйти»: забываем креды и историю этого инстанса. */
export function clearSession(idInstance: string): void {
  remove(CREDENTIALS_KEY);
  remove(chatsKey(idInstance));
}
