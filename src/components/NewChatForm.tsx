import { useState, type FormEvent } from 'react';
import { normalizePhone } from '../lib/phone';
import styles from './NewChatForm.module.css';

interface Props {
  onCreate: (phone: string) => Promise<void>;
}

export function NewChatForm({ onCreate }: Props) {
  const [value, setValue] = useState('');
  const [error, setError] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);

  async function handleSubmit(event: FormEvent) {
    event.preventDefault();
    const phone = normalizePhone(value);
    if (!phone) {
      setError('Номер в международном формате, например +7 999 123-45-67');
      return;
    }
    setBusy(true);
    setError(null);
    try {
      await onCreate(phone);
      setValue('');
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Не удалось создать чат');
    } finally {
      setBusy(false);
    }
  }

  return (
    <form className={styles.form} onSubmit={handleSubmit} noValidate>
      <div className={styles.row}>
        <label className="visually-hidden" htmlFor="new-chat-phone">
          Номер получателя
        </label>
        <input
          id="new-chat-phone"
          className={styles.input}
          type="tel"
          inputMode="tel"
          autoComplete="off"
          placeholder="Номер получателя"
          value={value}
          onChange={(e) => {
            setValue(e.target.value);
            setError(null);
          }}
          aria-invalid={error ? 'true' : undefined}
          aria-describedby={error ? 'new-chat-error' : undefined}
        />
        <button className={styles.button} type="submit" disabled={busy || !value.trim()}>
          {busy ? '…' : 'Создать чат'}
        </button>
      </div>
      {error && (
        <p id="new-chat-error" className={styles.error} role="alert">
          {error}
        </p>
      )}
    </form>
  );
}
