import 'leaflet/dist/leaflet.css';
import React, { useMemo, useState } from 'react';
import {
  View, Text, StyleSheet, TouchableOpacity, ScrollView, Alert,
} from 'react-native';
import { MapContainer, Marker, Popup, TileLayer, CircleMarker, Polyline, useMap } from 'react-leaflet';
import L from 'leaflet';
import { useNavigation } from '@react-navigation/native';
import { NativeStackNavigationProp } from '@react-navigation/native-stack';
import { Event, EventCategory, RootStackParamList } from '../types';
import { categoryEmojis, categoryLabels, eventStatusLabels } from '../data/mockEvents';
import { useEvents } from '../context/EventsContext';
import { useAuth } from '../context/AuthContext';
import { useLocation, getDistance, openRoute } from '../hooks/useLocation';

type Nav = NativeStackNavigationProp<RootStackParamList, 'Main'>;

const ALMATY_CENTER: [number, number] = [43.238, 76.945];

const MAP_FILTERS: Array<{ key: 'all' | EventCategory; label: string; emoji: string }> = [
  { key: 'all', label: 'Все', emoji: '🌟' },
  { key: 'mountains', label: 'Горы', emoji: '⛰️' },
  { key: 'theatre', label: 'Театр', emoji: '🎭' },
  { key: 'restaurant', label: 'Ресторан', emoji: '🍽️' },
  { key: 'sport', label: 'Спорт', emoji: '⚽' },
  { key: 'other', label: 'Другое', emoji: '✨' },
];

function eventIcon(event: Event, joined: boolean) {
  return L.divIcon({
    className: '',
    html: `
      <div style="
        width: 42px; height: 42px; border-radius: 21px;
        background: ${joined ? '#5B4FCF' : '#ffffff'};
        border: 3px solid #5B4FCF;
        box-shadow: 0 8px 20px rgba(26, 26, 46, 0.2);
        display: flex; align-items: center; justify-content: center;
        font-size: 20px;
      ">${categoryEmojis[event.category]}</div>
    `,
    iconSize: [42, 42],
    iconAnchor: [21, 21],
    popupAnchor: [0, -24],
  });
}

function FitRoute({ route }: { route: Array<[number, number]> }) {
  const map = useMap();
  React.useEffect(() => {
    if (route.length < 2) return;
    map.fitBounds(route, { padding: [40, 40] });
  }, [map, route]);
  return null;
}

export default function MapScreen() {
  const navigation = useNavigation<Nav>();
  const { events, joinEvent, leaveEvent, isJoined } = useEvents();
  const { user } = useAuth();
  const userLocation = useLocation();
  const [mapFilter, setMapFilter] = useState<'all' | EventCategory>('all');
  const [routeTargetId, setRouteTargetId] = useState<string | null>(null);

  const filteredEvents = mapFilter === 'all' ? events : events.filter(e => e.category === mapFilter);
  const routeTarget = events.find(e => e.id === routeTargetId) ?? null;
  const routeLine = useMemo<Array<[number, number]>>(() => {
    if (!userLocation || !routeTarget) return [];
    return [
      [userLocation.latitude, userLocation.longitude],
      [routeTarget.coordinate.latitude, routeTarget.coordinate.longitude],
    ];
  }, [routeTarget?.id, userLocation?.latitude, userLocation?.longitude]);

  async function handleJoin(event: Event) {
    if (!user) return;
    if (!isJoined(event.id, user.id) && (event.status ?? 'active') !== 'active') {
      Alert.alert('', 'К этому ивенту уже нельзя присоединиться');
      return;
    }
    if (isJoined(event.id, user.id)) await leaveEvent(event.id, user.id);
    else await joinEvent(event.id, user.id);
  }

  return (
    <View style={styles.container}>
      <MapContainer center={ALMATY_CENTER} zoom={12} style={leafletMapStyle} zoomControl={false}>
        <TileLayer
          attribution='&copy; <a href="https://www.openstreetmap.org/copyright">OpenStreetMap</a>'
          url="https://{s}.tile.openstreetmap.org/{z}/{x}/{y}.png"
        />
        {userLocation && (
          <CircleMarker
            center={[userLocation.latitude, userLocation.longitude]}
            radius={8}
            pathOptions={{ color: '#2F80ED', fillColor: '#2F80ED', fillOpacity: 0.8 }}
          />
        )}
        {routeLine.length > 0 && (
          <>
            <Polyline positions={routeLine} pathOptions={{ color: '#2E9E5D', weight: 5 }} />
            <FitRoute route={routeLine} />
          </>
        )}
        {filteredEvents.map(event => {
          const joined = user ? isJoined(event.id, user.id) : false;
          return (
            <Marker
              key={event.id}
              position={[event.coordinate.latitude, event.coordinate.longitude]}
              icon={eventIcon(event, joined)}
            >
              <Popup>
                <View style={styles.popup}>
                  <Text style={styles.popupCategory}>{categoryEmojis[event.category]} {categoryLabels[event.category]}</Text>
                  <Text style={styles.popupTitle}>{event.title}</Text>
                  <Text style={styles.popupMeta}>{event.datetime}</Text>
                  {!!event.address && <Text style={styles.popupMeta}>{event.address}</Text>}
                  {userLocation && (
                    <Text style={styles.popupMeta}>{getDistance(userLocation, event.coordinate)} от вас</Text>
                  )}
                  <Text style={styles.popupMeta}>
                    {event.participantsCount}/{event.maxParticipants} участников
                  </Text>
                  {(event.status ?? 'active') !== 'active' && (
                    <Text style={styles.popupStatus}>{eventStatusLabels[event.status ?? 'active']}</Text>
                  )}
                  <View style={styles.popupActions}>
                    <TouchableOpacity
                      style={styles.secondaryButton}
                      onPress={() => navigation.navigate('EventDetails', { eventId: event.id })}
                    >
                      <Text style={styles.secondaryButtonText}>Подробнее</Text>
                    </TouchableOpacity>
                    <TouchableOpacity
                      style={styles.routeButton}
                      onPress={() => {
                        setRouteTargetId(event.id);
                        openRoute(event.coordinate, event.title);
                      }}
                    >
                      <Text style={styles.routeButtonText}>Маршрут</Text>
                    </TouchableOpacity>
                    <TouchableOpacity
                      style={[styles.joinButton, joined && styles.joinButtonActive]}
                      onPress={() => handleJoin(event).catch(e => Alert.alert('Ошибка', e.message))}
                      disabled={!user || (!joined && (event.status ?? 'active') !== 'active')}
                    >
                      <Text style={[styles.joinButtonText, joined && styles.joinButtonTextActive]}>
                        {joined ? 'Вы в группе' : 'Присоединиться'}
                      </Text>
                    </TouchableOpacity>
                  </View>
                </View>
              </Popup>
            </Marker>
          );
        })}
      </MapContainer>

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
              onPress={() => setMapFilter(f.key)}
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
          <Text style={styles.routeBannerText} numberOfLines={1}>
            Маршрут: {routeTarget.title}
          </Text>
          <TouchableOpacity onPress={() => setRouteTargetId(null)} style={styles.routeClose}>
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
    </View>
  );
}

