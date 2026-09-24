import { formatTime } from '../lib/time';
import type { Message, MessageStatus } from '../state/chatReducer';
import styles from './MessageBubble.module.css';

const STATUS_LABEL: Record<MessageStatus, string> = {
  pending: 'Отправляется',
  sent: 'Отправлено',
  delivered: 'Доставлено',
  read: 'Прочитано',
  failed: 'Не отправлено',
};

export function MessageBubble({ message }: { message: Message }) {
  const outgoing = message.direction === 'out';
  return (
    <li className={styles.row} data-direction={message.direction}>
      <div className={styles.bubble} data-failed={message.status === 'failed' ? 'true' : undefined}>
        <span className={styles.text}>{message.text}</span>
        <span className={styles.meta}>
          <time dateTime={new Date(message.timestamp).toISOString()}>
            {formatTime(message.timestamp)}
          </time>
          {outgoing && message.status && <StatusIcon status={message.status} />}
        </span>
      </div>
      {message.status === 'failed' && message.error && (
        <span className={styles.error}>{message.error}</span>
      )}
    </li>
  );
}

function StatusIcon({ status }: { status: MessageStatus }) {
  const label = STATUS_LABEL[status];
  return (
    <span
      className={styles.status}
      data-status={status}
      title={label}
      aria-label={label}
      role="img"
    >
      {status === 'pending' && (
        <svg viewBox="0 0 16 16" width="14" height="14" aria-hidden="true">
          <circle cx="8" cy="8" r="6" fill="none" stroke="currentColor" strokeWidth="1.5" />
          <path d="M8 4.5V8l2.5 1.5" fill="none" stroke="currentColor" strokeWidth="1.5" />
        </svg>
      )}
      {status === 'sent' && (
        <svg viewBox="0 0 16 16" width="16" height="16" aria-hidden="true">
          <path d="m3 8.5 3 3 7-7" fill="none" stroke="currentColor" strokeWidth="1.6" />
        </svg>
      )}
      {(status === 'delivered' || status === 'read') && (
        <svg viewBox="0 0 20 16" width="20" height="16" aria-hidden="true">
          <path
            d="m1.5 8.5 3 3 7-7M8 11.5l1 0 7-7"
            fill="none"
            stroke="currentColor"
            strokeWidth="1.6"
          />
        </svg>
      )}
      {status === 'failed' && (
        <svg viewBox="0 0 16 16" width="14" height="14" aria-hidden="true">
          <circle cx="8" cy="8" r="7" fill="currentColor" />
          <path d="M8 4v5M8 11v1.2" stroke="#fff" strokeWidth="1.6" />
        </svg>
      )}
    </span>
  );
}
