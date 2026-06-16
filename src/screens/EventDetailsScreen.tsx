import React, { useState, useEffect } from 'react';
import {
  Alert, Platform, SafeAreaView, ScrollView, Share,
  StyleSheet, Text, TouchableOpacity, View, Image,
} from 'react-native';
import { RouteProp, useNavigation, useRoute } from '@react-navigation/native';
import { NativeStackNavigationProp } from '@react-navigation/native-stack';
import { EventStatus, RootStackParamList } from '../types';
import { useAuth } from '../context/AuthContext';
import { useEvents } from '../context/EventsContext';
import { useTheme } from '../context/ThemeContext';
import { categoryEmojis, eventStatusColors } from '../data/mockEvents';
import { getDistance, openRoute, useLocation } from '../hooks/useLocation';
import AvatarImage from '../components/AvatarImage';
import { supabase } from '../lib/supabase';
import { useLanguage } from '../context/LanguageContext';

type EventDetailsRoute = RouteProp<RootStackParamList, 'EventDetails'>;
type Nav = NativeStackNavigationProp<RootStackParamList>;

export default function EventDetailsScreen() {
  const route = useRoute<EventDetailsRoute>();
  const navigation = useNavigation<Nav>();
  const { eventId } = route.params;
  const { user } = useAuth();
  const { theme, isDark } = useTheme();
  const { t, locale } = useLanguage();
  const { events, joinEvent, leaveEvent, isJoined, updateEventStatus } = useEvents();
  const userLocation = useLocation();
  const event = events.find(e => e.id === eventId);

  const [creatorProfile, setCreatorProfile] = useState<{ name: string; avatar: string } | null>(null);

  useEffect(() => {
    if (event?.createdBy) {
      supabase.from('profiles')
        .select('name, avatar')
        .eq('id', event.createdBy)
        .single()
        .then(({ data }) => {
          if (data) {
            setCreatorProfile({
              name: data.name ?? t('organizer'),
              avatar: data.avatar ?? '👤',
            });
          }
        });
    }
  }, [event?.createdBy, t]);

  if (!event) {
    return (
      <SafeAreaView style={[styles.container, { backgroundColor: theme.bg }]}>
        <Text style={[styles.empty, { color: theme.subtext }]}>{t('eventNotFound')}</Text>
      </SafeAreaView>
    );
  }

  const currentEvent = event;
  const status = currentEvent.status ?? 'active';
  const joined = !!user && isJoined(event.id, user.id);
  const canManage = !!user && (currentEvent.createdBy === user.id || user.role === 'moderator' || user.role === 'admin');
  const isActive = status === 'active';
  const statusText = t(status === 'finished' ? 'statusFinished' : status === 'cancelled' ? 'statusCancelled' : 'statusActive');
  const isFull = event.participantsCount >= event.maxParticipants;
  const spotsLeft = Math.max(0, event.maxParticipants - event.participantsCount);
  const progress = Math.min(100, Math.max(6, (event.participantsCount / event.maxParticipants) * 100));
  const resolvedLocale = locale === 'kk' ? 'kk-KZ' : 'ru-RU';
  const startsAtDate = event.startsAt ? new Date(event.startsAt) : null;
  const hasValidStartsAt = !!startsAtDate && !Number.isNaN(startsAtDate.getTime());
  const dateLine = hasValidStartsAt
    ? startsAtDate.toLocaleDateString(resolvedLocale, { weekday: 'long', day: 'numeric', month: 'long' })
    : event.datetime;
  const timeLine = hasValidStartsAt
    ? startsAtDate.toLocaleTimeString(resolvedLocale, { hour: '2-digit', minute: '2-digit' })
    : '';
  const timingText = getTimingText(startsAtDate, status, t);
  const categoryLabel = t(`filter${event.category === 'mountains' ? 'Mountains' : event.category === 'theatre' ? 'Theatre' : event.category === 'restaurant' ? 'Restaurant' : event.category === 'sport' ? 'Sport' : 'Other'}`);

  async function handleJoin() {
    if (!user) return;
    if (!joined && !isActive) {
      Alert.alert('', t('joinErrorClosed'));
      return;
    }
    if (!joined && isFull) {
      Alert.alert('', t('noSpots'));
      return;
    }

    try {
      if (joined) await leaveEvent(currentEvent.id, user.id);
      else await joinEvent(currentEvent.id, user.id);
    } catch (e: any) {
      Alert.alert(t('error'), e.message ?? t('error'));
    }
  }

  async function setStatus(nextStatus: EventStatus, reason?: string) {
    try {
      await updateEventStatus(currentEvent.id, nextStatus, reason);
    } catch (e: any) {
      Alert.alert(t('error'), e.message ?? t('error'));
    }
  }

  function cancelEvent() {
    if (Platform.OS === 'ios') {
      Alert.prompt(t('cancelReason'), t('cancelEventAction'), [
        { text: t('back'), style: 'cancel' },
        { text: t('cancelEventAction'), style: 'destructive', onPress: (reason?: string) => setStatus('cancelled', reason || t('cancelNotice')) },
      ]);
      return;
    }

    setStatus('cancelled', t('cancelNotice'));
  }

  async function shareEvent() {
    await Share.share({
      title: currentEvent.title,
      message: `${t('eventShareMessage')} "${currentEvent.title}" в Жолдас`,
    });
  }

  const shadowHex = isDark ? '#000' : '#0F172A';
  const shadowOpacity = isDark ? 0.35 : 0.05;

  return (
    <SafeAreaView style={[styles.container, { backgroundColor: theme.bg }]}>
      <ScrollView contentContainerStyle={styles.content} showsVerticalScrollIndicator={false}>
        <View style={[styles.hero, { backgroundColor: theme.card, borderColor: theme.border, shadowColor: shadowHex, shadowOpacity }]}>
          {event.imageUri ? (
            <Image source={{ uri: event.imageUri }} style={styles.heroImage} />
          ) : (
            <View style={[styles.heroFallback, { backgroundColor: isDark ? '#111827' : '#EEF2FF' }]}>
              <Text style={styles.heroFallbackEmoji}>{categoryEmojis[event.category] ?? '✨'}</Text>
            </View>
          )}
          <View style={styles.topRow}>
            <View style={[styles.categoryBadge, { backgroundColor: theme.accentLight }]}>
              <Text style={[styles.categoryText, { color: theme.accent }]}>{categoryEmojis[event.category] ?? '✨'} {categoryLabel}</Text>
            </View>
            <View style={[styles.statusBadge, { backgroundColor: `${eventStatusColors[status]}12` }]}>
              <View style={[styles.statusDot, { backgroundColor: eventStatusColors[status] }]} />
              <Text style={[styles.statusText, { color: eventStatusColors[status] }]}>
                {statusText}
              </Text>
            </View>
          </View>

          <Text style={[styles.title, { color: theme.text }]}>{event.title}</Text>
          <Text style={[styles.heroSubtitle, { color: theme.subtext }]}>{timingText}</Text>
          <View style={styles.heroStats}>
            <View style={[styles.heroStat, { backgroundColor: theme.inputBg }]}>
              <Text style={[styles.heroStatValue, { color: theme.text }]}>{spotsLeft}</Text>
              <Text style={[styles.heroStatLabel, { color: theme.subtext }]}>{t(spotsLeft === 0 ? 'noSpots' : 'spotsLeft')}</Text>
            </View>
            <View style={[styles.heroStat, { backgroundColor: theme.inputBg }]}>
              <Text style={[styles.heroStatValue, { color: theme.text }]}>{event.participantsCount}/{event.maxParticipants}</Text>
              <Text style={[styles.heroStatLabel, { color: theme.subtext }]}>{t('participants')}</Text>
            </View>
            <View style={[styles.heroStat, { backgroundColor: theme.inputBg }]}>
              <Text style={[styles.heroStatValue, { color: eventStatusColors[status] }]}>{statusText}</Text>
              <Text style={[styles.heroStatLabel, { color: theme.subtext }]}>{t('status')}</Text>
            </View>
          </View>
        </View>

        <View style={styles.detailCards}>
          {creatorProfile && (
            <TouchableOpacity
              style={[styles.detailCard, { backgroundColor: theme.card, borderColor: theme.border, shadowColor: shadowHex, shadowOpacity }]}
              onPress={() => navigation.navigate('UserProfile', {
                userId: event.createdBy!,
                userName: creatorProfile.name,
                userAvatar: creatorProfile.avatar,
              })}
              activeOpacity={0.8}
            >
              <AvatarImage value={creatorProfile.avatar} size={42} backgroundColor={theme.accentLight} textSize={22} />
              <View style={styles.detailCardText}>
                <Text style={[styles.detailCardLabel, { color: theme.subtext }]}>{t('organizer')}</Text>
                <Text style={[styles.detailCardVal, { color: theme.text }]}>{creatorProfile.name}</Text>
              </View>
            </TouchableOpacity>
          )}

          <View style={[styles.detailCard, { backgroundColor: theme.card, borderColor: theme.border, shadowColor: shadowHex, shadowOpacity }]}>
            <View style={[styles.iconWrap, { backgroundColor: theme.accentLight }]}>
              <Text style={[styles.iconEmoji, { color: theme.accent }]}>📅</Text>
            </View>
            <View style={styles.detailCardText}>
              <Text style={[styles.detailCardLabel, { color: theme.subtext }]}>{t('dateTimeLabel')}</Text>
              <Text style={[styles.detailCardVal, { color: theme.text }]}>{capitalize(dateLine)}</Text>
              {!!timeLine && <Text style={[styles.detailCardDistance, { color: theme.accent }]}>{timeLine}</Text>}
            </View>
          </View>

          <View style={[styles.detailCard, { backgroundColor: theme.card, borderColor: theme.border, shadowColor: shadowHex, shadowOpacity }]}>
            <View style={[styles.iconWrap, { backgroundColor: theme.accentLight }]}>
              <Text style={[styles.iconEmoji, { color: theme.accent }]}>📍</Text>
            </View>
            <View style={styles.detailCardText}>
              <Text style={[styles.detailCardLabel, { color: theme.subtext }]}>{t('venueLabel')}</Text>
              <Text style={[styles.detailCardVal, { color: theme.text }]}>{event.address || 'Алматы'}</Text>
              {userLocation ? (
                <Text style={[styles.detailCardDistance, { color: theme.accent }]}>
                  {t('distanceLabel')}: {getDistance(userLocation, event.coordinate)}
                </Text>
              ) : (
                <Text style={[styles.detailCardDistance, { color: theme.subtext }]}>{t('enableLocation')}</Text>
              )}
            </View>
          </View>
        </View>

        {(event.genderFilter !== 'all' || event.minAge || event.maxAge) && (
          <View style={[styles.restrictionBox, { backgroundColor: theme.accentLight, borderColor: theme.border }]}>
            <Text style={[styles.restrictionText, { color: theme.text }]}>
              ⚠️ <Text style={{ fontWeight: '800' }}>{t('restrictionsLabel')}</Text>{' '}
              {event.genderFilter === 'male' ? t('genderFilterMale') : event.genderFilter === 'female' ? t('genderFilterFemale') : t('genderFilterAll')}
              {(event.minAge || event.maxAge) ? ` · ${t('ageLabel')} ${event.minAge ?? '—'} – ${event.maxAge ?? '—'} ${t('ageUnit')}` : ''}
            </Text>
          </View>
        )}

        {event.cancelReason ? (
          <View style={[styles.cancelBox, { backgroundColor: isDark ? 'rgba(239, 68, 68, 0.12)' : '#FEE4E2', borderColor: isDark ? 'rgba(239, 68, 68, 0.25)' : '#FDA29B' }]}>
            <Text style={[styles.cancelTitle, { color: theme.danger }]}>{t('cancelReason')}</Text>
            <Text style={[styles.cancelText, { color: theme.danger }]}>{event.cancelReason}</Text>
          </View>
        ) : null}

        <View style={[styles.section, { backgroundColor: theme.card, borderColor: theme.border, shadowColor: shadowHex, shadowOpacity }]}>
          <Text style={[styles.sectionTitle, { color: theme.text }]}>{t('descLabel')}</Text>
          <Text style={[styles.description, { color: theme.subtext }]}>{event.description}</Text>
        </View>

        <View style={[styles.section, { backgroundColor: theme.card, borderColor: theme.border, shadowColor: shadowHex, shadowOpacity }]}>
          <View style={styles.participantsHeader}>
            <Text style={[styles.sectionTitle, { color: theme.text }]}>{t('participants')}</Text>
            <Text style={[styles.participantsCount, { color: theme.accent }]}>
              {event.participantsCount}/{event.maxParticipants}
              {!!event.hiddenParticipantsCount ? ` (+${event.hiddenParticipantsCount} ${t('hiddenCount')})` : ''}
            </Text>
          </View>
          <View style={[styles.progressTrack, { backgroundColor: theme.inputBg }]}>
            <View style={[styles.progressFill, { backgroundColor: isFull ? theme.warning : theme.accent, width: `${progress}%` }]} />
          </View>
          <Text style={[styles.progressHint, { color: theme.subtext }]}>
            {isFull ? t('filled') : `${t('spotsLeft')}: ${spotsLeft}`}
          </Text>
          <TouchableOpacity
            style={[styles.secondaryButton, { borderColor: theme.border, backgroundColor: theme.inputBg }]}
            onPress={() => navigation.navigate('EventParticipants', { eventId: event.id, eventTitle: event.title })}
          >
            <Text style={[styles.secondaryButtonText, { color: theme.text }]}>{t('viewParticipants')}</Text>
          </TouchableOpacity>
        </View>

        <View style={[styles.section, { backgroundColor: theme.card, borderColor: theme.border, shadowColor: shadowHex, shadowOpacity }]}>
          <Text style={[styles.sectionTitle, { color: theme.text }]}>{t('meetingPlanTitle')}</Text>
          <View style={styles.planList}>
            <View style={styles.planItem}>
              <Text style={styles.planIcon}>🕘</Text>
              <Text style={[styles.planText, { color: theme.subtext }]}>{t('meetingPlanArrive')}</Text>
            </View>
            <View style={styles.planItem}>
              <Text style={styles.planIcon}>💬</Text>
              <Text style={[styles.planText, { color: theme.subtext }]}>{t('meetingPlanChat')}</Text>
            </View>
            <View style={styles.planItem}>
              <Text style={styles.planIcon}>⭐</Text>
              <Text style={[styles.planText, { color: theme.subtext }]}>{t('meetingPlanReview')}</Text>
            </View>
          </View>
        </View>

        <View style={styles.actions}>
          <TouchableOpacity
            style={[
              styles.primaryButton,
              { backgroundColor: joined ? theme.danger : theme.accent },
              (!isActive && !joined) && { backgroundColor: theme.border },
              (!joined && isFull) && { backgroundColor: theme.border }
            ]}
            onPress={handleJoin}
            disabled={!joined && (!isActive || isFull)}
            activeOpacity={0.8}
          >
            <Text style={styles.primaryButtonText}>
              {joined ? t('leaveEventBtn') : isFull ? t('filled') : isActive ? t('joinBtn') : statusText}
            </Text>
          </TouchableOpacity>

          {(joined || canManage) && (
            <TouchableOpacity
              style={[styles.primaryButton, { backgroundColor: theme.success }]}
              onPress={() => navigation.navigate('Chat', { eventId: event.id, eventTitle: event.title })}
              activeOpacity={0.8}
            >
              <Text style={styles.primaryButtonText}>{t('openChatAction')}</Text>
            </TouchableOpacity>
          )}

          {joined && (
            <TouchableOpacity
              style={[
                styles.primaryButton,
                { backgroundColor: status === 'finished' ? theme.warning : theme.border },
              ]}
              onPress={() => navigation.navigate('Review', { eventId: event.id, eventTitle: event.title })}
              disabled={status !== 'finished'}
              activeOpacity={0.8}
            >
              <Text style={styles.primaryButtonText}>
                {status === 'finished' ? t('reviewParticipants') : t('reviewAvailableAfterFinish')}
              </Text>
            </TouchableOpacity>
          )}

          <View style={styles.actionRow}>
            <TouchableOpacity style={[styles.actionRowBtn, { borderColor: theme.border, backgroundColor: theme.card }]} onPress={shareEvent}>
              <Text style={[styles.actionRowBtnText, { color: theme.text }]}>{t('shareBtn')}</Text>
            </TouchableOpacity>

            <TouchableOpacity
              style={[styles.actionRowBtn, { borderColor: theme.border, backgroundColor: theme.card }]}
              onPress={() => openRoute(event.coordinate, event.title)}
            >
              <Text style={[styles.actionRowBtnText, { color: theme.text }]}>{t('buildRoute')}</Text>
            </TouchableOpacity>
          </View>
        </View>

        {canManage && (
          <View style={[styles.section, { backgroundColor: theme.card, borderColor: theme.border, shadowColor: shadowHex, shadowOpacity }]}>
            <Text style={[styles.sectionTitle, { color: theme.text, marginBottom: 12 }]}>{t('managePanel')}</Text>
            <View style={styles.manageGrid}>
              <TouchableOpacity style={[styles.manageBtn, { backgroundColor: theme.inputBg }]} onPress={() => navigation.navigate('CreateEvent', { eventId: event.id })}>
                <Text style={[styles.manageBtnText, { color: theme.text }]}>{t('editAction')}</Text>
              </TouchableOpacity>
              {status !== 'finished' && (
                <TouchableOpacity style={[styles.manageBtn, { backgroundColor: theme.inputBg }]} onPress={() => setStatus('finished')}>
                  <Text style={[styles.manageBtnText, { color: theme.success }]}>{t('finishAction')}</Text>
                </TouchableOpacity>
              )}
              {status !== 'cancelled' && (
                <TouchableOpacity style={[styles.manageBtn, { backgroundColor: isDark ? 'rgba(239, 68, 68, 0.15)' : '#FEE4E2' }]} onPress={cancelEvent}>
                  <Text style={[styles.manageBtnText, { color: theme.danger }]}>{t('cancel')}</Text>
                </TouchableOpacity>
              )}
              {status !== 'active' && (
                <TouchableOpacity style={[styles.manageBtn, { backgroundColor: theme.inputBg }]} onPress={() => setStatus('active')}>
                  <Text style={[styles.manageBtnText, { color: theme.accent }]}>{t('restoreActiveAction')}</Text>
                </TouchableOpacity>
              )}
            </View>
          </View>
        )}
      </ScrollView>
    </SafeAreaView>
  );
}

