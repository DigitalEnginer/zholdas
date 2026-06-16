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
import { useLanguage } from '../context/LanguageContext';
import { useBadge } from '../context/BadgeContext';
import { supabase } from '../lib/supabase';
import AvatarImage from '../components/AvatarImage';

type Nav = NativeStackNavigationProp<RootStackParamList>;

function timeAgo(date: Date, t: (key: string) => string): string {
  const diff = Date.now() - date.getTime();
  const mins = Math.floor(diff / 60000);
  if (mins < 1) return t('timeJustNow');
  if (mins < 60) return `${mins} ${t('timeMinAgo')}`;
  const hours = Math.floor(mins / 60);
  if (hours < 24) return `${hours} ${t('timeHourAgo')}`;
  return `${Math.floor(hours / 24)} ${t('timeDayAgo')}`;
}

const getBadgeStyle = (type: string, isDark: boolean, t: (key: string) => string) => {
  switch (type) {
    case 'join':
      return {
        label: t('badgeJoin'),
        textColor: isDark ? '#60A5FA' : '#1D4ED8',
        bgColor: isDark ? 'rgba(96, 165, 250, 0.15)' : 'rgba(29, 78, 216, 0.08)',
      };
    case 'create':
      return {
        label: t('badgeCreate'),
        textColor: isDark ? '#A5B4FC' : '#4F46E5',
        bgColor: isDark ? 'rgba(165, 180, 252, 0.15)' : 'rgba(79, 70, 229, 0.08)',
      };
    case 'review':
      return {
        label: t('badgeReview'),
        textColor: isDark ? '#FCD34D' : '#D97706',
        bgColor: isDark ? 'rgba(252, 211, 77, 0.15)' : 'rgba(217, 119, 6, 0.08)',
      };
    default:
      return {
        label: t('badgeNear'),
        textColor: isDark ? '#34D399' : '#059669',
        bgColor: isDark ? 'rgba(52, 211, 153, 0.15)' : 'rgba(5, 150, 105, 0.08)',
      };
  }
};

function ActivityCard({ item, onPress }: { item: ActivityItem; onPress: () => void }) {
  const { theme, isDark } = useTheme();
  const { t } = useLanguage();

  const texts: Record<string, string> = {
    join: t('activityJoined'),
    create: t('activityCreated'),
    review: t('activityReviewed'),
    near: t('activityNear'),
  };

  const badge = getBadgeStyle(item.type, isDark, t);

  return (
    <TouchableOpacity
      style={[
        styles.card,
        {
          backgroundColor: theme.card,
          borderColor: theme.border,
          shadowColor: isDark ? '#000' : '#0F172A',
          shadowOpacity: isDark ? 0.35 : 0.04,
        }
      ]}
      onPress={onPress}
      activeOpacity={0.8}
    >
      <View style={[styles.avatarWrap, { backgroundColor: theme.accentLight }]}>
        <AvatarImage value={item.userAvatar} size={46} backgroundColor={theme.accentLight} textSize={24} />
      </View>
      <View style={styles.content}>
        <View style={styles.cardHeader}>
          <Text style={[styles.time, { color: theme.subtext }]}>{timeAgo(item.timestamp, t)}</Text>
          <View style={[styles.badgeContainer, { backgroundColor: badge.bgColor }]}>
            <Text style={[styles.badgeText, { color: badge.textColor }]}>{badge.label}</Text>
          </View>
        </View>
        <Text style={[styles.text, { color: theme.text }]} numberOfLines={2}>
          <Text style={styles.userName}>{item.userName} </Text>
          <Text style={{ color: theme.subtext }}>{texts[item.type]} </Text>
          <Text style={[styles.eventName, { color: theme.accent }]}>{item.eventTitle}</Text>
        </Text>
      </View>
    </TouchableOpacity>
  );
}

