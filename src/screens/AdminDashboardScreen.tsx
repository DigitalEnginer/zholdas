import React from 'react';
import {
  ActivityIndicator, Alert, RefreshControl, SafeAreaView, ScrollView, StyleSheet,
  Text, TextInput, TouchableOpacity, useWindowDimensions, View, Platform,
} from 'react-native';
import { useNavigation } from '@react-navigation/native';
import { NativeStackNavigationProp } from '@react-navigation/native-stack';
import { AppRole, EventStatus, RootStackParamList } from '../types';
import { useAuth } from '../context/AuthContext';
import { useTheme } from '../context/ThemeContext';
import { supabase } from '../lib/supabase';
import { getSuperAdminEmailRequirement, isSuperAdmin } from '../lib/adminAccess';

type Nav = NativeStackNavigationProp<RootStackParamList>;
type AdminTab = 'overview' | 'users' | 'events' | 'chats' | 'history' | 'tools';
type EventFilter = 'all' | EventStatus;

const BACKEND_URL = process.env.EXPO_PUBLIC_BACKEND_URL ?? 'http://localhost:8000';
const ROLES: AppRole[] = ['user', 'moderator', 'admin'];
const EVENT_FILTERS: { key: EventFilter; label: string }[] = [
  { key: 'all', label: 'Все' },
  { key: 'active', label: 'Активные' },
  { key: 'finished', label: 'Закрытые' },
  { key: 'cancelled', label: 'Отмененные' },
];

interface AdminEvent {
  id: string;
  title: string;
  status: EventStatus;
  created_by: string | null;
  created_at: string;
  datetime: string | null;
  participants_count: number | null;
}

interface AdminMessage {
  id: string;
  event_id: string;
  user_id: string;
  user_name: string;
  text: string;
  is_ai: boolean | null;
  created_at: string;
}

interface AdminProfile {
  id: string;
  name: string;
  email: string;
  avatar: string;
  role: AppRole;
  is_banned: boolean;
  ban_reason: string | null;
  created_at: string;
  events_joined: number | null;
  friends_made: number | null;
}

interface AdminAuditLog {
  id: string;
  actor_id: string | null;
  target_user_id: string | null;
  target_event_id: string | null;
  action: string;
  details: string | null;
  created_at: string;
}

interface SystemSetting {
  key: string;
  value: string;
  description: string | null;
  updated_at: string | null;
}

interface StatCard {
  label: string;
  value: number | string;
  tone: string;
}

interface UserDetails {
  events: AdminEvent[];
  messages: AdminMessage[];
  reports: { id: string; reason: string; status: string; created_at: string }[];
  reviews: { id: string; rating: number; comment: string | null; created_at: string }[];
}

function formatDate(value?: string | null) {
  if (!value) return '-';
  return new Date(value).toLocaleString('ru-RU', {
    day: '2-digit',
    month: 'short',
    hour: '2-digit',
    minute: '2-digit',
  });
}

function daysAgo(days: number) {
  const date = new Date();
  date.setDate(date.getDate() - days);
  return date.toISOString();
}

function todayStart() {
  const date = new Date();
  date.setHours(0, 0, 0, 0);
  return date.toISOString();
}

function cleanDetails(value?: string | null) {
  if (!value) return '';
  return value.split('\n').slice(0, 3).join(' | ');
}

