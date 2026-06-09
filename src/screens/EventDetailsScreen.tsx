import React from 'react';
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
import { categoryEmojis, categoryLabels, eventStatusColors, eventStatusLabels } from '../data/mockEvents';
import { getDistance, openRoute, useLocation } from '../hooks/useLocation';

type EventDetailsRoute = RouteProp<RootStackParamList, 'EventDetails'>;
type Nav = NativeStackNavigationProp<RootStackParamList>;

export default function EventDetailsScreen() {
  const route = useRoute<EventDetailsRoute>();
  const navigation = useNavigation<Nav>();
  const { eventId } = route.params;
  const { user } = useAuth();
  const { theme } = useTheme();
  const { events, joinEvent, leaveEvent, isJoined, updateEventStatus } = useEvents();
  const userLocation = useLocation();
  const event = events.find(e => e.id === eventId);

  if (!event) {
    return (
      <SafeAreaView style={[styles.container, { backgroundColor: theme.bg }]}>
        <Text style={[styles.empty, { color: theme.subtext }]}>Ивент не найден</Text>
      </SafeAreaView>
    );
  }

  const currentEvent = event;
  const status = currentEvent.status ?? 'active';
  const joined = !!user && isJoined(event.id, user.id);
  const canManage = !!user && (currentEvent.createdBy === user.id || user.role === 'moderator' || user.role === 'admin');
  const isActive = status === 'active';

  async function handleJoin() {
    if (!user) return;
    if (!joined && !isActive) {
      Alert.alert('', 'К этому ивенту уже нельзя присоединиться');
      return;
    }

    try {
      if (joined) await leaveEvent(currentEvent.id, user.id);
      else await joinEvent(currentEvent.id, user.id);
    } catch (e: any) {
      Alert.alert('Ошибка', e.message ?? 'Не удалось выполнить действие');
    }
  }

  async function setStatus(nextStatus: EventStatus, reason?: string) {
    try {
      await updateEventStatus(currentEvent.id, nextStatus, reason);
    } catch (e: any) {
      Alert.alert('Ошибка', e.message ?? 'Не удалось изменить статус');
    }
  }

  function cancelEvent() {
    if (Platform.OS === 'ios') {
      Alert.prompt('Причина отмены', 'Участники увидят эту причину', [
        { text: 'Назад', style: 'cancel' },
        { text: 'Отменить ивент', style: 'destructive', onPress: (reason?: string) => setStatus('cancelled', reason || 'Ивент отменен') },
      ]);
      return;
    }

    setStatus('cancelled', 'Ивент отменен');
  }

  async function shareEvent() {
    await Share.share({
      title: currentEvent.title,
      message: `Присоединяйся к ивенту "${currentEvent.title}" в Жолдас`,
    });
  }

  return (
    <SafeAreaView style={[styles.container, { backgroundColor: theme.bg }]}>
      <ScrollView contentContainerStyle={styles.content} showsVerticalScrollIndicator={false}>
        <View style={[styles.hero, { backgroundColor: theme.card, borderColor: theme.border }]}>
          {event.imageUri ? <Image source={{ uri: event.imageUri }} style={styles.heroImage} /> : null}
          <View style={styles.topRow}>
            <View style={styles.categoryBadge}>
              <Text>{categoryEmojis[event.category]}</Text>
              <Text style={styles.categoryText}>{categoryLabels[event.category]}</Text>
            </View>
            <View style={[styles.statusBadge, { backgroundColor: `${eventStatusColors[status]}18` }]}>
              <Text style={[styles.statusText, { color: eventStatusColors[status] }]}>
                {eventStatusLabels[status]}
              </Text>
            </View>
          </View>

          <Text style={[styles.title, { color: theme.text }]}>{event.title}</Text>
          <Text style={[styles.meta, { color: theme.subtext }]}>Время: {event.datetime}</Text>
          {event.address ? <Text style={[styles.meta, { color: theme.subtext }]}>Место: {event.address}</Text> : null}
          {userLocation ? (
            <Text style={[styles.meta, { color: theme.subtext }]}>
              Расстояние: {getDistance(userLocation, event.coordinate)}
            </Text>
          ) : (
            <Text style={[styles.meta, { color: theme.subtext }]}>Расстояние: включите геолокацию</Text>
          )}
          {event.cancelReason ? (
            <View style={styles.cancelBox}>
              <Text style={styles.cancelTitle}>Причина отмены</Text>
              <Text style={styles.cancelText}>{event.cancelReason}</Text>
            </View>
          ) : null}
        </View>

        <View style={[styles.section, { backgroundColor: theme.card, borderColor: theme.border }]}>
          <Text style={[styles.sectionTitle, { color: theme.text }]}>Описание</Text>
          <Text style={[styles.description, { color: theme.subtext }]}>{event.description}</Text>
        </View>

        <View style={[styles.section, { backgroundColor: theme.card, borderColor: theme.border }]}>
          <Text style={[styles.sectionTitle, { color: theme.text }]}>Участники</Text>
          <Text style={[styles.description, { color: theme.subtext }]}>
            {event.participantsCount}/{event.maxParticipants}
            {!!event.hiddenParticipantsCount ? ` · скрыто ${event.hiddenParticipantsCount}` : ''}
          </Text>
          <TouchableOpacity
            style={[styles.secondaryButton, { borderColor: theme.border }]}
            onPress={() => navigation.navigate('EventParticipants', { eventId: event.id, eventTitle: event.title })}
          >
            <Text style={[styles.secondaryButtonText, { color: theme.accent }]}>Посмотреть участников</Text>
          </TouchableOpacity>
        </View>

        <View style={styles.actions}>
          <TouchableOpacity
            style={[styles.primaryButton, (!isActive && !joined) && styles.disabledButton]}
            onPress={handleJoin}
            disabled={!joined && !isActive}
          >
            <Text style={styles.primaryButtonText}>
              {joined ? 'Выйти из ивента' : isActive ? 'Присоединиться' : eventStatusLabels[status]}
            </Text>
          </TouchableOpacity>

          {joined && (
            <TouchableOpacity
              style={[styles.primaryButton, styles.chatButton]}
              onPress={() => navigation.navigate('Chat', { eventId: event.id, eventTitle: event.title })}
            >
              <Text style={styles.primaryButtonText}>Открыть чат</Text>
            </TouchableOpacity>
          )}

          {status === 'finished' && joined && (
            <TouchableOpacity
              style={[styles.primaryButton, styles.reviewButton]}
              onPress={() => navigation.navigate('Review', { eventId: event.id, eventTitle: event.title })}
            >
              <Text style={styles.primaryButtonText}>Оценить участников</Text>
            </TouchableOpacity>
          )}

          <TouchableOpacity style={[styles.secondaryButton, { borderColor: theme.border }]} onPress={shareEvent}>
            <Text style={[styles.secondaryButtonText, { color: theme.accent }]}>Поделиться</Text>
          </TouchableOpacity>

          <TouchableOpacity
            style={[styles.secondaryButton, { borderColor: theme.border }]}
            onPress={() => openRoute(event.coordinate, event.title)}
          >
            <Text style={[styles.secondaryButtonText, { color: theme.accent }]}>Построить маршрут</Text>
          </TouchableOpacity>
        </View>

        {canManage && (
          <View style={[styles.section, { backgroundColor: theme.card, borderColor: theme.border }]}>
            <Text style={[styles.sectionTitle, { color: theme.text }]}>Управление</Text>
            <TouchableOpacity style={styles.manageButton} onPress={() => navigation.navigate('CreateEvent', { eventId: event.id })}>
              <Text style={styles.manageButtonText}>Редактировать</Text>
            </TouchableOpacity>
            {status !== 'finished' && (
              <TouchableOpacity style={styles.manageButton} onPress={() => setStatus('finished')}>
                <Text style={styles.manageButtonText}>Завершить</Text>
              </TouchableOpacity>
            )}
            {status !== 'cancelled' && (
              <TouchableOpacity style={[styles.manageButton, styles.dangerButton]} onPress={cancelEvent}>
                <Text style={styles.dangerButtonText}>Отменить</Text>
              </TouchableOpacity>
            )}
            {status !== 'active' && (
              <TouchableOpacity style={styles.manageButton} onPress={() => setStatus('active')}>
                <Text style={styles.manageButtonText}>Вернуть в активные</Text>
              </TouchableOpacity>
            )}
          </View>
        )}
      </ScrollView>
    </SafeAreaView>
  );
}

