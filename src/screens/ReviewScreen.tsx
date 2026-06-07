import React, { useState, useEffect } from 'react';
import {
  View, Text, StyleSheet, TouchableOpacity, SafeAreaView,
  ScrollView, TextInput, Alert, ActivityIndicator,
} from 'react-native';
import { useRoute, useNavigation, RouteProp } from '@react-navigation/native';
import { RootStackParamList } from '../types';
import { useAuth } from '../context/AuthContext';
import { supabase } from '../lib/supabase';

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
  const { eventId, eventTitle } = route.params;

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
      .select('user_id, profiles(id, name, avatar)')
      .eq('event_id', eventId)
      .neq('user_id', user?.id ?? '');

    const list: Participant[] = (data ?? []).map((ep: any) => ({
      id: ep.user_id,
      name: ep.profiles?.name ?? 'Пользователь',
      avatar: ep.profiles?.avatar ?? '🧑',
    }));
    setParticipants(list);
    setLoading(false);
  }

  async function handleSubmit() {
    const rated = Object.keys(ratings).filter(id => ratings[id] > 0);
    if (rated.length === 0) {
      Alert.alert('', 'Оцени хотя бы одного участника');
      return;
    }

    for (const toUserId of rated) {
      await supabase.from('reviews').insert({
        from_user_id: user?.id,
        to_user_id: toUserId,
        event_id: eventId,
        rating: ratings[toUserId],
        comment: comments[toUserId] ?? '',
      });

      // Update reviewee's average rating
      const { data: theirReviews } = await supabase
        .from('reviews')
        .select('rating')
        .eq('to_user_id', toUserId);

      if (theirReviews && theirReviews.length > 0) {
        const avg = theirReviews.reduce((s, r) => s + r.rating, 0) / theirReviews.length;
        await supabase
          .from('profiles')
          .update({ rating: parseFloat(avg.toFixed(1)), reviews_count: theirReviews.length })
          .eq('id', toUserId);
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
          <ActivityIndicator color="#5B4FCF" style={{ marginTop: 40 }} />
        ) : participants.length === 0 ? (
          <View style={styles.emptyContainer}>
            <Text style={styles.emptyText}>Нет других участников для оценки</Text>
          </View>
        ) : (
          participants.map(participant => (
            <View key={participant.id} style={styles.card}>
              <View style={styles.cardHeader}>
                <View style={styles.avatar}>
                  <Text style={styles.avatarText}>{participant.avatar}</Text>
                </View>
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
  container: { flex: 1, backgroundColor: '#F8F7FF' },
  header: { padding: 20, paddingBottom: 8 },
  title: { fontSize: 26, fontWeight: '800', color: '#1A1A2E' },
  subtitle: { fontSize: 14, color: '#5B4FCF', marginTop: 4, fontWeight: '600' },
  emptyContainer: { alignItems: 'center', paddingTop: 40 },
  emptyText: { fontSize: 15, color: '#AAA' },
  card: {
    backgroundColor: '#FFF', borderRadius: 16, margin: 12, marginBottom: 0,
    padding: 16,
    shadowColor: '#5B4FCF', shadowOffset: { width: 0, height: 2 },
    shadowOpacity: 0.07, shadowRadius: 8, elevation: 2,
  },
  cardHeader: { flexDirection: 'row', alignItems: 'center', gap: 12, marginBottom: 12 },
  avatar: {
    width: 48, height: 48, borderRadius: 24,
    backgroundColor: '#F0EEFF', justifyContent: 'center', alignItems: 'center',
  },
  avatarText: { fontSize: 24 },
  info: { flex: 1 },
  name: { fontSize: 16, fontWeight: '700', color: '#1A1A2E', marginBottom: 6 },
  starRow: { flexDirection: 'row', gap: 4 },
  star: { fontSize: 28, color: '#DDD' },
  starFilled: { color: '#F5A623' },
  commentInput: {
    backgroundColor: '#F8F7FF', borderRadius: 12,
    paddingHorizontal: 14, paddingVertical: 10,
    fontSize: 14, color: '#1A1A2E',
    borderWidth: 1, borderColor: '#E8E5FF',
  },
  submitBtn: {
    margin: 16, marginTop: 24, backgroundColor: '#5B4FCF',
    borderRadius: 16, paddingVertical: 16, alignItems: 'center',
  },
  submitBtnText: { fontSize: 16, fontWeight: '800', color: '#FFF' },
  skipBtn: { alignItems: 'center', paddingVertical: 8 },
  skipBtnText: { fontSize: 14, color: '#AAA' },
  successContainer: { flex: 1, justifyContent: 'center', alignItems: 'center' },
  successEmoji: { fontSize: 72, marginBottom: 16 },
  successTitle: { fontSize: 28, fontWeight: '800', color: '#1A1A2E', marginBottom: 8 },
  successText: { fontSize: 16, color: '#888' },
});
