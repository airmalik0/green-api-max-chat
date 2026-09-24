/**
 * Приводит введённый номер к виду «только цифры, с кодом страны».
 * «+7 (999) 123-45-67», «8 999 123 45 67», «79991234567» → «79991234567».
 * Возвращает null, если номер не похож на международный (10–15 цифр по E.164).
 */
export function normalizePhone(input: string): string | null {
  if (/[^\d\s()+\-.]/.test(input)) return null;
  let digits = input.replace(/\D/g, '');
  // Российский «восьмёрочный» формат: 8XXXXXXXXXX → 7XXXXXXXXXX
  if (digits.length === 11 && digits.startsWith('8')) digits = `7${digits.slice(1)}`;
  if (digits.length < 10 || digits.length > 15 || digits.startsWith('0')) return null;
  return digits;
}

/** «79991234567» → «+7 999 123-45-67»; прочие номера — «+» и цифры группами. */
export function formatPhone(digits: string): string {
  if (/^7\d{10}$/.test(digits)) {
    return `+7 ${digits.slice(1, 4)} ${digits.slice(4, 7)}-${digits.slice(7, 9)}-${digits.slice(9)}`;
  }
  return `+${digits}`;
}
