import { useCallback, useEffect, useMemo, useReducer } from 'react';
import { createGreenApiClient, GreenApiError } from '../api/greenApi';
import type { Credentials, NotificationBody } from '../api/types';
import { useNotificationPolling } from '../hooks/useNotificationPolling';
import { formatPhone } from '../lib/phone';
import { resolveChatId } from '../lib/resolveChatId';
import { loadChats, saveChats } from '../lib/storage';
import { chatReducer } from '../state/chatReducer';
import { ChatView } from './ChatView';
import styles from './ChatScreen.module.css';
import { Sidebar } from './Sidebar';

interface Props {
  credentials: Credentials;
  /** Пояснение после входа (например, что приложение включило приём уведомлений). */
  notice?: string | null;
  onLogout: () => void;
}

let localIdCounter = 0;
const nextLocalId = () => `local-${Date.now()}-${++localIdCounter}`;

export function ChatScreen({ credentials, notice, onLogout }: Props) {
  const client = useMemo(() => createGreenApiClient(credentials), [credentials]);
  const [state, dispatch] = useReducer(chatReducer, credentials.idInstance, (idInstance) => ({
    chats: loadChats(idInstance),
    activeChatId: null,
  }));

  useEffect(() => {
    saveChats(credentials.idInstance, state.chats);
  }, [credentials.idInstance, state.chats]);

  const handleNotification = useCallback(
    (body: NotificationBody) => dispatch({ type: 'notificationReceived', body }),
    [],
  );
  const pollingStatus = useNotificationPolling(client, handleNotification);

  const createChat = useCallback(
    async (phone: string) => {
      const chatId = await resolveChatId(client, phone);
      dispatch({
        type: 'chatOpened',
        chat: { id: chatId, title: formatPhone(phone), phone },
        now: Date.now(),
      });
    },
    [client],
  );

  const sendMessage = useCallback(
    async (chatId: string, text: string) => {
      const localId = nextLocalId();
      dispatch({ type: 'messageQueued', chatId, localId, text, timestamp: Date.now() });
      try {
        const result = await client.sendMessage(chatId, text);
        if (!result?.idMessage) throw new Error('GREEN-API не вернул idMessage');
        dispatch({ type: 'messageSent', chatId, localId, idMessage: result.idMessage });
      } catch (error) {
        const message =
          error instanceof GreenApiError || error instanceof Error
            ? error.message
            : 'Не удалось отправить';
        dispatch({ type: 'messageFailed', chatId, localId, error: message });
      }
    },
    [client],
  );

  const activeChat = state.chats.find((chat) => chat.id === state.activeChatId) ?? null;

  return (
    <div className={styles.layout} data-chat-open={activeChat ? 'true' : 'false'}>
      <Sidebar
        chats={state.chats}
        activeChatId={state.activeChatId}
        idInstance={credentials.idInstance}
        pollingStatus={pollingStatus}
        notice={notice}
        onSelect={(chatId) => dispatch({ type: 'chatSelected', chatId })}
        onCreateChat={createChat}
        onLogout={onLogout}
      />
      <ChatView
        chat={activeChat}
        onSend={sendMessage}
        onBack={() => dispatch({ type: 'chatSelected', chatId: null })}
      />
    </div>
  );
}
