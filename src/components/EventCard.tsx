import React from 'react';
import { View, Text, TouchableOpacity, StyleSheet, Image } from 'react-native';
import { Event } from '../types';
import { categoryEmojis, categoryLabels, eventStatusColors, eventStatusLabels } from '../data/mockEvents';
import { useTheme } from '../context/ThemeContext';

interface Props {
  event: Event;
  joined: boolean;
  distance?: string;
  onPress: () => void;
  onJoin: () => void;
}

export default function EventCard({ event, joined, distance, onPress, onJoin }: Props) {
  const { theme } = useTheme();
  const spotsLeft = event.maxParticipants - event.participantsCount;
  const isFull = spotsLeft <= 0;
  const status = event.status ?? 'active';
  const isActive = status === 'active';
  const statusColor = eventStatusColors[status];

  return (
    <TouchableOpacity
      style={[styles.card, { backgroundColor: theme.card, borderColor: theme.border }]}
      onPress={onPress}
      activeOpacity={0.85}
    >
      {event.imageUri ? (
        <Image source={{ uri: event.imageUri }} style={styles.photo} />
      ) : null}

      <View style={styles.header}>
        <View style={[styles.categoryBadge, { backgroundColor: theme.accentLight }]}>
          <Text style={styles.categoryEmoji}>{categoryEmojis[event.category]}</Text>
          <Text style={[styles.categoryText, { color: theme.accentText }]}>{categoryLabels[event.category]}</Text>
        </View>
        <View style={styles.metaRight}>
          {!isActive && (
            <View style={[styles.statusBadge, { backgroundColor: `${statusColor}18` }]}>
              <Text style={[styles.statusText, { color: statusColor }]}>
                {eventStatusLabels[status]}
              </Text>
            </View>
          )}
          {distance ? (
            <Text style={[styles.distance, { color: theme.accentText }]}>📍 {distance}</Text>
          ) : null}
          <Text style={[styles.datetime, { color: theme.subtext }]}>{event.datetime}</Text>
        </View>
      </View>

      <Text style={[styles.title, { color: theme.text }]}>{event.title}</Text>
      <Text style={[styles.description, { color: theme.subtext }]} numberOfLines={2}>{event.description}</Text>

      <View style={[styles.progressBar, { backgroundColor: theme.accentLight }]}>
        <View style={[styles.progressFill, { backgroundColor: theme.accent, width: `${Math.min(100, (event.participantsCount / event.maxParticipants) * 100)}%` }]} />
      </View>

      <View style={styles.footer}>
        <View style={styles.participants}>
          <Text style={styles.participantsIcon}>👥</Text>
          <Text style={[styles.participantsText, { color: theme.text }]}>{event.participantsCount}/{event.maxParticipants}</Text>
          {spotsLeft <= 3 && spotsLeft > 0 && (
            <Text style={styles.spotsLeft}> · Осталось {spotsLeft}</Text>
          )}
          {isFull && <Text style={styles.full}> · Заполнено</Text>}
          {!!event.hiddenParticipantsCount && (
            <Text style={styles.hidden}> · скрыто {event.hiddenParticipantsCount}</Text>
          )}
        </View>
        <TouchableOpacity
          style={[
            styles.joinBtn,
            { borderColor: theme.accent },
            joined && { backgroundColor: theme.accent },
            (!isActive || isFull) && !joined && styles.joinBtnFull,
          ]}
          onPress={onJoin}
          disabled={(!isActive || isFull) && !joined}
          activeOpacity={0.8}
        >
          <Text style={[styles.joinBtnText, { color: theme.accentText }, joined && styles.joinBtnTextActive]}>
            {joined ? '✓ В группе' : !isActive ? eventStatusLabels[status] : isFull ? 'Заполнено' : 'Войти'}
          </Text>
        </TouchableOpacity>
      </View>
      {joined && (
        <View style={[styles.chatHint, { backgroundColor: theme.inputBg, borderTopColor: theme.border }]}>
          <Text style={[styles.chatHintText, { color: theme.accentText }]}>💬 Нажми чтобы открыть чат группы</Text>
        </View>
      )}
    </TouchableOpacity>
  );
}

const styles = StyleSheet.create({
  card: {
    borderRadius: 14,
    borderWidth: 1,
    marginHorizontal: 16, marginVertical: 7,
    maxWidth: 760,
    shadowColor: '#101828', shadowOffset: { width: 0, height: 8 },
    shadowOpacity: 0.07, shadowRadius: 18, elevation: 3,
    overflow: 'hidden',
  },
  photo: { width: '100%', height: 158 },
  header: { flexDirection: 'row', justifyContent: 'space-between', alignItems: 'center', marginBottom: 8, padding: 16, paddingBottom: 0 },
  categoryBadge: {
    flexDirection: 'row', alignItems: 'center',
    paddingHorizontal: 10, paddingVertical: 5, borderRadius: 999, gap: 4,
  },
  categoryEmoji: { fontSize: 13 },
  categoryText: { fontSize: 12, fontWeight: '700' },
  metaRight: { alignItems: 'flex-end', gap: 2 },
  distance: { fontSize: 11, fontWeight: '700' },
  datetime: { fontSize: 12 },
  statusBadge: { paddingHorizontal: 8, paddingVertical: 3, borderRadius: 10 },
  statusText: { fontSize: 11, fontWeight: '800' },
  title: { fontSize: 17, fontWeight: '800', marginBottom: 6, paddingHorizontal: 16 },
  description: { fontSize: 13, lineHeight: 18, marginBottom: 12, paddingHorizontal: 16 },
  progressBar: { height: 5, borderRadius: 999, overflow: 'hidden', marginBottom: 12, marginHorizontal: 16 },
  progressFill: { height: '100%', borderRadius: 999 },
  footer: { flexDirection: 'row', justifyContent: 'space-between', alignItems: 'center', paddingHorizontal: 16 },
  participants: { flexDirection: 'row', alignItems: 'center' },
  participantsIcon: { fontSize: 14, marginRight: 4 },
  participantsText: { fontSize: 13, fontWeight: '700' },
  spotsLeft: { fontSize: 12, color: '#E07B2C', fontWeight: '500' },
  full: { fontSize: 12, color: '#FF4D4D', fontWeight: '500' },
  hidden: { fontSize: 12, color: '#999', fontWeight: '500' },
  joinBtn: {
    paddingHorizontal: 16, paddingVertical: 8, borderRadius: 14,
    borderWidth: 1.5,
  },
  joinBtnActive: {},
  joinBtnFull: { borderColor: '#CCC' },
  joinBtnText: { fontSize: 13, fontWeight: '800' },
  joinBtnTextActive: { color: '#FFF' },
  chatHint: { marginTop: 10, paddingTop: 10, paddingBottom: 16, borderTopWidth: 1, paddingHorizontal: 16 },
  chatHintText: { fontSize: 12, textAlign: 'center', fontWeight: '700' },
});
