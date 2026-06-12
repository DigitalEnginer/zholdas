import React from 'react';
import {
  ActivityIndicator, Alert, RefreshControl, SafeAreaView, ScrollView, StyleSheet,
  Text, TextInput, TouchableOpacity, View,
} from 'react-native';
import { useNavigation } from '@react-navigation/native';
import { NativeStackNavigationProp } from '@react-navigation/native-stack';
import { AppRole, EventStatus, RootStackParamList } from '../types';
import { useAuth } from '../context/AuthContext';
import { useTheme } from '../context/ThemeContext';
import { supabase } from '../lib/supabase';
import { getSuperAdminEmailRequirement, isSuperAdmin } from '../lib/adminAccess';

type Nav = NativeStackNavigationProp<RootStackParamList>;
type AdminTab = 'overview' | 'users' | 'events' | 'chats';

const BACKEND_URL = process.env.EXPO_PUBLIC_BACKEND_URL ?? 'http://localhost:8000';
const ROLES: AppRole[] = ['user', 'moderator', 'admin'];

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

interface StatCard {
  label: string;
  value: number;
  tone: string;
}

function formatDate(value?: string | null) {
  if (!value) return '—';
  return new Date(value).toLocaleString('ru-RU', {
    day: '2-digit',
    month: 'short',
    hour: '2-digit',
    minute: '2-digit',
  });
}

