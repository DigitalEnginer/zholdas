import React, { useState, useMemo } from 'react';
import {
  View, Text, FlatList, StyleSheet, TouchableOpacity,
  SafeAreaView, TextInput, Alert, ScrollView,
} from 'react-native';
import { useNavigation } from '@react-navigation/native';
import { NativeStackNavigationProp } from '@react-navigation/native-stack';
import { EventCategory, RootStackParamList } from '../types';
import { categoryLabels, eventStatusLabels } from '../data/mockEvents';
import EventCard from '../components/EventCard';
import { useEvents } from '../context/EventsContext';
import { useAuth } from '../context/AuthContext';
import { useLocation, getDistance, getDistanceKm } from '../hooks/useLocation';
import { useTheme } from '../context/ThemeContext';

type Nav = NativeStackNavigationProp<RootStackParamList, 'Main'>;

const FILTERS: Array<{ key: 'all' | EventCategory; label: string }> = [
  { key: 'all', label: 'Все' },
  { key: 'mountains', label: 'Горы' },
  { key: 'theatre', label: 'Театр' },
  { key: 'restaurant', label: 'Ресторан' },
  { key: 'sport', label: 'Спорт' },
  { key: 'other', label: 'Другое' },
];

export default function ListScreen() {
  const navigation = useNavigation<Nav>();
  const { theme } = useTheme();
  const { events, joinEvent, leaveEvent, isJoined } = useEvents();
  const { user } = useAuth();
  const userLocation = useLocation();
  const [activeFilter, setActiveFilter] = useState<'all' | EventCategory>('all');
  const [search, setSearch] = useState('');
  const [showJoinedOnly, setShowJoinedOnly] = useState(false);
  const [availableOnly, setAvailableOnly] = useState(false);
  const [nearOnly, setNearOnly] = useState(false);
  const [statusFilter, setStatusFilter] = useState<'all' | 'active' | 'finished' | 'cancelled'>('active');
  const [sortMode, setSortMode] = useState<'new' | 'near' | 'popular'>('new');

  const filtered = useMemo(() => {
    const next = events.filter(e => {
      if (activeFilter !== 'all' && e.category !== activeFilter) return false;
      if (statusFilter !== 'all' && (e.status ?? 'active') !== statusFilter) return false;
      if (availableOnly && e.participantsCount >= e.maxParticipants) return false;
      if (showJoinedOnly && user && !isJoined(e.id, user.id)) return false;
      if (nearOnly && userLocation) {
        if (getDistanceKm(userLocation, e.coordinate) > 5) return false;
      }
      if (search.trim()) {
        const q = search.toLowerCase();
        const haystack = `${e.title} ${e.description} ${e.address ?? ''}`.toLowerCase();
        if (!haystack.includes(q)) return false;
      }
      return true;
    });

    return [...next].sort((a, b) => {
      if (sortMode === 'popular') return b.participantsCount - a.participantsCount;
      if (sortMode === 'near' && userLocation) {
        return getDistanceKm(userLocation, a.coordinate) - getDistanceKm(userLocation, b.coordinate);
      }
      return 0;
    });
  }, [events, activeFilter, search, showJoinedOnly, availableOnly, nearOnly, statusFilter, sortMode, user, userLocation]);

  function handleJoin(eventId: string) {
    if (!user) return;
    const event = events.find(e => e.id === eventId);
    if (!event) return;
    if (!isJoined(eventId, user.id) && (event.status ?? 'active') !== 'active') {
      Alert.alert('', 'К этому ивенту уже нельзя присоединиться');
      return;
    }
    if (isJoined(eventId, user.id)) leaveEvent(eventId, user.id);
    else joinEvent(eventId, user.id).catch(e => Alert.alert('Ошибка', e.message));
  }

  function handleOpenChat(eventId: string, eventTitle: string) {
    navigation.navigate('EventDetails', { eventId });
  }

  return (
    <SafeAreaView style={[styles.container, { backgroundColor: theme.bg }]}>
      <View style={styles.header}>
        <View style={styles.titleRow}>
          <View style={styles.titleBlock}>
            <Text style={[styles.title, { color: theme.text }]}>События</Text>
            <Text style={[styles.subtitle, { color: theme.subtext }]}>Быстро найди активность рядом</Text>
          </View>
          <TouchableOpacity
            style={[styles.createBtn, { backgroundColor: theme.accent }]}
            onPress={() => navigation.navigate('CreateEvent')}
            activeOpacity={0.8}
          >
            <Text style={styles.createBtnText}>+ Создать</Text>
          </TouchableOpacity>
        </View>

        <View style={styles.searchRow}>
          <TextInput
            style={[
              styles.searchInput,
              {
                backgroundColor: theme.inputBg,
                borderColor: theme.border,
                color: theme.text,
              },
            ]}
            placeholder="Поиск событий..."
            placeholderTextColor={theme.subtext}
            value={search}
            onChangeText={setSearch}
            clearButtonMode="while-editing"
          />
          <TouchableOpacity
            style={[
              styles.joinedToggle,
              {
                backgroundColor: showJoinedOnly ? theme.accent : theme.inputBg,
                borderColor: showJoinedOnly ? theme.accent : theme.border,
              },
            ]}
            onPress={() => setShowJoinedOnly(v => !v)}
            activeOpacity={0.8}
          >
            <Text
              style={[
                styles.joinedToggleText,
                { color: showJoinedOnly ? '#FFFFFF' : theme.text },
              ]}
            >
              Мои
            </Text>
          </TouchableOpacity>
        </View>
      </View>

      <View style={styles.filtersScrollContainer}>
        <ScrollView
          horizontal
          showsHorizontalScrollIndicator={false}
          contentContainerStyle={styles.filtersScroll}
        >
          {FILTERS.map(filter => {
            const isActive = activeFilter === filter.key;
            return (
              <TouchableOpacity
                key={filter.key}
                style={[
                  styles.filterChip,
                  {
                    backgroundColor: isActive ? theme.accent : theme.card,
                    borderColor: isActive ? theme.accent : theme.border,
                  },
                ]}
                onPress={() => setActiveFilter(filter.key)}
                activeOpacity={0.8}
              >
                <Text
                  style={[
                    styles.filterLabel,
                    { color: isActive ? '#FFFFFF' : theme.subtext },
                  ]}
                >
                  {filter.label}
                </Text>
              </TouchableOpacity>
            );
          })}
        </ScrollView>
      </View>

      <View style={styles.quickFilters}>
        {[
          { key: 'active', label: 'Активные', onPress: () => setStatusFilter(statusFilter === 'active' ? 'all' : 'active'), active: statusFilter === 'active' },
          { key: 'available', label: 'Есть места', onPress: () => setAvailableOnly(v => !v), active: availableOnly },
          { key: 'near', label: 'Рядом', onPress: () => setNearOnly(v => !v), active: nearOnly },
        ].map(item => {
          const isActive = item.active;
          return (
            <TouchableOpacity
              key={item.key}
              style={[
                styles.quickChip,
                {
                  backgroundColor: isActive ? theme.accentLight : theme.card,
                  borderColor: isActive ? theme.accent : theme.border,
                },
              ]}
              onPress={item.onPress}
              activeOpacity={0.8}
            >
              <Text
                style={[
                  styles.quickText,
                  { color: isActive ? theme.accentText : theme.subtext },
                ]}
              >
                {item.label}
              </Text>
            </TouchableOpacity>
          );
        })}
        <TouchableOpacity
          style={[
            styles.quickChip,
            {
              backgroundColor: theme.card,
              borderColor: theme.border,
            },
          ]}
          onPress={() => setSortMode(sortMode === 'new' ? 'near' : sortMode === 'near' ? 'popular' : 'new')}
          activeOpacity={0.8}
        >
          <Text style={[styles.quickText, { color: theme.subtext }]}>
            {sortMode === 'near' ? 'Сначала рядом' : sortMode === 'popular' ? 'Популярные' : 'Новые'}
          </Text>
        </TouchableOpacity>
      </View>

      <Text style={[styles.count, { color: theme.subtext }]}>
        {filtered.length} активност{filtered.length === 1 ? 'ь' : 'и'}
        {statusFilter !== 'all' ? ` · ${eventStatusLabels[statusFilter]}` : ''}
      </Text>

      <FlatList
        data={filtered}
        keyExtractor={item => item.id}
        renderItem={({ item }) => (
          <EventCard
            event={item}
            joined={user ? isJoined(item.id, user.id) : false}
            distance={userLocation ? getDistance(userLocation, item.coordinate) : undefined}
            onPress={() => handleOpenChat(item.id, item.title)}
            onJoin={() => handleJoin(item.id)}
          />
        )}
        contentContainerStyle={styles.list}
        showsVerticalScrollIndicator={false}
        ListEmptyComponent={
          <View style={[styles.empty, { backgroundColor: theme.card, borderColor: theme.border }]}>
            <Text style={[styles.emptyText, { color: theme.text }]}>Ничего не найдено</Text>
            <Text style={[styles.emptyHint, { color: theme.subtext }]}>
              Попробуйте убрать фильтр или поискать другое место
            </Text>
          </View>
        }
      />
    </SafeAreaView>
  );
}

