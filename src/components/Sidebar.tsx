import type { PollingStatus } from '../lib/notificationLoop';
import { formatChatTime } from '../lib/time';
import { sortChats, type Chat } from '../state/chatReducer';
import { Avatar } from './Avatar';
import { NewChatForm } from './NewChatForm';
import styles from './Sidebar.module.css';

interface Props {
  chats: Chat[];
  activeChatId: string | null;
  idInstance: string;
  pollingStatus: PollingStatus;
  notice?: string | null;
  onSelect: (chatId: string) => void;
  onCreateChat: (phone: string) => Promise<void>;
  onLogout: () => void;
}

export function Sidebar({
  chats,
  activeChatId,
  idInstance,
  pollingStatus,
  notice,
  onSelect,
  onCreateChat,
  onLogout,
}: Props) {
  return (
    <aside className={styles.sidebar}>
      <header className={styles.header}>
        <div>
          <h1 className={styles.title}>Чаты</h1>
          <p className={styles.instance}>Инстанс {idInstance}</p>
        </div>
        <button className={styles.logout} type="button" onClick={onLogout}>
          Выйти
        </button>
      </header>

      <NewChatForm onCreate={onCreateChat} />

      {notice && (
        <p className={styles.status} role="status">
          {notice}
        </p>
      )}

      {pollingStatus.kind !== 'ok' && (
        <p className={styles.status} role="status">
          {pollingStatus.kind === 'retrying'
            ? `${pollingStatus.message} Повтор через ${pollingStatus.retryInSec} с.`
            : `Приём сообщений остановлен: ${pollingStatus.message}`}
        </p>
      )}

      {chats.length === 0 ? (
        <p className={styles.empty}>
          Чатов пока нет. Введите номер получателя, чтобы начать переписку.
        </p>
      ) : (
        <ul className={styles.list} aria-label="Список чатов">
          {sortChats(chats).map((chat) => {
            const last = chat.messages.at(-1);
            return (
              <li key={chat.id}>
                <button
                  type="button"
                  className={styles.item}
                  aria-current={chat.id === activeChatId ? 'true' : undefined}
                  onClick={() => onSelect(chat.id)}
                >
                  <Avatar title={chat.title} />
                  <span className={styles.itemBody}>
                    <span className={styles.itemTop}>
                      <span className={styles.itemTitle}>{chat.title}</span>
                      {last && (
                        <span className={styles.itemTime}>{formatChatTime(last.timestamp)}</span>
                      )}
                    </span>
                    <span className={styles.itemPreview}>
                      {last
                        ? `${last.direction === 'out' ? 'Вы: ' : ''}${last.text}`
                        : 'Нет сообщений'}
                    </span>
                  </span>
                </button>
              </li>
            );
          })}
        </ul>
      )}
    </aside>
  );
}