const styles = StyleSheet.create({
  container: { flex: 1 },
  content: { padding: 16, paddingBottom: 36 },
  empty: { marginTop: 40, textAlign: 'center', fontSize: 15 },
  hero: { borderWidth: 1, borderRadius: 16, padding: 16, marginBottom: 12, overflow: 'hidden' },
  heroImage: { height: 190, marginHorizontal: -16, marginTop: -16, marginBottom: 14 },
  topRow: { flexDirection: 'row', justifyContent: 'space-between', alignItems: 'center', marginBottom: 12 },
  categoryBadge: { flexDirection: 'row', alignItems: 'center', gap: 6, backgroundColor: '#F0EEFF', paddingHorizontal: 10, paddingVertical: 5, borderRadius: 14 },
  categoryText: { color: '#5B4FCF', fontWeight: '800', fontSize: 12 },
  statusBadge: { paddingHorizontal: 10, paddingVertical: 5, borderRadius: 14 },
  statusText: { fontSize: 12, fontWeight: '900' },
  title: { fontSize: 26, fontWeight: '900', marginBottom: 10 },
  meta: { fontSize: 14, lineHeight: 20, marginTop: 2 },
  cancelBox: { backgroundColor: '#FEE4E2', borderRadius: 12, padding: 12, marginTop: 12 },
  cancelTitle: { color: '#B42318', fontSize: 12, fontWeight: '900', marginBottom: 4 },
  cancelText: { color: '#B42318', fontSize: 13, lineHeight: 18 },
  section: { borderWidth: 1, borderRadius: 16, padding: 16, marginBottom: 12 },
  sectionTitle: { fontSize: 16, fontWeight: '900', marginBottom: 8 },
  description: { fontSize: 14, lineHeight: 20 },
  actions: { gap: 10, marginBottom: 12 },
  primaryButton: { backgroundColor: '#5B4FCF', borderRadius: 16, paddingVertical: 14, alignItems: 'center' },
  chatButton: { backgroundColor: '#2E9E5D' },
  reviewButton: { backgroundColor: '#F5A623' },
  disabledButton: { backgroundColor: '#C5BFFF' },
  primaryButtonText: { color: '#FFF', fontSize: 15, fontWeight: '900' },
  secondaryButton: { borderWidth: 1.5, borderRadius: 14, paddingVertical: 12, alignItems: 'center', marginTop: 10 },
  secondaryButtonText: { fontSize: 14, fontWeight: '900' },
  manageButton: { backgroundColor: '#F0EEFF', borderRadius: 14, paddingVertical: 12, alignItems: 'center', marginTop: 8 },
  manageButtonText: { color: '#5B4FCF', fontSize: 14, fontWeight: '900' },
  dangerButton: { backgroundColor: '#FEE4E2' },
  dangerButtonText: { color: '#B42318', fontSize: 14, fontWeight: '900' },
});
