import React from 'react';
import {
  View, Text, StyleSheet, ScrollView,
  TouchableOpacity, SafeAreaView, Alert, Platform,
} from 'react-native';
import { useNavigation } from '@react-navigation/native';
import { NativeStackNavigationProp } from '@react-navigation/native-stack';
import { RootStackParamList } from '../types';
import { useAuth } from '../context/AuthContext';
import { useEvents } from '../context/EventsContext';
import { useTheme } from '../context/ThemeContext';
import { categoryEmojis } from '../data/mockEvents';
import AvatarImage from '../components/AvatarImage';
import { supabase } from '../lib/supabase';

type Nav = NativeStackNavigationProp<RootStackParamList>;

interface ProfileReview {
  id: string;
  fromName: string;
  fromAvatar: string;
  rating: number;
  comment: string;
}

function StarRating({ rating }: { rating: number }) {
  const { theme } = useTheme();
  return (
    <View style={styles.stars}>
      {[1, 2, 3, 4, 5].map(i => (
        <Text key={i} style={[styles.star, i <= Math.round(rating) && styles.starFilled]}>★</Text>
      ))}
      {rating > 0 && <Text style={[styles.ratingValue, { color: theme.text }]}>{rating.toFixed(1)}</Text>}
    </View>
  );
}

