import React, { useState, useEffect, useCallback } from 'react';
import {
  View, Text, StyleSheet, FlatList,
  TouchableOpacity, SafeAreaView, RefreshControl,
} from 'react-native';
import { useNavigation, useFocusEffect } from '@react-navigation/native';
import { NativeStackNavigationProp } from '@react-navigation/native-stack';
import { ActivityItem, RootStackParamList } from '../types';
import { useTheme } from '../context/ThemeContext';
import { useAuth } from '../context/AuthContext';
import { useBadge } from '../context/BadgeContext';
import { supabase } from '../lib/supabase';
import AvatarImage from '../components/AvatarImage';

type Nav = NativeStackNavigationProp<RootStackParamList>;

function timeAgo(date: Date): string {
  const diff = Date.now() - date.getTime();
  const mins = Math.floor(diff / 60000);
  if (mins < 1) return 'только что';
  if (mins < 60) return `${mins} мин назад`;
  const hours = Math.floor(mins / 60);
  if (hours < 24) return `${hours} ч назад`;
  return `${Math.floor(hours / 24)} д назад`;
}

function ActivityCard({ item, onPress }: { item: ActivityItem; onPress: () => void }) {
  const { theme } = useTheme();

  const icons: Record<string, string> = {
    join: '🙋', create: '✨', review: '⭐', near: '📍',
  };
  const texts: Record<string, string> = {
    join: 'присоединился к',
    create: 'создал ивент',
    review: 'оценил участников',
    near: 'новый ивент рядом —',
  };

  return (
    <TouchableOpacity
      style={[styles.card, { backgroundColor: theme.card, borderColor: theme.border }]}
      onPress={onPress}
      activeOpacity={0.8}
    >
      <View style={[styles.avatarWrap, { backgroundColor: theme.accentLight }]}>
        <AvatarImage value={item.userAvatar} size={46} backgroundColor={theme.accentLight} textSize={24} />
      </View>
      <View style={styles.content}>
        <Text style={[styles.text, { color: theme.text }]} numberOfLines={2}>
          <Text style={styles.userName}>{item.userName} </Text>
          <Text style={{ color: theme.subtext }}>{texts[item.type]} </Text>
          <Text style={[styles.eventName, { color: theme.accent }]}>{item.eventTitle}</Text>
        </Text>
        <Text style={[styles.time, { color: theme.subtext }]}>{timeAgo(item.timestamp)}</Text>
      </View>
      <Text style={styles.typeIcon}>{icons[item.type]}</Text>
    </TouchableOpacity>
  );
}

