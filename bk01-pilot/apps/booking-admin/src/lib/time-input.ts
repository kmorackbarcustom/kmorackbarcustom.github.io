export function normalizeTimeInput(value: string): string {
  const trimmed = value.trim();
  if (!trimmed) return '';

  let hours: number;
  let minutes: number;

  const colonMatch = trimmed.match(/^(\d{1,2}):(\d{1,2})$/);
  if (colonMatch) {
    hours = Number(colonMatch[1]);
    minutes = Number(colonMatch[2]);
  } else if (/^\d{1,2}$/.test(trimmed)) {
    hours = Number(trimmed);
    minutes = 0;
  } else if (/^\d{3}$/.test(trimmed)) {
    hours = Number(trimmed.slice(0, 1));
    minutes = Number(trimmed.slice(1));
  } else if (/^\d{4}$/.test(trimmed)) {
    hours = Number(trimmed.slice(0, 2));
    minutes = Number(trimmed.slice(2));
  } else {
    return trimmed;
  }

  if (hours > 23 || minutes > 59) return trimmed;
  return `${String(hours).padStart(2, '0')}:${String(minutes).padStart(2, '0')}`;
}

export function isValidTimeInput(value: string): boolean {
  return /^(?:[01]\d|2[0-3]):[0-5]\d$/.test(normalizeTimeInput(value));
}
