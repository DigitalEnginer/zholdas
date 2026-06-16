import React from 'react';
import {
  View, Text, StyleSheet, ScrollView,
  TouchableOpacity, SafeAreaView, Alert, Platform, Modal,
} from 'react-native';
import { useNavigation } from '@react-navigation/native';
import { NativeStackNavigationProp } from '@react-navigation/native-stack';
import { RootStackParamList } from '../types';
import { useAuth } from '../context/AuthContext';
import { useEvents } from '../context/EventsContext';
import { useTheme } from '../context/ThemeContext';
import { useLanguage } from '../context/LanguageContext';
import { categoryEmojis } from '../data/mockEvents';
import AvatarImage from '../components/AvatarImage';
import { supabase } from '../lib/supabase';
import { isSuperAdmin } from '../lib/adminAccess';

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
        <Text key={i} style={[styles.star, { color: theme.border }, i <= Math.round(rating) && styles.starFilled]}>★</Text>
      ))}
      {rating > 0 && <Text style={[styles.ratingValue, { color: theme.text }]}>{rating.toFixed(1)}</Text>}
    </View>
  );
}

function ChevronRight({ color }: { color: string }) {
  return (
    <View
      style={{
        width: 7,
        height: 7,
        borderTopWidth: 1.5,
        borderRightWidth: 1.5,
        borderColor: color,
        transform: [{ rotate: '45deg' }],
        marginRight: 4,
      }}
    />
  );
}

