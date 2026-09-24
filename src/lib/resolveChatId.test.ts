import { describe, expect, it, vi } from 'vitest';
import { GreenApiError } from '../api/greenApi';
import { resolveChatId } from './resolveChatId';

const clientWith = (impl: () => Promise<unknown>) => ({
  checkAccount: vi.fn(impl) as never,
});

describe('resolveChatId', () => {
  it('берёт chatId из CheckAccount (MAX)', async () => {
    const client = clientWith(async () => ({ exist: true, chatId: '10000000' }));
    await expect(resolveChatId(client, '79991234567')).resolves.toBe('10000000');
  });

  it('ошибка, если аккаунта MAX на номере нет', async () => {
    const client = clientWith(async () => ({ exist: false, chatId: '' }));
    await expect(resolveChatId(client, '79991234567')).rejects.toThrow(/нет аккаунта MAX/);
  });

  it('понятная ошибка для неавторизованного инстанса', async () => {
    const client = clientWith(async () => ({
      status: false,
      reason: 'instance is starting or not authorized',
    }));
    await expect(resolveChatId(client, '79991234567')).rejects.toThrow(/не авторизован/);
  });

  it('если метода нет (WhatsApp-инстанс) — формат номер@c.us', async () => {
    const client = clientWith(async () => {
      throw new GreenApiError(404, 'not found');
    });
    await expect(resolveChatId(client, '79991234567')).resolves.toBe('79991234567@c.us');
  });

  it('прочие ошибки API пробрасываются', async () => {
    const client = clientWith(async () => {
      throw new GreenApiError(400, 'bad phone number');
    });
    await expect(resolveChatId(client, '79991234567')).rejects.toThrow('bad phone number');
  });
});
