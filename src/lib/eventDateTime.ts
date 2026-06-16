const DAY_MS = 24 * 60 * 60 * 1000;

function pad(value: number) {
  return String(value).padStart(2, '0');
}

export function formatDateInput(date: Date) {
  return `${date.getFullYear()}-${pad(date.getMonth() + 1)}-${pad(date.getDate())}`;
}

export function formatTimeInput(date: Date) {
  return `${pad(date.getHours())}:${pad(date.getMinutes())}`;
}

export function parseDateInput(value: string) {
  const match = value.trim().match(/^(\d{4})-(\d{2})-(\d{2})$/);
  if (!match) return null;

  const year = Number(match[1]);
  const month = Number(match[2]);
  const day = Number(match[3]);
  const date = new Date(year, month - 1, day);

  if (
    date.getFullYear() !== year
    || date.getMonth() !== month - 1
    || date.getDate() !== day
  ) {
    return null;
  }

  return date;
}

export function normalizeTimeInput(value: string) {
  const match = value.trim().match(/^(\d{1,2}):(\d{2})$/);
  if (!match) return null;

  const hours = Number(match[1]);
  const minutes = Number(match[2]);
  if (hours > 23 || minutes > 59) return null;

  return `${pad(hours)}:${pad(minutes)}`;
}

export function composeStartsAt(date: Date, time: string) {
  const normalizedTime = normalizeTimeInput(time);
  if (!normalizedTime) return null;

  const [hours, minutes] = normalizedTime.split(':').map(Number);
  const startsAt = new Date(date);
  startsAt.setHours(hours, minutes, 0, 0);
  return startsAt;
}

export function getDateOptions(count = 7) {
  const today = new Date();
  today.setHours(0, 0, 0, 0);

  return Array.from({ length: count }, (_, index) => {
    const date = new Date(today.getTime() + index * DAY_MS);
    return {
      value: formatDateInput(date),
      date,
    };
  });
}

export function formatEventDateTime(date: Date, locale: string) {
  const resolvedLocale = locale === 'kk' ? 'kk-KZ' : 'ru-RU';
  const day = date.toLocaleDateString(resolvedLocale, {
    weekday: 'long',
    day: 'numeric',
    month: 'short',
  });
  const time = date.toLocaleTimeString(resolvedLocale, {
    hour: '2-digit',
    minute: '2-digit',
  });

  return `${day.charAt(0).toUpperCase()}${day.slice(1)}, ${time}`;
}
