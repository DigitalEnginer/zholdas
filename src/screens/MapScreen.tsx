import React, { useState, useRef } from 'react';
import {
  View, Text, StyleSheet, TouchableOpacity, Animated, ScrollView, Alert,
} from 'react-native';
import MapView, { Marker, Polyline, PROVIDER_DEFAULT } from 'react-native-maps';
import { useNavigation } from '@react-navigation/native';
import { NativeStackNavigationProp } from '@react-navigation/native-stack';
import { EventCategory, RootStackParamList } from '../types';
import { categoryEmojis, categoryLabels, eventStatusColors, eventStatusLabels } from '../data/mockEvents';
import EventMarker from '../components/EventMarker';
import { useEvents } from '../context/EventsContext';
import { useAuth } from '../context/AuthContext';
import { useLocation, getDistance } from '../hooks/useLocation';

type Nav = NativeStackNavigationProp<RootStackParamList, 'Main'>;

const ALMATY_REGION = {
  latitude: 43.238, longitude: 76.945,
  latitudeDelta: 0.18, longitudeDelta: 0.18,
};

const MAP_FILTERS: Array<{ key: 'all' | EventCategory; label: string; emoji: string }> = [
  { key: 'all', label: 'Все', emoji: '🌟' },
  { key: 'mountains', label: 'Горы', emoji: '⛰️' },
  { key: 'theatre', label: 'Театр', emoji: '🎭' },
  { key: 'restaurant', label: 'Ресторан', emoji: '🍽️' },
  { key: 'sport', label: 'Спорт', emoji: '⚽' },
  { key: 'other', label: 'Другое', emoji: '✨' },
];

