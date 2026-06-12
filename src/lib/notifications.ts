import * as Notifications from 'expo-notifications';
import { Event } from '../types';

export function configureNotifications() {
  Notifications.setNotificationHandler({
    handleNotification: async () => ({
      shouldShowAlert: true,
      shouldPlaySound: true,
      shouldSetBadge: false,
      shouldShowBanner: true,
      shouldShowList: true,
    }),
  });
}

export async function scheduleEventReminder(event: Event) {
  const { status } = await Notifications.requestPermissionsAsync();
  if (status !== 'granted') return;
  await Notifications.scheduleNotificationAsync({
    content: {
      title: '🔔 Скоро ивент!',
      body: `Через час начинается "${event.title}"`,
      sound: true,
    },
    trigger: { type: Notifications.SchedulableTriggerInputTypes.TIME_INTERVAL, seconds: 5 },
  });
}
