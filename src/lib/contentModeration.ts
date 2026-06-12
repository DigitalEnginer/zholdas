type ModerationResult = {
  ok: boolean;
  message?: string;
};

const BLOCKED_RULES: Array<{ pattern: RegExp; message: string }> = [
  {
    pattern: /\b(бля+|сука+|хуй|хуе|пизд|еба|ёба|нахуй|долбо|мраз)\w*/i,
    message: 'Убери мат и оскорбления. Жолдас должен оставаться безопасным местом.',
  },
  {
    pattern: /\b(наркот|заклад|меф|соль|кокаин|героин|спайс)\w*/i,
    message: 'Нельзя публиковать контент про наркотики или незаконные вещества.',
  },
  {
    pattern: /\b(интим|эскорт|проститут|порно|18\+)\w*/i,
    message: 'Нельзя публиковать сексуальный или интимный контент.',
  },
  {
    pattern: /\b(убить|зареж|изнасил|террор|экстрем)\w*/i,
    message: 'Нельзя публиковать угрозы, насилие или экстремистский контент.',
  },
  {
    pattern: /(https?:\/\/|www\.|t\.me\/|wa\.me\/|bit\.ly\/)/i,
    message: 'Ссылки и внешние приглашения пока запрещены для защиты от спама.',
  },
];

function normalizeText(value: string) {
  return value.replace(/\s+/g, ' ').trim();
}

function hasTooMuchNoise(value: string) {
  const text = normalizeText(value);
  if (!text) return false;
  const symbolCount = (text.match(/[!?.@$#%^&*_=+~]{1}/g) ?? []).length;
  return symbolCount >= 8 || /(.)\1{5,}/i.test(text);
}

function checkCommonRules(value: string): ModerationResult {
  const text = normalizeText(value);
  for (const rule of BLOCKED_RULES) {
    if (rule.pattern.test(text)) {
      return { ok: false, message: rule.message };
    }
  }

  if (hasTooMuchNoise(text)) {
    return { ok: false, message: 'Текст выглядит как спам. Напиши спокойнее и понятнее.' };
  }

  return { ok: true };
}

export function validateEventContent(title: string, description: string): ModerationResult {
  const cleanTitle = normalizeText(title);
  const cleanDescription = normalizeText(description);

  if (cleanTitle.length < 4) {
    return { ok: false, message: 'Название ивента должно быть понятнее: минимум 4 символа.' };
  }

  if (cleanTitle.length > 60) {
    return { ok: false, message: 'Название ивента слишком длинное.' };
  }

  const titleCheck = checkCommonRules(cleanTitle);
  if (!titleCheck.ok) return titleCheck;

  const descriptionCheck = checkCommonRules(cleanDescription);
  if (!descriptionCheck.ok) return descriptionCheck;

  return { ok: true };
}

export function validateChatMessage(text: string): ModerationResult {
  const cleanText = normalizeText(text);
  if (!cleanText) return { ok: true };
  if (cleanText.length > 500) {
    return { ok: false, message: 'Сообщение слишком длинное.' };
  }
  return checkCommonRules(cleanText);
}

export function userMessageFromModerationError(errorMessage?: string) {
  const message = errorMessage ?? '';
  if (message.includes('Content violates Zholdas community rules')) {
    return 'Сообщение не прошло модерацию. Убери мат, спам, ссылки или опасный контент.';
  }
  if (message.includes('Event content violates Zholdas community rules')) {
    return 'Ивент не прошел модерацию. Измени название или описание.';
  }
  if (message.includes('User is banned')) {
    return 'Аккаунт заблокирован модерацией.';
  }
  return errorMessage;
}