export default function MapScreen() {
  const navigation = useNavigation<Nav>();
  const { events, joinEvent, leaveEvent, isJoined } = useEvents();
  const { user } = useAuth();
  const userLocation = useLocation();
  const mapRef = useRef<MapView>(null);
  const [selectedId, setSelectedId] = useState<string | null>(null);
  const [routeTargetId, setRouteTargetId] = useState<string | null>(null);
  const [mapFilter, setMapFilter] = useState<'all' | EventCategory>('all');
  const slideAnim = useRef(new Animated.Value(320)).current;

  const filteredEvents = mapFilter === 'all' ? events : events.filter(e => e.category === mapFilter);
  const selectedEvent = filteredEvents.find(e => e.id === selectedId) ?? null;
  const routeTarget = events.find(e => e.id === routeTargetId) ?? null;

  function openSheet(id: string) {
    setSelectedId(id);
    Animated.spring(slideAnim, { toValue: 0, useNativeDriver: true, tension: 65, friction: 10 }).start();
  }

  function closeSheet() {
    Animated.timing(slideAnim, { toValue: 320, duration: 220, useNativeDriver: true }).start(() => setSelectedId(null));
  }

  function handleJoin() {
    if (!selectedEvent || !user) return;
    if (!isJoined(selectedEvent.id, user.id) && (selectedEvent.status ?? 'active') !== 'active') {
      Alert.alert('', 'К этому ивенту уже нельзя присоединиться');
      return;
    }
    if (isJoined(selectedEvent.id, user.id)) leaveEvent(selectedEvent.id, user.id);
    else joinEvent(selectedEvent.id, user.id).catch(e => Alert.alert('Ошибка', e.message));
  }

  function showRoute() {
    if (!selectedEvent) return;
    if (!userLocation) {
      Alert.alert('', 'Разреши геолокацию, чтобы построить маршрут');
      return;
    }

    setRouteTargetId(selectedEvent.id);
    mapRef.current?.fitToCoordinates([userLocation, selectedEvent.coordinate], {
      edgePadding: { top: 180, right: 70, bottom: 360, left: 70 },
      animated: true,
    });
  }

  return (
    <View style={styles.container}>
      <MapView
        ref={mapRef}
        style={styles.map}
        provider={PROVIDER_DEFAULT}
        initialRegion={ALMATY_REGION}
        showsUserLocation={false}
        showsCompass={false}
      >
        {userLocation && (
          <Marker coordinate={userLocation} anchor={{ x: 0.5, y: 0.5 }}>
            <View style={styles.userMarker}>
              <View style={styles.userMarkerCore} />
            </View>
          </Marker>
        )}
        {userLocation && routeTarget && (
          <Polyline
            coordinates={[userLocation, routeTarget.coordinate]}
            strokeColor="#2E9E5D"
            strokeWidth={5}
          />
        )}
        {filteredEvents.map(event => (
          <EventMarker
            key={event.id}
            event={event}
            joined={user ? isJoined(event.id, user.id) : false}
            onCalloutPress={() => openSheet(event.id)}
          />
        ))}
      </MapView>

      <View style={styles.header}>
        <Text style={styles.headerTitle}>🗺 Жолдас</Text>
        <Text style={styles.headerSubtitle}>{filteredEvents.length} ивента в Алматы</Text>
      </View>

      <View style={styles.filterBar}>
        <ScrollView horizontal showsHorizontalScrollIndicator={false} contentContainerStyle={styles.filterScroll}>
          {MAP_FILTERS.map(f => (
            <TouchableOpacity
              key={f.key}
              style={[styles.filterChip, mapFilter === f.key && styles.filterChipActive]}
              onPress={() => { setMapFilter(f.key); closeSheet(); }}
              activeOpacity={0.7}
            >
              <Text style={styles.filterEmoji}>{f.emoji}</Text>
              <Text style={[styles.filterLabel, mapFilter === f.key && styles.filterLabelActive]}>{f.label}</Text>
            </TouchableOpacity>
          ))}
        </ScrollView>
      </View>

      {routeTarget && (
        <View style={styles.routeBanner}>
          <View style={{ flex: 1 }}>
            <Text style={styles.routeBannerTitle}>Маршрут показан</Text>
            <Text style={styles.routeBannerText} numberOfLines={1}>
              {userLocation ? `${getDistance(userLocation, routeTarget.coordinate)} до "${routeTarget.title}"` : routeTarget.title}
            </Text>
          </View>
          <TouchableOpacity style={styles.routeClose} onPress={() => setRouteTargetId(null)}>
            <Text style={styles.routeCloseText}>×</Text>
          </TouchableOpacity>
        </View>
      )}

      <TouchableOpacity
        style={styles.createFab}
        onPress={() => navigation.navigate('CreateEvent')}
        activeOpacity={0.85}
      >
        <Text style={styles.createFabText}>+ Создать</Text>
      </TouchableOpacity>

      {selectedEvent && (
        <TouchableOpacity style={styles.overlay} activeOpacity={1} onPress={closeSheet} />
      )}

      {selectedEvent && (
        <Animated.View style={[styles.sheet, { transform: [{ translateY: slideAnim }] }]}>
          <View style={styles.sheetHandle} />
          <View style={styles.sheetHeader}>
            <View style={styles.categoryBadge}>
              <Text>{categoryEmojis[selectedEvent.category]}</Text>
              <Text style={styles.categoryText}>{categoryLabels[selectedEvent.category]}</Text>
            </View>
            <TouchableOpacity onPress={closeSheet} style={styles.closeBtn}>
              <Text style={styles.closeBtnText}>✕</Text>
            </TouchableOpacity>
          </View>

          <Text style={styles.sheetTitle}>{selectedEvent.title}</Text>
          {(selectedEvent.status ?? 'active') !== 'active' && (
            <View style={[
              styles.statusBadge,
              { backgroundColor: `${eventStatusColors[selectedEvent.status ?? 'active']}18` },
            ]}>
              <Text style={[
                styles.statusText,
                { color: eventStatusColors[selectedEvent.status ?? 'active'] },
              ]}>
                {eventStatusLabels[selectedEvent.status ?? 'active']}
              </Text>
            </View>
          )}
          <View style={styles.sheetMeta}>
            <Text style={styles.sheetTime}>🕐 {selectedEvent.datetime}</Text>
            {userLocation && (
              <Text style={styles.sheetDist}>
                📍 {getDistance(userLocation, selectedEvent.coordinate)}
              </Text>
            )}
          </View>
          <Text style={styles.sheetDesc}>{selectedEvent.description}</Text>

          <View style={styles.sheetParticipants}>
            <Text style={styles.participantsLabel}>
              👥 {selectedEvent.participantsCount} из {selectedEvent.maxParticipants} участников
              {!!selectedEvent.hiddenParticipantsCount ? ` · скрыто ${selectedEvent.hiddenParticipantsCount}` : ''}
            </Text>
            <View style={styles.progressBar}>
              <View style={[styles.progressFill, {
                width: `${Math.min(100, (selectedEvent.participantsCount / selectedEvent.maxParticipants) * 100)}%`
              }]} />
            </View>
          </View>

          <View style={styles.sheetActions}>
            <TouchableOpacity
              style={styles.detailsBtn}
              onPress={() => {
                closeSheet();
                navigation.navigate('EventDetails', { eventId: selectedEvent.id });
              }}
            >
              <Text style={styles.detailsBtnText}>Подробнее</Text>
            </TouchableOpacity>
            <TouchableOpacity
              style={styles.routeBtn}
              onPress={showRoute}
            >
              <Text style={styles.routeBtnText}>Маршрут</Text>
            </TouchableOpacity>
            <TouchableOpacity
              style={[styles.joinBtn, user && isJoined(selectedEvent.id, user.id) && styles.joinBtnActive]}
              onPress={handleJoin}
              disabled={!user || (!isJoined(selectedEvent.id, user.id) && (selectedEvent.status ?? 'active') !== 'active')}
            >
              <Text style={[styles.joinBtnText, user && isJoined(selectedEvent.id, user.id) && styles.joinBtnTextActive]}>
                {user && isJoined(selectedEvent.id, user.id)
                  ? '✓ Вы в группе'
                  : (selectedEvent.status ?? 'active') !== 'active'
                    ? eventStatusLabels[selectedEvent.status ?? 'active']
                    : 'Присоединиться'}
              </Text>
            </TouchableOpacity>
            {user && isJoined(selectedEvent.id, user.id) && (
              <TouchableOpacity
                style={styles.chatBtn}
                onPress={() => {
                  closeSheet();
                  navigation.navigate('Chat', { eventId: selectedEvent.id, eventTitle: selectedEvent.title });
                }}
              >
                <Text style={styles.chatBtnText}>💬 Чат</Text>
              </TouchableOpacity>
            )}
          </View>
        </Animated.View>
      )}
    </View>
  );
}