export default function ActivityScreen() {
  const navigation = useNavigation<Nav>();
  const { theme } = useTheme();
  const { user } = useAuth();
  const { clearActivityBadge } = useBadge();
  const [feed, setFeed] = useState<ActivityItem[]>([]);
  const [refreshing, setRefreshing] = useState(false);
  const [friendsOnly, setFriendsOnly] = useState(false);
  const [followingIds, setFollowingIds] = useState<string[]>([]);

  useFocusEffect(
    useCallback(() => {
      clearActivityBadge();
    }, [])
  );

  useEffect(() => {
    if (user) loadFollowing();
  }, [user]);

  useEffect(() => {
    loadFeed();
  }, [followingIds, friendsOnly]);

  async function loadFollowing() {
    if (!user) return;
    const { data } = await supabase
      .from('follows')
      .select('following_id')
      .eq('follower_id', user.id);
    setFollowingIds((data ?? []).map((r: any) => r.following_id));
  }

  const loadFeed = useCallback(async () => {
    const [{ data: joins }, { data: creates }, { data: blocks }] = await Promise.all([
      supabase
        .from('event_participants')
        .select('user_id, joined_at, event_id, profiles(name, avatar, is_banned), events(title)')
        .order('joined_at', { ascending: false })
        .limit(30),
      supabase
        .from('events')
        .select('id, title, created_at, created_by, profiles(name, avatar, is_banned)')
        .not('created_by', 'is', null)
        .order('created_at', { ascending: false })
        .limit(15),
      user
        ? supabase.from('blocks').select('blocked_id').eq('blocker_id', user.id)
        : Promise.resolve({ data: [] }),
    ]);
    const blockedIds = new Set((blocks ?? []).map((b: any) => b.blocked_id));

    const joinItems: ActivityItem[] = (joins ?? [])
      .filter((j: any) => !(j.profiles as any)?.is_banned)
      .filter((j: any) => !blockedIds.has(j.user_id))
      .map((j: any) => ({
        id: `join-${j.event_id}-${j.user_id}`,
        type: 'join' as const,
        userId: j.user_id,
        userName: (j.profiles as any)?.name ?? 'Пользователь',
        userAvatar: (j.profiles as any)?.avatar ?? '🧑',
        eventId: j.event_id,
        eventTitle: (j.events as any)?.title ?? '',
        timestamp: new Date(j.joined_at),
      }));

    const createItems: ActivityItem[] = (creates ?? [])
      .filter((e: any) => !(e.profiles as any)?.is_banned)
      .filter((e: any) => !blockedIds.has(e.created_by))
      .map((e: any) => ({
        id: `create-${e.id}`,
        type: 'create' as const,
        userId: e.created_by ?? '',
        userName: (e.profiles as any)?.name ?? 'Пользователь',
        userAvatar: (e.profiles as any)?.avatar ?? '🧑',
        eventId: e.id,
        eventTitle: e.title,
        timestamp: new Date(e.created_at),
      }));

    let all = [...joinItems, ...createItems]
      .filter(item => item.eventTitle);

    if (friendsOnly && followingIds.length > 0) {
      all = all.filter(item => followingIds.includes(item.userId));
    }

    all.sort((a, b) => b.timestamp.getTime() - a.timestamp.getTime());
    setFeed(all);
    setRefreshing(false);
  }, [friendsOnly, followingIds]);

  function refresh() {
    setRefreshing(true);
    if (user) loadFollowing();
    loadFeed();
  }

  return (
    <SafeAreaView style={[styles.container, { backgroundColor: theme.bg }]}>
      <View style={styles.header}>
        <Text style={[styles.title, { color: theme.text }]}>Активность</Text>
        <View style={styles.headerRow}>
          <Text style={[styles.subtitle, { color: theme.subtext }]}>
            {friendsOnly ? 'Подписки' : 'Всё сообщество'}
          </Text>
          <TouchableOpacity
            style={[
              styles.filterToggle,
              friendsOnly
                ? { backgroundColor: theme.accent }
                : { backgroundColor: theme.card, borderColor: theme.border, borderWidth: 1.5 },
            ]}
            onPress={() => setFriendsOnly(v => !v)}
            activeOpacity={0.8}
          >
            <Text style={[styles.filterToggleText, { color: friendsOnly ? '#FFF' : theme.subtext }]}>
              {friendsOnly ? '👥 Друзья' : '🌍 Все'}
            </Text>
          </TouchableOpacity>
        </View>
      </View>

      <FlatList
        data={feed}
        keyExtractor={item => item.id}
        renderItem={({ item }) => (
          <ActivityCard
            item={item}
            onPress={() => navigation.navigate('Chat', { eventId: item.eventId, eventTitle: item.eventTitle })}
          />
        )}
        contentContainerStyle={styles.list}
        showsVerticalScrollIndicator={false}
        refreshControl={<RefreshControl refreshing={refreshing} onRefresh={refresh} tintColor={theme.accent} />}
        ListEmptyComponent={
          <View style={styles.empty}>
            <Text style={styles.emptyIcon}>{friendsOnly ? '👥' : '🌟'}</Text>
            <Text style={[styles.emptyText, { color: theme.subtext }]}>
              {friendsOnly ? 'Подписчики ещё не активны' : 'Пока тихо. Присоединись к ивенту!'}
            </Text>
          </View>
        }
      />
    </SafeAreaView>
  );
}

const styles = StyleSheet.create({
  container: { flex: 1 },
  header: { paddingHorizontal: 16, paddingTop: 12, paddingBottom: 12, width: '100%', maxWidth: 860, alignSelf: 'center' },
  title: { fontSize: 28, fontWeight: '800', marginBottom: 6 },
  headerRow: { flexDirection: 'row', justifyContent: 'space-between', alignItems: 'center' },
  subtitle: { fontSize: 14 },
  filterToggle: {
    borderRadius: 16, paddingHorizontal: 12, paddingVertical: 6,
  },
  filterToggleText: { fontSize: 13, fontWeight: '700' },
  list: { paddingHorizontal: 16, paddingBottom: 24, width: '100%', maxWidth: 860, alignSelf: 'center' },
  card: {
    flexDirection: 'row', alignItems: 'center', gap: 12,
    borderRadius: 16, padding: 14, marginBottom: 10,
    borderWidth: 1,
    shadowColor: '#101828', shadowOffset: { width: 0, height: 8 },
    shadowOpacity: 0.06, shadowRadius: 18, elevation: 2,
  },
  avatarWrap: { width: 46, height: 46, borderRadius: 23, justifyContent: 'center', alignItems: 'center' },
  content: { flex: 1 },
  text: { fontSize: 14, lineHeight: 20 },
  userName: { fontWeight: '700' },
  eventName: { fontWeight: '600' },
  time: { fontSize: 12, marginTop: 4 },
  typeIcon: { fontSize: 20 },
  empty: { alignItems: 'center', paddingTop: 80 },
  emptyIcon: { fontSize: 48, marginBottom: 12 },
  emptyText: { fontSize: 15 },
});
