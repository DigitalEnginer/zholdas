import React, { useState, useEffect } from 'react';
import {
  View, Text, StyleSheet, TouchableOpacity, SafeAreaView,
  ScrollView, TextInput, Alert, ActivityIndicator,
} from 'react-native';
import { useRoute, useNavigation, RouteProp } from '@react-navigation/native';
import { RootStackParamList } from '../types';
import { useAuth } from '../context/AuthContext';
import { supabase } from '../lib/supabase';
import { useEvents } from '../context/EventsContext';
import AvatarImage from '../components/AvatarImage';

type ReviewRoute = RouteProp<RootStackParamList, 'Review'>;

interface Participant {
  id: string;
  name: string;
  avatar: string;
}

function StarPicker({ value, onChange }: { value: number; onChange: (v: number) => void }) {
  return (
    <View style={styles.starRow}>
      {[1, 2, 3, 4, 5].map(i => (
        <TouchableOpacity key={i} onPress={() => onChange(i)}>
          <Text style={[styles.star, i <= value && styles.starFilled]}>★</Text>
        </TouchableOpacity>
      ))}
    </View>
  );
}

export default function ReviewScreen() {
  const route = useRoute<ReviewRoute>();
  const navigation = useNavigation();
  const { user, updateUser } = useAuth();
  const { events } = useEvents();
  const { eventId, eventTitle } = route.params;
  const event = events.find(e => e.id === eventId);

  const [participants, setParticipants] = useState<Participant[]>([]);
  const [ratings, setRatings] = useState<Record<string, number>>({});
  const [comments, setComments] = useState<Record<string, string>>({});
  const [submitted, setSubmitted] = useState(false);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    loadParticipants();
  }, [eventId]);

  async function loadParticipants() {
    const { data } = await supabase
      .from('event_participants')
      .select('user_id, profiles(id, name, avatar, is_banned)')
      .eq('event_id', eventId)
      .neq('user_id', user?.id ?? '');

    const list: Participant[] = (data ?? [])
      .filter((ep: any) => !ep.profiles?.is_banned)
      .map((ep: any) => ({
        id: ep.user_id,
        name: ep.profiles?.name ?? 'Пользователь',
        avatar: ep.profiles?.avatar ?? '🧑',
      }));
    setParticipants(list);
    setLoading(false);
  }

  async function handleSubmit() {
    if ((event?.status ?? 'active') !== 'finished') {
      Alert.alert('', 'Отзывы можно оставить только после завершения ивента');
      return;
    }

    const rated = Object.keys(ratings).filter(id => ratings[id] > 0);
    if (rated.length === 0) {
      Alert.alert('', 'Оцени хотя бы одного участника');
      return;
    }

    for (const toUserId of rated) {
      const { error } = await supabase.from('reviews').insert({
        from_user_id: user?.id,
        to_user_id: toUserId,
        event_id: eventId,
        rating: ratings[toUserId],
        comment: comments[toUserId] ?? '',
      });

      if (error) {
        if (error.message.includes('duplicate key')) {
          Alert.alert('', 'Ты уже оставил отзыв этому участнику за этот ивент');
        } else {
          Alert.alert('', error.message);
        }
        return;
      }
    }

    await updateUser({ eventsJoined: (user?.eventsJoined ?? 0) + 1 });

    setSubmitted(true);
    setTimeout(() => navigation.goBack(), 2000);
  }

  if (submitted) {
    return (
      <SafeAreaView style={styles.container}>
        <View style={styles.successContainer}>
          <Text style={styles.successEmoji}>🎉</Text>
          <Text style={styles.successTitle}>Спасибо!</Text>
          <Text style={styles.successText}>Отзывы отправлены участникам</Text>
        </View>
      </SafeAreaView>
    );
  }

  return (
    <SafeAreaView style={styles.container}>
      <ScrollView showsVerticalScrollIndicator={false}>
        <View style={styles.header}>
          <Text style={styles.title}>Оцени участников</Text>
          <Text style={styles.subtitle}>{eventTitle}</Text>
        </View>

        {loading ? (
        <ActivityIndicator color="#4F46E5" style={{ marginTop: 40 }} />
        ) : participants.length === 0 ? (
          <View style={styles.emptyContainer}>
            <Text style={styles.emptyText}>Нет других участников для оценки</Text>
          </View>
        ) : (
          participants.map(participant => (
            <View key={participant.id} style={styles.card}>
              <View style={styles.cardHeader}>
                <AvatarImage value={participant.avatar} size={48} backgroundColor="#EEF2FF" textSize={24} />
                <View style={styles.info}>
                  <Text style={styles.name}>{participant.name}</Text>
                  <StarPicker
                    value={ratings[participant.id] ?? 0}
                    onChange={v => setRatings(prev => ({ ...prev, [participant.id]: v }))}
                  />
                </View>
              </View>
              <TextInput
                style={styles.commentInput}
                placeholder="Оставить комментарий (необязательно)..."
                placeholderTextColor="#BBB"
                value={comments[participant.id] ?? ''}
                onChangeText={t => setComments(prev => ({ ...prev, [participant.id]: t }))}
                maxLength={120}
              />
            </View>
          ))
        )}

        {!loading && participants.length > 0 && (
          <TouchableOpacity style={styles.submitBtn} onPress={handleSubmit} activeOpacity={0.85}>
            <Text style={styles.submitBtnText}>Отправить отзывы ⭐</Text>
          </TouchableOpacity>
        )}

        <TouchableOpacity style={styles.skipBtn} onPress={() => navigation.goBack()}>
          <Text style={styles.skipBtnText}>Пропустить</Text>
        </TouchableOpacity>

        <View style={{ height: 40 }} />
      </ScrollView>
    </SafeAreaView>
  );
}

