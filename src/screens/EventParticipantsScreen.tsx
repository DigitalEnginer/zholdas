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
  const { theme, isDark } = useTheme();
  const [participants, setParticipants] = useState<Participant[]>([]);
  const [loading, setLoading] = useState(true);
  const [creatorId, setCreatorId] = useState<string | null>(null);
  const canModerate = user?.role === 'moderator' || user?.role === 'admin';

  const getShadowStyle = () => ({
    shadowColor: isDark ? '#000' : '#0F172A',
    shadowOffset: { width: 0, height: 6 },
    shadowOpacity: isDark ? 0.35 : 0.05,
    shadowRadius: 12,
    elevation: 2,
  });

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
            <View style={[styles.listContainer, { backgroundColor: theme.card, borderColor: theme.border }, getShadowStyle()]}>
              {participants.map((participant, index) => {
                const isLast = index === participants.length - 1;
                return (
                  <TouchableOpacity
                    key={participant.id}
                    style={[
                      styles.rowTile,
                      !isLast && { borderBottomWidth: 1, borderBottomColor: theme.border }
                    ]}
                    onPress={() => openProfile(participant)}
                    activeOpacity={0.75}
                  >
                    <AvatarImage value={participant.avatar} size={44} backgroundColor={theme.accentLight} textSize={24} />
                    <View style={styles.info}>
                      <View style={styles.titleRow}>
                        <Text style={[styles.name, { color: theme.text }]}>{participant.name}</Text>
                        {participant.id === creatorId && (
                          <View style={[styles.organizerBadge, { backgroundColor: theme.accentLight }]}>
                            <Text style={[styles.organizerBadgeText, { color: theme.accent }]}>ОРГАНИЗАТОР</Text>
                          </View>
                        )}
                        {participant.isBanned && (
                          <View style={[styles.bannedBadge, { backgroundColor: isDark ? 'rgba(239, 68, 68, 0.15)' : '#FEE4E2' }]}>
                            <Text style={[styles.bannedBadgeText, { color: theme.danger }]}>Забанен</Text>
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
                      <TouchableOpacity
                        style={[
                          styles.removeBtn,
                          {
                            backgroundColor: isDark ? 'rgba(239, 68, 68, 0.15)' : 'rgba(239, 68, 68, 0.08)',
                            borderColor: theme.danger + '40'
                          }
                        ]}
                        onPress={() => removeParticipant(participant)}
                      >
                        <Text style={[styles.removeText, { color: theme.danger }]}>Удалить</Text>
                      </TouchableOpacity>
                    )}
                  </TouchableOpacity>
                );
              })}
            </View>
          )}
        </ScrollView>
      )}
    </SafeAreaView>
  );
}

const styles = StyleSheet.create({
  container: { flex: 1 },
  content: { padding: 16, paddingBottom: 36, width: '100%', maxWidth: 760, alignSelf: 'center' },
  empty: { textAlign: 'center', marginTop: 40, fontSize: 15 },
  listContainer: {
    borderRadius: 16,
    borderWidth: 1.5,
    overflow: 'hidden',
  },
  rowTile: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 12,
    padding: 16,
  },
  info: { flex: 1 },
  titleRow: { flexDirection: 'row', alignItems: 'center', gap: 8, flexWrap: 'wrap' },
  name: { fontSize: 15, fontWeight: '800' },
  meta: { fontSize: 12, marginTop: 3 },
  organizerBadge: {
    borderRadius: 6,
    paddingHorizontal: 8,
    paddingVertical: 3,
  },
  organizerBadgeText: { fontSize: 9, fontWeight: '800', letterSpacing: 0.5 },
  bannedBadge: {
    borderRadius: 6,
    paddingHorizontal: 8,
    paddingVertical: 3,
  },
  bannedBadgeText: { fontSize: 9, fontWeight: '800', letterSpacing: 0.5 },
  arrow: { fontSize: 22, marginRight: 4 },
  removeBtn: {
    marginLeft: 8,
    borderRadius: 10,
    borderWidth: 1,
    paddingHorizontal: 10,
    paddingVertical: 6,
  },
  removeText: { fontSize: 11, fontWeight: '800' },
});
