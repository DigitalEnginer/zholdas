import React, { useState, useEffect } from 'react';
import {
  View, Text, StyleSheet, ScrollView,
  SafeAreaView, ActivityIndicator, TouchableOpacity,
  Alert,
} from 'react-native';
import { useRoute, RouteProp } from '@react-navigation/native';
import { RootStackParamList } from '../types';
import { useTheme } from '../context/ThemeContext';
import { useAuth } from '../context/AuthContext';
import { supabase } from '../lib/supabase';
import AvatarImage from '../components/AvatarImage';

type ProfileRoute = RouteProp<RootStackParamList, 'UserProfile'>;

interface ProfileData {
  name: string;
  avatar: string;
  bio: string;
  rating: number;
  reviewsCount: number;
  eventsJoined: number;
  friendsMade: number;
}

interface EventItem {
  id: string;
  title: string;
  datetime: string;
  participantsCount: number;
  category: string;
}

interface ReviewItem {
  id: string;
  fromName: string;
  fromAvatar: string;
  rating: number;
  comment: string;
}

const categoryEmojis: Record<string, string> = {
  mountains: '⛰️', theatre: '🎭', restaurant: '🍽️', sport: '⚽', other: '✨',
};

export default function UserProfileScreen() {
  const route = useRoute<ProfileRoute>();
  const { userId, userName, userAvatar } = route.params;
  const { theme, isDark } = useTheme();
  const { user: currentUser } = useAuth();

  const [profile, setProfile] = useState<ProfileData | null>(null);
  const [events, setEvents] = useState<EventItem[]>([]);
  const [reviews, setReviews] = useState<ReviewItem[]>([]);
  const [isFollowing, setIsFollowing] = useState(false);
  const [followersCount, setFollowersCount] = useState(0);
  const [loading, setLoading] = useState(true);
  const [followLoading, setFollowLoading] = useState(false);
  const [isBanned, setIsBanned] = useState(false);
  const [banLoading, setBanLoading] = useState(false);
  const [friendStatus, setFriendStatus] = useState<'none' | 'outgoing' | 'incoming' | 'accepted'>('none');
  const [isBlocked, setIsBlocked] = useState(false);

  const isOwnProfile = currentUser?.id === userId;
  const canModerate = currentUser?.role === 'moderator' || currentUser?.role === 'admin';

  useEffect(() => {
    loadProfile();
  }, [userId, currentUser?.id, currentUser?.role]);

  async function loadProfile() {
    const [
      { data: profileData },
      { data: eventsData },
      { data: reviewsData },
      { data: followData },
      { data: myFollow },
      { data: banData },
      { data: outgoingRequest },
      { data: incomingRequest },
      { data: blockData },
    ] = await Promise.all([
      supabase.from('profiles').select('*').eq('id', userId).single(),
      supabase.from('events').select('id, title, datetime, participants_count, category')
        .eq('created_by', userId).order('created_at', { ascending: false }).limit(5),
      supabase.from('reviews')
        .select('id, rating, comment, profiles!reviews_from_user_id_fkey(name, avatar)')
        .eq('to_user_id', userId).order('created_at', { ascending: false }).limit(10),
      supabase.from('follows').select('follower_id').eq('following_id', userId),
      currentUser
        ? supabase.from('follows').select('follower_id')
            .eq('follower_id', currentUser.id).eq('following_id', userId).maybeSingle()
        : Promise.resolve({ data: null }),
      canModerate
        ? supabase.from('user_bans').select('user_id').eq('user_id', userId).maybeSingle()
        : Promise.resolve({ data: null }),
      currentUser
        ? supabase.from('friend_requests').select('status')
            .eq('from_user_id', currentUser.id).eq('to_user_id', userId).maybeSingle()
        : Promise.resolve({ data: null }),
      currentUser
        ? supabase.from('friend_requests').select('status')
            .eq('from_user_id', userId).eq('to_user_id', currentUser.id).maybeSingle()
        : Promise.resolve({ data: null }),
      currentUser
        ? supabase.from('blocks').select('blocked_id')
            .eq('blocker_id', currentUser.id).eq('blocked_id', userId).maybeSingle()
        : Promise.resolve({ data: null }),
    ]);

    if (profileData) {
      setProfile({
        name: profileData.name ?? userName,
        avatar: profileData.avatar ?? userAvatar,
        bio: profileData.bio ?? '',
        rating: Number(profileData.rating) ?? 0,
        reviewsCount: profileData.reviews_count ?? 0,
        eventsJoined: profileData.events_joined ?? 0,
        friendsMade: profileData.friends_made ?? 0,
      });
    }

    setEvents((eventsData ?? []).map((e: any) => ({
      id: e.id, title: e.title, datetime: e.datetime,
      participantsCount: e.participants_count, category: e.category,
    })));

    setReviews((reviewsData ?? []).map((r: any) => ({
      id: r.id,
      fromName: (r.profiles as any)?.name ?? 'Пользователь',
      fromAvatar: (r.profiles as any)?.avatar ?? '🧑',
      rating: r.rating,
      comment: r.comment,
    })));

    setFollowersCount(followData?.length ?? 0);
    setIsFollowing(!!myFollow);
    setIsBanned(!!banData);
    setIsBlocked(!!blockData);
    if (outgoingRequest?.status === 'accepted' || incomingRequest?.status === 'accepted') {
      setFriendStatus('accepted');
    } else if (outgoingRequest?.status === 'pending') {
      setFriendStatus('outgoing');
    } else if (incomingRequest?.status === 'pending') {
      setFriendStatus('incoming');
    } else {
      setFriendStatus('none');
    }
    setLoading(false);
  }

  async function toggleFollow() {
    if (!currentUser || isOwnProfile) return;
    setFollowLoading(true);
    if (isFollowing) {
      await supabase.from('follows').delete()
        .eq('follower_id', currentUser.id).eq('following_id', userId);
      setIsFollowing(false);
      setFollowersCount(p => Math.max(0, p - 1));
    } else {
      await supabase.from('follows').insert({ follower_id: currentUser.id, following_id: userId });
      setIsFollowing(true);
      setFollowersCount(p => p + 1);
    }
    setFollowLoading(false);
  }

  async function sendFriendRequest() {
    if (!currentUser || isOwnProfile || isBlocked) return;

    const { error } = await supabase.from('friend_requests').insert({
      from_user_id: currentUser.id,
      to_user_id: userId,
    });

    if (error) {
      Alert.alert('Не удалось отправить заявку', error.message);
      return;
    }

    setFriendStatus('outgoing');
  }

  async function acceptFriendRequest() {
    if (!currentUser || isOwnProfile) return;

    const { error } = await supabase
      .from('friend_requests')
      .update({ status: 'accepted' })
      .eq('from_user_id', userId)
      .eq('to_user_id', currentUser.id);

    if (error) {
      Alert.alert('Не удалось принять заявку', error.message);
      return;
    }

    setFriendStatus('accepted');
  }

  async function toggleBlock() {
    if (!currentUser || isOwnProfile) return;

    if (isBlocked) {
      const { error } = await supabase.from('blocks').delete()
        .eq('blocker_id', currentUser.id).eq('blocked_id', userId);
      if (error) {
        Alert.alert('Не удалось разблокировать', error.message);
        return;
      }
      setIsBlocked(false);
      return;
    }

    Alert.alert('Заблокировать пользователя?', 'Вы не будете видеть его активность и не сможете взаимодействовать с ним.', [
      { text: 'Отмена', style: 'cancel' },
      {
        text: 'Заблокировать',
        style: 'destructive',
        onPress: async () => {
          const { error } = await supabase.from('blocks').insert({
            blocker_id: currentUser.id,
            blocked_id: userId,
          });

          if (error) {
            Alert.alert('Не удалось заблокировать', error.message);
            return;
          }

          setIsBlocked(true);
          setIsFollowing(false);
          setFriendStatus('none');
        },
      },
    ]);
  }

  async function banUser() {
    if (!currentUser || !canModerate || isOwnProfile) return;

    const banWithReason = async (reason: string) => {
      setBanLoading(true);
      const { error } = await supabase.from('user_bans').insert({
        user_id: userId,
        banned_by: currentUser.id,
        reason,
      });
      setBanLoading(false);

      if (error) {
        Alert.alert('Не удалось забанить', error.message);
        return;
      }

      setIsBanned(true);
    };

    Alert.alert('Причина бана', `${displayName} не сможет пользоваться основными функциями приложения.`, [
      { text: 'Отмена', style: 'cancel' },
      { text: 'Спам', style: 'destructive', onPress: () => banWithReason('Спам') },
      { text: 'Оскорбления', style: 'destructive', onPress: () => banWithReason('Оскорбления') },
      { text: 'Небезопасное поведение', style: 'destructive', onPress: () => banWithReason('Небезопасное поведение') },
      { text: 'Нарушение правил', style: 'destructive', onPress: () => banWithReason('Нарушение правил сообщества') },
    ]);
  }

  async function reportUser() {
    if (!currentUser || isOwnProfile) return;

    const reportWithReason = async (reason: string) => {
      const { error } = await supabase.from('reports').insert({
        reporter_id: currentUser.id,
        reported_user_id: userId,
        reason,
      });

      if (error) {
        Alert.alert('Не удалось отправить жалобу', error.message);
        return;
      }

      Alert.alert('Жалоба отправлена', 'Модератор рассмотрит ее в ближайшее время.');
    };

    Alert.alert('Пожаловаться', `Что не так с пользователем ${displayName}?`, [
      { text: 'Отмена', style: 'cancel' },
      { text: 'Спам', onPress: () => reportWithReason('Спам') },
      { text: 'Оскорбления', onPress: () => reportWithReason('Оскорбления') },
      { text: 'Небезопасное поведение', onPress: () => reportWithReason('Небезопасное поведение') },
      { text: 'Другое нарушение', onPress: () => reportWithReason('Другое нарушение') },
    ]);
  }

  async function unbanUser() {
    if (!currentUser || !canModerate || isOwnProfile) return;

    Alert.alert('Разбанить пользователя?', `${displayName} снова будет доступен для сообщества.`, [
      { text: 'Отмена', style: 'cancel' },
      {
        text: 'Разбанить',
        onPress: async () => {
          setBanLoading(true);
          const { error } = await supabase.from('user_bans').delete().eq('user_id', userId);
          setBanLoading(false);

          if (error) {
            Alert.alert('Не удалось разбанить', error.message);
            return;
          }

          setIsBanned(false);
        },
      },
    ]);
  }

  const displayRating = profile?.rating ?? 0;
  const displayName = profile?.name ?? userName;
  const displayAvatar = profile?.avatar ?? userAvatar;

  if (loading) {
    return (
      <SafeAreaView style={[styles.container, { backgroundColor: theme.bg }]}>
        <ActivityIndicator color={theme.accent} style={{ flex: 1 }} />
      </SafeAreaView>
    );
  }

  const shadowHex = isDark ? '#000' : '#0F172A';
  const shadowOpacity = isDark ? 0.35 : 0.04;

  return (
    <SafeAreaView style={[styles.container, { backgroundColor: theme.bg }]}>
      <ScrollView showsVerticalScrollIndicator={false} contentContainerStyle={styles.content}>
        <View style={styles.hero}>
          <View style={[styles.avatar, { backgroundColor: theme.accentLight, borderColor: theme.accent }]}>
            <AvatarImage
              value={displayAvatar}
              size={90}
              backgroundColor={theme.accentLight}
              borderColor={theme.accent}
              textSize={44}
            />
          </View>
          <Text style={[styles.name, { color: theme.text }]}>{displayName}</Text>
          {profile?.bio ? (
            <Text style={[styles.bio, { color: theme.subtext }]}>{profile.bio}</Text>
          ) : null}

          <View style={styles.ratingRow}>
            {[1, 2, 3, 4, 5].map(i => (
              <Text key={i} style={[styles.star, i <= Math.round(displayRating) && styles.starFilled]}>★</Text>
            ))}
            <Text style={[styles.ratingVal, { color: theme.text }]}>
              {displayRating > 0 ? displayRating.toFixed(1) : '—'}
            </Text>
          </View>

          {/* Action Buttons Section */}
          <View style={styles.actionSection}>
            <View style={styles.mainActionsRow}>
              {!isOwnProfile && currentUser && (
                <TouchableOpacity
                  style={[
                    styles.primaryActionBtn,
                    isFollowing
                      ? { backgroundColor: theme.card, borderColor: theme.border }
                      : { backgroundColor: theme.accent, borderColor: theme.accent },
                  ]}
                  onPress={toggleFollow}
                  disabled={followLoading}
                  activeOpacity={0.8}
                >
                  <Text style={[styles.primaryActionBtnText, { color: isFollowing ? theme.text : '#FFF' }]}>
                    {isFollowing ? '✓ Подписка' : 'Подписаться'}
                  </Text>
                </TouchableOpacity>
              )}

              {!isOwnProfile && currentUser && !isBlocked && (
                <TouchableOpacity
                  style={[
                    styles.primaryActionBtn,
                    friendStatus === 'accepted'
                      ? { backgroundColor: theme.card, borderColor: theme.border }
                      : { backgroundColor: theme.accent, borderColor: theme.accent }
                  ]}
                  onPress={friendStatus === 'incoming' ? acceptFriendRequest : friendStatus === 'none' ? sendFriendRequest : undefined}
                  disabled={friendStatus === 'outgoing' || friendStatus === 'accepted'}
                  activeOpacity={0.8}
                >
                  <Text style={[styles.primaryActionBtnText, { color: friendStatus === 'accepted' ? theme.text : '#FFF' }]}>
                    {friendStatus === 'accepted'
                      ? '✓ В друзьях'
                      : friendStatus === 'outgoing'
                        ? 'Отправлено'
                        : friendStatus === 'incoming'
                          ? 'Принять'
                          : 'В друзья'}
                  </Text>
                </TouchableOpacity>
              )}
            </View>

            {/* Secondary Actions */}
            <View style={styles.secondaryActionsRow}>
              {!isOwnProfile && currentUser && (
                <TouchableOpacity
                  style={[styles.secondaryActionBtn, { borderColor: theme.border, backgroundColor: theme.card }]}
                  onPress={toggleBlock}
                  activeOpacity={0.8}
                >
                  <Text style={[styles.secondaryActionBtnText, { color: isBlocked ? theme.accent : theme.subtext }]}>
                    {isBlocked ? 'Разблокировать' : 'Блок'}
                  </Text>
                </TouchableOpacity>
              )}

              {!isOwnProfile && currentUser && (
                <TouchableOpacity
                  style={[styles.secondaryActionBtn, { borderColor: theme.border, backgroundColor: theme.card }]}
                  onPress={reportUser}
                  activeOpacity={0.8}
                >
                  <Text style={[styles.secondaryActionBtnText, { color: theme.subtext }]}>Жалоба</Text>
                </TouchableOpacity>
              )}

              {!isOwnProfile && canModerate && (
                <TouchableOpacity
                  style={[
                    styles.secondaryActionBtn,
                    { borderColor: theme.danger, backgroundColor: isDark ? 'rgba(239, 68, 68, 0.12)' : '#FFF1F1' }
                  ]}
                  onPress={isBanned ? unbanUser : banUser}
                  disabled={banLoading}
                  activeOpacity={0.8}
                >
                  <Text style={[styles.secondaryActionBtnText, { color: theme.danger }]}>
                    {isBanned ? 'Разбанить' : 'Бан'}
                  </Text>
                </TouchableOpacity>
              )}
            </View>
          </View>
        </View>

        {/* Stats Row Redesigned into Grid Tiles */}
        <View style={styles.statsRowContainer}>
          {[
            { label: 'Ивентов', value: profile?.eventsJoined ?? 0 },
            { label: 'Подписчики', value: followersCount },
            { label: 'Отзывов', value: profile?.reviewsCount ?? 0 },
          ].map((stat) => (
            <View
              key={stat.label}
              style={[
                styles.statTile,
                {
                  backgroundColor: theme.card,
                  borderColor: theme.border,
                  shadowColor: shadowHex,
                  shadowOpacity,
                }
              ]}
            >
              <Text style={[styles.statValue, { color: theme.accent }]}>{stat.value}</Text>
              <Text style={[styles.statLabel, { color: theme.subtext }]}>{stat.label}</Text>
            </View>
          ))}
        </View>

        {events.length > 0 && (
          <View
            style={[
              styles.section,
              {
                backgroundColor: theme.card,
                borderColor: theme.border,
                shadowColor: shadowHex,
                shadowOpacity,
              }
            ]}
          >
            <Text style={[styles.sectionTitle, { color: theme.subtext }]}>Ивенты участника</Text>
            {events.map((event, i) => (
              <View key={event.id} style={[styles.eventRow, { borderTopColor: theme.border }, i === 0 && { borderTopWidth: 0 }]}>
                <Text style={styles.eventIcon}>{categoryEmojis[event.category] ?? '✨'}</Text>
                <View style={{ flex: 1 }}>
                  <Text style={[styles.eventTitle, { color: theme.text }]}>{event.title}</Text>
                  <Text style={[styles.eventTime, { color: theme.subtext }]}>{event.datetime}</Text>
                </View>
                <View style={[styles.badge, { backgroundColor: theme.accentLight, borderColor: theme.border, borderWidth: 1 }]}>
                  <Text style={[styles.badgeText, { color: theme.accent }]}>{event.participantsCount} чел.</Text>
                </View>
              </View>
            ))}
          </View>
        )}

        <View
          style={[
            styles.section,
            {
              backgroundColor: theme.card,
              borderColor: theme.border,
              shadowColor: shadowHex,
              shadowOpacity,
            }
          ]}
        >
          <Text style={[styles.sectionTitle, { color: theme.subtext }]}>Отзывы</Text>
          {reviews.length === 0 ? (
            <View style={[styles.emptyReviews, { backgroundColor: theme.inputBg, borderColor: theme.border }]}>
              <Text style={styles.emptyReviewsIcon}>★</Text>
              <Text style={[styles.emptyReviewsText, { color: theme.subtext }]}>Отзывов пока нет</Text>
            </View>
          ) : (
            reviews.map((review, i) => (
              <View key={review.id} style={[styles.reviewRow, { borderTopColor: theme.border }, i === 0 && { borderTopWidth: 0 }]}>
                <AvatarImage value={review.fromAvatar} size={38} backgroundColor={theme.accentLight} textSize={22} />
                <View style={{ flex: 1 }}>
                  <View style={styles.reviewHeader}>
                    <Text style={[styles.reviewFrom, { color: theme.text }]}>{review.fromName}</Text>
                    <Text style={styles.reviewStars}>{'★'.repeat(review.rating)}</Text>
                  </View>
                  {review.comment ? (
                    <Text style={[styles.reviewText, { color: theme.subtext }]}>{review.comment}</Text>
                  ) : null}
                </View>
              </View>
            ))
          )}
        </View>

        <View style={{ height: 40 }} />
      </ScrollView>
    </SafeAreaView>
  );
}

