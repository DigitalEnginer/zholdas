import React from 'react';
import { View, Text, TouchableOpacity, StyleSheet, Image, Platform } from 'react-native';
import { LinearGradient } from 'expo-linear-gradient';
import { Event } from '../types';
import { eventStatusColors } from '../data/mockEvents';
import { useTheme } from '../context/ThemeContext';
import { useLanguage } from '../context/LanguageContext';

interface Props {
  event: Event;
  joined: boolean;
  distance?: string;
  onPress: () => void;
  onJoin: () => void;
}

export default function EventCard({ event, joined, distance, onPress, onJoin }: Props) {
  const { theme } = useTheme();
  const { t } = useLanguage();
  const spotsLeft = event.maxParticipants - event.participantsCount;
  const isFull = spotsLeft <= 0;
  const status = event.status ?? 'active';
  const isActive = status === 'active';
  const statusColor = eventStatusColors[status];
  const statusText = t(status === 'finished' ? 'statusFinished' : status === 'cancelled' ? 'statusCancelled' : 'statusActive');
  const spotsWord = spotsLeft === 1 ? 'место' : 'места';

  return (
    <TouchableOpacity
      style={[styles.card, { backgroundColor: theme.card, borderColor: theme.border }]}
      onPress={onPress}
      activeOpacity={0.9}
    >
      {event.imageUri ? (
        <View style={styles.photoWrap}>
          <Image source={{ uri: event.imageUri }} style={styles.photo} />
          <LinearGradient colors={['rgba(17,24,39,0.02)', 'rgba(17,24,39,0.42)']} style={styles.photoOverlay} />
        </View>
      ) : (
        <LinearGradient
          colors={[theme.accentLight, '#ECFDF3']}
          start={{ x: 0, y: 0 }}
          end={{ x: 1, y: 1 }}
          style={[styles.placeholder, { borderBottomColor: theme.border }]}
        >
          <Text style={[styles.placeholderText, { color: theme.accentText }]}>
            {t(`filter${event.category === 'mountains' ? 'Mountains' : event.category === 'theatre' ? 'Theatre' : event.category === 'restaurant' ? 'Restaurant' : event.category === 'sport' ? 'Sport' : 'Other'}`)}
          </Text>
        </LinearGradient>
      )}

      <View style={styles.header}>
        <View style={[styles.categoryBadge, { backgroundColor: theme.accentLight }]}>
          <Text style={[styles.categoryText, { color: theme.accentText }]}>
            {t(`filter${event.category === 'mountains' ? 'Mountains' : event.category === 'theatre' ? 'Theatre' : event.category === 'restaurant' ? 'Restaurant' : event.category === 'sport' ? 'Sport' : 'Other'}`)}
          </Text>
        </View>
        <View style={styles.metaRight}>
          {!isActive && (
            <View style={[styles.statusBadge, { backgroundColor: `${statusColor}15` }]}>
              <Text style={[styles.statusText, { color: statusColor }]}>
                {statusText}
              </Text>
            </View>
          )}
          {distance ? (
            <Text style={[styles.distance, { color: theme.accent }]}>{distance} {t('fromYou')}</Text>
          ) : null}
          <Text style={[styles.datetime, { color: theme.subtext }]}>{event.datetime}</Text>
        </View>
      </View>

      <Text style={[styles.title, { color: theme.text }]} numberOfLines={2}>{event.title}</Text>
      <Text style={[styles.description, { color: theme.subtext }]} numberOfLines={2}>
        {event.description}
      </Text>

      <View style={[styles.infoStrip, { backgroundColor: theme.inputBg, borderColor: theme.border }]}>
        <View style={styles.infoItem}>
          <Text style={[styles.infoLabel, { color: theme.subtext }]}>{t('participants')}</Text>
          <Text style={[styles.infoValue, { color: theme.text }]}>{event.participantsCount}/{event.maxParticipants}</Text>
        </View>
        <View style={[styles.infoDivider, { backgroundColor: theme.border }]} />
        <View style={styles.infoItem}>
          <Text style={[styles.infoLabel, { color: theme.subtext }]}>{t('spotsLeft')}</Text>
          <Text style={[styles.infoValue, { color: theme.text }]}>{Math.max(0, spotsLeft)}</Text>
        </View>
        <View style={[styles.infoDivider, { backgroundColor: theme.border }]} />
        <View style={styles.infoItem}>
          <Text style={[styles.infoLabel, { color: theme.subtext }]}>{statusText}</Text>
          <Text style={[styles.infoValue, { color: theme.text }]}>{isActive ? t('enterBtn') : statusText}</Text>
        </View>
      </View>

      <View style={[styles.progressBar, { backgroundColor: theme.border }]}>
        <LinearGradient
          colors={[theme.accent, '#17A39A']}
          start={{ x: 0, y: 0 }}
          end={{ x: 1, y: 0 }}
          style={[styles.progressFill, { width: `${Math.min(100, (event.participantsCount / event.maxParticipants) * 100)}%` }]}
        />
      </View>

      <View style={styles.footer}>
        <View style={styles.participants}>
          <Text style={[styles.participantsText, { color: theme.subtext }]}>
            {t('participants')}:{' '}
            <Text style={[styles.participantsCountText, { color: theme.text }]}>
              {event.participantsCount}/{event.maxParticipants}
            </Text>
          </Text>
          {spotsLeft <= 3 && spotsLeft > 0 && (
            <Text style={[styles.spotsLeft, { color: theme.warning }]}> · {t('spotsLeft')} {spotsLeft} {spotsWord}</Text>
          )}
          {isFull && <Text style={[styles.full, { color: theme.danger }]}> · {t('noSpots')}</Text>}
          {!!event.hiddenParticipantsCount && (
            <Text style={[styles.hidden, { color: theme.subtext }]}>
              · {t('hiddenCount')} {event.hiddenParticipantsCount}
            </Text>
          )}
        </View>
        <TouchableOpacity
          style={[
            styles.joinBtn,
            { borderColor: theme.accent, backgroundColor: joined ? theme.accent : 'transparent' },
            (!isActive || isFull) && !joined && styles.joinBtnFull,
          ]}
          onPress={onJoin}
          disabled={(!isActive || isFull) && !joined}
          activeOpacity={0.8}
        >
          <Text
            style={[
              styles.joinBtnText,
              { color: joined ? '#FFFFFF' : theme.accent },
              (!isActive || isFull) && !joined && { color: theme.subtext },
            ]}
          >
            {joined ? t('openChatAction') : !isActive ? statusText : isFull ? t('filled') : t('enterBtn')}
          </Text>
        </TouchableOpacity>
      </View>
      {joined && (
        <View style={[styles.chatHint, { backgroundColor: theme.inputBg, borderTopColor: theme.border }]}>
          <Text style={[styles.chatHintText, { color: theme.accent }]}>
            {t('openGroupChatHint')}
          </Text>
        </View>
      )}
    </TouchableOpacity>
  );
}

