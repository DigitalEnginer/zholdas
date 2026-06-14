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
import { useTheme } from '../context/ThemeContext';
import AvatarImage from '../components/AvatarImage';
import { useLanguage } from '../context/LanguageContext';

type ReviewRoute = RouteProp<RootStackParamList, 'Review'>;

interface Participant {
  id: string;
  name: string;
  avatar: string;
}

function StarPicker({ value, onChange }: { value: number; onChange: (v: number) => void }) {
  const { theme } = useTheme();
  return (
    <View style={styles.starRow}>
      {[1, 2, 3, 4, 5].map(i => (
        <TouchableOpacity key={i} onPress={() => onChange(i)} activeOpacity={0.7} style={styles.starTouch}>
          <Text style={[styles.star, { color: i <= value ? '#EAB308' : theme.border }]}>★</Text>
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
  const { theme, isDark } = useTheme();
  const { t } = useLanguage();
  const { eventId, eventTitle } = route.params;
  const event = events.find(e => e.id === eventId);

  const [participants, setParticipants] = useState<Participant[]>([]);
  const [ratings, setRatings] = useState<Record<string, number>>({});
  const [comments, setComments] = useState<Record<string, string>>({});
  const [submitted, setSubmitted] = useState(false);
  const [loading, setLoading] = useState(true);
  const [focusedInputId, setFocusedInputId] = useState<string | null>(null);

  const getShadowStyle = () => ({
    shadowColor: isDark ? '#000' : '#0F172A',
    shadowOffset: { width: 0, height: 6 },
    shadowOpacity: isDark ? 0.35 : 0.06,
    shadowRadius: 14,
    elevation: 3,
  });

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
        name: ep.profiles?.name ?? t('userLabel'),
        avatar: ep.profiles?.avatar ?? '🧑',
      }));
    setParticipants(list);
    setLoading(false);
  }

  async function handleSubmit() {
    if ((event?.status ?? 'active') !== 'finished') {
      Alert.alert('', t('reviewEventNotFinished'));
      return;
    }

    const rated = Object.keys(ratings).filter(id => ratings[id] > 0);
    if (rated.length === 0) {
      Alert.alert('', t('reviewRatingEmptyAlert'));
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
          Alert.alert('', t('duplicateReview'));
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
      <SafeAreaView style={[styles.container, { backgroundColor: theme.bg }]}>
        <View style={styles.successContainer}>
          <Text style={styles.successEmoji}>🎉</Text>
          <Text style={[styles.successTitle, { color: theme.text }]}>{t('reviewThanksTitle')}</Text>
          <Text style={[styles.successText, { color: theme.subtext }]}>{t('reviewSentToParticipants')}</Text>
        </View>
      </SafeAreaView>
    );
  }

  return (
    <SafeAreaView style={[styles.container, { backgroundColor: theme.bg }]}>
      <ScrollView showsVerticalScrollIndicator={false}>
        <View style={styles.header}>
          <Text style={[styles.title, { color: theme.text }]}>{t('rateParticipantsTitle')}</Text>
          <Text style={[styles.subtitle, { color: theme.accent }]}>{eventTitle}</Text>
        </View>

        {loading ? (
          <ActivityIndicator color={theme.accent} style={{ marginTop: 40 }} />
        ) : participants.length === 0 ? (
          <View style={styles.emptyContainer}>
            <Text style={[styles.emptyText, { color: theme.subtext }]}>{t('noParticipantsToReview')}</Text>
          </View>
        ) : (
          participants.map(participant => (
            <View
              key={participant.id}
              style={[
                styles.card,
                { backgroundColor: theme.card, borderColor: theme.border },
                getShadowStyle()
              ]}
            >
              <View style={styles.cardHeader}>
                <AvatarImage value={participant.avatar} size={48} backgroundColor={theme.accentLight} textSize={24} />
                <View style={styles.info}>
                  <Text style={[styles.name, { color: theme.text }]}>{participant.name}</Text>
                  <StarPicker
                    value={ratings[participant.id] ?? 0}
                    onChange={v => setRatings(prev => ({ ...prev, [participant.id]: v }))}
                  />
                </View>
              </View>
              <TextInput
                style={[
                  styles.commentInput,
                  {
                    backgroundColor: theme.inputBg,
                    borderColor: focusedInputId === participant.id ? theme.accent : theme.border,
                    color: theme.text,
                  }
                ]}
                placeholder={t('reviewCommentPlaceholder')}
                placeholderTextColor={theme.subtext + '80'}
                value={comments[participant.id] ?? ''}
                onChangeText={t => setComments(prev => ({ ...prev, [participant.id]: t }))}
                onFocus={() => setFocusedInputId(participant.id)}
                onBlur={() => setFocusedInputId(null)}
                maxLength={120}
              />
            </View>
          ))
        )}

        {!loading && participants.length > 0 && (
          <TouchableOpacity
            style={[styles.submitBtn, { backgroundColor: theme.accent }, getShadowStyle()]}
            onPress={handleSubmit}
            activeOpacity={0.85}
          >
            <Text style={styles.submitBtnText}>{t('reviewSubmitBtn')} ⭐</Text>
          </TouchableOpacity>
        )}

        <TouchableOpacity style={styles.skipBtn} onPress={() => navigation.goBack()} activeOpacity={0.7}>
          <Text style={[styles.skipBtnText, { color: theme.subtext }]}>{t('skip')}</Text>
        </TouchableOpacity>

        <View style={{ height: 40 }} />
      </ScrollView>
    </SafeAreaView>
  );
}

const styles = StyleSheet.create({
  container: { flex: 1 },
  header: { padding: 24, paddingBottom: 12, width: '100%', maxWidth: 760, alignSelf: 'center' },
  title: { fontSize: 26, fontWeight: '900' },
  subtitle: { fontSize: 14, marginTop: 6, fontWeight: '700' },
  emptyContainer: { alignItems: 'center', paddingTop: 40 },
  emptyText: { fontSize: 15 },
  card: {
    borderRadius: 18, marginHorizontal: 16, marginVertical: 10,
    padding: 16,
    borderWidth: 1.5,
    maxWidth: 728, alignSelf: 'center',
    width: '92%',
  },
  cardHeader: { flexDirection: 'row', alignItems: 'center', gap: 14, marginBottom: 16 },
  info: { flex: 1 },
  name: { fontSize: 16, fontWeight: '800', marginBottom: 4 },
  starRow: { flexDirection: 'row', gap: 2 },
  starTouch: { paddingVertical: 4, paddingRight: 6 },
  star: { fontSize: 28 },
  commentInput: {
    borderRadius: 12,
    paddingHorizontal: 14,
    paddingVertical: 12,
    fontSize: 14,
    borderWidth: 1.5,
  },
  submitBtn: {
    marginHorizontal: 16, marginVertical: 24,
    borderRadius: 14, paddingVertical: 16, alignItems: 'center',
    width: '92%', maxWidth: 728, alignSelf: 'center',
  },
  submitBtnText: { fontSize: 16, fontWeight: '800', color: '#FFF' },
  skipBtn: { alignItems: 'center', paddingVertical: 12 },
  skipBtnText: { fontSize: 14, fontWeight: '700' },
  successContainer: { flex: 1, justifyContent: 'center', alignItems: 'center', padding: 24 },
  successEmoji: { fontSize: 72, marginBottom: 16 },
  successTitle: { fontSize: 28, fontWeight: '800', marginBottom: 8 },
  successText: { fontSize: 16, textAlign: 'center' },
});
