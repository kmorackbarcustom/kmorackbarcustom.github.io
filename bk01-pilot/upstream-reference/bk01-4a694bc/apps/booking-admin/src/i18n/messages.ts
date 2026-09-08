import th from '../../messages/th.json';
import en from '../../messages/en.json';
import type { Locale } from './config';

type Messages = typeof th;

export const messages: Record<Locale, Messages> = {
  th,
  en: en as Messages,
};

export function getMessages(locale: Locale): Messages {
  return messages[locale];
}