export default function ActivityScreen() {
  const navigation = useNavigation<Nav>();
  const { theme, isDark } = useTheme();
  const { user } = useAuth();
  const { t } = useLanguage();
  const { clearActivityBadge } = useBadge();
  const [feed, setFeed] = useState<ActivityItem[]>([]);
  const [refreshing, setRefreshing] = useState(false);
  const [friendsOnly, setFriendsOnly] = useState(false);
  const [friendIds, setFriendIds] = useState<string[]>([]);

  useFocusEffect(
    useCallback(() => {
      clearActivityBadge();
    }, [])
  );

  useEffect(() => {
    if (user) loadFriends();
  }, [user]);

  async function loadFriends() {
    if (!user) return;
    const { data } = await supabase
      .from('friend_requests')
      .select('from_user_id, to_user_id')
      .eq('status', 'accepted')
      .or(`from_user_id.eq.${user.id},to_user_id.eq.${user.id}`);
    setFriendIds((data ?? []).map((r: any) => r.from_user_id === user.id ? r.to_user_id : r.from_user_id));
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
      .filter((j: any) => !user || j.user_id !== user.id)
      .map((j: any) => ({
        id: `join-${j.event_id}-${j.user_id}`,
        type: 'join' as const,
        userId: j.user_id,
        userName: (j.profiles as any)?.name ?? t('userLabel'),
        userAvatar: (j.profiles as any)?.avatar ?? '🧑',
        eventId: j.event_id,
        eventTitle: (j.events as any)?.title ?? '',
        timestamp: new Date(j.joined_at),
      }));

    const createItems: ActivityItem[] = (creates ?? [])
      .filter((e: any) => !(e.profiles as any)?.is_banned)
      .filter((e: any) => !blockedIds.has(e.created_by))
      .filter((e: any) => !user || e.created_by !== user.id)
      .map((e: any) => ({
        id: `create-${e.id}`,
        type: 'create' as const,
        userId: e.created_by ?? '',
        userName: (e.profiles as any)?.name ?? t('userLabel'),
        userAvatar: (e.profiles as any)?.avatar ?? '🧑',
        eventId: e.id,
        eventTitle: e.title,
        timestamp: new Date(e.created_at),
      }));

    let all = [...joinItems, ...createItems]
      .filter(item => item.eventTitle);

    if (friendsOnly) {
      all = all.filter(item => friendIds.includes(item.userId));
    }

    all.sort((a, b) => b.timestamp.getTime() - a.timestamp.getTime());
    setFeed(all);
    setRefreshing(false);
  }, [friendsOnly, friendIds, user, t]);

  useEffect(() => {
    loadFeed();
  }, [loadFeed]);

  function refresh() {
    setRefreshing(true);
    if (user) loadFriends();
    loadFeed();
  }

  return (
    <SafeAreaView style={[styles.container, { backgroundColor: theme.bg }]}>
      <View style={styles.header}>
        <Text style={[styles.title, { color: theme.text }]}>{t('activityTitle')}</Text>
        <View style={styles.headerRow}>
          <Text style={[styles.subtitle, { color: theme.subtext }]}>
            {friendsOnly ? t('activityFriends') : t('activityAll')}
          </Text>
          <View style={[styles.segmentedContainer, { backgroundColor: theme.inputBg, borderColor: theme.border }]}>
            <TouchableOpacity
              style={[
                styles.segmentButton,
                !friendsOnly && [
                  styles.segmentActiveButton,
                  {
                    backgroundColor: theme.card,
                    shadowColor: isDark ? '#000' : '#0F172A',
                    shadowOpacity: isDark ? 0.2 : 0.05,
                  }
                ]
              ]}
              onPress={() => setFriendsOnly(false)}
              activeOpacity={0.9}
            >
              <Text style={[styles.segmentButtonText, { color: !friendsOnly ? theme.text : theme.subtext, fontWeight: !friendsOnly ? '700' : '500' }]}>
                {t('activityFilterAll')}
              </Text>
            </TouchableOpacity>
            <TouchableOpacity
              style={[
                styles.segmentButton,
                friendsOnly && [
                  styles.segmentActiveButton,
                  {
                    backgroundColor: theme.card,
                    shadowColor: isDark ? '#000' : '#0F172A',
                    shadowOpacity: isDark ? 0.2 : 0.05,
                  }
                ]
              ]}
              onPress={() => setFriendsOnly(true)}
              activeOpacity={0.9}
            >
              <Text style={[styles.segmentButtonText, { color: friendsOnly ? theme.text : theme.subtext, fontWeight: friendsOnly ? '700' : '500' }]}>
                {t('activityFilterFriends')}
              </Text>
            </TouchableOpacity>
          </View>
        </View>
      </View>

      <FlatList
        data={feed}
        keyExtractor={item => item.id}
        renderItem={({ item }) => (
          <ActivityCard
            item={item}
            onPress={() => navigation.navigate('Chat', { eventId: item.eventId!, eventTitle: item.eventTitle! })}
          />
        )}
        contentContainerStyle={styles.list}
        showsVerticalScrollIndicator={false}
        refreshControl={<RefreshControl refreshing={refreshing} onRefresh={refresh} tintColor={theme.accent} />}
        ListEmptyComponent={
          <View style={[styles.emptyContainer, { borderColor: theme.border, backgroundColor: theme.card }]}>
            <View style={[styles.emptyCircle, { backgroundColor: theme.accentLight }]}>
              <Text style={[styles.emptyCircleText, { color: theme.accent }]}>
                {friendsOnly ? '👥' : '✦'}
              </Text>
            </View>
            <Text style={[styles.emptyTitle, { color: theme.text }]}>
              {friendsOnly ? t('activityEmptyFriendsTitle') : t('activityEmptyAllTitle')}
            </Text>
            <Text style={[styles.emptyText, { color: theme.subtext }]}>
              {friendsOnly ? t('activityEmptyFriends') : t('activityEmptyAll')}
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
  segmentedContainer: {
    flexDirection: 'row',
    alignItems: 'center',
    borderRadius: 20,
    padding: 3,
    borderWidth: 1,
  },
  segmentButton: {
    paddingHorizontal: 16,
    paddingVertical: 6,
    borderRadius: 17,
  },
  segmentActiveButton: {
    shadowOffset: { width: 0, height: 2 },
    shadowRadius: 4,
    elevation: 1,
  },
  segmentButtonText: {
    fontSize: 13,
  },
  list: { paddingHorizontal: 16, paddingBottom: 24, width: '100%', maxWidth: 860, alignSelf: 'center' },
  card: {
    flexDirection: 'row', alignItems: 'center', gap: 12,
    borderRadius: 16, padding: 14, marginBottom: 10,
    borderWidth: 1,
    shadowOffset: { width: 0, height: 8 },
    shadowRadius: 18, elevation: 2,
  },
  avatarWrap: { width: 46, height: 46, borderRadius: 23, justifyContent: 'center', alignItems: 'center' },
  content: { flex: 1 },
  cardHeader: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
    marginBottom: 4,
  },
  badgeContainer: {
    borderRadius: 8,
    paddingHorizontal: 7,
    paddingVertical: 3,
  },
  badgeText: {
    fontSize: 10,
    fontWeight: '800',
    letterSpacing: 0.5,
  },
  text: { fontSize: 14, lineHeight: 20 },
  userName: { fontWeight: '700' },
  eventName: { fontWeight: '600' },
  time: { fontSize: 12 },
  emptyContainer: {
    alignItems: 'center',
    justifyContent: 'center',
    paddingVertical: 40,
    paddingHorizontal: 24,
    borderRadius: 20,
    borderWidth: 1,
    marginTop: 40,
    marginHorizontal: 16,
  },
  emptyCircle: {
    width: 56,
    height: 56,
    borderRadius: 28,
    alignItems: 'center',
    justifyContent: 'center',
    marginBottom: 16,
  },
  emptyCircleText: {
    fontSize: 24,
  },
  emptyTitle: {
    fontSize: 16,
    fontWeight: '700',
    marginBottom: 8,
    textAlign: 'center',
  },
  emptyText: {
    fontSize: 14,
    textAlign: 'center',
    lineHeight: 20,
  },
});