const styles = StyleSheet.create({
  container: { flex: 1 },
  content: { width: '100%', maxWidth: 860, alignSelf: 'center', paddingBottom: 40 },
  hero: { alignItems: 'center', paddingTop: 32, paddingBottom: 24, paddingHorizontal: 16 },
  avatar: {
    width: 90, height: 90, borderRadius: 45,
    justifyContent: 'center', alignItems: 'center',
    marginBottom: 14, borderWidth: 3,
  },
  name: { fontSize: 22, fontWeight: '800', marginBottom: 4 },
  bio: { fontSize: 14, marginBottom: 12, textAlign: 'center', paddingHorizontal: 32, lineHeight: 20 },
  ratingRow: { flexDirection: 'row', alignItems: 'center', gap: 2, marginBottom: 16 },
  star: { fontSize: 20, color: '#DDD' },
  starFilled: { color: '#F5A623' },
  ratingVal: { fontSize: 16, fontWeight: '700', marginLeft: 6 },
  actionSection: { width: '100%', maxWidth: 420, gap: 10, marginTop: 6, paddingHorizontal: 16 },
  mainActionsRow: { flexDirection: 'row', gap: 10, justifyContent: 'center' },
  primaryActionBtn: {
    flex: 1, borderWidth: 1.5, borderRadius: 16,
    paddingVertical: 11, alignItems: 'center', justifyContent: 'center',
  },
  primaryActionBtnText: { fontSize: 14, fontWeight: '700' },
  secondaryActionsRow: { flexDirection: 'row', gap: 8, justifyContent: 'center', marginTop: 4 },
  secondaryActionBtn: {
    flex: 1, borderWidth: 1.5, borderRadius: 14,
    paddingVertical: 9, alignItems: 'center', justifyContent: 'center',
  },
  secondaryActionBtnText: { fontSize: 12, fontWeight: '700' },
  statsRowContainer: {
    flexDirection: 'row',
    gap: 12,
    marginHorizontal: 16,
    marginBottom: 20,
    marginTop: 8,
  },
  statTile: {
    flex: 1,
    alignItems: 'center',
    justifyContent: 'center',
    paddingVertical: 18,
    borderRadius: 16,
    borderWidth: 1,
    shadowOffset: { width: 0, height: 4 },
    shadowRadius: 10,
    elevation: 2,
  },
  statValue: { fontSize: 22, fontWeight: '800' },
  statLabel: { fontSize: 11, marginTop: 2 },
  section: {
    marginHorizontal: 16, marginBottom: 12, borderRadius: 16, overflow: 'hidden',
    borderWidth: 1,
    shadowOffset: { width: 0, height: 6 },
    shadowRadius: 12,
    elevation: 2,
  },
  sectionTitle: {
    fontSize: 13, fontWeight: '700', textTransform: 'uppercase',
    paddingHorizontal: 16, paddingTop: 14, paddingBottom: 8,
  },
  eventRow: {
    flexDirection: 'row', alignItems: 'center', gap: 12,
    paddingHorizontal: 16, paddingVertical: 12, borderTopWidth: 1,
  },
  eventIcon: { fontSize: 22 },
  eventTitle: { fontSize: 14, fontWeight: '600' },
  eventTime: { fontSize: 12, marginTop: 2 },
  badge: { borderRadius: 10, paddingHorizontal: 8, paddingVertical: 4 },
  badgeText: { fontSize: 12, fontWeight: '600' },
  reviewRow: {
    flexDirection: 'row', gap: 12, alignItems: 'flex-start',
    paddingHorizontal: 16, paddingVertical: 12, borderTopWidth: 1,
  },
  reviewHeader: { flexDirection: 'row', justifyContent: 'space-between', marginBottom: 4 },
  reviewFrom: { fontSize: 14, fontWeight: '700' },
  reviewStars: { fontSize: 12, color: '#F5A623' },
  reviewText: { fontSize: 13, lineHeight: 18 },
  emptyReviews: {
    margin: 16,
    marginTop: 8,
    padding: 18,
    borderWidth: 1,
    borderStyle: 'dashed',
    borderRadius: 14,
    alignItems: 'center',
  },
  emptyReviewsIcon: { fontSize: 24, color: '#98A2B3', marginBottom: 8 },
  emptyReviewsText: { fontSize: 14, fontWeight: '700', textAlign: 'center' },
});