export default function ProfileScreen() {
  const navigation = useNavigation<Nav>();
  const { user, logout, refreshProfile } = useAuth();
  const { events, isJoined } = useEvents();
  const { theme, isDark, themeMode, setThemeMode } = useTheme();
  const { t, locale, setLocale } = useLanguage();
  const scrollRef = React.useRef<ScrollView>(null);
  const eventsSectionY = React.useRef(0);
  const reviewsSectionY = React.useRef(0);
  const [friendsCount, setFriendsCount] = React.useState(0);
  const [profileReviews, setProfileReviews] = React.useState<ProfileReview[]>([]);
  const [settingsPicker, setSettingsPicker] = React.useState<'theme' | 'language' | null>(null);

  const myEvents = user ? events.filter(e => isJoined(e.id, user.id)) : [];

  React.useEffect(() => {
    loadProfileStats();
  }, [user?.id]);

  async function loadProfileStats() {
    if (!user) return;

    try {
      await refreshProfile();
    } catch (err) {
      console.warn('Failed to refresh profile:', err);
    }

    const { data: friendsData } = await supabase
      .from('friend_requests')
      .select('id')
      .eq('status', 'accepted')
      .or(`from_user_id.eq.${user.id},to_user_id.eq.${user.id}`);

    setFriendsCount(friendsData?.length ?? 0);
    setProfileReviews([]);
  }

  function handleLogout() {
    if (Platform.OS === 'web') {
      const confirmed = typeof window === 'undefined' ? true : window.confirm(t('logoutPrompt'));
      if (confirmed) logout();
      return;
    }

    Alert.alert(t('logoutPrompt'), t('logoutText'), [
      { text: t('cancel'), style: 'cancel' },
      { text: t('logoutBtnText'), style: 'destructive', onPress: logout },
    ]);
  }

  if (!user) return null;

  const canModerate = user.role === 'moderator' || user.role === 'admin';
  const cardShadow = {
    shadowColor: isDark ? '#000' : '#0F172A',
    shadowOpacity: isDark ? 0.35 : 0.04,
  };

  const stats = [
    {
      label: t('eventsLabel'),
      value: String(myEvents.length),
      onPress: () => scrollRef.current?.scrollTo({ y: eventsSectionY.current, animated: true }),
    },
    {
      label: t('friendsLabel'),
      value: String(friendsCount),
      onPress: () => navigation.navigate('Friends'),
    },
  ];

  const themeTitle = themeMode === 'system'
    ? t('themeSystem')
    : themeMode === 'dark'
      ? t('themeDark')
      : t('themeLight');
  const languageTitle = locale === 'kk' ? t('languageKazakh') : t('languageRussian');

  const pickerTitle = settingsPicker === 'theme' ? t('chooseTheme') : t('chooseLanguage');
  const pickerOptions = settingsPicker === 'theme'
    ? [
      { key: 'system', label: t('themeSystem'), onPress: () => setThemeMode('system'), active: themeMode === 'system' },
      { key: 'light', label: t('themeLight'), onPress: () => setThemeMode('light'), active: themeMode === 'light' },
      { key: 'dark', label: t('themeDark'), onPress: () => setThemeMode('dark'), active: themeMode === 'dark' },
    ]
    : [
      { key: 'ru', label: t('languageRussian'), onPress: () => setLocale('ru'), active: locale === 'ru' },
      { key: 'kk', label: t('languageKazakh'), onPress: () => setLocale('kk'), active: locale === 'kk' },
    ];

  const settings = [
    { color: '#6366F1', label: t('settingEditProfile'), onPress: () => navigation.navigate('EditProfile') },
    { color: '#F59E0B', label: t('settingNotifications'), onPress: () => navigation.navigate('Notifications') },
    { color: '#EC4899', label: t('settingFriends'), onPress: () => navigation.navigate('Friends') },
    { color: '#10B981', label: t('settingCreateEvent'), onPress: () => navigation.navigate('CreateEvent') },
    ...(isSuperAdmin(user) ? [{ color: '#EF4444', label: t('adminPanel'), onPress: () => navigation.navigate('AdminDashboard') }] : []),
    ...(canModerate ? [{ color: '#8B5CF6', label: t('moderationPanel'), onPress: () => navigation.navigate('ModeratorDashboard') }] : []),
    ...(user.role === 'admin' ? [{ color: '#3B82F6', label: t('manageRoles'), onPress: () => navigation.navigate('AdminRoles') }] : []),
    { color: '#8B5CF6', label: `${t('settingTheme')}${themeTitle}`, onPress: () => setSettingsPicker('theme') },
    { color: '#64748B', label: `${t('settingLanguageTitle')}: ${languageTitle}`, onPress: () => setSettingsPicker('language') },
    { color: '#D946EF', label: t('settingAbout'), onPress: () => Alert.alert('Жолдас', t('settingAboutAlert')) },
  ];

  return (
    <SafeAreaView style={[styles.container, { backgroundColor: theme.bg }]}>
      <ScrollView ref={scrollRef} showsVerticalScrollIndicator={false} contentContainerStyle={styles.content}>
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
          <Text style={[styles.since, { color: theme.subtext }]}>{t('joinedSince')} {user.joinedAt}</Text>

          <TouchableOpacity
            style={[styles.editBtn, { borderColor: theme.accent }]}
            onPress={() => navigation.navigate('EditProfile')}
            activeOpacity={0.8}
          >
            <Text style={[styles.editBtnText, { color: theme.accent }]}>✎ {t('editProfileBtn')}</Text>
          </TouchableOpacity>
        </View>

        <View style={styles.statsRowContainer}>
          {stats.map((stat) => (
            <TouchableOpacity
              key={stat.label}
              style={[
                styles.statTile,
                {
                  backgroundColor: theme.card,
                  borderColor: theme.border,
                  ...cardShadow,
                },
              ]}
              onPress={stat.onPress}
              activeOpacity={0.75}
            >
              <Text style={[styles.statValue, { color: theme.accent }]}>{stat.value}</Text>
              <Text style={[styles.statLabel, { color: theme.subtext }]}>{stat.label}</Text>
            </TouchableOpacity>
          ))}
        </View>

        <View
          style={[
            styles.section,
            { backgroundColor: theme.card, borderColor: theme.border, ...cardShadow },
          ]}
          onLayout={event => { eventsSectionY.current = event.nativeEvent.layout.y; }}
        >
          <Text style={[styles.sectionTitle, { color: theme.subtext }]}>{t('myEventsSection')}</Text>
          {myEvents.length === 0 ? (
            <View style={[styles.emptyEvents, { backgroundColor: theme.inputBg, borderColor: theme.border }]}>
              <Text style={[styles.emptyEventsIcon, { color: theme.subtext }]}>✨</Text>
              <Text style={[styles.emptyEventsText, { color: theme.subtext }]}>{t('emptyEventsMsg')}</Text>
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
                <View style={[styles.eventBadge, { backgroundColor: theme.accentLight, borderColor: theme.border, borderWidth: 1 }]}>
                  <Text style={[styles.eventBadgeText, { color: theme.accent }]}>{event.participantsCount} {t('personCount')}</Text>
                </View>
              </TouchableOpacity>
            ))
          )}
        </View>



        <View style={[styles.section, { backgroundColor: theme.card, borderColor: theme.border, ...cardShadow }]}>
          <Text style={[styles.sectionTitle, { color: theme.subtext }]}>{t('settingsSectionTitle')}</Text>
          {settings.map(item => (
            <TouchableOpacity key={item.label} style={[styles.settingRow, { borderTopColor: theme.border }]} onPress={item.onPress} activeOpacity={0.7}>
              <View style={[styles.settingDot, { backgroundColor: item.color }]} />
              <Text style={[styles.settingLabel, { color: theme.text }]}>{item.label}</Text>
              <ChevronRight color={theme.subtext} />
            </TouchableOpacity>
          ))}
        </View>

        <TouchableOpacity
          style={[
            styles.logoutBtn,
            {
              backgroundColor: isDark ? 'rgba(239, 68, 68, 0.12)' : '#FFF1F1',
              borderColor: isDark ? 'rgba(239, 68, 68, 0.25)' : '#FFD0D0',
            },
          ]}
          onPress={handleLogout}
          activeOpacity={0.8}
        >
          <Text style={styles.logoutText}>{t('logoutBtnText')}</Text>
        </TouchableOpacity>

        <View style={{ height: 40 }} />
      </ScrollView>

      <Modal
        visible={settingsPicker !== null}
        animationType="fade"
        transparent
        onRequestClose={() => setSettingsPicker(null)}
      >
        <TouchableOpacity
          style={styles.modalOverlay}
          activeOpacity={1}
          onPress={() => setSettingsPicker(null)}
        >
          <TouchableOpacity
            activeOpacity={1}
            style={[styles.pickerSheet, { backgroundColor: theme.card, borderColor: theme.border }]}
          >
            <View style={styles.pickerHeader}>
              <Text style={[styles.pickerTitle, { color: theme.text }]}>{pickerTitle}</Text>
              <TouchableOpacity
                style={[styles.pickerClose, { backgroundColor: theme.inputBg }]}
                onPress={() => setSettingsPicker(null)}
                activeOpacity={0.75}
              >
                <Text style={[styles.pickerCloseText, { color: theme.text }]}>×</Text>
              </TouchableOpacity>
            </View>

            {pickerOptions.map(option => (
              <TouchableOpacity
                key={option.key}
                style={[styles.pickerOption, { borderTopColor: theme.border }]}
                onPress={() => {
                  option.onPress();
                  setSettingsPicker(null);
                }}
                activeOpacity={0.75}
              >
                <Text style={[styles.pickerOptionText, { color: theme.text }]}>{option.label}</Text>
                <View
                  style={[
                    styles.pickerCheck,
                    {
                      borderColor: option.active ? theme.accent : theme.border,
                      backgroundColor: option.active ? theme.accent : 'transparent',
                    },
                  ]}
                >
                  {option.active ? <Text style={styles.pickerCheckText}>✓</Text> : null}
                </View>
              </TouchableOpacity>
            ))}
          </TouchableOpacity>
        </TouchableOpacity>
      </Modal>
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
  star: { fontSize: 22 },
  starFilled: { color: '#F5A623' },
  ratingValue: { fontSize: 16, fontWeight: '700', marginLeft: 6 },
  reviews: { fontSize: 13, marginBottom: 4 },
  since: { fontSize: 12, marginTop: 4, marginBottom: 16 },
  editBtn: {
    borderWidth: 1.5, borderRadius: 20,
    paddingHorizontal: 20, paddingVertical: 8,
  },
  editBtnText: { fontSize: 14, fontWeight: '600' },
  statsRowContainer: {
    flexDirection: 'row',
    gap: 12,
    marginHorizontal: 16,
    marginBottom: 20,
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
    marginHorizontal: 16, marginBottom: 12,
    borderRadius: 16, overflow: 'hidden',
    borderWidth: 1,
    shadowOffset: { width: 0, height: 6 },
    shadowRadius: 12,
    elevation: 2,
  },
  sectionTitle: {
    fontSize: 13, fontWeight: '700',
    textTransform: 'uppercase',
    paddingHorizontal: 16, paddingTop: 14, paddingBottom: 8,
  },
  emptyEvents: {
    margin: 16,
    marginTop: 8,
    paddingHorizontal: 16,
    paddingVertical: 18,
    borderWidth: 1,
    borderStyle: 'dashed',
    borderRadius: 14,
    alignItems: 'center',
  },
  emptyEventsIcon: { fontSize: 24, marginBottom: 8 },
  emptyEventsText: { fontSize: 13, textAlign: 'center', fontWeight: '700' },
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
  eventBadgeText: { fontSize: 11, fontWeight: '600' },
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
  settingDot: {
    width: 8,
    height: 8,
    borderRadius: 4,
    marginRight: 14,
  },
  settingLabel: { flex: 1, fontSize: 15 },
  modalOverlay: {
    flex: 1,
    justifyContent: 'flex-end',
    backgroundColor: 'rgba(15, 23, 42, 0.45)',
    paddingHorizontal: 12,
    paddingBottom: 12,
  },
  pickerSheet: {
    borderRadius: 24,
    borderWidth: 1,
    overflow: 'hidden',
    shadowColor: '#000',
    shadowOffset: { width: 0, height: -8 },
    shadowOpacity: 0.18,
    shadowRadius: 24,
    elevation: 12,
  },
  pickerHeader: {
    minHeight: 64,
    paddingLeft: 20,
    paddingRight: 14,
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
  },
  pickerTitle: {
    fontSize: 18,
    fontWeight: '800',
  },
  pickerClose: {
    width: 36,
    height: 36,
    borderRadius: 18,
    alignItems: 'center',
    justifyContent: 'center',
  },
  pickerCloseText: {
    fontSize: 26,
    lineHeight: 30,
    fontWeight: '600',
  },
  pickerOption: {
    minHeight: 58,
    paddingHorizontal: 20,
    flexDirection: 'row',
    alignItems: 'center',
    borderTopWidth: 1,
  },
  pickerOptionText: {
    flex: 1,
    fontSize: 16,
    fontWeight: '700',
  },
  pickerCheck: {
    width: 24,
    height: 24,
    borderRadius: 12,
    borderWidth: 1.5,
    alignItems: 'center',
    justifyContent: 'center',
  },
  pickerCheckText: {
    color: '#FFF',
    fontSize: 14,
    fontWeight: '900',
  },
  logoutBtn: {
    marginHorizontal: 16, marginTop: 8, paddingVertical: 14,
    borderRadius: 14, alignItems: 'center',
    borderWidth: 1.5,
  },
  logoutText: { fontSize: 15, fontWeight: '700', color: '#FF4D4D' },
});
