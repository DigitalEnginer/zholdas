import React from 'react';
import { View, Text, TouchableOpacity, StyleSheet, Image } from 'react-native';
import { Event } from '../types';
import { categoryEmojis, categoryLabels } from '../data/mockEvents';

interface Props {
  event: Event;
  joined: boolean;
  distance?: string;
  onPress: () => void;
  onJoin: () => void;
}

export default function EventCard({ event, joined, distance, onPress, onJoin }: Props) {
  const spotsLeft = event.maxParticipants - event.participantsCount;
  const isFull = spotsLeft <= 0;

  return (
    <TouchableOpacity style={styles.card} onPress={onPress} activeOpacity={0.85}>
      {event.imageUri ? (
        <Image source={{ uri: event.imageUri }} style={styles.photo} />
      ) : null}

      <View style={styles.header}>
        <View style={styles.categoryBadge}>
          <Text style={styles.categoryEmoji}>{categoryEmojis[event.category]}</Text>
          <Text style={styles.categoryText}>{categoryLabels[event.category]}</Text>
        </View>
        <View style={styles.metaRight}>
          {distance ? (
            <Text style={styles.distance}>📍 {distance}</Text>
          ) : null}
          <Text style={styles.datetime}>{event.datetime}</Text>
        </View>
      </View>

      <Text style={styles.title}>{event.title}</Text>
      <Text style={styles.description} numberOfLines={2}>{event.description}</Text>

      <View style={styles.progressBar}>
        <View style={[styles.progressFill, { width: `${Math.min(100, (event.participantsCount / event.maxParticipants) * 100)}%` }]} />
      </View>

      <View style={styles.footer}>
        <View style={styles.participants}>
          <Text style={styles.participantsIcon}>👥</Text>
          <Text style={styles.participantsText}>{event.participantsCount}/{event.maxParticipants}</Text>
          {spotsLeft <= 3 && spotsLeft > 0 && (
            <Text style={styles.spotsLeft}> · Осталось {spotsLeft}</Text>
          )}
          {isFull && <Text style={styles.full}> · Заполнено</Text>}
          {!!event.hiddenParticipantsCount && (
            <Text style={styles.hidden}> · скрыто {event.hiddenParticipantsCount}</Text>
          )}
        </View>
        <TouchableOpacity
          style={[styles.joinBtn, joined && styles.joinBtnActive, isFull && !joined && styles.joinBtnFull]}
          onPress={onJoin}
          disabled={isFull && !joined}
          activeOpacity={0.8}
        >
          <Text style={[styles.joinBtnText, joined && styles.joinBtnTextActive]}>
            {joined ? '✓ В группе' : isFull ? 'Заполнено' : 'Войти'}
          </Text>
        </TouchableOpacity>
      </View>
      {joined && (
        <View style={styles.chatHint}>
          <Text style={styles.chatHintText}>💬 Нажми чтобы открыть чат группы</Text>
        </View>
      )}
    </TouchableOpacity>
  );
}

const styles = StyleSheet.create({
  card: {
    backgroundColor: '#FFF', borderRadius: 16,
    marginHorizontal: 16, marginVertical: 6,
    shadowColor: '#5B4FCF', shadowOffset: { width: 0, height: 2 },
    shadowOpacity: 0.08, shadowRadius: 8, elevation: 3,
    overflow: 'hidden',
  },
  photo: { width: '100%', height: 140 },
  header: { flexDirection: 'row', justifyContent: 'space-between', alignItems: 'center', marginBottom: 8, padding: 16, paddingBottom: 0 },
  categoryBadge: {
    flexDirection: 'row', alignItems: 'center',
    backgroundColor: '#F0EEFF', paddingHorizontal: 10, paddingVertical: 4, borderRadius: 20, gap: 4,
  },
  categoryEmoji: { fontSize: 13 },
  categoryText: { fontSize: 12, color: '#5B4FCF', fontWeight: '600' },
  metaRight: { alignItems: 'flex-end', gap: 2 },
  distance: { fontSize: 11, color: '#5B4FCF', fontWeight: '600' },
  datetime: { fontSize: 12, color: '#999' },
  title: { fontSize: 17, fontWeight: '700', color: '#1A1A2E', marginBottom: 6, paddingHorizontal: 16 },
  description: { fontSize: 13, color: '#666', lineHeight: 18, marginBottom: 10, paddingHorizontal: 16 },
  progressBar: { height: 4, backgroundColor: '#F0EEFF', borderRadius: 2, overflow: 'hidden', marginBottom: 12, marginHorizontal: 16 },
  progressFill: { height: '100%', backgroundColor: '#5B4FCF', borderRadius: 2 },
  footer: { flexDirection: 'row', justifyContent: 'space-between', alignItems: 'center', paddingHorizontal: 16 },
  participants: { flexDirection: 'row', alignItems: 'center' },
  participantsIcon: { fontSize: 14, marginRight: 4 },
  participantsText: { fontSize: 13, color: '#555', fontWeight: '600' },
  spotsLeft: { fontSize: 12, color: '#E07B2C', fontWeight: '500' },
  full: { fontSize: 12, color: '#FF4D4D', fontWeight: '500' },
  hidden: { fontSize: 12, color: '#999', fontWeight: '500' },
  joinBtn: {
    paddingHorizontal: 16, paddingVertical: 8, borderRadius: 20,
    borderWidth: 1.5, borderColor: '#5B4FCF',
  },
  joinBtnActive: { backgroundColor: '#5B4FCF' },
  joinBtnFull: { borderColor: '#CCC' },
  joinBtnText: { fontSize: 13, color: '#5B4FCF', fontWeight: '600' },
  joinBtnTextActive: { color: '#FFF' },
  chatHint: { marginTop: 10, paddingTop: 10, paddingBottom: 16, borderTopWidth: 1, borderTopColor: '#F0EEFF', paddingHorizontal: 16 },
  chatHintText: { fontSize: 12, color: '#5B4FCF', textAlign: 'center' },
});
