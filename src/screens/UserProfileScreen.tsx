import React, { useState, useEffect } from 'react';
import {
  View, Text, StyleSheet, ScrollView,
  SafeAreaView, ActivityIndicator, TouchableOpacity,
  Alert, TextInput,
} from 'react-native';
import { useRoute, RouteProp } from '@react-navigation/native';
import { RootStackParamList } from '../types';
import { useTheme } from '../context/ThemeContext';
import { useAuth } from '../context/AuthContext';
import { supabase } from '../lib/supabase';
import AvatarImage from '../components/AvatarImage';
import { useLanguage } from '../context/LanguageContext';

type ProfileRoute = RouteProp<RootStackParamList, 'UserProfile'>;

interface ProfileData {
  name: string;
  avatar: string;
  bio: string;
  role: 'user' | 'moderator' | 'admin';
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
  const { t } = useLanguage();

  const [profile, setProfile] = useState<ProfileData | null>(null);
  const [events, setEvents] = useState<EventItem[]>([]);
  const [reviews, setReviews] = useState<ReviewItem[]>([]);
  const [loading, setLoading] = useState(true);
  const [isBanned, setIsBanned] = useState(false);
  const [banLoading, setBanLoading] = useState(false);
  const [reportLoading, setReportLoading] = useState(false);
  const [friendStatus, setFriendStatus] = useState<'none' | 'outgoing' | 'incoming' | 'accepted'>('none');
  const [isBlocked, setIsBlocked] = useState(false);
  const [reasonSheet, setReasonSheet] = useState<'ban' | 'report' | null>(null);
  const [selectedReportReason, setSelectedReportReason] = useState('');
  const [reportDetails, setReportDetails] = useState('');

  const isOwnProfile = currentUser?.id === userId;
  const canModerate = currentUser?.role === 'moderator' || currentUser?.role === 'admin';

  useEffect(() => {
    loadProfile();
  }, [userId, currentUser?.id, currentUser?.role]);

