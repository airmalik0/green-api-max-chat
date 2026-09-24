import { GreenApiError, type GreenApiClient } from '../api/greenApi';

/**
 * По номеру телефона находит chatId получателя.
 *
 * В MAX (GREEN-API v3) отправка идёт по числовому chatId, а получить его по номеру можно
 * методом CheckAccount — так и рекомендует документация. Входящие сообщения приходят
 * с этим же chatId, поэтому ответ собеседника попадёт в тот же чат.
 * Если метода у инстанса нет (WhatsApp-инстанс), берём классический формат `номер@c.us`.
 */
export async function resolveChatId(
  client: Pick<GreenApiClient, 'checkAccount'>,
  phone: string,
): Promise<string> {
  let response: Awaited<ReturnType<GreenApiClient['checkAccount']>>;
  try {
    response = await client.checkAccount(phone);
  } catch (error) {
    if (error instanceof GreenApiError && (error.status === 404 || error.status === 405)) {
      return `${phone}@c.us`;
    }
    throw error;
  }

  const body = (response ?? {}) as Partial<{
    exist: boolean;
    chatId: string;
    status: boolean;
    reason: string;
  }>;
  if (body.exist === true) return body.chatId || `${phone}@c.us`;
  if (body.exist === false) throw new Error('На этом номере нет аккаунта MAX.');
  if (body.reason?.includes('not authorized')) {
    throw new Error('Инстанс не авторизован — отсканируйте QR-код в личном кабинете GREEN-API.');
  }
  throw new Error(body.reason ? `GREEN-API: ${body.reason}` : 'Не удалось проверить номер.');
}