function capitalize(value: string) {
  if (!value) return value;
  return `${value.charAt(0).toUpperCase()}${value.slice(1)}`;
}

function getTimingText(startsAt: Date | null, status: EventStatus, t: (key: string, defaultText?: string) => string) {
  if (status === 'finished') return t('eventTimingFinished');
  if (status === 'cancelled') return t('eventTimingCancelled');
  if (!startsAt || Number.isNaN(startsAt.getTime())) return t('eventTimingActive');

  const diffMs = startsAt.getTime() - Date.now();
  if (diffMs <= 0) return t('eventTimingNow');

  const diffMinutes = Math.ceil(diffMs / 60000);
  if (diffMinutes < 60) return `${t('eventTimingIn')} ${diffMinutes} ${t('minUnit')}`;

  const diffHours = Math.ceil(diffMinutes / 60);
  if (diffHours < 24) return `${t('eventTimingIn')} ${diffHours} ${t('hourUnit')}`;

  const diffDays = Math.ceil(diffHours / 24);
  return `${t('eventTimingIn')} ${diffDays} ${t('dayUnit')}`;
}

const styles = StyleSheet.create({
  container: { flex: 1 },
  content: { padding: 16, paddingBottom: 36, width: '100%', maxWidth: 820, alignSelf: 'center' },
  empty: { marginTop: 40, textAlign: 'center', fontSize: 15 },
  hero: {
    borderWidth: 1, borderRadius: 16, padding: 16, marginBottom: 16, overflow: 'hidden',
    shadowOffset: { width: 0, height: 4 },
    shadowRadius: 12, elevation: 2,
  },
  heroImage: { height: 210, marginHorizontal: -16, marginTop: -16, marginBottom: 16, borderRadius: 0 },
  heroFallback: { height: 170, marginHorizontal: -16, marginTop: -16, marginBottom: 16, alignItems: 'center', justifyContent: 'center' },
  heroFallbackEmoji: { fontSize: 58 },
  topRow: { flexDirection: 'row', justifyContent: 'space-between', alignItems: 'center', marginBottom: 14 },
  categoryBadge: { paddingHorizontal: 12, paddingVertical: 6, borderRadius: 12 },
  categoryText: { fontWeight: '700', fontSize: 12, textTransform: 'uppercase', letterSpacing: 0.5 },
  statusBadge: { flexDirection: 'row', alignItems: 'center', paddingHorizontal: 12, paddingVertical: 6, borderRadius: 12, gap: 6 },
  statusDot: { width: 6, height: 6, borderRadius: 3 },
  statusText: { fontSize: 12, fontWeight: '700' },
  title: { fontSize: 24, fontWeight: '800', lineHeight: 32 },
  heroSubtitle: { fontSize: 14, fontWeight: '700', marginTop: 6 },
  heroStats: { flexDirection: 'row', gap: 8, marginTop: 16 },
  heroStat: { flex: 1, borderRadius: 14, paddingVertical: 12, paddingHorizontal: 8, alignItems: 'center', justifyContent: 'center' },
  heroStatValue: { fontSize: 16, fontWeight: '900', textAlign: 'center' },
  heroStatLabel: { fontSize: 11, fontWeight: '700', textAlign: 'center', marginTop: 3 },
  detailCards: { gap: 10, marginBottom: 16 },
  detailCard: {
    flexDirection: 'row', alignItems: 'center', gap: 14, borderWidth: 1, borderRadius: 16, padding: 14,
    shadowOffset: { width: 0, height: 2 }, shadowRadius: 6, elevation: 1,
  },
  detailCardText: { flex: 1 },
  detailCardLabel: { fontSize: 11, fontWeight: '600', textTransform: 'uppercase', letterSpacing: 0.5, marginBottom: 3 },
  detailCardVal: { fontSize: 15, fontWeight: '700' },
  detailCardDistance: { fontSize: 12, fontWeight: '600', marginTop: 3 },
  iconWrap: { width: 42, height: 42, borderRadius: 12, justifyContent: 'center', alignItems: 'center' },
  iconEmoji: { fontSize: 20 },
  restrictionBox: { borderWidth: 1.5, borderRadius: 16, padding: 14, marginBottom: 16, borderStyle: 'dashed' },
  restrictionText: { fontSize: 13, fontWeight: '600' },
  cancelBox: { borderWidth: 1, borderRadius: 16, padding: 14, marginBottom: 16 },
  cancelTitle: { fontSize: 14, fontWeight: '800', marginBottom: 4, textTransform: 'uppercase', letterSpacing: 0.5 },
  cancelText: { fontSize: 13, lineHeight: 18, fontWeight: '600' },
  section: {
    borderWidth: 1, borderRadius: 16, padding: 16, marginBottom: 16,
    shadowOffset: { width: 0, height: 2 }, shadowRadius: 6, elevation: 1,
  },
  sectionTitle: { fontSize: 16, fontWeight: '800' },
  description: { fontSize: 14, lineHeight: 22, marginTop: 8 },
  participantsHeader: { flexDirection: 'row', justifyContent: 'space-between', alignItems: 'center', marginBottom: 12 },
  participantsCount: { fontSize: 16, fontWeight: '800' },
  progressTrack: { height: 8, borderRadius: 999, overflow: 'hidden', marginBottom: 8 },
  progressFill: { height: '100%', borderRadius: 999 },
  progressHint: { fontSize: 12, fontWeight: '700', marginBottom: 12 },
  planList: { gap: 12, marginTop: 14 },
  planItem: { flexDirection: 'row', alignItems: 'flex-start', gap: 10 },
  planIcon: { fontSize: 18, lineHeight: 24 },
  planText: { flex: 1, fontSize: 14, lineHeight: 21, fontWeight: '600' },
  actions: { gap: 10, marginBottom: 16 },
  primaryButton: { borderRadius: 16, paddingVertical: 15, alignItems: 'center', justifyContent: 'center' },
  primaryButtonText: { color: '#FFF', fontSize: 16, fontWeight: '800' },
  secondaryButton: { borderWidth: 1.5, borderRadius: 16, paddingVertical: 14, alignItems: 'center', justifyContent: 'center' },
  secondaryButtonText: { fontSize: 14, fontWeight: '700' },
  actionRow: { flexDirection: 'row', gap: 10, marginTop: 4 },
  actionRowBtn: { flex: 1, borderWidth: 1.5, borderRadius: 16, paddingVertical: 12, alignItems: 'center', justifyContent: 'center' },
  actionRowBtnText: { fontSize: 14, fontWeight: '700' },
  manageGrid: { flexDirection: 'row', flexWrap: 'wrap', gap: 8, marginTop: 10 },
  manageBtn: { flex: 1, minWidth: '45%', borderRadius: 12, paddingVertical: 12, alignItems: 'center', justifyContent: 'center' },
  manageBtnText: { fontSize: 13, fontWeight: '700' },
});
