import { Event } from '../types';

export const mockEvents: Event[] = [
  {
    id: '1',
    title: 'Поход на Кок-Жайляу',
    category: 'mountains',
    datetime: 'Воскресенье, 08:00',
    participantsCount: 5,
    maxParticipants: 12,
    description: 'Поднимаемся на живописное плато Кок-Жайляу. Лёгкий маршрут, подходит для начинающих. Возьмите воду и перекус.',
    coordinate: {
      latitude: 43.1526,
      longitude: 76.9868,
    },
  },
  {
    id: '2',
    title: 'ТЮЗ театр',
    category: 'theatre',
    datetime: 'Сегодня, 19:00',
    participantsCount: 3,
    maxParticipants: 8,
    description: 'Идём на спектакль в Театр юного зрителя. Смотрим современную постановку. Билеты каждый берёт сам.',
    coordinate: {
      latitude: 43.2565,
      longitude: 76.9286,
    },
  },
  {
    id: '3',
    title: 'Джаз-вечер Алматы Централ',
    category: 'restaurant',
    datetime: 'Сегодня, 20:00',
    participantsCount: 8,
    maxParticipants: 15,
    description: 'Живая джазовая музыка в центре Алматы. Хорошая атмосфера, вкусная еда. Столик забронирован.',
    coordinate: {
      latitude: 43.2389,
      longitude: 76.8897,
    },
  },
  {
    id: '4',
    title: 'Волейбол в парке Горького',
    category: 'sport',
    datetime: 'Суббота, 17:00',
    participantsCount: 10,
    maxParticipants: 20,
    description: 'Дружеский волейбол на открытой площадке в парке им. Горького. Уровень любой, главное — хорошее настроение!',
    coordinate: {
      latitude: 43.2483,
      longitude: 76.9425,
    },
  },
];

export const categoryLabels: Record<string, string> = {
  mountains: 'Горы',
  theatre: 'Театр',
  restaurant: 'Ресторан',
  sport: 'Спорт',
  other: 'Другое',
};

export const categoryEmojis: Record<string, string> = {
  mountains: '⛰️',
  theatre: '🎭',
  restaurant: '🍽️',
  sport: '⚽',
  other: '✨',
};