export default function AdminDashboardScreen() {
  const navigation = useNavigation<Nav>();
  const { user } = useAuth();
  const { theme } = useTheme();
  const [activeTab, setActiveTab] = React.useState<AdminTab>('overview');
  const [loading, setLoading] = React.useState(true);
  const [refreshing, setRefreshing] = React.useState(false);
  const [stats, setStats] = React.useState<StatCard[]>([]);
  const [profiles, setProfiles] = React.useState<AdminProfile[]>([]);
  const [userSearch, setUserSearch] = React.useState('');
  const [events, setEvents] = React.useState<AdminEvent[]>([]);
  const [selectedEventId, setSelectedEventId] = React.useState<string | null>(null);
  const [messages, setMessages] = React.useState<AdminMessage[]>([]);

  const isAdmin = isSuperAdmin(user);
  const selectedEvent = events.find(event => event.id === selectedEventId) ?? null;
  const filteredProfiles = profiles.filter(profile => {
    const haystack = `${profile.name} ${profile.email} ${profile.id}`.toLowerCase();
    return haystack.includes(userSearch.trim().toLowerCase());
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

  async function loadAdminData() {
    if (!isAdmin) {
      setLoading(false);
      return;
    }

    const [
      usersCount,
      eventsCount,
      activeEventsCount,
      messagesCount,
      pendingReportsCount,
      bansCount,
      { data: eventsData },
      { data: profilesData },
    ] = await Promise.all([
      countRows('profiles'),
      countRows('events'),
      countRows('events', query => query.eq('status', 'active')),
      countRows('messages'),
      countRows('reports', query => query.eq('status', 'pending')),
      countRows('user_bans'),
      supabase
        .from('events')
        .select('id, title, status, created_by, created_at, datetime, participants_count')
        .order('created_at', { ascending: false })
        .limit(80),
      supabase
        .from('profiles')
        .select('id, name, email, avatar, role, is_banned, ban_reason, created_at, events_joined, friends_made')
        .order('created_at', { ascending: false })
        .limit(150),
    ]);

    setStats([
      { label: 'Юзеры', value: usersCount, tone: theme.accent },
      { label: 'Ивенты', value: eventsCount, tone: '#2E9E5D' },
      { label: 'Активные', value: activeEventsCount, tone: '#0EA5E9' },
      { label: 'Сообщения', value: messagesCount, tone: '#8B5CF6' },
      { label: 'Жалобы', value: pendingReportsCount, tone: '#D92D20' },
      { label: 'Баны', value: bansCount, tone: '#E07B2C' },
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

    setEvents(nextEvents);
    setProfiles(((profilesData ?? []) as any[]).map(profile => ({
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
    })));
    setSelectedEventId(prev => prev ?? nextEvents[0]?.id ?? null);
    setLoading(false);
  }

  async function refresh() {
    setRefreshing(true);
    await loadAdminData();
    if (selectedEventId) await loadEventMessages(selectedEventId);
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

  async function setEventStatus(event: AdminEvent, status: EventStatus) {
    const { error } = await supabase.rpc('set_event_status', {
      p_event_id: event.id,
      p_status: status,
      p_cancel_reason: status === 'cancelled' ? 'Закрыто администратором' : null,
    });

    if (error) {
      Alert.alert('Не удалось изменить статус', error.message);
      return;
    }

    await loadAdminData();
  }

  function deleteEvent(event: AdminEvent) {
    Alert.alert('Удалить ивент?', `"${event.title}" пропадет из приложения.`, [
      { text: 'Отмена', style: 'cancel' },
      {
        text: 'Удалить',
        style: 'destructive',
        onPress: async () => {
          const { error } = await supabase.from('events').delete().eq('id', event.id);
          if (error) {
            Alert.alert('Не удалось удалить', error.message);
            return;
          }
          await loadAdminData();
        },
      },
    ]);
  }

  async function deleteMessage(message: AdminMessage) {
    const { error } = await supabase.from('messages').delete().eq('id', message.id);
    if (error) {
      Alert.alert('Не удалось удалить сообщение', error.message);
      return;
    }
    setMessages(prev => prev.filter(item => item.id !== message.id));
  }

  function isProtectedPeerAdmin(profile: AdminProfile) {
    return profile.role === 'admin' && profile.id !== user?.id;
  }

  function canManageProfile(profile: AdminProfile) {
    return profile.id !== user?.id && !isProtectedPeerAdmin(profile);
  }

  async function setUserRole(profile: AdminProfile, role: AppRole) {
    if (isProtectedPeerAdmin(profile)) {
      Alert.alert('Нельзя менять другого admin', 'У второго админа такой же уровень защиты. Роль admin меняем только вручную через Supabase.');
      return;
    }

    if (profile.id === user?.id && role !== 'admin') {
      Alert.alert('Нельзя снять admin с себя', 'Сначала назначьте другого super-admin.');
      return;
    }

    const { error } = await supabase.from('profiles').update({ role }).eq('id', profile.id);
    if (error) {
      Alert.alert('Не удалось изменить роль', error.message);
      return;
    }

    setProfiles(prev => prev.map(item => item.id === profile.id ? { ...item, role } : item));
  }

  async function banUser(profile: AdminProfile) {
    if (!user || profile.id === user.id) return;
    if (isProtectedPeerAdmin(profile)) {
      Alert.alert('Нельзя банить другого admin', 'Для изменения доступа второго админа используйте Supabase вручную.');
      return;
    }

    const { error } = await supabase.from('user_bans').insert({
      user_id: profile.id,
      banned_by: user.id,
      reason: 'Заблокировано super-admin',
    });

    if (error) {
      Alert.alert('Не удалось забанить', error.message);
      return;
    }

    await loadAdminData();
  }

  async function unbanUser(profile: AdminProfile) {
    if (isProtectedPeerAdmin(profile)) {
      Alert.alert('Нельзя менять другого admin', 'Для изменения доступа второго админа используйте Supabase вручную.');
      return;
    }

    const { error } = await supabase.from('user_bans').delete().eq('user_id', profile.id);
    if (error) {
      Alert.alert('Не удалось разбанить', error.message);
      return;
    }

    await loadAdminData();
  }

  function hardDeleteUser(profile: AdminProfile) {
    if (profile.id === user?.id) {
      Alert.alert('Нельзя удалить себя', 'Это защита от случайной потери админ-доступа.');
      return;
    }

    if (isProtectedPeerAdmin(profile)) {
      Alert.alert('Нельзя удалить другого admin', 'Admin-аккаунты удаляем только вручную через Supabase, чтобы один админ не мог снести второго.');
      return;
    }

    Alert.alert(
      'Удалить пользователя навсегда?',
      `${profile.email || profile.name}\n\nБудут удалены профиль, auth-аккаунт, сообщения, участия, жалобы, баны и созданные им ивенты.`,
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

            await loadAdminData();
          },
        },
      ],
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
        <View style={[styles.hero, { backgroundColor: theme.card, borderColor: theme.border }]}>
          <Text style={[styles.heroTitle, { color: theme.text }]}>Super Admin</Text>
          <Text style={[styles.heroText, { color: theme.subtext }]}>
            Доступ ко всем чатам, ивентам, модерации и статистике. Админ не добавляется в участники чатов.
          </Text>
          <View style={styles.quickActions}>
            <TouchableOpacity style={[styles.quickBtn, { backgroundColor: theme.accent }]} onPress={() => navigation.navigate('ModeratorDashboard')}>
              <Text style={styles.quickBtnText}>Модерация</Text>
            </TouchableOpacity>
            <TouchableOpacity style={[styles.quickBtn, { backgroundColor: '#1A1A2E' }]} onPress={() => navigation.navigate('AdminRoles')}>
              <Text style={styles.quickBtnText}>Роли</Text>
            </TouchableOpacity>
          </View>
        </View>

        <View style={[styles.tabs, { backgroundColor: theme.card }]}>
          {[
            { key: 'overview', label: 'Статистика' },
            { key: 'users', label: 'Юзеры' },
            { key: 'events', label: 'Ивенты' },
            { key: 'chats', label: 'Чаты' },
          ].map(tab => {
            const selected = activeTab === tab.key;
            return (
              <TouchableOpacity
                key={tab.key}
                style={[styles.tab, selected && { backgroundColor: theme.accent }]}
                onPress={() => setActiveTab(tab.key as AdminTab)}
              >
                <Text style={[styles.tabText, { color: selected ? '#FFF' : theme.subtext }]}>{tab.label}</Text>
              </TouchableOpacity>
            );
          })}
        </View>

        {activeTab === 'overview' && (
          <View style={styles.statsGrid}>
            {stats.map(stat => (
              <View key={stat.label} style={[styles.statCard, { backgroundColor: theme.card, borderColor: theme.border }]}>
                <Text style={[styles.statValue, { color: stat.tone }]}>{stat.value}</Text>
                <Text style={[styles.statLabel, { color: theme.subtext }]}>{stat.label}</Text>
              </View>
            ))}
          </View>
        )}

        {activeTab === 'users' && (
          <View style={[styles.section, { backgroundColor: theme.card }]}>
            <Text style={[styles.sectionTitle, { color: theme.subtext }]}>Управление пользователями</Text>
            <TextInput
              style={[styles.searchInput, { backgroundColor: theme.bg, borderColor: theme.border, color: theme.text }]}
              value={userSearch}
              onChangeText={setUserSearch}
              placeholder="Поиск по имени, email или id"
              placeholderTextColor={theme.subtext}
              autoCapitalize="none"
              autoCorrect={false}
            />
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
                    {profile.ban_reason ? (
                      <Text style={[styles.itemMeta, { color: '#D92D20' }]}>{profile.ban_reason}</Text>
                    ) : null}
                    {protectedPeerAdmin ? (
                      <Text style={[styles.itemMeta, { color: '#E07B2C' }]}>Защищенный admin: другой admin не может менять этот аккаунт</Text>
                    ) : null}
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
                  {profile.is_banned ? (
                    <TouchableOpacity
                      style={[styles.actionBtn, { backgroundColor: manageable ? '#2E9E5D' : theme.subtext }]}
                      onPress={() => unbanUser(profile)}
                      disabled={!manageable}
                    >
                      <Text style={styles.actionText}>Разбанить</Text>
                    </TouchableOpacity>
                  ) : (
                    <TouchableOpacity
                      style={[styles.actionBtn, { backgroundColor: manageable ? '#E07B2C' : theme.subtext }]}
                      onPress={() => banUser(profile)}
                      disabled={!manageable}
                    >
                      <Text style={styles.actionText}>Бан</Text>
                    </TouchableOpacity>
                  )}
                  <TouchableOpacity
                    style={[styles.actionBtn, { backgroundColor: manageable ? '#D92D20' : theme.subtext }]}
                    onPress={() => hardDeleteUser(profile)}
                    disabled={!manageable}
                  >
                    <Text style={styles.actionText}>Удалить навсегда</Text>
                  </TouchableOpacity>
                </View>
              </View>
            );
            })}
            {filteredProfiles.length === 0 ? (
              <Text style={[styles.emptyText, { color: theme.subtext }]}>Пользователи не найдены</Text>
            ) : null}
          </View>
        )}

        {activeTab === 'events' && (
          <View style={[styles.section, { backgroundColor: theme.card }]}>
            <Text style={[styles.sectionTitle, { color: theme.subtext }]}>Управление ивентами</Text>
            {events.map(event => (
              <View key={event.id} style={[styles.eventCard, { borderTopColor: theme.border }]}>
                <View style={styles.rowBetween}>
                  <View style={styles.eventInfo}>
                    <Text style={[styles.itemTitle, { color: theme.text }]}>{event.title}</Text>
                    <Text style={[styles.itemMeta, { color: theme.subtext }]}>
                      {event.status} · {event.participants_count ?? 0} участников · {formatDate(event.created_at)}
                    </Text>
                  </View>
                  <TouchableOpacity
                    style={[styles.smallBtn, { backgroundColor: theme.accentLight }]}
                    onPress={() => navigation.navigate('EventDetails', { eventId: event.id })}
                  >
                    <Text style={[styles.smallBtnText, { color: theme.accent }]}>Открыть</Text>
                  </TouchableOpacity>
                </View>
                <View style={styles.actions}>
                  {event.status !== 'finished' && (
                    <TouchableOpacity style={[styles.actionBtn, { backgroundColor: '#2E9E5D' }]} onPress={() => setEventStatus(event, 'finished')}>
                      <Text style={styles.actionText}>Закрыть</Text>
                    </TouchableOpacity>
                  )}
                  {event.status !== 'cancelled' && (
                    <TouchableOpacity style={[styles.actionBtn, { backgroundColor: '#E07B2C' }]} onPress={() => setEventStatus(event, 'cancelled')}>
                      <Text style={styles.actionText}>Отменить</Text>
                    </TouchableOpacity>
                  )}
                  {event.status !== 'active' && (
                    <TouchableOpacity style={[styles.actionBtn, { backgroundColor: theme.accent }]} onPress={() => setEventStatus(event, 'active')}>
                      <Text style={styles.actionText}>Активировать</Text>
                    </TouchableOpacity>
                  )}
                  <TouchableOpacity style={[styles.actionBtn, { backgroundColor: '#D92D20' }]} onPress={() => deleteEvent(event)}>
                    <Text style={styles.actionText}>Удалить</Text>
                  </TouchableOpacity>
                </View>
              </View>
            ))}
          </View>
        )}

        {activeTab === 'chats' && (
          <View style={styles.chatLayout}>
            <View style={[styles.section, { backgroundColor: theme.card }]}>
              <Text style={[styles.sectionTitle, { color: theme.subtext }]}>Все чаты</Text>
              {events.map(event => (
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

            <View style={[styles.section, { backgroundColor: theme.card }]}>
              <Text style={[styles.sectionTitle, { color: theme.subtext }]}>
                {selectedEvent ? `Чат: ${selectedEvent.title}` : 'Чат'}
              </Text>
              {messages.length === 0 ? (
                <Text style={[styles.emptyText, { color: theme.subtext }]}>Сообщений нет или нет доступа по RLS.</Text>
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
                      <TouchableOpacity style={[styles.smallBtn, { backgroundColor: '#FEE4E2' }]} onPress={() => deleteMessage(message)}>
                        <Text style={[styles.smallBtnText, { color: '#D92D20' }]}>Удалить</Text>
                      </TouchableOpacity>
                    )}
                  </View>
                ))
              )}
            </View>
          </View>
        )}
      </ScrollView>
    </SafeAreaView>
  );
}