export default function AdminDashboardScreen() {
  const navigation = useNavigation<Nav>();
  const { user } = useAuth();
  const { theme, isDark } = useTheme();
  const { width } = useWindowDimensions();
  const isWide = width >= 920;
  const [activeTab, setActiveTab] = React.useState<AdminTab>('overview');
  const [loading, setLoading] = React.useState(true);
  const [refreshing, setRefreshing] = React.useState(false);
  const [stats, setStats] = React.useState<StatCard[]>([]);
  const [analytics, setAnalytics] = React.useState<StatCard[]>([]);
  const [profiles, setProfiles] = React.useState<AdminProfile[]>([]);
  const [userSearch, setUserSearch] = React.useState('');
  const [selectedProfile, setSelectedProfile] = React.useState<AdminProfile | null>(null);
  const [userDetails, setUserDetails] = React.useState<UserDetails | null>(null);
  const [userDetailsLoading, setUserDetailsLoading] = React.useState(false);
  const [events, setEvents] = React.useState<AdminEvent[]>([]);
  const [eventSearch, setEventSearch] = React.useState('');
  const [eventFilter, setEventFilter] = React.useState<EventFilter>('all');
  const [selectedEventId, setSelectedEventId] = React.useState<string | null>(null);
  const [messages, setMessages] = React.useState<AdminMessage[]>([]);
  const [auditLogs, setAuditLogs] = React.useState<AdminAuditLog[]>([]);
  const [settings, setSettings] = React.useState<SystemSetting[]>([]);
  const [broadcastTitle, setBroadcastTitle] = React.useState('');
  const [broadcastBody, setBroadcastBody] = React.useState('');
  const [sendingBroadcast, setSendingBroadcast] = React.useState(false);

  // Focus states for search/text inputs
  const [userSearchFocused, setUserSearchFocused] = React.useState(false);
  const [eventSearchFocused, setEventSearchFocused] = React.useState(false);
  const [broadcastTitleFocused, setBroadcastTitleFocused] = React.useState(false);
  const [broadcastBodyFocused, setBroadcastBodyFocused] = React.useState(false);

  const shadowColor = isDark ? '#000' : '#0F172A';
  const shadowOpacity = isDark ? 0.35 : 0.05;

  const isAdmin = isSuperAdmin(user);
  const selectedEvent = events.find(event => event.id === selectedEventId) ?? null;
  const profileById = React.useMemo(() => {
    const map: Record<string, AdminProfile> = {};
    profiles.forEach(profile => { map[profile.id] = profile; });
    return map;
  }, [profiles]);

  const filteredProfiles = profiles.filter(profile => {
    const haystack = `${profile.name} ${profile.email} ${profile.id}`.toLowerCase();
    return haystack.includes(userSearch.trim().toLowerCase());
  });

  const filteredEvents = events.filter(event => {
    const matchesStatus = eventFilter === 'all' || event.status === eventFilter;
    const matchesSearch = `${event.title} ${event.id}`.toLowerCase().includes(eventSearch.trim().toLowerCase());
    return matchesStatus && matchesSearch;
  });

  React.useEffect(() => {
    loadAdminData();
  }, []);

  React.useEffect(() => {
    if (selectedEventId) loadEventMessages(selectedEventId);
  }, [selectedEventId]);

  async function countRows(table: string, filter?: (query: any) => any) {
    let query = supabase.from(table).select('id', { count: 'exact', head: true });
    if (filter) query = filter(query);
    const { count } = await query;
    return count ?? 0;
  }

  async function logAdminAction(action: string, targetUserId?: string | null, targetEventId?: string | null, details?: string | null) {
    try {
      await supabase.rpc('log_admin_action', {
        p_action: action,
        p_target_user_id: targetUserId ?? null,
        p_target_event_id: targetEventId ?? null,
        p_details: details ?? null,
      });
    } catch {
      // Audit logging is best-effort so moderation actions do not get stuck during SQL rollout.
    }
  }

  async function loadAdminData() {
    if (!isAdmin) {
      setLoading(false);
      return;
    }

    const sinceToday = todayStart();
    const since7 = daysAgo(7);
    const since30 = daysAgo(30);

    const [
      usersCount,
      eventsCount,
      activeEventsCount,
      messagesCount,
      pendingReportsCount,
      bansCount,
      usersToday,
      users7,
      users30,
      events7,
      events30,
      messages7,
      joins7,
      { data: activeMessageRows },
      { data: activeJoinRows },
      { data: eventsData },
      { data: profilesData },
      { data: auditData },
      { data: settingsData },
    ] = await Promise.all([
      countRows('profiles'),
      countRows('events'),
      countRows('events', query => query.eq('status', 'active')),
      countRows('messages'),
      countRows('reports', query => query.eq('status', 'pending')),
      countRows('user_bans'),
      countRows('profiles', query => query.gte('created_at', sinceToday)),
      countRows('profiles', query => query.gte('created_at', since7)),
      countRows('profiles', query => query.gte('created_at', since30)),
      countRows('events', query => query.gte('created_at', since7)),
      countRows('events', query => query.gte('created_at', since30)),
      countRows('messages', query => query.gte('created_at', since7)),
      countRows('event_participants', query => query.gte('joined_at', since7)),
      supabase.from('messages').select('user_id').gte('created_at', since7).neq('user_id', 'ai').limit(1000),
      supabase.from('event_participants').select('user_id').gte('joined_at', since7).limit(1000),
      supabase
        .from('events')
        .select('id, title, status, created_by, created_at, datetime, participants_count')
        .order('created_at', { ascending: false })
        .limit(150),
      supabase
        .from('profiles')
        .select('id, name, email, avatar, role, is_banned, ban_reason, created_at, events_joined, friends_made')
        .order('created_at', { ascending: false })
        .limit(200),
      supabase
        .from('admin_audit_logs')
        .select('id, actor_id, target_user_id, target_event_id, action, details, created_at')
        .order('created_at', { ascending: false })
        .limit(80),
      supabase
        .from('system_settings')
        .select('key, value, description, updated_at')
        .order('key', { ascending: true }),
    ]);

    const activeIds = new Set<string>();
    (activeMessageRows ?? []).forEach((row: any) => row.user_id && activeIds.add(row.user_id));
    (activeJoinRows ?? []).forEach((row: any) => row.user_id && activeIds.add(row.user_id));

    setStats([
      { label: 'Юзеры', value: usersCount, tone: theme.accent },
      { label: 'Ивенты', value: eventsCount, tone: theme.success ?? '#10B981' },
      { label: 'Активные', value: activeEventsCount, tone: '#0EA5E9' },
      { label: 'Сообщения', value: messagesCount, tone: '#8B5CF6' },
      { label: 'Жалобы', value: pendingReportsCount, tone: theme.danger ?? '#EF4444' },
      { label: 'Баны', value: bansCount, tone: theme.warning ?? '#F59E0B' },
    ]);

    setAnalytics([
      { label: 'Рег. сегодня', value: usersToday, tone: theme.accent },
      { label: 'Рег. 7 дней', value: users7, tone: '#0EA5E9' },
      { label: 'Рег. 30 дней', value: users30, tone: '#8B5CF6' },
      { label: 'Ивенты 7 дней', value: events7, tone: theme.success ?? '#10B981' },
      { label: 'Ивенты 30 дней', value: events30, tone: theme.success ?? '#10B981' },
      { label: 'Сообщ. 7 дней', value: messages7, tone: theme.warning ?? '#F59E0B' },
      { label: 'Вступления 7 дней', value: joins7, tone: theme.danger ?? '#EF4444' },
      { label: 'Активные 7 дней', value: activeIds.size, tone: theme.text },
    ]);

    const nextEvents = ((eventsData ?? []) as any[]).map(event => ({
      id: event.id,
      title: event.title,
      status: event.status ?? 'active',
      created_by: event.created_by,
      created_at: event.created_at,
      datetime: event.datetime,
      participants_count: event.participants_count,
    }));

    const nextProfiles = ((profilesData ?? []) as any[]).map(profile => ({
      id: profile.id,
      name: profile.name ?? 'Пользователь',
      email: profile.email ?? '',
      avatar: profile.avatar ?? '👤',
      role: profile.role ?? 'user',
      is_banned: !!profile.is_banned,
      ban_reason: profile.ban_reason ?? null,
      created_at: profile.created_at,
      events_joined: profile.events_joined ?? 0,
      friends_made: profile.friends_made ?? 0,
    }));

    setEvents(nextEvents);
    setProfiles(nextProfiles);
    setAuditLogs((auditData ?? []) as AdminAuditLog[]);
    setSettings((settingsData ?? []) as SystemSetting[]);
    setSelectedEventId(prev => prev ?? nextEvents[0]?.id ?? null);
    setLoading(false);
  }

  async function refresh() {
    setRefreshing(true);
    await loadAdminData();
    if (selectedEventId) await loadEventMessages(selectedEventId);
    if (selectedProfile) await loadProfileDetails(selectedProfile);
    setRefreshing(false);
  }

  async function loadEventMessages(eventId: string) {
    const { data, error } = await supabase
      .from('messages')
      .select('id, event_id, user_id, user_name, text, is_ai, created_at')
      .eq('event_id', eventId)
      .order('created_at', { ascending: false })
      .limit(80);

    if (error) {
      Alert.alert('Не удалось открыть чат', error.message);
      setMessages([]);
      return;
    }

    setMessages((data ?? []) as AdminMessage[]);
  }

  async function loadProfileDetails(profile: AdminProfile) {
    setSelectedProfile(profile);
    setUserDetailsLoading(true);

    const [{ data: profileEvents }, { data: profileMessages }, { data: profileReports }, { data: profileReviews }] = await Promise.all([
      supabase
        .from('events')
        .select('id, title, status, created_by, created_at, datetime, participants_count')
        .eq('created_by', profile.id)
        .order('created_at', { ascending: false })
        .limit(10),
      supabase
        .from('messages')
        .select('id, event_id, user_id, user_name, text, is_ai, created_at')
        .eq('user_id', profile.id)
        .order('created_at', { ascending: false })
        .limit(10),
      supabase
        .from('reports')
        .select('id, reason, status, created_at')
        .or(`reporter_id.eq.${profile.id},reported_user_id.eq.${profile.id}`)
        .order('created_at', { ascending: false })
        .limit(10),
      supabase
        .from('reviews')
        .select('id, rating, comment, created_at')
        .or(`from_user_id.eq.${profile.id},to_user_id.eq.${profile.id}`)
        .order('created_at', { ascending: false })
        .limit(10),
    ]);

    setUserDetails({
      events: ((profileEvents ?? []) as any[]).map(event => ({
        id: event.id,
        title: event.title,
        status: event.status ?? 'active',
        created_by: event.created_by,
        created_at: event.created_at,
        datetime: event.datetime,
        participants_count: event.participants_count,
      })),
      messages: (profileMessages ?? []) as AdminMessage[],
      reports: (profileReports ?? []) as UserDetails['reports'],
      reviews: (profileReviews ?? []) as UserDetails['reviews'],
    });
    setUserDetailsLoading(false);
  }

  async function setEventStatus(event: AdminEvent, status: EventStatus) {
    const doSetStatus = async () => {
      const { error } = await supabase.rpc('set_event_status', {
        p_event_id: event.id,
        p_status: status,
        p_cancel_reason: status === 'cancelled' ? 'Закрыто администратором' : null,
      });

      if (error) {
        Alert.alert('Не удалось изменить статус', error.message);
        return;
      }

      await logAdminAction('event_status_changed', null, event.id, `${event.status}->${status}: ${event.title}`);
      await loadAdminData();
    };

    let statusLabel = status === 'active' ? 'активный' : status === 'finished' ? 'завершенный' : 'отмененный';
    Alert.alert(
      'Изменить статус ивента?',
      `Ивент: "${event.title}"\nНовый статус: ${statusLabel.toUpperCase()}`,
      [
        { text: 'Отмена', style: 'cancel' },
        { text: 'Изменить', onPress: doSetStatus },
      ]
    );
  }

  function deleteEvent(event: AdminEvent) {
    const doDelete = async () => {
      try {
        // 1. Delete related messages first
        await supabase.from('messages').delete().eq('event_id', event.id);
        // 2. Delete related participants
        await supabase.from('event_participants').delete().eq('event_id', event.id);
        // 3. Delete reviews if any
        await supabase.from('reviews').delete().eq('event_id', event.id);
        
        // 4. Finally delete the event
        const { error } = await supabase.from('events').delete().eq('id', event.id);
        if (error) {
          Alert.alert('Не удалось удалить', error.message);
          return;
        }
        await logAdminAction('event_deleted', event.created_by, event.id, event.title);
        await loadAdminData();
      } catch (err: any) {
        Alert.alert('Не удалось удалить', err.message ?? 'Неизвестная ошибка');
      }
    };

    if (Platform.OS === 'web') {
      const confirmed = typeof window !== 'undefined' && window.confirm(`Удалить ивент?\n\n"${event.title}" пропадет из приложения.`);
      if (confirmed) doDelete();
    } else {
      Alert.alert('Удалить ивент?', `"${event.title}" пропадет из приложения.`, [
        { text: 'Отмена', style: 'cancel' },
        { text: 'Удалить', style: 'destructive', onPress: doDelete },
      ]);
    }
  }

  async function deleteMessage(message: AdminMessage) {
    const doDelete = async () => {
      const { error } = await supabase.from('messages').delete().eq('id', message.id);
      if (error) {
        Alert.alert('Не удалось удалить сообщение', error.message);
        return;
      }
      await logAdminAction('message_deleted', message.user_id === 'ai' ? null : message.user_id, message.event_id, message.text?.slice(0, 250));
      setMessages(prev => prev.filter(item => item.id !== message.id));
    };

    Alert.alert(
      'Удалить сообщение?',
      `Текст: "${message.text?.slice(0, 80)}"`,
      [
        { text: 'Отмена', style: 'cancel' },
        { text: 'Удалить', style: 'destructive', onPress: doDelete },
      ]
    );
  }

  function isProtectedPeerAdmin(profile: AdminProfile) {
    return profile.role === 'admin' && profile.id !== user?.id;
  }

  function canManageProfile(profile: AdminProfile) {
    return profile.id !== user?.id && !isProtectedPeerAdmin(profile);
  }

  async function setUserRole(profile: AdminProfile, role: AppRole) {
    if (isProtectedPeerAdmin(profile)) {
      Alert.alert('Нельзя менять другого admin', 'Второй admin защищен от изменений через интерфейс.');
      return;
    }

    if (profile.id === user?.id && role !== 'admin') {
      Alert.alert('Нельзя снять admin с себя', 'Сначала назначьте другого super-admin.');
      return;
    }

    const doSetRole = async () => {
      const { error } = await supabase.from('profiles').update({ role }).eq('id', profile.id);
      if (error) {
        Alert.alert('Не удалось изменить роль', error.message);
        return;
      }

      await logAdminAction('role_changed', profile.id, null, `${profile.email || profile.id}: ${profile.role}->${role}`);
      setProfiles(prev => prev.map(item => item.id === profile.id ? { ...item, role } : item));
      await loadAdminData();
    };

    Alert.alert(
      'Изменить роль пользователя?',
      `Новая роль для ${profile.email || profile.name}: ${role.toUpperCase()}`,
      [
        { text: 'Отмена', style: 'cancel' },
        { text: 'Изменить', onPress: doSetRole },
      ]
    );
  }

  async function banUser(profile: AdminProfile) {
    if (!user || !canManageProfile(profile)) return;

    const doBan = async () => {
      const { error } = await supabase.from('user_bans').insert({
        user_id: profile.id,
        banned_by: user.id,
        reason: 'Заблокировано super-admin',
      });

      if (error) {
        Alert.alert('Не удалось забанить', error.message);
        return;
      }

      await logAdminAction('user_banned', profile.id, null, profile.email || profile.name);
      await loadAdminData();
    };

    Alert.alert(
      'Заблокировать пользователя?',
      `Вы уверены, что хотите забанить ${profile.email || profile.name}?`,
      [
        { text: 'Отмена', style: 'cancel' },
        { text: 'Забанить', style: 'destructive', onPress: doBan },
      ]
    );
  }

  async function unbanUser(profile: AdminProfile) {
    if (!canManageProfile(profile)) return;

    const doUnban = async () => {
      const { error } = await supabase.from('user_bans').delete().eq('user_id', profile.id);
      if (error) {
        Alert.alert('Не удалось разбанить', error.message);
        return;
      }

      await logAdminAction('user_unbanned', profile.id, null, profile.email || profile.name);
      await loadAdminData();
    };

    Alert.alert(
      'Разблокировать пользователя?',
      `Разблокировать доступ для ${profile.email || profile.name}?`,
      [
        { text: 'Отмена', style: 'cancel' },
        { text: 'Разблокировать', onPress: doUnban },
      ]
    );
  }

  function hardDeleteUser(profile: AdminProfile) {
    if (profile.id === user?.id) {
      Alert.alert('Нельзя удалить себя', 'Это защита от случайной потери админ-доступа.');
      return;
    }

    if (isProtectedPeerAdmin(profile)) {
      Alert.alert('Нельзя удалить другого admin', 'Admin-аккаунты удаляем только вручную через Supabase.');
      return;
    }

    Alert.alert(
      'Удалить пользователя навсегда?',
      `${profile.email || profile.name}\n\nБудут удалены профиль, auth-аккаунт, storage-файлы, сообщения, участия, жалобы, баны и созданные им ивенты.`,
      [
        { text: 'Отмена', style: 'cancel' },
        {
          text: 'Удалить',
          style: 'destructive',
          onPress: async () => {
            const { data: { session } } = await supabase.auth.getSession();
            const accessToken = session?.access_token;

            if (!accessToken) {
              Alert.alert('Нет сессии', 'Войдите заново в аккаунт администратора.');
              return;
            }

            const response = await fetch(`${BACKEND_URL}/admin/users/${profile.id}`, {
              method: 'DELETE',
              headers: {
                Authorization: `Bearer ${accessToken}`,
              },
            });

            if (!response.ok) {
              const payload = await response.json().catch(() => null);
              Alert.alert('Не удалось удалить', payload?.detail ?? 'Backend вернул ошибку');
              return;
            }

            setSelectedProfile(null);
            setUserDetails(null);
            await loadAdminData();
          },
        },
      ],
    );
  }

  async function updateSetting(setting: SystemSetting, value: string) {
    const { error } = await supabase
      .from('system_settings')
      .update({ value })
      .eq('key', setting.key);

    if (error) {
      Alert.alert('Не удалось сохранить настройку', error.message);
      return;
    }

    await logAdminAction('setting_updated', null, null, `${setting.key}: ${setting.value}->${value}`);
    setSettings(prev => prev.map(item => item.key === setting.key ? { ...item, value } : item));
  }

  async function sendBroadcast() {
    const title = broadcastTitle.trim();
    const body = broadcastBody.trim();
    if (title.length < 3) {
      Alert.alert('Нужен заголовок', 'Минимум 3 символа.');
      return;
    }

    const doBroadcast = async () => {
      setSendingBroadcast(true);
      const { data, error } = await supabase.rpc('create_admin_broadcast', {
        p_title: title,
        p_body: body,
      });
      setSendingBroadcast(false);

      if (error) {
        Alert.alert('Не удалось отправить', error.message);
        return;
      }

      setBroadcastTitle('');
      setBroadcastBody('');
      Alert.alert('Готово', `Уведомление отправлено: ${data ?? 0} пользователям.`);
      await loadAdminData();
    };

    Alert.alert(
      'Отправить объявление всем?',
      `Заголовок: "${title}"\nТекст: "${body}"\n\nЭто уведомление получат все пользователи приложения.`,
      [
        { text: 'Отмена', style: 'cancel' },
        { text: 'Отправить', style: 'destructive', onPress: doBroadcast },
      ]
    );
  }

  if (!isAdmin) {
    return (
      <SafeAreaView style={[styles.container, { backgroundColor: theme.bg }]}>
        <View style={styles.center}>
          <Text style={[styles.emptyTitle, { color: theme.text }]}>Нет доступа</Text>
          <Text style={[styles.emptyText, { color: theme.subtext }]}>
            Админ-панель доступна только super-admin аккаунту
            {getSuperAdminEmailRequirement() ? `: ${getSuperAdminEmailRequirement()}` : '.'}
          </Text>
        </View>
      </SafeAreaView>
    );
  }

  if (loading) {
    return (
      <SafeAreaView style={[styles.container, { backgroundColor: theme.bg }]}>
        <ActivityIndicator color={theme.accent} style={{ flex: 1 }} />
      </SafeAreaView>
    );
  }

  return (
    <SafeAreaView style={[styles.container, { backgroundColor: theme.bg }]}>
      <ScrollView
        contentContainerStyle={styles.content}
        showsVerticalScrollIndicator={false}
        refreshControl={<RefreshControl refreshing={refreshing} onRefresh={refresh} tintColor={theme.accent} />}
      >
        <View style={[styles.hero, { backgroundColor: theme.card, borderColor: theme.border, shadowColor, shadowOpacity }]}>
          <Text style={[styles.heroTitle, { color: theme.text }]}>Super Admin</Text>
          <Text style={[styles.heroText, { color: theme.subtext }]}>
            Управление пользователями, чатами, ивентами, модерацией, настройками и статистикой.
          </Text>
          <View style={styles.quickActions}>
            <TouchableOpacity
              style={[styles.quickBtn, { backgroundColor: theme.accent }]}
              onPress={() => navigation.navigate('ModeratorDashboard')}
              activeOpacity={0.8}
            >
              <Text style={styles.quickBtnText}>Модерация</Text>
            </TouchableOpacity>
            <TouchableOpacity
              style={[
                styles.quickBtn,
                {
                  backgroundColor: theme.inputBg,
                  borderWidth: 1,
                  borderColor: theme.border,
                }
              ]}
              onPress={() => navigation.navigate('AdminRoles')}
              activeOpacity={0.8}
            >
              <Text style={[styles.quickBtnText, { color: theme.text }]}>Роли</Text>
            </TouchableOpacity>
          </View>
        </View>

        <View style={[styles.tabs, { backgroundColor: theme.inputBg, borderColor: theme.border }]}>
          {[
            { key: 'overview', label: 'Статистика' },
            { key: 'users', label: 'Юзеры' },
            { key: 'events', label: 'Ивенты' },
            { key: 'chats', label: 'Чаты' },
            { key: 'history', label: 'История' },
            { key: 'tools', label: 'Инструменты' },
          ].map(tab => {
            const selected = activeTab === tab.key;
            return (
              <TouchableOpacity
                key={tab.key}
                style={[
                  styles.tab,
                  selected && {
                    backgroundColor: theme.card,
                    borderColor: theme.border,
                    borderWidth: 1,
                    shadowColor,
                    shadowOpacity: isDark ? 0.2 : 0.06,
                    shadowOffset: { width: 0, height: 2 },
                    shadowRadius: 4,
                    elevation: 2,
                  }
                ]}
                onPress={() => setActiveTab(tab.key as AdminTab)}
                activeOpacity={0.8}
              >
                <Text style={[styles.tabText, { color: selected ? theme.text : theme.subtext, fontWeight: selected ? '800' : '600' }]}>{tab.label}</Text>
              </TouchableOpacity>
            );
          })}
        </View>

        {activeTab === 'overview' && (
          <>
            <View style={styles.statsGrid}>
              {stats.map(stat => (
                <View
                  key={stat.label}
                  style={[
                    styles.statCard,
                    isWide && styles.statCardWide,
                    {
                      backgroundColor: theme.card,
                      borderColor: theme.border,
                      shadowColor,
                      shadowOpacity,
                    }
                  ]}
                >
                  <Text style={[styles.statValue, { color: stat.tone }]}>{stat.value}</Text>
                  <Text style={[styles.statLabel, { color: theme.subtext }]}>{stat.label}</Text>
                </View>
              ))}
            </View>
            <View style={[styles.section, { backgroundColor: theme.card, borderColor: theme.border, shadowColor, shadowOpacity }]}>
              <Text style={[styles.sectionTitle, { color: theme.subtext }]}>MVP аналитика</Text>
              <View style={styles.statsGridInner}>
                {analytics.map(stat => (
                  <View
                    key={stat.label}
                    style={[
                      styles.statCardSmall,
                      isWide && styles.statCardSmallWide,
                      {
                        backgroundColor: theme.card,
                        borderColor: theme.border,
                        shadowColor,
                        shadowOpacity,
                      }
                    ]}
                  >
                    <Text style={[styles.statValueSmall, { color: stat.tone }]}>{stat.value}</Text>
                    <Text style={[styles.statLabel, { color: theme.subtext }]}>{stat.label}</Text>
                  </View>
                ))}
              </View>
            </View>
          </>
        )}

        {activeTab === 'users' && (
          <View style={[styles.section, { backgroundColor: theme.card, borderColor: theme.border, shadowColor, shadowOpacity }]}>
            <Text style={[styles.sectionTitle, { color: theme.subtext }]}>Управление пользователями</Text>
            <TextInput
              style={[
                styles.searchInput,
                {
                  backgroundColor: theme.inputBg,
                  borderColor: userSearchFocused ? theme.accent : theme.border,
                  color: theme.text,
                }
              ]}
              value={userSearch}
              onChangeText={setUserSearch}
              placeholder="Поиск по имени, email или id"
              placeholderTextColor={theme.subtext}
              autoCapitalize="none"
              autoCorrect={false}
              onFocus={() => setUserSearchFocused(true)}
              onBlur={() => setUserSearchFocused(false)}
            />
            {selectedProfile && (
              <View style={[styles.detailPanel, { backgroundColor: theme.bg, borderColor: theme.border }]}>
                <View style={styles.rowBetween}>
                  <View style={styles.eventInfo}>
                    <Text style={[styles.itemTitle, { color: theme.text }]}>{selectedProfile.name}</Text>
                    <Text style={[styles.itemMeta, { color: theme.subtext }]}>{selectedProfile.email || selectedProfile.id}</Text>
                  </View>
                  <TouchableOpacity style={[styles.smallBtn, { backgroundColor: theme.card }]} onPress={() => { setSelectedProfile(null); setUserDetails(null); }}>
                    <Text style={[styles.smallBtnText, { color: theme.subtext }]}>Скрыть</Text>
                  </TouchableOpacity>
                </View>
                {userDetailsLoading ? (
                  <ActivityIndicator color={theme.accent} style={{ marginTop: 12 }} />
                ) : userDetails ? (
                  <>
                    <Text style={[styles.detailTitle, { color: theme.subtext }]}>Ивенты пользователя</Text>
                    {userDetails.events.length === 0 ? <Text style={[styles.itemMeta, { color: theme.subtext }]}>Нет ивентов</Text> : null}
                    {userDetails.events.map(event => (
                      <Text key={event.id} style={[styles.detailLine, { color: theme.text }]}>
                        {event.title} · {event.status} · {formatDate(event.created_at)}
                      </Text>
                    ))}
                    <Text style={[styles.detailTitle, { color: theme.subtext }]}>Последние сообщения</Text>
                    {userDetails.messages.length === 0 ? <Text style={[styles.itemMeta, { color: theme.subtext }]}>Нет сообщений</Text> : null}
                    {userDetails.messages.map(message => (
                      <Text key={message.id} style={[styles.detailLine, { color: theme.text }]}>
                        {message.text || '[медиа]'} · {formatDate(message.created_at)}
                      </Text>
                    ))}
                    <Text style={[styles.detailTitle, { color: theme.subtext }]}>Жалобы и отзывы</Text>
                    <Text style={[styles.itemMeta, { color: theme.subtext }]}>
                      Жалоб: {userDetails.reports.length} · Отзывов: {userDetails.reviews.length}
                    </Text>
                  </>
                ) : null}
              </View>
            )}

            {filteredProfiles.map(profile => {
              const protectedPeerAdmin = isProtectedPeerAdmin(profile);
              const manageable = canManageProfile(profile);
              return (
                <View key={profile.id} style={[styles.userCard, { borderTopColor: theme.border }]}>
                  <View style={styles.rowBetween}>
                    <View style={styles.eventInfo}>
                      <Text style={[styles.itemTitle, { color: theme.text }]}>{profile.name}</Text>
                      <Text style={[styles.itemMeta, { color: theme.subtext }]}>{profile.email || profile.id}</Text>
                      <Text style={[styles.itemMeta, { color: theme.subtext }]}>
                        {profile.role} · {profile.is_banned ? 'бан' : 'активен'} · {formatDate(profile.created_at)}
                      </Text>
                      <Text style={[styles.itemMeta, { color: theme.subtext }]}>
                        joined: {profile.events_joined ?? 0} · friends: {profile.friends_made ?? 0}
                      </Text>
                      {profile.ban_reason ? <Text style={[styles.itemMeta, { color: theme.danger }]}>{profile.ban_reason}</Text> : null}
                      {protectedPeerAdmin ? <Text style={[styles.itemMeta, { color: theme.warning }]}>Другой admin защищен от изменений</Text> : null}
                    </View>
                    <TouchableOpacity
                      style={[styles.smallBtn, { backgroundColor: theme.accentLight }]}
                      onPress={() => navigation.navigate('UserProfile', { userId: profile.id, userName: profile.name, userAvatar: profile.avatar })}
                    >
                      <Text style={[styles.smallBtnText, { color: theme.accent }]}>Профиль</Text>
                    </TouchableOpacity>
                  </View>

                  <View style={styles.roles}>
                    {ROLES.map(role => (
                      <TouchableOpacity
                        key={role}
                        disabled={protectedPeerAdmin || (profile.id === user?.id && role !== 'admin')}
                        style={[
                          styles.roleBtn,
                          {
                            borderColor: profile.role === role ? theme.accent : theme.border,
                            backgroundColor: profile.role === role ? theme.accentLight : 'transparent',
                            opacity: protectedPeerAdmin || (profile.id === user?.id && role !== 'admin') ? 0.5 : 1,
                          },
                        ]}
                        onPress={() => setUserRole(profile, role)}
                      >
                        <Text style={[styles.roleText, { color: profile.role === role ? theme.accent : theme.subtext }]}>{role}</Text>
                      </TouchableOpacity>
                    ))}
                  </View>

                  <View style={styles.actions}>
                    <TouchableOpacity style={[styles.actionBtn, { backgroundColor: theme.accent }]} onPress={() => loadProfileDetails(profile)}>
                      <Text style={styles.actionText}>Детали</Text>
                    </TouchableOpacity>
                    {profile.is_banned ? (
                      <TouchableOpacity
                        style={[
                          styles.actionBtn,
                          {
                            backgroundColor: manageable
                              ? (isDark ? 'rgba(16, 185, 129, 0.15)' : '#ECFDF5')
                              : theme.inputBg,
                            borderColor: manageable ? theme.success : theme.border,
                            borderWidth: 1,
                          }
                        ]}
                        onPress={() => unbanUser(profile)}
                        disabled={!manageable}
                      >
                        <Text style={[styles.actionText, { color: manageable ? theme.success : theme.subtext }]}>Разбанить</Text>
                      </TouchableOpacity>
                    ) : (
                      <TouchableOpacity
                        style={[
                          styles.actionBtn,
                          {
                            backgroundColor: manageable
                              ? (isDark ? 'rgba(245, 158, 11, 0.15)' : '#FEF3C7')
                              : theme.inputBg,
                            borderColor: manageable ? theme.warning : theme.border,
                            borderWidth: 1,
                          }
                        ]}
                        onPress={() => banUser(profile)}
                        disabled={!manageable}
                      >
                        <Text style={[styles.actionText, { color: manageable ? theme.warning : theme.subtext }]}>Бан</Text>
                      </TouchableOpacity>
                    )}
                    <TouchableOpacity
                      style={[
                        styles.actionBtn,
                        {
                          backgroundColor: manageable
                            ? (isDark ? 'rgba(239, 68, 68, 0.15)' : '#FFF1F1')
                            : theme.inputBg,
                          borderColor: manageable ? theme.danger : theme.border,
                          borderWidth: 1,
                        }
                      ]}
                      onPress={() => hardDeleteUser(profile)}
                      disabled={!manageable}
                    >
                      <Text style={[styles.actionText, { color: manageable ? theme.danger : theme.subtext }]}>Удалить навсегда</Text>
                    </TouchableOpacity>
                  </View>
                </View>
              );
            })}
            {filteredProfiles.length === 0 ? (
              <View style={[styles.emptyPanel, { backgroundColor: theme.bg, borderColor: theme.border }]}>
                <Text style={styles.emptyIcon}>⌕</Text>
                <Text style={[styles.emptyText, { color: theme.subtext }]}>Пользователи не найдены</Text>
              </View>
            ) : null}
          </View>
        )}

        {activeTab === 'events' && (
          <View style={[styles.section, { backgroundColor: theme.card, borderColor: theme.border, shadowColor, shadowOpacity }]}>
            <Text style={[styles.sectionTitle, { color: theme.subtext }]}>Управление ивентами</Text>
            <TextInput
              style={[
                styles.searchInput,
                {
                  backgroundColor: theme.inputBg,
                  borderColor: eventSearchFocused ? theme.accent : theme.border,
                  color: theme.text,
                }
              ]}
              value={eventSearch}
              onChangeText={setEventSearch}
              placeholder="Поиск ивента"
              placeholderTextColor={theme.subtext}
              autoCorrect={false}
              onFocus={() => setEventSearchFocused(true)}
              onBlur={() => setEventSearchFocused(false)}
            />
            <View style={styles.roles}>
              {EVENT_FILTERS.map(filter => (
                <TouchableOpacity
                  key={filter.key}
                  style={[
                    styles.roleBtn,
                    {
                      borderColor: eventFilter === filter.key ? theme.accent : theme.border,
                      backgroundColor: eventFilter === filter.key ? theme.accentLight : 'transparent',
                    },
                  ]}
                  onPress={() => setEventFilter(filter.key)}
                >
                  <Text style={[styles.roleText, { color: eventFilter === filter.key ? theme.accent : theme.subtext }]}>{filter.label}</Text>
                </TouchableOpacity>
              ))}
            </View>
            {filteredEvents.map(event => (
              <View key={event.id} style={[styles.eventCard, { borderTopColor: theme.border }]}>
                <View style={styles.rowBetween}>
                  <View style={styles.eventInfo}>
                    <Text style={[styles.itemTitle, { color: theme.text }]}>{event.title}</Text>
                    <Text style={[styles.itemMeta, { color: theme.subtext }]}>
                      {event.status} · {event.participants_count ?? 0} участников · {formatDate(event.created_at)}
                    </Text>
                    <Text style={[styles.itemMeta, { color: theme.subtext }]}>creator: {profileById[event.created_by ?? '']?.email ?? event.created_by ?? '-'}</Text>
                  </View>
                  <TouchableOpacity style={[styles.smallBtn, { backgroundColor: theme.accentLight }]} onPress={() => navigation.navigate('EventDetails', { eventId: event.id })}>
                    <Text style={[styles.smallBtnText, { color: theme.accent }]}>Открыть</Text>
                  </TouchableOpacity>
                </View>
                <View style={styles.actions}>
                  {event.status !== 'finished' && (
                    <TouchableOpacity
                      style={[
                        styles.actionBtn,
                        {
                          backgroundColor: isDark ? 'rgba(16, 185, 129, 0.15)' : '#ECFDF5',
                          borderColor: theme.success,
                          borderWidth: 1,
                        }
                      ]}
                      onPress={() => setEventStatus(event, 'finished')}
                    >
                      <Text style={[styles.actionText, { color: theme.success }]}>Закрыть</Text>
                    </TouchableOpacity>
                  )}
                  {event.status !== 'cancelled' && (
                    <TouchableOpacity
                      style={[
                        styles.actionBtn,
                        {
                          backgroundColor: isDark ? 'rgba(245, 158, 11, 0.15)' : '#FEF3C7',
                          borderColor: theme.warning,
                          borderWidth: 1,
                        }
                      ]}
                      onPress={() => setEventStatus(event, 'cancelled')}
                    >
                      <Text style={[styles.actionText, { color: theme.warning }]}>Отменить</Text>
                    </TouchableOpacity>
                  )}
                  {event.status !== 'active' && (
                    <TouchableOpacity
                      style={[
                        styles.actionBtn,
                        {
                          backgroundColor: theme.accentLight,
                          borderColor: theme.accent,
                          borderWidth: 1,
                        }
                      ]}
                      onPress={() => setEventStatus(event, 'active')}
                    >
                      <Text style={[styles.actionText, { color: theme.accent }]}>Активировать</Text>
                    </TouchableOpacity>
                  )}
                  <TouchableOpacity
                    style={[
                      styles.actionBtn,
                      {
                        backgroundColor: isDark ? 'rgba(239, 68, 68, 0.15)' : '#FFF1F1',
                        borderColor: theme.danger,
                        borderWidth: 1,
                      }
                    ]}
                    onPress={() => deleteEvent(event)}
                  >
                    <Text style={[styles.actionText, { color: theme.danger }]}>Удалить</Text>
                  </TouchableOpacity>
                </View>
              </View>
            ))}
            {filteredEvents.length === 0 ? (
              <View style={[styles.emptyPanel, { backgroundColor: theme.bg, borderColor: theme.border }]}>
                <Text style={styles.emptyIcon}>⌕</Text>
                <Text style={[styles.emptyText, { color: theme.subtext }]}>Ивенты не найдены</Text>
              </View>
            ) : null}
          </View>
        )}

        {activeTab === 'chats' && (
          <View style={[styles.chatLayout, isWide && styles.chatLayoutWide]}>
            <View style={[styles.section, isWide && styles.chatListPane, { backgroundColor: theme.card, borderColor: theme.border, shadowColor, shadowOpacity }]}>
              <Text style={[styles.sectionTitle, { color: theme.subtext }]}>Все чаты</Text>
              {filteredEvents.map(event => (
                <TouchableOpacity
                  key={event.id}
                  style={[
                    styles.chatEventRow,
                    { borderTopColor: theme.border },
                    selectedEventId === event.id && { backgroundColor: theme.accentLight },
                  ]}
                  onPress={() => setSelectedEventId(event.id)}
                >
                  <Text style={[styles.itemTitle, { color: selectedEventId === event.id ? theme.accent : theme.text }]}>{event.title}</Text>
                  <Text style={[styles.itemMeta, { color: theme.subtext }]}>{event.status} · {formatDate(event.created_at)}</Text>
                </TouchableOpacity>
              ))}
            </View>

            <View style={[styles.section, isWide && styles.chatMessagesPane, { backgroundColor: theme.card, borderColor: theme.border, shadowColor, shadowOpacity }]}>
              <Text style={[styles.sectionTitle, { color: theme.subtext }]}>
                {selectedEvent ? `Чат: ${selectedEvent.title}` : 'Чат'}
              </Text>
              {messages.length === 0 ? (
                <View style={[styles.emptyPanel, { backgroundColor: theme.bg, borderColor: theme.border }]}>
                  <Text style={styles.emptyIcon}>💬</Text>
                  <Text style={[styles.emptyText, { color: theme.subtext }]}>Сообщений нет или нет доступа по RLS.</Text>
                </View>
              ) : (
                messages.map(message => (
                  <View key={message.id} style={[styles.messageRow, { borderTopColor: theme.border }]}>
                    <View style={styles.messageBody}>
                      <Text style={[styles.messageAuthor, { color: message.is_ai ? '#E07B2C' : theme.text }]}>
                        {message.user_name || (message.is_ai ? 'Жолдас AI' : 'Пользователь')}
                      </Text>
                      <Text style={[styles.messageText, { color: theme.subtext }]}>{message.text || '[медиа]'}</Text>
                      <Text style={[styles.itemMeta, { color: theme.subtext }]}>{formatDate(message.created_at)}</Text>
                    </View>
                    {!message.is_ai && (
                      <TouchableOpacity
                        style={[
                          styles.smallBtn,
                          {
                            backgroundColor: isDark ? 'rgba(239, 68, 68, 0.15)' : '#FFF1F1',
                            borderColor: theme.danger,
                            borderWidth: 1,
                          }
                        ]}
                        onPress={() => deleteMessage(message)}
                      >
                        <Text style={[styles.smallBtnText, { color: theme.danger }]}>Удалить</Text>
                      </TouchableOpacity>
                    )}
                  </View>
                ))
              )}
            </View>
          </View>
        )}

        {activeTab === 'history' && (
          <View style={[styles.section, { backgroundColor: theme.card, borderColor: theme.border, shadowColor, shadowOpacity }]}>
            <Text style={[styles.sectionTitle, { color: theme.subtext }]}>История действий админов</Text>
            {auditLogs.length === 0 ? (
              <View style={[styles.emptyPanel, { backgroundColor: theme.bg, borderColor: theme.border }]}>
                <Text style={styles.emptyIcon}>↺</Text>
                <Text style={[styles.emptyText, { color: theme.subtext }]}>Логов пока нет</Text>
              </View>
            ) : (
              auditLogs.map(log => {
                const actor = log.actor_id ? profileById[log.actor_id] : null;
                const target = log.target_user_id ? profileById[log.target_user_id] : null;
                return (
                  <View key={log.id} style={[styles.eventCard, { borderTopColor: theme.border }]}>
                    <Text style={[styles.itemTitle, { color: theme.text }]}>{log.action}</Text>
                    <Text style={[styles.itemMeta, { color: theme.subtext }]}>Кто: {actor?.email ?? actor?.name ?? log.actor_id ?? 'system'}</Text>
                    <Text style={[styles.itemMeta, { color: theme.subtext }]}>Цель: {target?.email ?? target?.name ?? log.target_user_id ?? log.target_event_id ?? '-'}</Text>
                    {log.details ? <Text style={[styles.messageText, { color: theme.subtext }]}>{cleanDetails(log.details)}</Text> : null}
                    <Text style={[styles.itemMeta, { color: theme.subtext }]}>{formatDate(log.created_at)}</Text>
                  </View>
                );
              })
            )}
          </View>
        )}

        {activeTab === 'tools' && (
          <View style={[styles.toolsLayout, isWide && styles.toolsLayoutWide]}>
            <View style={[styles.section, isWide && styles.toolsPane, { backgroundColor: theme.card, borderColor: theme.border, shadowColor, shadowOpacity }]}>
              <Text style={[styles.sectionTitle, { color: theme.subtext }]}>Broadcast всем пользователям</Text>
              <TextInput
                style={[
                  styles.searchInput,
                  {
                    backgroundColor: theme.inputBg,
                    borderColor: broadcastTitleFocused ? theme.accent : theme.border,
                    color: theme.text,
                  }
                ]}
                value={broadcastTitle}
                onChangeText={setBroadcastTitle}
                placeholder="Заголовок"
                placeholderTextColor={theme.subtext}
                onFocus={() => setBroadcastTitleFocused(true)}
                onBlur={() => setBroadcastTitleFocused(false)}
              />
              <TextInput
                style={[
                  styles.textArea,
                  {
                    backgroundColor: theme.inputBg,
                    borderColor: broadcastBodyFocused ? theme.accent : theme.border,
                    color: theme.text,
                  }
                ]}
                value={broadcastBody}
                onChangeText={setBroadcastBody}
                placeholder="Текст объявления"
                placeholderTextColor={theme.subtext}
                multiline
                onFocus={() => setBroadcastBodyFocused(true)}
                onBlur={() => setBroadcastBodyFocused(false)}
              />
              <TouchableOpacity style={[styles.sendWideBtn, { backgroundColor: theme.accent }]} onPress={sendBroadcast} disabled={sendingBroadcast}>
                <Text style={styles.actionText}>{sendingBroadcast ? 'Отправляем...' : 'Отправить всем'}</Text>
              </TouchableOpacity>
            </View>

            <View style={[styles.section, isWide && styles.toolsPane, { backgroundColor: theme.card, borderColor: theme.border, shadowColor, shadowOpacity }]}>
              <Text style={[styles.sectionTitle, { color: theme.subtext }]}>Системные настройки</Text>
              {settings.map(setting => (
                <View key={setting.key} style={[styles.eventCard, { borderTopColor: theme.border }]}>
                  <Text style={[styles.itemTitle, { color: theme.text }]}>{setting.key}</Text>
                  {setting.description ? <Text style={[styles.itemMeta, { color: theme.subtext }]}>{setting.description}</Text> : null}
                  <TextInput
                    style={[styles.searchInputInline, { backgroundColor: theme.inputBg, borderColor: theme.border, color: theme.text }]}
                    defaultValue={setting.value}
                    placeholderTextColor={theme.subtext}
                    autoCapitalize="none"
                    onSubmitEditing={event => updateSetting(setting, event.nativeEvent.text.trim())}
                    onEndEditing={event => {
                      const value = event.nativeEvent.text.trim();
                      if (value !== setting.value) updateSetting(setting, value);
                    }}
                  />
                  <Text style={[styles.itemMeta, { color: theme.subtext }]}>updated: {formatDate(setting.updated_at)}</Text>
                </View>
              ))}
            </View>
          </View>
        )}
      </ScrollView>
    </SafeAreaView>
  );
}

