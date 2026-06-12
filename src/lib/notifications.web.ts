import { Event } from '../types';

export function configureNotifications() {
  // Web push can be added later; the PWA MVP uses in-app notifications.
}

export async function scheduleEventReminder(_event: Event) {
  // Browser notifications need a separate push/service-worker flow.
}
