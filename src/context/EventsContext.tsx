import React, { createContext, useContext, useState, useEffect } from 'react';
import * as Notifications from 'expo-notifications';
import { supabase } from '../lib/supabase';
import { Event, EventCategory } from '../types';
import { useAuth } from './AuthContext';

interface EventsContextType {
  events: Event[];
  isLoading: boolean;
  joinEvent: (eventId: string, userId: string) => Promise<void>;
  leaveEvent: (eventId: string, userId: string) => Promise<void>;
  createEvent: (event: Omit<Event, 'id' | 'participantsCount' | 'joinedUserIds'>) => Promise<Event>;
  isJoined: (eventId: string, userId: string) => boolean;
}

const EventsContext = createContext<EventsContextType>({} as EventsContextType);

Notifications.setNotificationHandler({
  handleNotification: async () => ({
    shouldShowAlert: true,
    shouldPlaySound: true,
    shouldSetBadge: false,
    shouldShowBanner: true,
    shouldShowList: true,
  }),
});

async function scheduleEventReminder(event: Event) {
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

function transformEvent(e: any): Event {
  const participants = e.event_participants ?? [];
  const visibleParticipants = participants.filter((p: any) => !p.profiles?.is_banned);

  return {
    id: e.id,
    title: e.title,
    category: e.category as EventCategory,
    datetime: e.datetime,
    participantsCount: visibleParticipants.length,
    hiddenParticipantsCount: Math.max(0, participants.length - visibleParticipants.length),
    maxParticipants: e.max_participants,
    description: e.description,
    coordinate: { latitude: Number(e.latitude), longitude: Number(e.longitude) },
    address: e.address ?? undefined,
    createdBy: e.created_by ?? undefined,
    joinedUserIds: visibleParticipants.map((p: { user_id: string }) => p.user_id),
    imageUri: e.image_uri ?? undefined,
    isRecurring: e.is_recurring ?? false,
    recurringLabel: e.recurring_label ?? undefined,
    genderFilter: e.gender_filter ?? 'all',
    minAge: e.min_age ?? undefined,
    maxAge: e.max_age ?? undefined,
  };
}

export function EventsProvider({ children }: { children: React.ReactNode }) {
  const [events, setEvents] = useState<Event[]>([]);
  const [isLoading, setIsLoading] = useState(true);
  const { user } = useAuth();

  useEffect(() => {
    loadEvents();

    const channel = supabase
      .channel('events-realtime')
      .on('postgres_changes', { event: '*', schema: 'public', table: 'events' }, loadEvents)
      .on('postgres_changes', { event: '*', schema: 'public', table: 'event_participants' }, loadEvents)
      .subscribe();

    return () => { supabase.removeChannel(channel); };
  }, [user?.id]);

  async function loadEvents() {
    const { data, error } = await supabase
      .from('events')
      .select('*, profiles!events_created_by_fkey(is_banned), event_participants(user_id, profiles(id, is_banned))')
      .order('created_at', { ascending: false });

    if (!error && data) {
      let nextEvents = data.filter((e: any) => !e.profiles?.is_banned).map(transformEvent);

      if (user) {
        const { data: blocks } = await supabase
          .from('blocks')
          .select('blocked_id')
          .eq('blocker_id', user.id);
        const blockedIds = new Set((blocks ?? []).map((b: any) => b.blocked_id));
        nextEvents = nextEvents.filter((event: Event) => !event.createdBy || !blockedIds.has(event.createdBy));
      }

      setEvents(nextEvents);
    }
    setIsLoading(false);
  }

  async function joinEvent(eventId: string, userId: string) {
    try {
      await supabase.rpc('join_event', { p_event_id: eventId, p_user_id: userId });
      const event = events.find(e => e.id === eventId);
      if (event) scheduleEventReminder(event);
      await loadEvents();
    } catch (err: any) {
      if (err?.message?.includes('full')) throw new Error('Ивент уже заполнен');
    }
  }

  async function leaveEvent(eventId: string, userId: string) {
    await supabase.rpc('leave_event', { p_event_id: eventId, p_user_id: userId });
    await loadEvents();
  }

  async function createEvent(data: Omit<Event, 'id' | 'participantsCount' | 'joinedUserIds'>): Promise<Event> {
    const { data: newEvent, error } = await supabase.from('events').insert({
      title: data.title,
      category: data.category,
      datetime: data.datetime,
      participants_count: 1,
      max_participants: data.maxParticipants,
      description: data.description,
      latitude: data.coordinate.latitude,
      longitude: data.coordinate.longitude,
      address: data.address ?? null,
      created_by: data.createdBy ?? null,
      image_uri: data.imageUri ?? null,
      is_recurring: data.isRecurring ?? false,
      recurring_label: data.recurringLabel ?? null,
      gender_filter: data.genderFilter ?? 'all',
      min_age: data.minAge ?? null,
      max_age: data.maxAge ?? null,
    }).select().single();

    if (error) throw new Error(error.message);

    if (data.createdBy) {
      await supabase.from('event_participants').insert({
        event_id: newEvent.id,
        user_id: data.createdBy,
      });
    }

    await loadEvents();
    return transformEvent({ ...newEvent, event_participants: data.createdBy ? [{ user_id: data.createdBy }] : [] });
  }

  function isJoined(eventId: string, userId: string): boolean {
    const event = events.find(e => e.id === eventId);
    return event?.joinedUserIds?.includes(userId) ?? false;
  }

  return (
    <EventsContext.Provider value={{ events, isLoading, joinEvent, leaveEvent, createEvent, isJoined }}>
      {children}
    </EventsContext.Provider>
  );
}

export const useEvents = () => useContext(EventsContext);