const styles = StyleSheet.create({
  container: { flex: 1 },
  content: { padding: 16, paddingBottom: 36, width: '100%', maxWidth: 1180, alignSelf: 'center' },
  center: { flex: 1, justifyContent: 'center', alignItems: 'center', padding: 24 },
  hero: {
    borderWidth: 1, borderRadius: 16, padding: 16, marginBottom: 12,
    shadowOffset: { width: 0, height: 8 }, shadowRadius: 18, elevation: 2,
  },
  heroTitle: { fontSize: 22, fontWeight: '900' },
  heroText: { fontSize: 13, lineHeight: 18, marginTop: 6 },
  quickActions: { flexDirection: 'row', gap: 8, marginTop: 14 },
  quickBtn: { borderRadius: 14, paddingHorizontal: 14, paddingVertical: 10 },
  quickBtnText: { color: '#FFF', fontSize: 13, fontWeight: '800' },
  tabs: { flexDirection: 'row', flexWrap: 'wrap', gap: 4, borderRadius: 16, padding: 4, marginBottom: 16, borderWidth: 1 },
  tab: { minWidth: '30%', flexGrow: 1, borderRadius: 12, paddingVertical: 10, alignItems: 'center', justifyContent: 'center' },
  tabText: { fontSize: 12 },
  statsGrid: { flexDirection: 'row', flexWrap: 'wrap', gap: 10, marginBottom: 12 },
  statsGridInner: { flexDirection: 'row', flexWrap: 'wrap', gap: 10, paddingHorizontal: 16, paddingBottom: 16 },
  statCard: { width: '48%', borderWidth: 1, borderRadius: 16, padding: 16, shadowOffset: { width: 0, height: 6 }, shadowRadius: 14, elevation: 1 },
  statCardWide: { width: '32%' },
  statCardSmall: { width: '48%', borderWidth: 1, borderRadius: 14, padding: 12, shadowOffset: { width: 0, height: 4 }, shadowRadius: 12, elevation: 1 },
  statCardSmallWide: { width: '23.5%' },
  statValue: { fontSize: 28, fontWeight: '900' },
  statValueSmall: { fontSize: 22, fontWeight: '900' },
  statLabel: { fontSize: 12, marginTop: 4 },
  section: {
    borderRadius: 16, overflow: 'hidden', marginBottom: 12, borderWidth: 1,
    shadowOffset: { width: 0, height: 6 }, shadowRadius: 16, elevation: 2,
  },
  sectionTitle: { fontSize: 12, fontWeight: '900', textTransform: 'uppercase', padding: 16, paddingBottom: 8 },
  searchInput: {
    borderWidth: 1.5,
    borderRadius: 14,
    fontSize: 14,
    marginHorizontal: 16,
    marginBottom: 8,
    paddingHorizontal: 14,
    paddingVertical: 10,
  },
  searchInputInline: {
    borderWidth: 1.5,
    borderRadius: 14,
    fontSize: 14,
    marginTop: 10,
    paddingHorizontal: 14,
    paddingVertical: 10,
  },
  textArea: {
    borderWidth: 1.5,
    borderRadius: 14,
    fontSize: 14,
    minHeight: 88,
    marginHorizontal: 16,
    marginBottom: 10,
    paddingHorizontal: 14,
    paddingVertical: 10,
    textAlignVertical: 'top',
  },
  detailPanel: { borderWidth: 1, borderRadius: 14, marginHorizontal: 16, marginBottom: 12, padding: 14 },
  detailTitle: { fontSize: 11, fontWeight: '900', textTransform: 'uppercase', marginTop: 12, marginBottom: 5 },
  detailLine: { fontSize: 13, lineHeight: 18, marginTop: 3 },
  userCard: { padding: 16, borderTopWidth: 1 },
  eventCard: { padding: 16, borderTopWidth: 1 },
  rowBetween: { flexDirection: 'row', alignItems: 'center', gap: 10 },
  eventInfo: { flex: 1 },
  itemTitle: { fontSize: 15, fontWeight: '800' },
  itemMeta: { fontSize: 12, marginTop: 3 },
  actions: { flexDirection: 'row', flexWrap: 'wrap', gap: 8, marginTop: 12 },
  roles: { flexDirection: 'row', flexWrap: 'wrap', gap: 8, marginTop: 12, paddingHorizontal: 16 },
  roleBtn: { borderWidth: 1, borderRadius: 20, paddingHorizontal: 12, paddingVertical: 6 },
  roleText: { fontSize: 12, fontWeight: '800' },
  actionBtn: { borderRadius: 14, paddingHorizontal: 12, paddingVertical: 8 },
  sendWideBtn: { borderRadius: 14, paddingVertical: 13, alignItems: 'center', marginHorizontal: 16, marginBottom: 16 },
  actionText: { fontSize: 12, fontWeight: '800' },
  smallBtn: { borderRadius: 12, paddingHorizontal: 10, paddingVertical: 7 },
  smallBtnText: { fontSize: 12, fontWeight: '800' },
  chatLayout: { gap: 0 },
  chatLayoutWide: { flexDirection: 'row', alignItems: 'flex-start', gap: 12 },
  chatListPane: { width: 360 },
  chatMessagesPane: { flex: 1 },
  toolsLayout: { gap: 0 },
  toolsLayoutWide: { flexDirection: 'row', alignItems: 'flex-start', gap: 12 },
  toolsPane: { flex: 1 },
  chatEventRow: { paddingHorizontal: 16, paddingVertical: 12, borderTopWidth: 1 },
  messageRow: { flexDirection: 'row', gap: 10, alignItems: 'flex-start', padding: 16, borderTopWidth: 1 },
  messageBody: { flex: 1 },
  messageAuthor: { fontSize: 13, fontWeight: '900' },
  messageText: { fontSize: 13, lineHeight: 18, marginTop: 4 },
  emptyTitle: { fontSize: 18, fontWeight: '900', marginBottom: 6 },
  emptyPanel: {
    borderWidth: 1,
    borderStyle: 'dashed',
    borderRadius: 14,
    margin: 16,
    paddingHorizontal: 16,
    paddingVertical: 22,
    alignItems: 'center',
  },
  emptyIcon: { fontSize: 26, marginBottom: 8, color: '#98A2B3' },
  emptyText: { fontSize: 13, lineHeight: 18, textAlign: 'center' },
});
