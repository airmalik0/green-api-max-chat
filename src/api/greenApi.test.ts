import { describe, expect, it, vi } from 'vitest';
import { apiUrlFor, createGreenApiClient, GreenApiError } from './greenApi';

const credentials = {
  apiUrl: 'https://3100.api.green-api.com/',
  idInstance: '3100123456',
  apiTokenInstance: 'token123',
};

function mockFetch(status: number, body: string) {
  return vi.fn<typeof fetch>().mockResolvedValue(new Response(body, { status }));
}

describe('createGreenApiClient', () => {
  it('собирает URL в формате {apiUrl}/waInstance{id}/{method}/{token}', async () => {
    const fetchMock = mockFetch(200, '{"stateInstance":"authorized"}');
    const client = createGreenApiClient(credentials, fetchMock);

    await expect(client.getStateInstance()).resolves.toEqual({ stateInstance: 'authorized' });
    expect(fetchMock).toHaveBeenCalledWith(
      'https://3100.api.green-api.com/waInstance3100123456/getStateInstance/token123',
      expect.objectContaining({ method: 'GET' }),
    );
  });

  it('sendMessage шлёт POST с chatId и message', async () => {
    const fetchMock = mockFetch(200, '{"idMessage":"ABC"}');
    const client = createGreenApiClient(credentials, fetchMock);

    await expect(client.sendMessage('10000000', 'Привет')).resolves.toEqual({ idMessage: 'ABC' });
    const [url, init] = fetchMock.mock.calls[0];
    expect(url).toBe('https://3100.api.green-api.com/waInstance3100123456/sendMessage/token123');
    expect(init?.method).toBe('POST');
    expect(JSON.parse(String(init?.body))).toEqual({ chatId: '10000000', message: 'Привет' });
  });

  it('checkAccount передаёт номер числом', async () => {
    const fetchMock = mockFetch(200, '{"exist":true,"chatId":"10000000"}');
    await createGreenApiClient(credentials, fetchMock).checkAccount('79991234567');
    expect(JSON.parse(String(fetchMock.mock.calls[0][1]?.body))).toEqual({
      phoneNumber: 79991234567,
    });
  });

  it('receiveNotification передаёт таймаут и возвращает null на пустой очереди', async () => {
    const fetchMock = mockFetch(200, 'null');
    const client = createGreenApiClient(credentials, fetchMock);

    await expect(client.receiveNotification(20)).resolves.toBeNull();
    expect(fetchMock.mock.calls[0][0]).toBe(
      'https://3100.api.green-api.com/waInstance3100123456/receiveNotification/token123?receiveTimeout=20',
    );
  });

  it('receiveNotification считает 408 по таймауту пустой очередью, а не ошибкой', async () => {
    const client = createGreenApiClient(credentials, mockFetch(408, ''));
    await expect(client.receiveNotification(20)).resolves.toBeNull();
  });

  it('408 в других методах остаётся ошибкой', async () => {
    const client = createGreenApiClient(credentials, mockFetch(408, ''));
    await expect(client.getStateInstance()).rejects.toMatchObject({ status: 408 });
  });

  it('deleteNotification шлёт DELETE с receiptId в пути', async () => {
    const fetchMock = mockFetch(200, '{"result":true}');
    await createGreenApiClient(credentials, fetchMock).deleteNotification(42);
    const [url, init] = fetchMock.mock.calls[0];
    expect(url).toBe(
      'https://3100.api.green-api.com/waInstance3100123456/deleteNotification/token123/42',
    );
    expect(init?.method).toBe('DELETE');
  });

  it('401 превращается в понятную ошибку неверных кредов', async () => {
    const client = createGreenApiClient(credentials, mockFetch(401, ''));
    const error = await client.getStateInstance().catch((e: unknown) => e);
    expect(error).toBeInstanceOf(GreenApiError);
    expect((error as GreenApiError).isUnauthorized).toBe(true);
    expect((error as GreenApiError).message).toMatch(/Неверный idInstance/);
  });

  it('400 показывает текст ошибки сервера', async () => {
    const client = createGreenApiClient(
      credentials,
      mockFetch(400, '{"message":"Validation failed"}'),
    );
    await expect(client.sendMessage('1', 'x')).rejects.toThrow('Validation failed');
  });

  it('сетевой сбой — GreenApiError со статусом 0', async () => {
    const fetchMock = vi.fn<typeof fetch>().mockRejectedValue(new TypeError('Failed to fetch'));
    const error = await createGreenApiClient(credentials, fetchMock)
      .getStateInstance()
      .catch((e: unknown) => e);
    expect(error).toBeInstanceOf(GreenApiError);
    expect((error as GreenApiError).status).toBe(0);
  });

  it('отмена запроса пробрасывает AbortError как есть', async () => {
    const fetchMock = vi
      .fn<typeof fetch>()
      .mockRejectedValue(new DOMException('Aborted', 'AbortError'));
    await expect(
      createGreenApiClient(credentials, fetchMock).receiveNotification(5),
    ).rejects.toMatchObject({ name: 'AbortError' });
  });
});

describe('apiUrlFor', () => {
  it('строит хост по первым четырём цифрам idInstance', () => {
    expect(apiUrlFor('3100227456')).toBe('https://3100.api.green-api.com');
    expect(apiUrlFor(' 1103123456 ')).toBe('https://1103.api.green-api.com');
  });

  it('пусто, пока номер инстанса не введён', () => {
    expect(apiUrlFor('')).toBe('');
    expect(apiUrlFor('31a')).toBe('');
  });
});
