import React, { useState, useMemo } from 'react';
import {
  View, Text, FlatList, StyleSheet, TouchableOpacity,
  SafeAreaView, TextInput, Alert, ScrollView, Platform,
} from 'react-native';
import { useNavigation } from '@react-navigation/native';
import { NativeStackNavigationProp } from '@react-navigation/native-stack';
import { EventCategory, RootStackParamList } from '../types';
import EventCard from '../components/EventCard';
import { useEvents } from '../context/EventsContext';
import { useAuth } from '../context/AuthContext';
import { useLocation, getDistance, getDistanceKm } from '../hooks/useLocation';
import { useTheme } from '../context/ThemeContext';
import { useLanguage } from '../context/LanguageContext';

type Nav = NativeStackNavigationProp<RootStackParamList, 'Main'>;

const FILTERS: Array<{ key: 'all' | EventCategory; labelKey: string }> = [
  { key: 'all', labelKey: 'filterAll' },
  { key: 'mountains', labelKey: 'filterMountains' },
  { key: 'theatre', labelKey: 'filterTheatre' },
  { key: 'restaurant', labelKey: 'filterRestaurant' },
  { key: 'sport', labelKey: 'filterSport' },
  { key: 'other', labelKey: 'filterOther' },
];
const CONTENT_MAX_WIDTH = 1120;
const LIST_MAX_WIDTH = 1040;
const WEB_BOTTOM_SPACE = 128;
const NATIVE_BOTTOM_SPACE = 110;

export default function ListScreen() {
  const navigation = useNavigation<Nav>();
  const { theme } = useTheme();
  const { t } = useLanguage();
  const { events, joinEvent, isJoined } = useEvents();
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
      Alert.alert('', t('joinErrorClosed'));
      return;
    }
    if (!isJoined(eventId, user.id)) {
      joinEvent(eventId, user.id).catch(e => Alert.alert(t('error'), e.message));
    }
  }

  function handleOpenDetails(eventId: string) {
    navigation.navigate('EventDetails', { eventId });
  }

  return (
    <SafeAreaView style={[styles.container, { backgroundColor: theme.bg }]}>
      <View style={styles.pageFrame}>
      <View style={styles.header}>
        <View style={styles.titleRow}>
          <View style={styles.titleBlock}>
            <Text style={[styles.title, { color: theme.text }]}>{t('listTitle')}</Text>
            <Text style={[styles.subtitle, { color: theme.subtext }]}>{t('listSubtitle')}</Text>
          </View>
          <View style={{ flexDirection: 'row', gap: 8, alignItems: 'center' }}>
            <TouchableOpacity
              style={[styles.createBtn, { backgroundColor: theme.accent }]}
              onPress={() => navigation.navigate('CreateEvent')}
              activeOpacity={0.8}
            >
              <Text style={styles.createBtnText}>+ {t('createEventBtn')}</Text>
            </TouchableOpacity>
          </View>
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
            placeholder={t('searchEventsPlaceholder')}
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
              {t('myShort')}
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
                  {t(filter.labelKey)}
                </Text>
              </TouchableOpacity>
            );
          })}
        </ScrollView>
      </View>

      <View style={styles.quickFilters}>
        {[
          { key: 'active', label: t('quickActive'), onPress: () => setStatusFilter(statusFilter === 'active' ? 'all' : 'active'), active: statusFilter === 'active' },
          { key: 'available', label: t('quickAvailable'), onPress: () => setAvailableOnly(v => !v), active: availableOnly },
          { key: 'near', label: t('quickNear'), onPress: () => setNearOnly(v => !v), active: nearOnly },
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
            {sortMode === 'near' ? t('sortNear') : sortMode === 'popular' ? t('sortPopular') : t('sortNew')}
          </Text>
        </TouchableOpacity>
      </View>

      <Text style={[styles.count, { color: theme.subtext }]}>
        {filtered.length} {t('activityCountLabel')}
        {statusFilter !== 'all' ? ` · ${t(statusFilter === 'active' ? 'statusActive' : statusFilter === 'finished' ? 'statusFinished' : 'statusCancelled')}` : ''}
      </Text>

      <FlatList
        data={filtered}
        keyExtractor={item => item.id}
        renderItem={({ item }) => {
          const joined = user ? isJoined(item.id, user.id) : false;
          return (
            <EventCard
              event={item}
              joined={joined}
              distance={userLocation ? getDistance(userLocation, item.coordinate) : undefined}
              onPress={() => handleOpenDetails(item.id)}
              onJoin={() => joined
                ? navigation.navigate('Chat', { eventId: item.id, eventTitle: item.title })
                : handleJoin(item.id)}
            />
          );
        }}
        contentContainerStyle={styles.list}
        showsVerticalScrollIndicator={false}
        ListEmptyComponent={
          <View style={[styles.empty, { backgroundColor: theme.card, borderColor: theme.border }]}>
            <Text style={[styles.emptyText, { color: theme.text }]}>{t('emptySearchTitle')}</Text>
            <Text style={[styles.emptyHint, { color: theme.subtext }]}>
              {t('emptySearchHint')}
            </Text>
          </View>
        }
      />
      </View>
    </SafeAreaView>
  );
}