const styles = StyleSheet.create({
  container: { flex: 1 },
  content: { padding: 16, paddingBottom: 36 },
  center: { flex: 1, justifyContent: 'center', alignItems: 'center', padding: 24 },
  hero: { borderWidth: 1, borderRadius: 16, padding: 16, marginBottom: 12 },
  heroTitle: { fontSize: 22, fontWeight: '900' },
  heroText: { fontSize: 13, lineHeight: 18, marginTop: 6 },
  quickActions: { flexDirection: 'row', gap: 8, marginTop: 14 },
  quickBtn: { borderRadius: 14, paddingHorizontal: 14, paddingVertical: 10 },
  quickBtnText: { color: '#FFF', fontSize: 13, fontWeight: '800' },
  tabs: { flexDirection: 'row', gap: 6, borderRadius: 16, padding: 6, marginBottom: 12 },
  tab: { flex: 1, borderRadius: 12, paddingVertical: 10, alignItems: 'center' },
  tabText: { fontSize: 13, fontWeight: '800' },
  statsGrid: { flexDirection: 'row', flexWrap: 'wrap', gap: 10 },
  statCard: { width: '48%', borderWidth: 1, borderRadius: 16, padding: 16 },
  statValue: { fontSize: 28, fontWeight: '900' },
  statLabel: { fontSize: 12, marginTop: 4 },
  section: { borderRadius: 16, overflow: 'hidden', marginBottom: 12 },
  sectionTitle: { fontSize: 12, fontWeight: '900', textTransform: 'uppercase', letterSpacing: 0.8, padding: 16, paddingBottom: 8 },
  searchInput: {
    borderWidth: 1,
    borderRadius: 14,
    fontSize: 14,
    marginHorizontal: 16,
    marginBottom: 8,
    paddingHorizontal: 14,
    paddingVertical: 10,
  },
  userCard: { padding: 16, borderTopWidth: 1 },
  eventCard: { padding: 16, borderTopWidth: 1 },
  rowBetween: { flexDirection: 'row', alignItems: 'center', gap: 10 },
  eventInfo: { flex: 1 },
  itemTitle: { fontSize: 15, fontWeight: '800' },
  itemMeta: { fontSize: 12, marginTop: 3 },
  actions: { flexDirection: 'row', flexWrap: 'wrap', gap: 8, marginTop: 12 },
  roles: { flexDirection: 'row', flexWrap: 'wrap', gap: 8, marginTop: 12 },
  roleBtn: { borderWidth: 1, borderRadius: 14, paddingHorizontal: 10, paddingVertical: 6 },
  roleText: { fontSize: 12, fontWeight: '800' },
  actionBtn: { borderRadius: 12, paddingHorizontal: 12, paddingVertical: 8 },
  actionText: { color: '#FFF', fontSize: 12, fontWeight: '800' },
  smallBtn: { borderRadius: 12, paddingHorizontal: 10, paddingVertical: 7 },
  smallBtnText: { fontSize: 12, fontWeight: '800' },
  chatLayout: { gap: 0 },
  chatEventRow: { paddingHorizontal: 16, paddingVertical: 12, borderTopWidth: 1 },
  messageRow: { flexDirection: 'row', gap: 10, alignItems: 'flex-start', padding: 16, borderTopWidth: 1 },
  messageBody: { flex: 1 },
  messageAuthor: { fontSize: 13, fontWeight: '900' },
  messageText: { fontSize: 13, lineHeight: 18, marginTop: 4 },
  emptyTitle: { fontSize: 18, fontWeight: '900', marginBottom: 6 },
  emptyText: { fontSize: 13, lineHeight: 18, paddingHorizontal: 16, paddingBottom: 16, textAlign: 'center' },
});