  async function loadProfile() {
    const [
      { data: profileData },
      { data: eventsData },
      { data: banData },
      { data: outgoingRequest },
      { data: incomingRequest },
      { data: blockData },
    ] = await Promise.all([
      supabase.from('profiles').select('*').eq('id', userId).single(),
      supabase.from('events').select('id, title, datetime, participants_count, category')
        .eq('created_by', userId).order('created_at', { ascending: false }).limit(5),
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
        role: profileData.role ?? 'user',
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

    setReviews([]);

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

  async function sendFriendRequest() {
    if (!currentUser || isOwnProfile || isBlocked) return;

    const { error } = await supabase.from('friend_requests').insert({
      from_user_id: currentUser.id,
      to_user_id: userId,
    });

    if (error) {
      Alert.alert(t('friendRequestSendError'), error.message);
      return;
    }

    setFriendStatus('outgoing');
  }

  async function cancelFriendRequest() {
    if (!currentUser || isOwnProfile) return;

    const { error } = await supabase
      .from('friend_requests')
      .delete()
      .eq('from_user_id', currentUser.id)
      .eq('to_user_id', userId);

    if (error) {
      Alert.alert(t('error'), error.message);
      return;
    }

    setFriendStatus('none');
  }

  async function removeFriendRequest() {
    if (!currentUser || isOwnProfile) return;

    // Remove accepted friendship from both directions
    await supabase.from('friend_requests').delete()
      .eq('from_user_id', currentUser.id).eq('to_user_id', userId);
    await supabase.from('friend_requests').delete()
      .eq('from_user_id', userId).eq('to_user_id', currentUser.id);

    setFriendStatus('none');
  }

  async function acceptFriendRequest() {
    if (!currentUser || isOwnProfile) return;

    const { error } = await supabase
      .from('friend_requests')
      .update({ status: 'accepted' })
      .eq('from_user_id', userId)
      .eq('to_user_id', currentUser.id);

    if (error) {
      Alert.alert(t('friendRequestAcceptError'), error.message);
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
        Alert.alert(t('unblockError'), error.message);
        return;
      }
      setIsBlocked(false);
      return;
    }

    Alert.alert(t('blockUserTitle'), t('blockUserText'), [
      { text: t('cancel'), style: 'cancel' },
      {
        text: t('blockUserAction'),
        style: 'destructive',
        onPress: async () => {
          const { error } = await supabase.from('blocks').insert({
            blocker_id: currentUser.id,
            blocked_id: userId,
          });

          if (error) {
            Alert.alert(t('blockError'), error.message);
            return;
          }

          setIsBlocked(true);
          setFriendStatus('none');
        },
      },
    ]);
  }

  async function banUser() {
    if (!currentUser || !canModerate || isOwnProfile) return;
    setReasonSheet('ban');
  }

  function closeReasonSheet() {
    setReasonSheet(null);
    setSelectedReportReason('');
    setReportDetails('');
  }

  async function banWithReason(reason: string) {
    if (!currentUser || !canModerate || isOwnProfile) return;

    Alert.alert(
      t('banTitle') ?? 'Заблокировать пользователя?',
      `${displayName}\n\nПричина: ${reason}`,
      [
        { text: t('cancel') ?? 'Отмена', style: 'cancel' },
        {
          text: t('ban') ?? 'Заблокировать',
          style: 'destructive',
          onPress: async () => {
            closeReasonSheet();
            setBanLoading(true);
            const { error } = await supabase.from('user_bans').insert({
              user_id: userId,
              banned_by: currentUser.id,
              reason,
            });
            setBanLoading(false);

            if (error) {
              Alert.alert(t('banError'), error.message);
              return;
            }

            setIsBanned(true);
          }
        }
      ]
    );
  }

  async function reportUser() {
    if (!currentUser || isOwnProfile) return;
    setSelectedReportReason('');
    setReportDetails('');
    setReasonSheet('report');
  }

  async function reportWithReason(reason: string, detailsText = '') {
    if (!currentUser || isOwnProfile) return;

    const trimmedDetails = detailsText.trim();
    const isOtherReason = reason === t('otherViolationReason');
    if (isOtherReason && trimmedDetails.length < 3) {
      Alert.alert(t('reportSendError'), t('reportDetailsRequired'));
      return;
    }

    closeReasonSheet();
    setReportLoading(true);
    const { error } = await supabase.from('reports').insert({
      reporter_id: currentUser.id,
      reported_user_id: userId,
      reason,
      status: 'pending',
      details: [
        'type:profile',
        `category:${reason}`,
        `description:${trimmedDetails.replace(/\n/g, ' ').slice(0, 1000)}`,
        `reported_user_name:${displayName}`,
        `reporter_name:${currentUser.name}`,
      ].join('\n'),
    });
    setReportLoading(false);

    if (error) {
      const isDuplicateOrRateLimited = error.message.toLowerCase().includes('row-level security')
        || error.message.toLowerCase().includes('violates')
        || error.message.toLowerCase().includes('duplicate');
      Alert.alert(
        t('reportSendError'),
        isDuplicateOrRateLimited ? t('reportAlreadySentText') : error.message,
      );
      return;
    }

    Alert.alert(t('reportSentTitle'), t('reportSentText'));
  }

  async function unbanUser() {
    if (!currentUser || !canModerate || isOwnProfile) return;

    Alert.alert(t('unbanTitle'), `${displayName} ${t('unbanText')}`, [
      { text: t('cancel'), style: 'cancel' },
      {
        text: t('unban'),
        onPress: async () => {
          setBanLoading(true);
          const { error } = await supabase.from('user_bans').delete().eq('user_id', userId);
          setBanLoading(false);

          if (error) {
            Alert.alert(t('unbanError'), error.message);
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
  const canModerateTarget = !!currentUser
    && !isOwnProfile
    && (currentUser.role === 'admin' || (currentUser.role === 'moderator' && (profile?.role ?? 'user') === 'user'));
  const shouldShowBlockAction = !isOwnProfile && !!currentUser && (friendStatus === 'accepted' || isBlocked);
  const reasonOptions = reasonSheet === 'ban'
    ? [t('spamReason'), t('insultsReason'), t('unsafeReason'), t('rulesReason')]
    : [t('spamReason'), t('insultsReason'), t('unsafeReason'), t('otherViolationReason')];
  const reasonTitle = reasonSheet === 'ban' ? t('banReasonTitle') : t('reportUserTitle');
  const reasonSubtitle = reasonSheet === 'ban'
    ? `${displayName} ${t('banUserText')}`
    : `${t('reportUserPrompt')} ${displayName}?`;
  const isOtherReportReason = selectedReportReason === t('otherViolationReason');
  const canSendReport = !!selectedReportReason && (!isOtherReportReason || reportDetails.trim().length >= 3);

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
    <SafeAreaView style={[styles.container, { backgroundColor: isDark ? theme.bg : '#F5F6FA' }]}>
      <ScrollView showsVerticalScrollIndicator={false} contentContainerStyle={styles.content}>
        <View style={[
          styles.heroCard,
          {
            backgroundColor: theme.card,
            borderColor: theme.border,
            shadowColor: shadowHex,
            shadowOpacity: isDark ? 0.28 : 0.07,
          },
        ]}>
          <View style={[styles.avatarRing, { backgroundColor: theme.accentLight, borderColor: theme.accent }]}>
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

          {/* Action Buttons Section */}
          <View style={styles.actionSection}>
            <View style={styles.mainActionsRow}>
              {!isOwnProfile && currentUser && !isBlocked && (
                <TouchableOpacity
                  style={[
                    styles.primaryActionBtn,
                    friendStatus === 'accepted'
                      ? { backgroundColor: theme.inputBg, borderColor: theme.border }
                      : { backgroundColor: theme.accent, borderColor: theme.accent }
                  ]}
                  onPress={
                    friendStatus === 'incoming' ? acceptFriendRequest
                    : friendStatus === 'none' ? sendFriendRequest
                    : friendStatus === 'outgoing' ? cancelFriendRequest
                    : friendStatus === 'accepted' ? () => Alert.alert(
                        t('removeFriend'),
                        t('removeFriend') + '?',
                        [
                          { text: t('cancel'), style: 'cancel' },
                          { text: t('friendsActionDelete'), style: 'destructive', onPress: removeFriendRequest },
                        ]
                      )
                    : undefined
                  }
                  disabled={false}
                  activeOpacity={0.8}
                >
                  <Text style={[styles.primaryActionBtnText, { color: friendStatus === 'accepted' ? theme.text : '#FFF' }]}>
                    {friendStatus === 'accepted'
                      ? t('friendAccepted')
                      : friendStatus === 'outgoing'
                        ? t('friendsActionCancel')
                        : friendStatus === 'incoming'
                          ? t('accept')
                          : t('friendsShort')}
                  </Text>
                </TouchableOpacity>
              )}
            </View>

            {/* Secondary Actions */}
            <View style={styles.secondaryActionsRow}>
              {shouldShowBlockAction && (
                <TouchableOpacity
                  style={[styles.secondaryActionBtn, { borderColor: theme.border, backgroundColor: theme.inputBg }]}
                  onPress={toggleBlock}
                  activeOpacity={0.8}
                >
                  <Text style={[styles.secondaryActionBtnText, { color: isBlocked ? theme.accent : theme.subtext }]}>
                    {isBlocked ? t('unblock') : t('block')}
                  </Text>
                </TouchableOpacity>
              )}

              {!isOwnProfile && currentUser && (
                <TouchableOpacity
                  style={[styles.secondaryActionBtn, { borderColor: theme.border, backgroundColor: theme.inputBg }]}
                  onPress={reportUser}
                  disabled={reportLoading}
                  activeOpacity={0.8}
                >
                  <Text style={[styles.secondaryActionBtnText, { color: theme.subtext }]}>{t('complaint')}</Text>
                </TouchableOpacity>
              )}

              {canModerateTarget && (
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
                    {isBanned ? t('unban') : t('ban')}
                  </Text>
                </TouchableOpacity>
              )}
            </View>
          </View>
        </View>

        <View
          style={[
            styles.statsCard,
            {
              backgroundColor: theme.card,
              borderColor: theme.border,
              shadowColor: shadowHex,
              shadowOpacity,
            },
          ]}
        >
          {[
            { label: t('eventsLabel'), value: profile?.eventsJoined ?? 0 },
            { label: t('friendsLabel'), value: profile?.friendsMade ?? 0 },
          ].map((stat, index) => (
            <View
              key={stat.label}
              style={[
                styles.statTile,
                index > 0 && { borderLeftColor: theme.border, borderLeftWidth: 1 },
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
            <Text style={[styles.sectionTitle, { color: theme.subtext }]}>{t('participantEvents')}</Text>
            {events.map((event, i) => (
              <View key={event.id} style={[styles.eventRow, { borderTopColor: theme.border }, i === 0 && { borderTopWidth: 0 }]}>
                <Text style={styles.eventIcon}>{categoryEmojis[event.category] ?? '✨'}</Text>
                <View style={{ flex: 1 }}>
                  <Text style={[styles.eventTitle, { color: theme.text }]}>{event.title}</Text>
                  <Text style={[styles.eventTime, { color: theme.subtext }]}>{event.datetime}</Text>
                </View>
                <View style={[styles.badge, { backgroundColor: theme.accentLight, borderColor: theme.border, borderWidth: 1 }]}>
                  <Text style={[styles.badgeText, { color: theme.accent }]}>{event.participantsCount} {t('personCount')}</Text>
                </View>
              </View>
            ))}
          </View>
        )}



        <View style={{ height: 40 }} />
      </ScrollView>

      {reasonSheet !== null && (
        <TouchableOpacity
          style={styles.sheetOverlay}
          activeOpacity={1}
          onPress={closeReasonSheet}
        >
          <TouchableOpacity
            activeOpacity={1}
            style={[styles.reasonSheet, { backgroundColor: theme.card, borderColor: theme.border }]}
          >
            <Text style={[styles.reasonTitle, { color: theme.text }]}>{reasonTitle}</Text>
            <Text style={[styles.reasonSubtitle, { color: theme.subtext }]}>{reasonSubtitle}</Text>

            {reasonOptions.map(reason => (
              <TouchableOpacity
                key={reason}
                style={[
                  styles.reasonOption,
                  {
                    borderTopColor: theme.border,
                    backgroundColor: selectedReportReason === reason
                      ? theme.accentLight
                      : 'transparent',
                  },
                ]}
                onPress={() => {
                  if (reasonSheet === 'ban') {
                    banWithReason(reason);
                  } else {
                    setSelectedReportReason(reason);
                  }
                }}
                activeOpacity={0.75}
              >
                <View style={styles.reasonOptionContent}>
                  <Text
                    style={[
                      styles.reasonOptionText,
                      { color: reasonSheet === 'ban' ? theme.danger : theme.text },
                    ]}
                  >
                    {reason}
                  </Text>
                  {reasonSheet === 'report' && selectedReportReason === reason ? (
                    <Text style={[styles.reasonCheck, { color: theme.accent }]}>✓</Text>
                  ) : null}
                </View>
              </TouchableOpacity>
            ))}

            {reasonSheet === 'report' && selectedReportReason ? (
              <View style={styles.reportDetailsBlock}>
                <Text style={[styles.reportDetailsLabel, { color: theme.text }]}>
                  {isOtherReportReason ? t('reportDetailsRequired') : t('reportDetailsTitle')}
                </Text>
                <TextInput
                  value={reportDetails}
                  onChangeText={setReportDetails}
                  placeholder={t('reportDetailsPlaceholder')}
                  placeholderTextColor={theme.subtext}
                  multiline
                  maxLength={1000}
                  textAlignVertical="top"
                  style={[
                    styles.reportDetailsInput,
                    {
                      color: theme.text,
                      backgroundColor: theme.inputBg,
                      borderColor: isOtherReportReason && reportDetails.trim().length < 3
                        ? theme.danger
                        : theme.border,
                    },
                  ]}
                />
                <TouchableOpacity
                  style={[
                    styles.reasonSubmit,
                    {
                      backgroundColor: canSendReport ? theme.accent : theme.inputBg,
                      borderColor: canSendReport ? theme.accent : theme.border,
                    },
                  ]}
                  onPress={() => reportWithReason(selectedReportReason, reportDetails)}
                  disabled={!canSendReport || reportLoading}
                  activeOpacity={0.75}
                >
                  <Text style={[styles.reasonSubmitText, { color: canSendReport ? '#FFF' : theme.subtext }]}>
                    {reportLoading ? t('loading') : t('send')}
                  </Text>
                </TouchableOpacity>
              </View>
            ) : null}

            <TouchableOpacity
              style={[styles.reasonCancel, { backgroundColor: theme.inputBg }]}
              onPress={closeReasonSheet}
              activeOpacity={0.75}
            >
              <Text style={[styles.reasonCancelText, { color: theme.subtext }]}>{t('cancel')}</Text>
            </TouchableOpacity>
          </TouchableOpacity>
        </TouchableOpacity>
      )}
    </SafeAreaView>
  );
}

const styles = StyleSheet.create({
  container: { flex: 1 },
  content: {
    width: '100%',
    maxWidth: 430,
    alignSelf: 'center',
    paddingHorizontal: 16,
    paddingTop: 18,
    paddingBottom: 34,
  },
  heroCard: {
    alignItems: 'center',
    paddingTop: 28,
    paddingBottom: 20,
    paddingHorizontal: 18,
    borderRadius: 30,
    borderWidth: 1,
    shadowOffset: { width: 0, height: 14 },
    shadowRadius: 28,
    elevation: 4,
  },
  avatarRing: {
    width: 102,
    height: 102,
    borderRadius: 51,
    justifyContent: 'center',
    alignItems: 'center',
    marginBottom: 16,
    borderWidth: 3,
  },
  name: { fontSize: 26, fontWeight: '900', marginBottom: 4, letterSpacing: 0 },
  bio: { fontSize: 15, marginBottom: 14, textAlign: 'center', paddingHorizontal: 18, lineHeight: 21 },
  ratingRow: { flexDirection: 'row', alignItems: 'center', gap: 2, marginBottom: 18 },
  star: { fontSize: 20, color: '#DDD' },
  starFilled: { color: '#F5A623' },
  ratingVal: { fontSize: 16, fontWeight: '700', marginLeft: 6 },
  actionSection: { width: '100%', gap: 10, marginTop: 4 },
  mainActionsRow: { flexDirection: 'row', gap: 10, justifyContent: 'center' },
  primaryActionBtn: {
    flex: 1,
    borderWidth: 1.5,
    borderRadius: 999,
    minHeight: 52,
    paddingHorizontal: 16,
    alignItems: 'center',
    justifyContent: 'center',
  },
  primaryActionBtnText: { fontSize: 16, fontWeight: '800' },
  secondaryActionsRow: { flexDirection: 'row', gap: 8, justifyContent: 'center', marginTop: 4 },
  secondaryActionBtn: {
    flex: 1,
    borderWidth: 1,
    borderRadius: 999,
    minHeight: 42,
    paddingHorizontal: 10,
    alignItems: 'center',
    justifyContent: 'center',
  },
  secondaryActionBtnText: { fontSize: 13, fontWeight: '800' },
  statsCard: {
    flexDirection: 'row',
    marginTop: 14,
    marginBottom: 14,
    borderRadius: 22,
    borderWidth: 1,
    overflow: 'hidden',
    shadowOffset: { width: 0, height: 8 },
    shadowRadius: 18,
    elevation: 2,
  },
  statTile: {
    flex: 1,
    alignItems: 'center',
    justifyContent: 'center',
    paddingVertical: 18,
    paddingHorizontal: 4,
  },
  statValue: { fontSize: 24, fontWeight: '900' },
  statLabel: { fontSize: 12, marginTop: 4, fontWeight: '600' },
  section: {
    marginBottom: 14,
    borderRadius: 22,
    overflow: 'hidden',
    borderWidth: 1,
    shadowOffset: { width: 0, height: 8 },
    shadowRadius: 18,
    elevation: 2,
  },
  sectionTitle: {
    fontSize: 13,
    fontWeight: '800',
    textTransform: 'uppercase',
    paddingHorizontal: 18,
    paddingTop: 16,
    paddingBottom: 10,
  },
  eventRow: {
    flexDirection: 'row', alignItems: 'center', gap: 12,
    paddingHorizontal: 18, paddingVertical: 14, borderTopWidth: 1,
  },
  eventIcon: { fontSize: 24 },
  eventTitle: { fontSize: 15, fontWeight: '800' },
  eventTime: { fontSize: 13, marginTop: 3 },
  badge: { borderRadius: 999, paddingHorizontal: 10, paddingVertical: 5 },
  badgeText: { fontSize: 12, fontWeight: '800' },
  reviewRow: {
    flexDirection: 'row', gap: 12, alignItems: 'flex-start',
    paddingHorizontal: 18, paddingVertical: 14, borderTopWidth: 1,
  },
  reviewHeader: { flexDirection: 'row', justifyContent: 'space-between', marginBottom: 4 },
  reviewFrom: { fontSize: 15, fontWeight: '800' },
  reviewStars: { fontSize: 12, color: '#F5A623' },
  reviewText: { fontSize: 13, lineHeight: 18 },
  emptyReviews: {
    margin: 18,
    marginTop: 8,
    paddingVertical: 22,
    paddingHorizontal: 18,
    borderWidth: 1,
    borderStyle: 'dashed',
    borderRadius: 18,
    alignItems: 'center',
  },
  emptyReviewsIcon: { fontSize: 24, color: '#98A2B3', marginBottom: 8 },
  emptyReviewsText: { fontSize: 14, fontWeight: '700', textAlign: 'center' },
  sheetOverlay: {
    position: 'absolute',
    top: 0,
    right: 0,
    bottom: 0,
    left: 0,
    justifyContent: 'flex-end',
    backgroundColor: 'rgba(15, 23, 42, 0.45)',
    padding: 14,
    zIndex: 100,
    elevation: 100,
  },
  reasonSheet: {
    width: '100%',
    maxWidth: 430,
    alignSelf: 'center',
    borderRadius: 28,
    borderWidth: 1,
    paddingTop: 18,
    paddingHorizontal: 14,
    paddingBottom: 14,
    shadowColor: '#000',
    shadowOffset: { width: 0, height: -10 },
    shadowOpacity: 0.18,
    shadowRadius: 24,
    elevation: 12,
  },
  reasonTitle: {
    fontSize: 20,
    fontWeight: '900',
    textAlign: 'center',
    marginBottom: 6,
  },
  reasonSubtitle: {
    fontSize: 14,
    lineHeight: 20,
    textAlign: 'center',
    marginBottom: 12,
    paddingHorizontal: 8,
  },
  reasonOption: {
    minHeight: 54,
    alignItems: 'center',
    justifyContent: 'center',
    borderTopWidth: 1,
  },
  reasonOptionContent: {
    width: '100%',
    minHeight: 54,
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    paddingHorizontal: 12,
  },
  reasonOptionText: {
    fontSize: 16,
    fontWeight: '800',
  },
  reasonCheck: {
    fontSize: 18,
    fontWeight: '900',
  },
  reportDetailsBlock: {
    gap: 10,
    paddingTop: 14,
    borderTopWidth: 1,
    borderTopColor: 'rgba(148, 163, 184, 0.22)',
  },
  reportDetailsLabel: {
    fontSize: 14,
    fontWeight: '800',
    paddingHorizontal: 4,
  },
  reportDetailsInput: {
    minHeight: 116,
    borderWidth: 1,
    borderRadius: 18,
    paddingHorizontal: 14,
    paddingTop: 12,
    paddingBottom: 12,
    fontSize: 15,
    lineHeight: 21,
    fontWeight: '600',
  },
  reasonSubmit: {
    minHeight: 50,
    borderRadius: 18,
    borderWidth: 1,
    alignItems: 'center',
    justifyContent: 'center',
  },
  reasonSubmitText: {
    fontSize: 16,
    fontWeight: '900',
  },
  reasonCancel: {
    minHeight: 50,
    borderRadius: 18,
    alignItems: 'center',
    justifyContent: 'center',
    marginTop: 10,
  },
  reasonCancelText: {
    fontSize: 16,
    fontWeight: '800',
  },
});