const styles = StyleSheet.create({
  container: { flex: 1, backgroundColor: '#F6F7FB' },
  header: { padding: 20, paddingBottom: 8, width: '100%', maxWidth: 760, alignSelf: 'center' },
  title: { fontSize: 26, fontWeight: '900', color: '#111827' },
  subtitle: { fontSize: 14, color: '#4338CA', marginTop: 4, fontWeight: '700' },
  emptyContainer: { alignItems: 'center', paddingTop: 40 },
  emptyText: { fontSize: 15, color: '#98A2B3' },
  card: {
    backgroundColor: '#FFF', borderRadius: 16, margin: 12, marginBottom: 0,
    padding: 16,
    borderWidth: 1, borderColor: '#E4E7EC',
    maxWidth: 736, alignSelf: 'center',
    shadowColor: '#101828', shadowOffset: { width: 0, height: 8 },
    shadowOpacity: 0.06, shadowRadius: 18, elevation: 2,
  },
  cardHeader: { flexDirection: 'row', alignItems: 'center', gap: 12, marginBottom: 12 },
  info: { flex: 1 },
  name: { fontSize: 16, fontWeight: '800', color: '#111827', marginBottom: 6 },
  starRow: { flexDirection: 'row', gap: 4 },
  star: { fontSize: 28, color: '#DDD' },
  starFilled: { color: '#F5A623' },
  commentInput: {
    backgroundColor: '#F9FAFB', borderRadius: 12,
    paddingHorizontal: 14, paddingVertical: 10,
    fontSize: 14, color: '#111827',
    borderWidth: 1, borderColor: '#E4E7EC',
  },
  submitBtn: {
    margin: 16, marginTop: 24, backgroundColor: '#4F46E5',
    borderRadius: 14, paddingVertical: 16, alignItems: 'center',
    width: '100%', maxWidth: 736, alignSelf: 'center',
  },
  submitBtnText: { fontSize: 16, fontWeight: '800', color: '#FFF' },
  skipBtn: { alignItems: 'center', paddingVertical: 8 },
  skipBtnText: { fontSize: 14, color: '#98A2B3' },
  successContainer: { flex: 1, justifyContent: 'center', alignItems: 'center' },
  successEmoji: { fontSize: 72, marginBottom: 16 },
  successTitle: { fontSize: 28, fontWeight: '800', color: '#111827', marginBottom: 8 },
  successText: { fontSize: 16, color: '#667085' },
});
