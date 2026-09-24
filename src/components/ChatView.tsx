import { useEffect, useRef } from 'react';
import { formatPhone } from '../lib/phone';
import type { Chat } from '../state/chatReducer';
import { Avatar } from './Avatar';
import styles from './ChatView.module.css';
import { Composer } from './Composer';
import { MessageBubble } from './MessageBubble';

interface Props {
  chat: Chat | null;
  onSend: (chatId: string, text: string) => void;
  onBack: () => void;
}

export function ChatView({ chat, onSend, onBack }: Props) {
  const listRef = useRef<HTMLDivElement>(null);
  const messageCount = chat?.messages.length ?? 0;

  useEffect(() => {
    const list = listRef.current;
    if (list) list.scrollTop = list.scrollHeight;
  }, [chat?.id, messageCount]);

  if (!chat) {
    return (
      <section className={styles.view}>
        <div className={styles.placeholder}>
          <span>Выберите чат или создайте новый</span>
        </div>
      </section>
    );
  }

  const subtitle =
    chat.phone && chat.title !== formatPhone(chat.phone) ? formatPhone(chat.phone) : null;

  return (
    <section className={styles.view} aria-label={`Чат с ${chat.title}`}>
      <header className={styles.header}>
        <button className={styles.back} type="button" onClick={onBack} aria-label="К списку чатов">
          <svg viewBox="0 0 24 24" width="24" height="24" aria-hidden="true">
            <path fill="currentColor" d="M15.4 5.4 14 4l-8 8 8 8 1.4-1.4L8.8 12z" />
          </svg>
        </button>
        <Avatar title={chat.title} size={40} />
        <div className={styles.headerText}>
          <h2 className={styles.title}>{chat.title}</h2>
          {subtitle && <p className={styles.subtitle}>{subtitle}</p>}
        </div>
      </header>

      <div className={styles.messages} ref={listRef}>
        {chat.messages.length === 0 ? (
          <p className={styles.hint}>Напишите первое сообщение</p>
        ) : (
          <ol className={styles.list}>
            {chat.messages.map((message) => (
              <MessageBubble key={message.id} message={message} />
            ))}
          </ol>
        )}
      </div>

      <Composer key={chat.id} onSend={(text) => onSend(chat.id, text)} />
    </section>
  );
}
