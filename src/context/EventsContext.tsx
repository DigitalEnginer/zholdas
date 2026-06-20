import React, { createContext, useContext, useState, useEffect } from 'react';
import { supabase } from '../lib/supabase';
import { configureNotifications, scheduleEventReminder } from '../lib/notifications';
import { Event, EventCategory } from '../types';
import { useAuth } from './AuthContext';

interface EventsContextType {
  events: Event[];
  isLoading: boolean;
  joinEvent: (eventId: string, userId: string) => Promise<void>;
  leaveEvent: (eventId: string, userId: string) => Promise<void>;
  createEvent: (event: Omit<Event, 'id' | 'participantsCount' | 'joinedUserIds'>) => Promise<Event>;
  updateEvent: (eventId: string, event: Partial<Omit<Event, 'id' | 'participantsCount' | 'joinedUserIds'>>) => Promise<void>;
  updateEventStatus: (eventId: string, status: NonNullable<Event['status']>, cancelReason?: string) => Promise<void>;
  isJoined: (eventId: string, userId: string) => boolean;
}

const EventsContext = createContext<EventsContextType>({} as EventsContextType);

configureNotifications();

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
    status: e.status ?? 'active',
    cancelReason: e.cancel_reason ?? undefined,
    startsAt: e.starts_at ?? undefined,
    visibility: e.visibility ?? 'public',
  };
}

function toEventUpdate(data: Partial<Omit<Event, 'id' | 'participantsCount' | 'joinedUserIds'>>) {
  const update: Record<string, unknown> = {};
  if (data.title !== undefined) update.title = data.title;
  if (data.category !== undefined) update.category = data.category;
  if (data.datetime !== undefined) update.datetime = data.datetime;
  if (data.maxParticipants !== undefined) update.max_participants = data.maxParticipants;
  if (data.description !== undefined) update.description = data.description;
  if (data.coordinate !== undefined) {
    update.latitude = data.coordinate.latitude;
    update.longitude = data.coordinate.longitude;
  }
  if (data.address !== undefined) update.address = data.address ?? null;
  if (data.createdBy !== undefined) update.created_by = data.createdBy ?? null;
  if (data.imageUri !== undefined) update.image_uri = data.imageUri ?? null;
  if (data.isRecurring !== undefined) update.is_recurring = data.isRecurring;
  if (data.recurringLabel !== undefined) update.recurring_label = data.recurringLabel ?? null;
  if (data.genderFilter !== undefined) update.gender_filter = data.genderFilter;
  if (data.minAge !== undefined) update.min_age = data.minAge ?? null;
  if (data.maxAge !== undefined) update.max_age = data.maxAge ?? null;
  if (data.status !== undefined) update.status = data.status;
  if (data.cancelReason !== undefined) update.cancel_reason = data.cancelReason ?? null;
  if (data.startsAt !== undefined) update.starts_at = data.startsAt ?? null;
  if (data.visibility !== undefined) update.visibility = data.visibility;
  return update;
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
    await supabase.rpc('finish_past_events');

    const { data, error } = await supabase
      .from('events')
      .select('*, profiles!events_created_by_fkey(is_banned), event_participants(user_id, profiles(id, is_banned))')
      .order('created_at', { ascending: false });

    if (!error && data) {
      let nextEvents = data.filter((e: any) => !e.profiles?.is_banned).map(transformEvent);

      if (user) {
        // Fetch blocks
        const { data: blocks } = await supabase
          .from('blocks')
          .select('blocked_id')
          .eq('blocker_id', user.id);
        const blockedIds = new Set((blocks ?? []).map((b: any) => b.blocked_id));

        // Fetch accepted friends
        const { data: friendsData } = await supabase
          .from('friend_requests')
          .select('from_user_id, to_user_id')
          .eq('status', 'accepted')
          .or(`from_user_id.eq.${user.id},to_user_id.eq.${user.id}`);
        const friendIds = new Set(
          (friendsData ?? []).map((r: any) =>
            r.from_user_id === user.id ? r.to_user_id : r.from_user_id
          )
        );

        const currentYear = new Date().getFullYear();
        const userAge = user.birthYear ? currentYear - user.birthYear : undefined;
        const userGender = user.gender;

        nextEvents = nextEvents.filter((event: Event) => {
          // 1. Block check
          if (event.createdBy && blockedIds.has(event.createdBy)) {
            return false;
          }

          // 2. Creator always sees their own events
          if (event.createdBy === user.id) {
            return true;
          }

          // 3. Visibility check: only friends see if visibility is 'friends'
          if (event.visibility === 'friends') {
            if (!event.createdBy || !friendIds.has(event.createdBy)) {
              return false;
            }
          }

          // 4. Gender filter check
          if (event.genderFilter && event.genderFilter !== 'all') {
            if (!userGender || userGender === 'not_specified' || userGender !== event.genderFilter) {
              return false;
            }
          }

          // 5. Age filter check
          if (event.minAge !== undefined || event.maxAge !== undefined) {
            if (userAge === undefined) {
              return false;
            }
            if (event.minAge !== undefined && userAge < event.minAge) {
              return false;
            }
            if (event.maxAge !== undefined && userAge > event.maxAge) {
              return false;
            }
          }

          return true;
        });
      } else {
        // If not logged in, hide friends-only events and events with restrictions
        nextEvents = nextEvents.filter((event: Event) => {
          if (event.visibility === 'friends') {
            return false;
          }
          if (event.genderFilter && event.genderFilter !== 'all') {
            return false;
          }
          if (event.minAge !== undefined || event.maxAge !== undefined) {
            return false;
          }
          return true;
        });
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
      throw new Error(err?.message ?? 'Не удалось присоединиться к ивенту');
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
      status: data.status ?? 'active',
      starts_at: data.startsAt ?? null,
      visibility: data.visibility ?? 'public',
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

  async function updateEvent(eventId: string, event: Partial<Omit<Event, 'id' | 'participantsCount' | 'joinedUserIds'>>) {
    const { error } = await supabase.from('events').update(toEventUpdate(event)).eq('id', eventId);
    if (error) throw new Error(error.message);
    await loadEvents();
  }

  async function updateEventStatus(eventId: string, status: NonNullable<Event['status']>, cancelReason?: string) {
    const { error } = await supabase.rpc('set_event_status', {
      p_event_id: eventId,
      p_status: status,
      p_cancel_reason: cancelReason ?? null,
    });
    if (error) throw new Error(error.message);
    await loadEvents();
  }

  function isJoined(eventId: string, userId: string): boolean {
    const event = events.find(e => e.id === eventId);
    return event?.joinedUserIds?.includes(userId) ?? false;
  }

  return (
    <EventsContext.Provider value={{ events, isLoading, joinEvent, leaveEvent, createEvent, updateEvent, updateEventStatus, isJoined }}>
      {children}
    </EventsContext.Provider>
  );
}

export const useEvents = () => useContext(EventsContext);