const styles = StyleSheet.create({
  card: {
    width: '100%',
    borderRadius: 22,
    borderWidth: 1,
    marginVertical: 10,
    maxWidth: '100%',
    shadowColor: '#0F172A',
    shadowOffset: { width: 0, height: 10 },
    shadowOpacity: 0.08,
    shadowRadius: 20,
    elevation: 4,
    overflow: 'hidden',
  },
  photoWrap: { height: Platform.OS === 'web' ? 190 : 160 },
  photo: { width: '100%', height: '100%' },
  photoOverlay: { ...StyleSheet.absoluteFillObject },
  placeholder: {
    height: Platform.OS === 'web' ? 148 : 112,
    justifyContent: 'center',
    alignItems: 'center',
    borderBottomWidth: 1,
  },
  placeholderText: { fontSize: 14, fontWeight: '900' },
  header: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'flex-start',
    gap: 12,
    marginBottom: 10,
    padding: 18,
    paddingBottom: 0,
  },
  categoryBadge: {
    flexDirection: 'row',
    alignItems: 'center',
    paddingHorizontal: 10,
    paddingVertical: 4,
    borderRadius: 30,
  },
  categoryText: { fontSize: 11, fontWeight: '800' },
  metaRight: { alignItems: 'flex-end', gap: 3, flexShrink: 1 },
  distance: { fontSize: 12, fontWeight: '800' },
  datetime: { fontSize: 12, fontWeight: '700', textAlign: 'right' },
  statusBadge: { paddingHorizontal: 8, paddingVertical: 3, borderRadius: 8 },
  statusText: { fontSize: 10, fontWeight: '800' },
  title: { fontSize: 21, fontWeight: '900', marginBottom: 6, paddingHorizontal: 18, lineHeight: 26 },
  description: { fontSize: 14, lineHeight: 20, marginBottom: 14, paddingHorizontal: 18 },
  infoStrip: {
    flexDirection: 'row',
    marginHorizontal: 18,
    marginBottom: 14,
    borderRadius: 16,
    borderWidth: 1,
    overflow: 'hidden',
  },
  infoItem: { flex: 1, alignItems: 'center', justifyContent: 'center', paddingVertical: 11, paddingHorizontal: 6 },
  infoLabel: { fontSize: 9, fontWeight: '800', textTransform: 'uppercase' },
  infoValue: { fontSize: 14, fontWeight: '900', marginTop: 3, textAlign: 'center' },
  infoDivider: { width: 1 },
  progressBar: { height: 4, borderRadius: 999, overflow: 'hidden', marginBottom: 16, marginHorizontal: 18 },
  progressFill: { height: '100%', borderRadius: 999 },
  footer: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
    gap: 14,
    paddingHorizontal: 18,
    paddingBottom: 18,
  },
  participants: { flexDirection: 'row', alignItems: 'center', flex: 1, flexWrap: 'wrap' },
  participantsText: { fontSize: 13, fontWeight: '700' },
  participantsCountText: { fontWeight: '900' },
  spotsLeft: { fontSize: 12, fontWeight: '600' },
  full: { fontSize: 12, fontWeight: '600' },
  hidden: { fontSize: 12, fontWeight: '500' },
  joinBtn: {
    minWidth: 100,
    minHeight: 40,
    paddingHorizontal: 18,
    paddingVertical: 9,
    borderRadius: 13,
    borderWidth: 1.5,
    alignItems: 'center',
    justifyContent: 'center',
  },
  joinBtnFull: { borderColor: '#CBD5E1', backgroundColor: 'transparent' },
  joinBtnText: { fontSize: 13, fontWeight: '900' },
  chatHint: {
    paddingVertical: 10,
    borderTopWidth: 1,
    alignItems: 'center',
    justifyContent: 'center',
  },
  chatHintText: { fontSize: 12, fontWeight: '700' },
});