const styles = StyleSheet.create({
  container: { flex: 1 },
  map: { flex: 1 },
  userMarker: {
    width: 26,
    height: 26,
    borderRadius: 13,
    backgroundColor: 'rgba(47, 128, 237, 0.18)',
    borderWidth: 2,
    borderColor: '#2F80ED',
    justifyContent: 'center',
    alignItems: 'center',
  },
  userMarkerCore: {
    width: 10,
    height: 10,
    borderRadius: 5,
    backgroundColor: '#2F80ED',
  },
  header: {
    position: 'absolute', top: 56, left: 16, right: 16,
    backgroundColor: 'rgba(255,255,255,0.95)', borderRadius: 16, padding: 14,
    shadowColor: '#000', shadowOffset: { width: 0, height: 2 },
    shadowOpacity: 0.1, shadowRadius: 8, elevation: 4,
  },
  headerTitle: { fontSize: 18, fontWeight: '800', color: '#1A1A2E' },
  headerSubtitle: { fontSize: 12, color: '#888', marginTop: 2 },
  filterBar: {
    position: 'absolute', top: 148, left: 0, right: 0,
  },
  filterScroll: { paddingHorizontal: 16, gap: 8 },
  filterChip: {
    flexDirection: 'row', alignItems: 'center', gap: 4,
    paddingHorizontal: 12, paddingVertical: 7, borderRadius: 20,
    backgroundColor: 'rgba(255,255,255,0.95)',
    borderWidth: 1.5, borderColor: '#E8E5FF',
    shadowColor: '#000', shadowOffset: { width: 0, height: 1 },
    shadowOpacity: 0.08, shadowRadius: 4, elevation: 2,
  },
  filterChipActive: { backgroundColor: '#5B4FCF', borderColor: '#5B4FCF' },
  filterEmoji: { fontSize: 13 },
  filterLabel: { fontSize: 12, color: '#555', fontWeight: '600' },
  filterLabelActive: { color: '#FFF' },
  routeBanner: {
    position: 'absolute',
    top: 202,
    left: 16,
    right: 16,
    backgroundColor: 'rgba(255,255,255,0.96)',
    borderRadius: 16,
    paddingHorizontal: 14,
    paddingVertical: 12,
    flexDirection: 'row',
    alignItems: 'center',
    gap: 12,
    shadowColor: '#000',
    shadowOffset: { width: 0, height: 2 },
    shadowOpacity: 0.1,
    shadowRadius: 8,
    elevation: 4,
  },
  routeBannerTitle: { color: '#2E9E5D', fontSize: 13, fontWeight: '900' },
  routeBannerText: { color: '#555', fontSize: 12, marginTop: 2 },
  routeClose: {
    width: 30,
    height: 30,
    borderRadius: 15,
    backgroundColor: '#EAF7EF',
    alignItems: 'center',
    justifyContent: 'center',
  },
  routeCloseText: { color: '#2E9E5D', fontSize: 22, fontWeight: '700', lineHeight: 24 },
  createFab: {
    position: 'absolute', bottom: 100, right: 16,
    backgroundColor: '#5B4FCF', borderRadius: 24,
    paddingHorizontal: 18, paddingVertical: 12,
    shadowColor: '#5B4FCF', shadowOffset: { width: 0, height: 4 },
    shadowOpacity: 0.35, shadowRadius: 10, elevation: 6,
  },
  createFabText: { fontSize: 14, fontWeight: '800', color: '#FFF' },
  overlay: {
    position: 'absolute', top: 0, left: 0, right: 0, bottom: 0,
    backgroundColor: 'transparent',
  },
  sheet: {
    position: 'absolute', bottom: 0, left: 0, right: 0,
    backgroundColor: '#FFF', borderTopLeftRadius: 24, borderTopRightRadius: 24,
    padding: 20, paddingBottom: 36,
    shadowColor: '#000', shadowOffset: { width: 0, height: -4 },
    shadowOpacity: 0.12, shadowRadius: 16, elevation: 12,
  },
  sheetHandle: {
    width: 40, height: 4, backgroundColor: '#E0E0E0',
    borderRadius: 2, alignSelf: 'center', marginBottom: 16,
  },
  sheetHeader: {
    flexDirection: 'row', justifyContent: 'space-between',
    alignItems: 'center', marginBottom: 10,
  },
  categoryBadge: {
    flexDirection: 'row', alignItems: 'center', gap: 6,
    backgroundColor: '#F0EEFF', paddingHorizontal: 12, paddingVertical: 5, borderRadius: 20,
  },
  categoryText: { fontSize: 12, color: '#5B4FCF', fontWeight: '600' },
  closeBtn: {
    width: 30, height: 30, borderRadius: 15,
    backgroundColor: '#F5F5F5', justifyContent: 'center', alignItems: 'center',
  },
  closeBtnText: { fontSize: 14, color: '#666' },
  sheetTitle: { fontSize: 22, fontWeight: '800', color: '#1A1A2E', marginBottom: 6 },
  statusBadge: { alignSelf: 'flex-start', paddingHorizontal: 10, paddingVertical: 4, borderRadius: 12, marginBottom: 8 },
  statusText: { fontSize: 12, fontWeight: '800' },
  sheetMeta: { flexDirection: 'row', gap: 12, marginBottom: 10 },
  sheetTime: { fontSize: 14, color: '#5B4FCF', fontWeight: '500' },
  sheetDist: { fontSize: 14, color: '#5B4FCF', fontWeight: '500' },
  sheetDesc: { fontSize: 14, color: '#666', lineHeight: 20, marginBottom: 14 },
  sheetParticipants: { marginBottom: 18 },
  participantsLabel: { fontSize: 13, color: '#555', marginBottom: 8, fontWeight: '500' },
  progressBar: { height: 6, backgroundColor: '#F0EEFF', borderRadius: 3, overflow: 'hidden' },
  progressFill: { height: '100%', backgroundColor: '#5B4FCF', borderRadius: 3 },
  sheetActions: { flexDirection: 'row', flexWrap: 'wrap', gap: 10 },
  detailsBtn: {
    width: '47.5%', borderRadius: 16, paddingVertical: 13, alignItems: 'center',
    backgroundColor: '#F0EEFF',
  },
  detailsBtnText: { fontSize: 14, fontWeight: '800', color: '#5B4FCF' },
  routeBtn: {
    width: '47.5%', borderRadius: 16, paddingVertical: 13, alignItems: 'center',
    backgroundColor: '#EAF7EF',
  },
  routeBtnText: { fontSize: 14, fontWeight: '800', color: '#2E9E5D' },
  joinBtn: {
    width: '47.5%', paddingVertical: 13, borderRadius: 16,
    borderWidth: 2, borderColor: '#5B4FCF', alignItems: 'center',
  },
  joinBtnActive: { backgroundColor: '#5B4FCF' },
  joinBtnText: { fontSize: 14, fontWeight: '800', color: '#5B4FCF' },
  joinBtnTextActive: { color: '#FFF' },
  chatBtn: {
    width: '47.5%', paddingVertical: 13,
    borderRadius: 16, backgroundColor: '#F0EEFF', alignItems: 'center',
  },
  chatBtnText: { fontSize: 14, fontWeight: '800', color: '#5B4FCF' },
});
