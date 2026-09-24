/** Доступ к инстансу GREEN-API — три значения из личного кабинета. */
export interface Credentials {
  apiUrl: string;
  idInstance: string;
  apiTokenInstance: string;
}

export type InstanceState =
  | 'authorized'
  | 'notAuthorized'
  | 'blocked'
  | 'starting'
  | 'suspended'
  | 'pendingPassword'
  | 'sleepMode'
  | 'yellowCard';

export interface StateInstanceResponse {
  stateInstance: InstanceState;
}

/** Часть настроек инстанса, от которых зависит приём уведомлений. */
export interface InstanceSettings {
  webhookUrl: string;
  incomingWebhook: 'yes' | 'no';
  outgoingWebhook: 'yes' | 'no';
}

export interface SendMessageResponse {
  idMessage: string;
}

export interface CheckAccountResponse {
  exist: boolean;
  chatId: string;
}

export interface DeleteNotificationResponse {
  result: boolean;
  reason?: string;
}

export interface SenderData {
  chatId: string;
  chatName?: string;
  sender?: string;
  senderName?: string;
  senderContactName?: string;
  senderPhoneNumber?: number | string;
}

export interface MessageData {
  typeMessage: string;
  textMessageData?: { textMessage: string };
  extendedTextMessageData?: { text: string };
}

export interface IncomingMessageNotification {
  typeWebhook: 'incomingMessageReceived';
  timestamp: number;
  idMessage: string;
  senderData: SenderData;
  messageData: MessageData;
}

export type OutgoingStatus = 'sent' | 'delivered' | 'read' | 'failed' | 'noAccount' | 'notInGroup';

export interface OutgoingMessageStatusNotification {
  typeWebhook: 'outgoingMessageStatus';
  chatId: string;
  timestamp: number;
  idMessage: string;
  status: OutgoingStatus;
  description?: string;
}

/** Все прочие типы уведомлений приложение не показывает — только удаляет из очереди. */
export interface OtherNotification {
  typeWebhook: string;
}

export type NotificationBody =
  IncomingMessageNotification | OutgoingMessageStatusNotification | OtherNotification;

export interface ReceivedNotification {
  receiptId: number;
  body: NotificationBody;
}