const styles = StyleSheet.create({
  container: { flex: 1 },
  pageFrame: {
    flex: 1,
    width: '100%',
    alignSelf: 'center',
  },
  header: {
    paddingHorizontal: 20,
    paddingTop: Platform.OS === 'web' ? 24 : 14,
    paddingBottom: 10,
    width: '100%',
    maxWidth: CONTENT_MAX_WIDTH,
    alignSelf: 'center',
  },
  titleRow: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'flex-start',
    gap: 14,
    marginBottom: 16,
  },
  titleBlock: { flex: 1, paddingRight: 12 },
  title: { fontSize: 30, fontWeight: '900' },
  subtitle: { fontSize: 14, marginTop: 4, fontWeight: '700' },
  createBtn: {
    borderRadius: 14,
    paddingHorizontal: 16,
    paddingVertical: 10,
    minHeight: 42,
    justifyContent: 'center',
  },
  createBtnText: { fontSize: 14, fontWeight: '900', color: '#FFF' },
  headerChatBtn: {
    width: 38,
    height: 38,
    borderRadius: 19,
    justifyContent: 'center',
    alignItems: 'center',
  },
  searchRow: { flexDirection: 'row', gap: 10, marginBottom: 6 },
  searchInput: {
    flex: 1,
    minHeight: 46,
    borderRadius: 14,
    paddingHorizontal: 16,
    paddingVertical: 11,
    fontSize: 15,
    borderWidth: 1,
  },
  joinedToggle: {
    minHeight: 46,
    paddingHorizontal: 16,
    paddingVertical: 11,
    borderRadius: 14,
    borderWidth: 1,
    justifyContent: 'center',
  },
  joinedToggleText: { fontSize: 14, fontWeight: '900' },
  filtersScrollContainer: {
    width: '100%',
    maxWidth: CONTENT_MAX_WIDTH,
    alignSelf: 'center',
    marginBottom: 8,
  },
  filtersScroll: {
    paddingHorizontal: 20,
    gap: 8,
    paddingVertical: 5,
  },
  filterChip: {
    flexDirection: 'row',
    alignItems: 'center',
    minHeight: 36,
    paddingHorizontal: 16,
    paddingVertical: 8,
    borderRadius: 20,
    borderWidth: 1,
  },
  filterLabel: { fontSize: 13, fontWeight: '800' },
  quickFilters: {
    flexDirection: 'row',
    flexWrap: 'wrap',
    gap: 8,
    paddingHorizontal: 20,
    paddingBottom: 8,
    width: '100%',
    maxWidth: CONTENT_MAX_WIDTH,
    alignSelf: 'center',
  },
  quickChip: {
    minHeight: 34,
    justifyContent: 'center',
    paddingHorizontal: 14,
    paddingVertical: 7,
    borderRadius: 20,
    borderWidth: 1,
  },
  quickText: { fontSize: 12, fontWeight: '800' },
  count: {
    fontSize: 13,
    paddingHorizontal: 20,
    marginBottom: 8,
    width: '100%',
    maxWidth: CONTENT_MAX_WIDTH,
    alignSelf: 'center',
    fontWeight: '800',
  },
  list: {
    paddingTop: 4,
    paddingBottom: Platform.OS === 'web' ? WEB_BOTTOM_SPACE : NATIVE_BOTTOM_SPACE,
    paddingHorizontal: 20,
    width: '100%',
    maxWidth: LIST_MAX_WIDTH,
    alignSelf: 'center',
  },
  empty: {
    alignItems: 'center',
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