export default function ProfileScreen() {
  const navigation = useNavigation<Nav>();
  const { user, logout } = useAuth();
  const { events, isJoined } = useEvents();
  const { theme } = useTheme();
  const scrollRef = React.useRef<ScrollView>(null);
  const eventsSectionY = React.useRef(0);
  const reviewsSectionY = React.useRef(0);
  const [friendsCount, setFriendsCount] = React.useState(0);
  const [profileReviews, setProfileReviews] = React.useState<ProfileReview[]>([]);

  const myEvents = user ? events.filter(e => isJoined(e.id, user.id)) : [];

  React.useEffect(() => {
    loadProfileStats();
  }, [user?.id]);

  async function loadProfileStats() {
    if (!user) return;

    const [{ data: friendsData }, { data: reviewsData }] = await Promise.all([
      supabase
        .from('friend_requests')
        .select('id')
        .eq('status', 'accepted')
        .or(`from_user_id.eq.${user.id},to_user_id.eq.${user.id}`),
      supabase
        .from('reviews')
        .select('id, rating, comment, profiles!reviews_from_user_id_fkey(name, avatar)')
        .eq('to_user_id', user.id)
        .order('created_at', { ascending: false })
        .limit(10),
    ]);

    setFriendsCount(friendsData?.length ?? 0);
    setProfileReviews((reviewsData ?? []).map((review: any) => ({
      id: review.id,
      fromName: review.profiles?.name ?? 'Пользователь',
      fromAvatar: review.profiles?.avatar ?? '👤',
      rating: Number(review.rating ?? 0),
      comment: review.comment ?? '',
    })));
  }

  function handleLogout() {
    if (Platform.OS === 'web') {
      const confirmed = typeof window === 'undefined'
        ? true
        : window.confirm('Выйти из профиля?');
      if (confirmed) logout();
      return;
    }

    Alert.alert('Выйти?', 'Ваша сессия завершится', [
      { text: 'Отмена', style: 'cancel' },
      { text: 'Выйти', style: 'destructive', onPress: logout },
    ]);
  }

  if (!user) return null;

  const canModerate = user.role === 'moderator' || user.role === 'admin';

  const stats = [
    {
      label: 'Ивентов',
      value: String(myEvents.length),
      onPress: () => scrollRef.current?.scrollTo({ y: eventsSectionY.current, animated: true }),
    },
    {
      label: 'Друзей',
      value: String(friendsCount),
      onPress: () => navigation.navigate('Friends'),
    },
    {
      label: 'Отзывов',
      value: String(user.reviewsCount || profileReviews.length),
      onPress: () => scrollRef.current?.scrollTo({ y: reviewsSectionY.current, animated: true }),
    },
  ];

  return (
    <SafeAreaView style={[styles.container, { backgroundColor: theme.bg }]}>
      <ScrollView ref={scrollRef} showsVerticalScrollIndicator={false}>
        <View style={styles.hero}>
          <TouchableOpacity
            style={[styles.avatar, { backgroundColor: theme.accentLight, borderColor: theme.accent }]}
            onPress={() => navigation.navigate('EditProfile')}
            activeOpacity={0.8}
          >
            <AvatarImage
              value={user.avatar}
              size={90}
              backgroundColor={theme.accentLight}
              borderColor={theme.accent}
              textSize={44}
            />
            <View style={[styles.editBadge, { backgroundColor: theme.accent }]}>
              <Text style={styles.editBadgeText}>✎</Text>
            </View>
          </TouchableOpacity>
          <Text style={[styles.name, { color: theme.text }]}>{user.name}</Text>
          <Text style={[styles.username, { color: theme.subtext }]}>{user.username}</Text>
          {user.bio ? <Text style={[styles.bio, { color: theme.subtext }]}>{user.bio}</Text> : null}
          <StarRating rating={user.rating} />
          {user.reviewsCount > 0 && (
            <Text style={[styles.reviews, { color: theme.subtext }]}>{user.reviewsCount} отзыв(а)</Text>
          )}
          <Text style={[styles.since, { color: theme.subtext }]}>В Жолдас с {user.joinedAt}</Text>

          <TouchableOpacity
            style={[styles.editBtn, { borderColor: theme.accent }]}
            onPress={() => navigation.navigate('EditProfile')}
            activeOpacity={0.8}
          >
            <Text style={[styles.editBtnText, { color: theme.accent }]}>✎ Редактировать профиль</Text>
          </TouchableOpacity>
        </View>

        <View style={[styles.statsRow, { backgroundColor: theme.card }]}>
          {stats.map((stat, i) => (
            <TouchableOpacity
              key={stat.label}
              style={[styles.statItem, i < 2 && { borderRightWidth: 1, borderRightColor: theme.border }]}
              onPress={stat.onPress}
              activeOpacity={0.75}
            >
              <Text style={[styles.statValue, { color: theme.accent }]}>{stat.value}</Text>
              <Text style={[styles.statLabel, { color: theme.subtext }]}>{stat.label}</Text>
            </TouchableOpacity>
          ))}
        </View>

        <View
          style={[styles.section, { backgroundColor: theme.card }]}
          onLayout={event => { eventsSectionY.current = event.nativeEvent.layout.y; }}
        >
          <Text style={[styles.sectionTitle, { color: theme.subtext }]}>Мои ивенты</Text>
          {myEvents.length === 0 ? (
            <View style={styles.emptyEvents}>
              <Text style={[styles.emptyEventsText, { color: theme.subtext }]}>Ты пока не присоединился ни к одному ивенту</Text>
            </View>
          ) : (
            myEvents.map(event => (
              <TouchableOpacity
                key={event.id}
                style={[styles.eventRow, { borderTopColor: theme.border }]}
                onPress={() => navigation.navigate('Chat', { eventId: event.id, eventTitle: event.title })}
                activeOpacity={0.75}
              >
                <View style={[styles.eventIconWrap, { backgroundColor: theme.accentLight }]}>
                  <Text style={styles.eventIcon}>{categoryEmojis[event.category]}</Text>
                </View>
                <View style={styles.eventInfo}>
                  <Text style={[styles.eventTitle, { color: theme.text }]}>{event.title}</Text>
                  <Text style={[styles.eventTime, { color: theme.subtext }]}>{event.datetime}</Text>
                </View>
                <View style={[styles.eventBadge, { backgroundColor: theme.accentLight }]}>
                  <Text style={[styles.eventBadgeText, { color: theme.accent }]}>👥 {event.participantsCount}</Text>
                </View>
              </TouchableOpacity>
            ))
          )}
        </View>

        <View
          style={[styles.section, { backgroundColor: theme.card }]}
          onLayout={event => { reviewsSectionY.current = event.nativeEvent.layout.y; }}
        >
          <Text style={[styles.sectionTitle, { color: theme.subtext }]}>Отзывы</Text>
          {profileReviews.length === 0 ? (
            <View style={styles.emptyEvents}>
              <Text style={[styles.emptyEventsText, { color: theme.subtext }]}>Отзывов пока нет</Text>
            </View>
          ) : (
            profileReviews.map((review, i) => (
              <View key={review.id} style={[styles.reviewRow, { borderTopColor: theme.border }, i === 0 && { borderTopWidth: 0 }]}>
                <AvatarImage value={review.fromAvatar} size={38} backgroundColor={theme.accentLight} textSize={22} />
                <View style={styles.reviewBody}>
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

        <View style={[styles.section, { backgroundColor: theme.card }]}>
          <Text style={[styles.sectionTitle, { color: theme.subtext }]}>Настройки</Text>
          {[
            { icon: '✎', label: 'Редактировать профиль', onPress: () => navigation.navigate('EditProfile') },
            { icon: '🔔', label: 'Уведомления', onPress: () => navigation.navigate('Notifications') },
            { icon: '👥', label: 'Друзья и заявки', onPress: () => navigation.navigate('Friends') },
            { icon: '✨', label: 'Создать ивент', onPress: () => navigation.navigate('CreateEvent') },
            ...(canModerate ? [{ icon: '!', label: 'Модерация', onPress: () => navigation.navigate('ModeratorDashboard') }] : []),
            ...(user.role === 'admin' ? [{ icon: '🔐', label: 'Управление ролями', onPress: () => navigation.navigate('AdminRoles') }] : []),
            { icon: '🌐', label: 'Язык: Русский', onPress: () => {} },
            { icon: '💜', label: 'О приложении Жолдас', onPress: () => Alert.alert('Жолдас', 'Версия 1.0\nНайди компанию в Алматы 🇰🇿') },
          ].map(item => (
            <TouchableOpacity key={item.label} style={[styles.settingRow, { borderTopColor: theme.border }]} onPress={item.onPress} activeOpacity={0.7}>
              <Text style={styles.settingIcon}>{item.icon}</Text>
              <Text style={[styles.settingLabel, { color: theme.text }]}>{item.label}</Text>
              <Text style={[styles.settingArrow, { color: theme.subtext }]}>›</Text>
            </TouchableOpacity>
          ))}
        </View>

        <TouchableOpacity style={styles.logoutBtn} onPress={handleLogout} activeOpacity={0.8}>
          <Text style={styles.logoutText}>Выйти из профиля</Text>
        </TouchableOpacity>

        <View style={{ height: 40 }} />
      </ScrollView>
    </SafeAreaView>
  );
}

const styles = StyleSheet.create({
  container: { flex: 1 },
  hero: { alignItems: 'center', paddingTop: 32, paddingBottom: 24, paddingHorizontal: 16 },
  avatar: {
    width: 90, height: 90, borderRadius: 45,
    justifyContent: 'center', alignItems: 'center',
    marginBottom: 14, borderWidth: 3,
  },
  editBadge: {
    position: 'absolute', bottom: 0, right: 0,
    width: 26, height: 26, borderRadius: 13,
    justifyContent: 'center', alignItems: 'center',
  },
  editBadgeText: { fontSize: 12, color: '#FFF', fontWeight: '700' },
  name: { fontSize: 22, fontWeight: '800', marginBottom: 4 },
  username: { fontSize: 14, marginBottom: 8 },
  bio: { fontSize: 14, textAlign: 'center', marginBottom: 12, lineHeight: 20 },
  stars: { flexDirection: 'row', alignItems: 'center', gap: 2, marginBottom: 4 },
  star: { fontSize: 22, color: '#DDD' },
  starFilled: { color: '#F5A623' },
  ratingValue: { fontSize: 16, fontWeight: '700', marginLeft: 6 },
  reviews: { fontSize: 13, marginBottom: 4 },
  since: { fontSize: 12, marginTop: 4, marginBottom: 16 },
  editBtn: {
    borderWidth: 1.5, borderRadius: 20,
    paddingHorizontal: 20, paddingVertical: 8,
  },
  editBtnText: { fontSize: 14, fontWeight: '600' },
  statsRow: {
    flexDirection: 'row', marginHorizontal: 16, marginBottom: 16,
    borderRadius: 16, overflow: 'hidden',
    shadowColor: '#5B4FCF', shadowOffset: { width: 0, height: 2 },
    shadowOpacity: 0.07, shadowRadius: 8, elevation: 2,
  },
  statItem: { flex: 1, alignItems: 'center', paddingVertical: 18 },
  statValue: { fontSize: 22, fontWeight: '800' },
  statLabel: { fontSize: 11, marginTop: 2 },
  section: {
    marginHorizontal: 16, marginBottom: 12,
    borderRadius: 16, overflow: 'hidden',
    shadowColor: '#5B4FCF', shadowOffset: { width: 0, height: 2 },
    shadowOpacity: 0.07, shadowRadius: 8, elevation: 2,
  },
  sectionTitle: {
    fontSize: 13, fontWeight: '700',
    textTransform: 'uppercase', letterSpacing: 0.8,
    paddingHorizontal: 16, paddingTop: 14, paddingBottom: 8,
  },
  emptyEvents: { paddingHorizontal: 16, paddingBottom: 16 },
  emptyEventsText: { fontSize: 13, textAlign: 'center' },
  eventRow: {
    flexDirection: 'row', alignItems: 'center',
    paddingHorizontal: 16, paddingVertical: 12, borderTopWidth: 1,
  },
  eventIconWrap: {
    width: 40, height: 40, borderRadius: 12,
    justifyContent: 'center', alignItems: 'center', marginRight: 12,
  },
  eventIcon: { fontSize: 20 },
  eventInfo: { flex: 1 },
  eventTitle: { fontSize: 14, fontWeight: '600', marginBottom: 2 },
  eventTime: { fontSize: 12 },
  eventBadge: { borderRadius: 10, paddingHorizontal: 8, paddingVertical: 4 },
  eventBadgeText: { fontSize: 12, fontWeight: '600' },
  reviewRow: {
    flexDirection: 'row',
    gap: 12,
    alignItems: 'flex-start',
    paddingHorizontal: 16,
    paddingVertical: 12,
    borderTopWidth: 1,
  },
  reviewBody: { flex: 1 },
  reviewHeader: { flexDirection: 'row', justifyContent: 'space-between', gap: 8, marginBottom: 4 },
  reviewFrom: { fontSize: 14, fontWeight: '700' },
  reviewStars: { fontSize: 12, color: '#F5A623' },
  reviewText: { fontSize: 13, lineHeight: 18 },
  settingRow: {
    flexDirection: 'row', alignItems: 'center',
    paddingHorizontal: 16, paddingVertical: 14, borderTopWidth: 1,
  },
  settingIcon: { fontSize: 18, marginRight: 14 },
  settingLabel: { flex: 1, fontSize: 15 },
  settingArrow: { fontSize: 20 },
  logoutBtn: {
    marginHorizontal: 16, marginTop: 8, paddingVertical: 14,
    borderRadius: 14, backgroundColor: '#FFF1F1', alignItems: 'center',
    borderWidth: 1.5, borderColor: '#FFD0D0',
  },
  logoutText: { fontSize: 15, fontWeight: '700', color: '#FF4D4D' },
});
