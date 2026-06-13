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
      activeOpacity={0.9}
    >
      {event.imageUri ? (
        <Image source={{ uri: event.imageUri }} style={styles.photo} />
      ) : null}

      <View style={styles.header}>
        <View style={[styles.categoryBadge, { backgroundColor: theme.accentLight }]}>
          <Text style={[styles.categoryText, { color: theme.accentText }]}>
            {categoryLabels[event.category]}
          </Text>
        </View>
        <View style={styles.metaRight}>
          {!isActive && (
            <View style={[styles.statusBadge, { backgroundColor: `${statusColor}15` }]}>
              <Text style={[styles.statusText, { color: statusColor }]}>
                {eventStatusLabels[status]}
              </Text>
            </View>
          )}
          {distance ? (
            <Text style={[styles.distance, { color: theme.accent }]}>{distance} от вас</Text>
          ) : null}
          <Text style={[styles.datetime, { color: theme.subtext }]}>{event.datetime}</Text>
        </View>
      </View>

      <Text style={[styles.title, { color: theme.text }]}>{event.title}</Text>
      <Text style={[styles.description, { color: theme.subtext }]} numberOfLines={2}>
        {event.description}
      </Text>

      <View style={[styles.progressBar, { backgroundColor: theme.border }]}>
        <View
          style={[
            styles.progressFill,
            {
              backgroundColor: theme.accent,
              width: `${Math.min(100, (event.participantsCount / event.maxParticipants) * 100)}%`,
            },
          ]}
        />
      </View>

      <View style={styles.footer}>
        <View style={styles.participants}>
          <Text style={[styles.participantsText, { color: theme.subtext }]}>
            Участники:{' '}
            <Text style={[styles.participantsCountText, { color: theme.text }]}>
              {event.participantsCount}/{event.maxParticipants}
            </Text>
          </Text>
          {spotsLeft <= 3 && spotsLeft > 0 && (
            <Text style={[styles.spotsLeft, { color: theme.warning }]}> · Осталось {spotsLeft}</Text>
          )}
          {isFull && <Text style={[styles.full, { color: theme.danger }]}> · Мест нет</Text>}
          {!!event.hiddenParticipantsCount && (
            <Text style={[styles.hidden, { color: theme.subtext }]}>
              · скрыто {event.hiddenParticipantsCount}
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
            {joined ? 'В группе' : !isActive ? eventStatusLabels[status] : isFull ? 'Заполнено' : 'Войти'}
          </Text>
        </TouchableOpacity>
      </View>
      {joined && (
        <View style={[styles.chatHint, { backgroundColor: theme.inputBg, borderTopColor: theme.border }]}>
          <Text style={[styles.chatHintText, { color: theme.accent }]}>
            Открыть чат группы →
          </Text>
        </View>
      )}
    </TouchableOpacity>
  );
}

const styles = StyleSheet.create({
  card: {
    borderRadius: 16,
    borderWidth: 1,
    marginHorizontal: 16,
    marginVertical: 8,
    maxWidth: 760,
    shadowColor: '#0F172A',
    shadowOffset: { width: 0, height: 4 },
    shadowOpacity: 0.04,
    shadowRadius: 12,
    elevation: 2,
    overflow: 'hidden',
  },
  photo: { width: '100%', height: 160 },
  header: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
    marginBottom: 10,
    padding: 16,
    paddingBottom: 0,
  },
  categoryBadge: {
    flexDirection: 'row',
    alignItems: 'center',
    paddingHorizontal: 10,
    paddingVertical: 4,
    borderRadius: 30,
  },
  categoryText: { fontSize: 11, fontWeight: '700', letterSpacing: 0.3 },
  metaRight: { alignItems: 'flex-end', gap: 2 },
  distance: { fontSize: 11, fontWeight: '700', letterSpacing: 0.1 },
  datetime: { fontSize: 11, fontWeight: '500' },
  statusBadge: { paddingHorizontal: 8, paddingVertical: 3, borderRadius: 8 },
  statusText: { fontSize: 10, fontWeight: '800', letterSpacing: 0.2 },
  title: { fontSize: 18, fontWeight: '700', marginBottom: 6, paddingHorizontal: 16, letterSpacing: -0.2 },
  description: { fontSize: 13, lineHeight: 18, marginBottom: 12, paddingHorizontal: 16 },
  progressBar: { height: 3, borderRadius: 999, overflow: 'hidden', marginBottom: 14, marginHorizontal: 16 },
  progressFill: { height: '100%', borderRadius: 999 },
  footer: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
    paddingHorizontal: 16,
    paddingBottom: 16,
  },
  participants: { flexDirection: 'row', alignItems: 'center' },
  participantsText: { fontSize: 12, fontWeight: '500' },
  participantsCountText: { fontWeight: '700' },
  spotsLeft: { fontSize: 12, fontWeight: '600' },
  full: { fontSize: 12, fontWeight: '600' },
  hidden: { fontSize: 12, fontWeight: '500' },
  joinBtn: {
    paddingHorizontal: 16,
    paddingVertical: 7,
    borderRadius: 10,
    borderWidth: 1.5,
  },
  joinBtnFull: { borderColor: '#CBD5E1', backgroundColor: 'transparent' },
  joinBtnText: { fontSize: 12, fontWeight: '700' },
  chatHint: {
    paddingVertical: 10,
    borderTopWidth: 1,
    alignItems: 'center',
    justifyContent: 'center',
  },
  chatHintText: { fontSize: 12, fontWeight: '600', letterSpacing: 0.1 },
});