const styles = StyleSheet.create({
  container: { flex: 1 },
  header: { paddingHorizontal: 16, paddingTop: 14, paddingBottom: 8, width: '100%', maxWidth: 960, alignSelf: 'center' },
  titleRow: { flexDirection: 'row', justifyContent: 'space-between', alignItems: 'center', marginBottom: 12 },
  titleBlock: { flex: 1, paddingRight: 12 },
  title: { fontSize: 28, fontWeight: '800', letterSpacing: -0.5 },
  subtitle: { fontSize: 13, marginTop: 2, fontWeight: '500' },
  createBtn: { borderRadius: 10, paddingHorizontal: 14, paddingVertical: 8 },
  createBtnText: { fontSize: 13, fontWeight: '700', color: '#FFF' },
  searchRow: { flexDirection: 'row', gap: 8, marginBottom: 4 },
  searchInput: {
    flex: 1,
    borderRadius: 10,
    paddingHorizontal: 14,
    paddingVertical: 9,
    fontSize: 14,
    borderWidth: 1,
  },
  joinedToggle: {
    paddingHorizontal: 14,
    paddingVertical: 9,
    borderRadius: 10,
    borderWidth: 1,
    justifyContent: 'center',
  },
  joinedToggleText: { fontSize: 13, fontWeight: '700' },
  filtersScrollContainer: {
    width: '100%',
    maxWidth: 960,
    alignSelf: 'center',
    marginBottom: 6,
  },
  filtersScroll: {
    paddingHorizontal: 16,
    gap: 8,
    paddingVertical: 4,
  },
  filterChip: {
    flexDirection: 'row',
    alignItems: 'center',
    paddingHorizontal: 14,
    paddingVertical: 6,
    borderRadius: 20,
    borderWidth: 1,
  },
  filterLabel: { fontSize: 13, fontWeight: '600' },
  quickFilters: {
    flexDirection: 'row',
    flexWrap: 'wrap',
    gap: 6,
    paddingHorizontal: 16,
    paddingBottom: 8,
    width: '100%',
    maxWidth: 960,
    alignSelf: 'center',
  },
  quickChip: {
    paddingHorizontal: 12,
    paddingVertical: 6,
    borderRadius: 20,
    borderWidth: 1,
  },
  quickText: { fontSize: 12, fontWeight: '600' },
  count: { fontSize: 12, paddingHorizontal: 16, marginBottom: 4, width: '100%', maxWidth: 960, alignSelf: 'center', fontWeight: '500' },
  list: { paddingVertical: 4, paddingBottom: 24, paddingHorizontal: 0, width: '100%', maxWidth: 792, alignSelf: 'center' },
  empty: {
    alignItems: 'center',
    marginHorizontal: 16,
    marginTop: 48,
    paddingVertical: 32,
    paddingHorizontal: 18,
    borderWidth: 1,
    borderStyle: 'dashed',
    borderRadius: 16,
  },
  emptyText: {
    fontSize: 15,
    fontWeight: '700',
    marginBottom: 4,
  },
  emptyHint: {
    fontSize: 13,
    textAlign: 'center',
  },
});
