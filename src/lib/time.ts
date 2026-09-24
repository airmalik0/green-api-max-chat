const timeFormat = new Intl.DateTimeFormat('ru-RU', { hour: '2-digit', minute: '2-digit' });
const dateFormat = new Intl.DateTimeFormat('ru-RU', { day: '2-digit', month: '2-digit' });

/** Время сообщения: «14:05». */
export function formatTime(timestamp: number): string {
  return timeFormat.format(timestamp);
}

/** Для списка чатов: сегодня — время, раньше — дата «23.09». */
export function formatChatTime(timestamp: number, now: number = Date.now()): string {
  const sameDay = new Date(timestamp).toDateString() === new Date(now).toDateString();
  return sameDay ? timeFormat.format(timestamp) : dateFormat.format(timestamp);
}
