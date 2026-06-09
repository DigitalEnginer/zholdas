import React, { useEffect, useState } from 'react';
import {
  ActivityIndicator, Alert, SafeAreaView, ScrollView,
  StyleSheet, Text, TouchableOpacity, View,
} from 'react-native';
import { RouteProp, useNavigation, useRoute } from '@react-navigation/native';
import { NativeStackNavigationProp } from '@react-navigation/native-stack';
import { RootStackParamList } from '../types';
import { useAuth } from '../context/AuthContext';
import { useTheme } from '../context/ThemeContext';
import { supabase } from '../lib/supabase';
import AvatarImage from '../components/AvatarImage';

type ParticipantsRoute = RouteProp<RootStackParamList, 'EventParticipants'>;
type Nav = NativeStackNavigationProp<RootStackParamList>;

interface Participant {
  id: string;
  name: string;
  avatar: string;
  rating: number;
  isBanned: boolean;
}

export default function EventParticipantsScreen() {
  const route = useRoute<ParticipantsRoute>();
  const navigation = useNavigation<Nav>();
  const { eventId } = route.params;
  const { user } = useAuth();
  const { theme } = useTheme();
  const [participants, setParticipants] = useState<Participant[]>([]);
  const [loading, setLoading] = useState(true);
  const [creatorId, setCreatorId] = useState<string | null>(null);
  const canModerate = user?.role === 'moderator' || user?.role === 'admin';

  useEffect(() => {
    loadParticipants();
  }, [eventId]);

  async function loadParticipants() {
    const { data, error } = await supabase
      .from('event_participants')
      .select('user_id, profiles(id, name, avatar, rating, is_banned)')
      .eq('event_id', eventId);
    const { data: eventData } = await supabase
      .from('events')
      .select('created_by')
      .eq('id', eventId)
      .single();
    setCreatorId(eventData?.created_by ?? null);

    if (error) {
      Alert.alert('Не удалось загрузить участников', error.message);
      setLoading(false);
      return;
    }

    setParticipants((data ?? [])
      .filter((row: any) => canModerate || !row.profiles?.is_banned)
      .map((row: any) => ({
        id: row.user_id,
        name: row.profiles?.name ?? 'Пользователь',
        avatar: row.profiles?.avatar ?? '👤',
        rating: Number(row.profiles?.rating ?? 0),
        isBanned: !!row.profiles?.is_banned,
      })));
    setLoading(false);
  }

  function openProfile(participant: Participant) {
    navigation.navigate('UserProfile', {
      userId: participant.id,
      userName: participant.name,
      userAvatar: participant.avatar,
    });
  }

  async function removeParticipant(participant: Participant) {
    if (!user || participant.id === user.id) return;

    Alert.alert('Удалить участника?', participant.name, [
      { text: 'Отмена', style: 'cancel' },
      {
        text: 'Удалить',
        style: 'destructive',
        onPress: async () => {
          const { error } = await supabase
            .from('event_participants')
            .delete()
            .eq('event_id', eventId)
            .eq('user_id', participant.id);

          if (error) {
            Alert.alert('Не удалось удалить', error.message);
            return;
          }

          setParticipants(prev => prev.filter(item => item.id !== participant.id));
        },
      },
    ]);
  }

  return (
    <SafeAreaView style={[styles.container, { backgroundColor: theme.bg }]}>
      {loading ? (
        <ActivityIndicator color={theme.accent} style={{ flex: 1 }} />
      ) : (
        <ScrollView contentContainerStyle={styles.content} showsVerticalScrollIndicator={false}>
          {participants.length === 0 ? (
            <Text style={[styles.empty, { color: theme.subtext }]}>Участников пока нет</Text>
          ) : (
            participants.map(participant => (
              <TouchableOpacity
                key={participant.id}
                style={[styles.row, { backgroundColor: theme.card, borderColor: theme.border }]}
                onPress={() => openProfile(participant)}
                activeOpacity={0.75}
              >
                <AvatarImage value={participant.avatar} size={44} backgroundColor={theme.accentLight} textSize={24} />
                <View style={styles.info}>
                  <View style={styles.titleRow}>
                    <Text style={[styles.name, { color: theme.text }]}>{participant.name}</Text>
                    {participant.isBanned && (
                      <View style={styles.bannedBadge}>
                        <Text style={styles.bannedBadgeText}>Забанен</Text>
                      </View>
                    )}
                  </View>
                  <Text style={[styles.meta, { color: theme.subtext }]}>
                    {participant.isBanned
                      ? 'Скрыт для обычных пользователей'
                      : participant.id === user?.id
                        ? 'Это вы'
                        : participant.rating > 0
                          ? `Рейтинг ${participant.rating.toFixed(1)}`
                          : 'Профиль участника'}
                  </Text>
                </View>
                <Text style={[styles.arrow, { color: theme.subtext }]}>›</Text>
                {(canModerate || creatorId === user?.id) && participant.id !== user?.id && (
                  <TouchableOpacity style={styles.removeBtn} onPress={() => removeParticipant(participant)}>
                    <Text style={styles.removeText}>Удалить</Text>
                  </TouchableOpacity>
                )}
              </TouchableOpacity>
            ))
          )}
        </ScrollView>
      )}
    </SafeAreaView>
  );
}

const styles = StyleSheet.create({
  container: { flex: 1 },
  content: { padding: 16, paddingBottom: 36 },
  empty: { textAlign: 'center', marginTop: 40, fontSize: 15 },
  row: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 12,
    borderWidth: 1,
    borderRadius: 14,
    padding: 14,
    marginBottom: 10,
  },
  info: { flex: 1 },
  titleRow: { flexDirection: 'row', alignItems: 'center', gap: 8, flexWrap: 'wrap' },
  name: { fontSize: 16, fontWeight: '800' },
  meta: { fontSize: 12, marginTop: 3 },
  bannedBadge: {
    borderRadius: 8,
    backgroundColor: '#FEE4E2',
    paddingHorizontal: 7,
    paddingVertical: 3,
  },
  bannedBadgeText: { color: '#B42318', fontSize: 10, fontWeight: '800' },
  arrow: { fontSize: 24 },
  removeBtn: {
    marginLeft: 8,
    borderRadius: 12,
    backgroundColor: '#FEE4E2',
    paddingHorizontal: 8,
    paddingVertical: 6,
  },
  removeText: { color: '#B42318', fontSize: 11, fontWeight: '800' },
});
