import React, { useState, useMemo } from 'react';
import {
  View, Text, FlatList, StyleSheet, TouchableOpacity,
  SafeAreaView, TextInput,
} from 'react-native';
import { useNavigation } from '@react-navigation/native';
import { NativeStackNavigationProp } from '@react-navigation/native-stack';
import { EventCategory, RootStackParamList } from '../types';
import { categoryEmojis, categoryLabels } from '../data/mockEvents';
import EventCard from '../components/EventCard';
import { useEvents } from '../context/EventsContext';
import { useAuth } from '../context/AuthContext';
import { useLocation, getDistance } from '../hooks/useLocation';

type Nav = NativeStackNavigationProp<RootStackParamList, 'Main'>;

const FILTERS: Array<{ key: 'all' | EventCategory; label: string; emoji: string }> = [
  { key: 'all', label: 'Все', emoji: '🌟' },
  { key: 'mountains', label: 'Горы', emoji: '⛰️' },
  { key: 'theatre', label: 'Театр', emoji: '🎭' },
  { key: 'restaurant', label: 'Ресторан', emoji: '🍽️' },
  { key: 'sport', label: 'Спорт', emoji: '⚽' },
  { key: 'other', label: 'Другое', emoji: '✨' },
];

export default function ListScreen() {
  const navigation = useNavigation<Nav>();
  const { events, joinEvent, leaveEvent, isJoined } = useEvents();
  const { user } = useAuth();
  const userLocation = useLocation();
  const [activeFilter, setActiveFilter] = useState<'all' | EventCategory>('all');
  const [search, setSearch] = useState('');
  const [showJoinedOnly, setShowJoinedOnly] = useState(false);

  const filtered = useMemo(() => {
    return events.filter(e => {
      if (activeFilter !== 'all' && e.category !== activeFilter) return false;
      if (showJoinedOnly && user && !isJoined(e.id, user.id)) return false;
      if (search.trim()) {
        const q = search.toLowerCase();
        if (!e.title.toLowerCase().includes(q) && !e.description.toLowerCase().includes(q)) return false;
      }
      return true;
    });
  }, [events, activeFilter, search, showJoinedOnly, user]);

  function handleJoin(eventId: string) {
    if (!user) return;
    if (isJoined(eventId, user.id)) leaveEvent(eventId, user.id);
    else joinEvent(eventId, user.id);
  }

  function handleOpenChat(eventId: string, eventTitle: string) {
    if (user && isJoined(eventId, user.id)) {
      navigation.navigate('Chat', { eventId, eventTitle });
    }
  }

  return (
    <SafeAreaView style={styles.container}>
      <View style={styles.header}>
        <View style={styles.titleRow}>
          <Text style={styles.title}>Ивенты</Text>
          <TouchableOpacity
            style={styles.createBtn}
            onPress={() => navigation.navigate('CreateEvent')}
          >
            <Text style={styles.createBtnText}>+ Создать</Text>
          </TouchableOpacity>
        </View>

        <View style={styles.searchRow}>
          <TextInput
            style={styles.searchInput}
            placeholder="🔍  Поиск ивентов..."
            placeholderTextColor="#AAA"
            value={search}
            onChangeText={setSearch}
            clearButtonMode="while-editing"
          />
          <TouchableOpacity
            style={[styles.joinedToggle, showJoinedOnly && styles.joinedToggleActive]}
            onPress={() => setShowJoinedOnly(v => !v)}
          >
            <Text style={[styles.joinedToggleText, showJoinedOnly && styles.joinedToggleTextActive]}>Мои</Text>
          </TouchableOpacity>
        </View>
      </View>

      <View style={styles.filters}>
        {FILTERS.map(filter => (
          <TouchableOpacity
            key={filter.key}
            style={[styles.filterChip, activeFilter === filter.key && styles.filterChipActive]}
            onPress={() => setActiveFilter(filter.key)}
            activeOpacity={0.7}
          >
            <Text style={styles.filterEmoji}>{filter.emoji}</Text>
            <Text style={[styles.filterLabel, activeFilter === filter.key && styles.filterLabelActive]}>
              {filter.label}
            </Text>
          </TouchableOpacity>
        ))}
      </View>

      <Text style={styles.count}>{filtered.length} активност{filtered.length === 1 ? 'ь' : 'и'}</Text>

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
          <View style={styles.empty}>
            <Text style={styles.emptyIcon}>🔍</Text>
            <Text style={styles.emptyText}>Ничего не найдено</Text>
          </View>
        }
      />
    </SafeAreaView>
  );
}

const styles = StyleSheet.create({
  container: { flex: 1, backgroundColor: '#F8F7FF' },
  header: { paddingHorizontal: 16, paddingTop: 12, paddingBottom: 8 },
  titleRow: { flexDirection: 'row', justifyContent: 'space-between', alignItems: 'center', marginBottom: 12 },
  title: { fontSize: 28, fontWeight: '800', color: '#1A1A2E' },
  createBtn: { backgroundColor: '#5B4FCF', borderRadius: 20, paddingHorizontal: 14, paddingVertical: 7 },
  createBtnText: { fontSize: 13, fontWeight: '700', color: '#FFF' },
  searchRow: { flexDirection: 'row', gap: 8, marginBottom: 4 },
  searchInput: {
    flex: 1, backgroundColor: '#FFF', borderRadius: 14,
    paddingHorizontal: 14, paddingVertical: 10,
    fontSize: 14, color: '#1A1A2E', borderWidth: 1.5, borderColor: '#E8E5FF',
  },
  joinedToggle: {
    paddingHorizontal: 14, paddingVertical: 10, borderRadius: 14,
    backgroundColor: '#FFF', borderWidth: 1.5, borderColor: '#E8E5FF', justifyContent: 'center',
  },
  joinedToggleActive: { backgroundColor: '#5B4FCF', borderColor: '#5B4FCF' },
  joinedToggleText: { fontSize: 13, fontWeight: '700', color: '#5B4FCF' },
  joinedToggleTextActive: { color: '#FFF' },
  filters: { flexDirection: 'row', paddingHorizontal: 12, paddingBottom: 8, gap: 6, flexWrap: 'wrap' },
  filterChip: {
    flexDirection: 'row', alignItems: 'center', gap: 4,
    paddingHorizontal: 12, paddingVertical: 7, borderRadius: 20,
    backgroundColor: '#FFF', borderWidth: 1.5, borderColor: '#E8E5FF',
  },
  filterChipActive: { backgroundColor: '#5B4FCF', borderColor: '#5B4FCF' },
  filterEmoji: { fontSize: 13 },
  filterLabel: { fontSize: 13, color: '#555', fontWeight: '500' },
  filterLabelActive: { color: '#FFF', fontWeight: '700' },
  count: { fontSize: 12, color: '#AAA', paddingHorizontal: 16, marginBottom: 4 },
  list: { paddingVertical: 4, paddingBottom: 24 },
  empty: { alignItems: 'center', paddingTop: 60 },
  emptyIcon: { fontSize: 40, marginBottom: 12 },
  emptyText: { fontSize: 15, color: '#AAA' },
});