const leafletMapStyle: React.CSSProperties = { height: '100%', width: '100%' };

const styles = StyleSheet.create({
  container: { flex: 1, backgroundColor: '#E8E5FF' },
  header: {
    position: 'absolute', top: 24, left: 16, right: 16,
    backgroundColor: 'rgba(255,255,255,0.96)', borderRadius: 16, padding: 14,
    shadowColor: '#000', shadowOffset: { width: 0, height: 2 },
    shadowOpacity: 0.1, shadowRadius: 8,
  },
  headerTitle: { fontSize: 18, fontWeight: '800', color: '#1A1A2E' },
  headerSubtitle: { fontSize: 12, color: '#888', marginTop: 2 },
  filterBar: { position: 'absolute', top: 116, left: 0, right: 0 },
  filterScroll: { paddingHorizontal: 16, gap: 8 },
  filterChip: {
    flexDirection: 'row', alignItems: 'center', gap: 4,
    paddingHorizontal: 12, paddingVertical: 7, borderRadius: 20,
    backgroundColor: 'rgba(255,255,255,0.96)',
    borderWidth: 1.5, borderColor: '#E8E5FF',
  },
  filterChipActive: { backgroundColor: '#5B4FCF', borderColor: '#5B4FCF' },
  filterEmoji: { fontSize: 13 },
  filterLabel: { fontSize: 12, color: '#555', fontWeight: '600' },
  filterLabelActive: { color: '#FFF' },
  routeBanner: {
    position: 'absolute', top: 162, left: 16, right: 16,
    backgroundColor: 'rgba(255,255,255,0.96)', borderRadius: 16,
    paddingHorizontal: 14, paddingVertical: 12,
    flexDirection: 'row', alignItems: 'center', gap: 12,
  },
  routeBannerText: { flex: 1, color: '#2E9E5D', fontSize: 13, fontWeight: '800' },
  routeClose: {
    width: 28, height: 28, borderRadius: 14,
    backgroundColor: '#EAF7EF', alignItems: 'center', justifyContent: 'center',
  },
  routeCloseText: { color: '#2E9E5D', fontSize: 20, fontWeight: '700', lineHeight: 22 },
  createFab: {
    position: 'absolute', bottom: 28, right: 16,
    backgroundColor: '#5B4FCF', borderRadius: 24,
    paddingHorizontal: 18, paddingVertical: 12,
    shadowColor: '#5B4FCF', shadowOffset: { width: 0, height: 4 },
    shadowOpacity: 0.35, shadowRadius: 10,
  },
  createFabText: { fontSize: 14, fontWeight: '800', color: '#FFF' },
  popup: { width: 230, gap: 6 },
  popupCategory: { color: '#5B4FCF', fontSize: 12, fontWeight: '800' },
  popupTitle: { color: '#1A1A2E', fontSize: 16, fontWeight: '800' },
  popupMeta: { color: '#555', fontSize: 12 },
  popupStatus: { color: '#D92D20', fontSize: 12, fontWeight: '800' },
  popupActions: { gap: 8, marginTop: 8 },
  secondaryButton: { backgroundColor: '#F0EEFF', borderRadius: 12, paddingVertical: 9, alignItems: 'center' },
  secondaryButtonText: { color: '#5B4FCF', fontSize: 13, fontWeight: '800' },
  routeButton: { backgroundColor: '#EAF7EF', borderRadius: 12, paddingVertical: 9, alignItems: 'center' },
  routeButtonText: { color: '#2E9E5D', fontSize: 13, fontWeight: '800' },
  joinButton: {
    borderRadius: 12, paddingVertical: 9, alignItems: 'center',
    borderWidth: 2, borderColor: '#5B4FCF',
  },
  joinButtonActive: { backgroundColor: '#5B4FCF' },
  joinButtonText: { color: '#5B4FCF', fontSize: 13, fontWeight: '800' },
  joinButtonTextActive: { color: '#FFF' },
});
