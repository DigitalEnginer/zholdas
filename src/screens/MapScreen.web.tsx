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
import { categoryEmojis } from '../data/mockEvents';
import { useEvents } from '../context/EventsContext';
import { useAuth } from '../context/AuthContext';
import { useLocation, getDistance, openRoute } from '../hooks/useLocation';
import { useTheme } from '../context/ThemeContext';
import { useLanguage } from '../context/LanguageContext';

type Nav = NativeStackNavigationProp<RootStackParamList, 'Main'>;

const ALMATY_CENTER: [number, number] = [43.238, 76.945];

const MAP_FILTERS: Array<{ key: 'all' | EventCategory }> = [
  { key: 'all' },
  { key: 'mountains' },
  { key: 'theatre' },
  { key: 'restaurant' },
  { key: 'sport' },
  { key: 'other' },
];

function eventIcon(event: Event, joined: boolean) {
  return L.divIcon({
    className: '',
    html: `
      <div style="
        width: 44px; height: 50px; position: relative;
        display: flex; align-items: flex-start; justify-content: center;
      ">
        <div style="
          width: 40px; height: 40px; border-radius: 20px 20px 20px 6px;
          transform: rotate(-45deg);
          background: ${joined ? '#6366F1' : '#ffffff'};
          border: 3px solid #6366F1;
          box-shadow: 0 8px 20px rgba(15, 23, 42, 0.15);
          display: flex; align-items: center; justify-content: center;
        ">
          <span style="
            transform: rotate(45deg);
            display: block;
            font-size: 18px;
            line-height: 1;
          ">${categoryEmojis[event.category]}</span>
        </div>
      </div>
    `,
    iconSize: [44, 50],
    iconAnchor: [22, 46],
    popupAnchor: [0, -42],
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
  const { theme, isDark } = useTheme();
  const { events, joinEvent, leaveEvent, isJoined } = useEvents();
  const { user } = useAuth();
  const userLocation = useLocation();
  const { t } = useLanguage();
  const [mapFilter, setMapFilter] = useState<'all' | EventCategory>('all');
  const [routeTargetId, setRouteTargetId] = useState<string | null>(null);

  const getCategoryLabel = (key: 'all' | EventCategory) => {
    switch (key) {
      case 'all': return t('filterAll');
      case 'mountains': return t('filterMountains');
      case 'theatre': return t('filterTheatre');
      case 'restaurant': return t('filterRestaurant');
      case 'sport': return t('filterSport');
      case 'other': return t('filterOther');
      default: return key;
    }
  };
  const getStatusLabel = (status: string) => (
    status === 'finished' ? t('statusFinished') : status === 'cancelled' ? t('statusCancelled') : t('statusActive')
  );

  const filteredEvents = (mapFilter === 'all' ? events : events.filter(e => e.category === mapFilter))
    .filter(e => (e.status ?? 'active') === 'active');
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
      Alert.alert('', t('joinErrorClosed'));
      return;
    }
    if (isJoined(event.id, user.id)) await leaveEvent(event.id, user.id);
    else await joinEvent(event.id, user.id);
  }

  return (
    <View style={[styles.container, { backgroundColor: theme.bg }]}>
      <MapContainer center={ALMATY_CENTER} zoom={12} style={leafletMapStyle} zoomControl={false}>
        <TileLayer
          attribution='&copy; <a href="https://www.openstreetmap.org/copyright">OpenStreetMap</a> &copy; <a href="https://carto.com/attributions">CARTO</a>'
          url={isDark ? 'https://{s}.basemaps.cartocdn.com/dark_all/{z}/{x}/{y}{r}.png' : 'https://{s}.basemaps.cartocdn.com/rastertiles/voyager/{z}/{x}/{y}{r}.png'}
        />
        {userLocation && (
          <CircleMarker
            center={[userLocation.latitude, userLocation.longitude]}
            radius={8}
            pathOptions={{ color: theme.accent, fillColor: theme.accent, fillOpacity: 0.8 }}
          />
        )}
        {routeLine.length > 0 && (
          <>
            <Polyline positions={routeLine} pathOptions={{ color: theme.success, weight: 5 }} />
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
                  <Text style={[styles.popupCategory, { color: theme.accent }]}>
                    {getCategoryLabel(event.category)}
                  </Text>
                  <Text style={[styles.popupTitle, { color: theme.text }]}>{event.title}</Text>
                  <Text style={[styles.popupMeta, { color: theme.subtext }]}>{event.datetime}</Text>
                  {!!event.address && (
                    <Text style={[styles.popupMeta, { color: theme.subtext }]}>{event.address}</Text>
                  )}
                  {userLocation && (
                    <Text style={[styles.popupMeta, { color: theme.accent }]}>
                      {getDistance(userLocation, event.coordinate)} {t('kmFromYou')}
                    </Text>
                  )}
                  <Text style={[styles.popupMeta, { color: theme.subtext }]}>
                    {t('participants')}: {event.participantsCount}/{event.maxParticipants}
                  </Text>
                  {(event.status ?? 'active') !== 'active' && (
                    <Text style={[styles.popupStatus, { color: theme.danger }]}>
                      {getStatusLabel(event.status ?? 'active')}
                    </Text>
                  )}
                  <View style={styles.popupActions}>
                    <TouchableOpacity
                      style={[styles.secondaryButton, { backgroundColor: theme.accentLight }]}
                      onPress={() => navigation.navigate('EventDetails', { eventId: event.id })}
                    >
                      <Text style={[styles.secondaryButtonText, { color: theme.accentText }]}>{t('detailsBtn')}</Text>
                    </TouchableOpacity>
                    <TouchableOpacity
                      style={[styles.routeButton, { backgroundColor: theme.inputBg }]}
                      onPress={() => {
                        setRouteTargetId(event.id);
                        openRoute(event.coordinate, event.title, userLocation);
                      }}
                    >
                      <Text style={[styles.routeButtonText, { color: theme.text }]}>{t('routeBtn')}</Text>
                    </TouchableOpacity>
                    {joined ? (
                      <TouchableOpacity
                        style={[styles.joinButton, { borderColor: theme.accent, backgroundColor: theme.accent }]}
                        onPress={() => navigation.navigate('Chat', { eventId: event.id, eventTitle: event.title })}
                      >
                        <Text style={[styles.joinButtonText, { color: '#FFFFFF' }]}>
                          💬 {t('chatShort')}
                        </Text>
                      </TouchableOpacity>
                    ) : (
                      <TouchableOpacity
                        style={[styles.joinButton, { borderColor: theme.accent, backgroundColor: 'transparent' }]}
                        onPress={() => handleJoin(event).catch(e => Alert.alert(t('error'), e.message))}
                        disabled={!user || (event.status ?? 'active') !== 'active'}
                      >
                        <Text style={[styles.joinButtonText, { color: theme.accent }]}>
                          {t('joinBtn')}
                        </Text>
                      </TouchableOpacity>
                    )}
                  </View>
                </View>
              </Popup>
            </Marker>
          );
        })}
      </MapContainer>

      <View style={[styles.header, { flexDirection: 'row', justifyContent: 'space-between', alignItems: 'center', backgroundColor: theme.card, borderColor: theme.border }]}>
        <View>
          <Text style={[styles.headerTitle, { color: theme.text }]}>Жолдас</Text>
          <Text style={[styles.headerSubtitle, { color: theme.subtext }]}>
            {filteredEvents.length} {t('eventsCount')}
          </Text>
        </View>
      </View>

      <View style={styles.filterBar}>
        <ScrollView horizontal showsHorizontalScrollIndicator={false} contentContainerStyle={styles.filterScroll}>
          {MAP_FILTERS.map(f => {
            const isActive = mapFilter === f.key;
            return (
              <TouchableOpacity
                key={f.key}
                style={[
                  styles.filterChip,
                  {
                    backgroundColor: isActive ? theme.accent : theme.card,
                    borderColor: isActive ? theme.accent : theme.border,
                  },
                ]}
                onPress={() => setMapFilter(f.key)}
                activeOpacity={0.8}
              >
                <Text
                  style={[
                    styles.filterLabel,
                    { color: isActive ? '#FFFFFF' : theme.text },
                  ]}
                >
                  {getCategoryLabel(f.key)}
                </Text>
              </TouchableOpacity>
            );
          })}
        </ScrollView>
      </View>

      {routeTarget && (
        <View style={[styles.routeBanner, { backgroundColor: theme.card, borderColor: theme.border }]}>
          <Text style={[styles.routeBannerText, { color: theme.success }]} numberOfLines={1}>
            {t('routeBtn')}: {routeTarget.title}
          </Text>
          <TouchableOpacity
            onPress={() => setRouteTargetId(null)}
            style={[styles.routeClose, { backgroundColor: theme.inputBg }]}
          >
            <Text style={[styles.routeCloseText, { color: theme.text }]}>x</Text>
          </TouchableOpacity>
        </View>
      )}

      <TouchableOpacity
        style={[styles.createFab, { backgroundColor: theme.accent }]}
        onPress={() => navigation.navigate('CreateEvent')}
        activeOpacity={0.85}
      >
        <Text style={styles.createFabText}>+ {t('createEventBtn')}</Text>
      </TouchableOpacity>
    </View>
  );
}

const leafletMapStyle: React.CSSProperties = { height: '100%', width: '100%' };

const styles = StyleSheet.create({
  container: { flex: 1 },
  header: {
    position: 'absolute', top: 16, left: 16, right: 16,
    borderRadius: 12,
    borderWidth: 1,
    paddingHorizontal: 16,
    paddingVertical: 12,
    maxWidth: 420,
    shadowColor: '#0F172A',
    shadowOffset: { width: 0, height: 6 },
    shadowOpacity: 0.08,
    shadowRadius: 16,
    zIndex: 999,
  },
  headerTitle: { fontSize: 18, fontWeight: '800', letterSpacing: -0.4 },
  headerSubtitle: { fontSize: 12, marginTop: 2, fontWeight: '500' },
  headerChatBtn: {
    width: 40,
    height: 40,
    borderRadius: 20,
    justifyContent: 'center',
    alignItems: 'center',
  },
  filterBar: { position: 'absolute', top: 92, left: 0, right: 0, zIndex: 999 },
  filterScroll: { paddingHorizontal: 16, gap: 8 },
  filterChip: {
    flexDirection: 'row', alignItems: 'center', gap: 4,
    paddingHorizontal: 14, paddingVertical: 8, borderRadius: 20,
    borderWidth: 1,
    shadowColor: '#0F172A',
    shadowOffset: { width: 0, height: 4 },
    shadowOpacity: 0.04,
    shadowRadius: 10,
  },
  filterLabel: { fontSize: 12, fontWeight: '600' },
  routeBanner: {
    position: 'absolute', top: 148, left: 16, right: 16,
    borderRadius: 12, borderWidth: 1,
    paddingHorizontal: 16, paddingVertical: 12,
    flexDirection: 'row', alignItems: 'center', gap: 12,
    shadowColor: '#0F172A',
    shadowOffset: { width: 0, height: 4 },
    shadowOpacity: 0.04,
    shadowRadius: 12,
    zIndex: 999,
  },
  routeBannerText: { flex: 1, fontSize: 13, fontWeight: '700' },
  routeClose: {
    width: 24, height: 24, borderRadius: 12,
    alignItems: 'center', justifyContent: 'center',
  },
  routeCloseText: { fontSize: 16, fontWeight: '700', lineHeight: 18 },
  createFab: {
    position: 'absolute', bottom: 28, right: 16,
    borderRadius: 12,
    paddingHorizontal: 18, paddingVertical: 12,
    shadowColor: '#0F172A', shadowOffset: { width: 0, height: 6 },
    shadowOpacity: 0.15, shadowRadius: 10,
    zIndex: 999,
  },
  createFabText: { fontSize: 14, fontWeight: '700', color: '#FFF' },
  popup: { width: 240, padding: 4 },
  popupCategory: { fontSize: 11, fontWeight: '700', letterSpacing: 0.3, marginBottom: 2 },
  popupTitle: { fontSize: 15, fontWeight: '700', letterSpacing: -0.2, marginBottom: 4 },
  popupMeta: { fontSize: 11, fontWeight: '500', marginBottom: 2 },
  popupStatus: { fontSize: 11, fontWeight: '700', marginTop: 2 },
  popupActions: { gap: 6, marginTop: 10 },
  secondaryButton: { borderRadius: 8, paddingVertical: 8, alignItems: 'center' },
  secondaryButtonText: { fontSize: 12, fontWeight: '700' },
  routeButton: { borderRadius: 8, paddingVertical: 8, alignItems: 'center' },
  routeButtonText: { fontSize: 12, fontWeight: '700' },
  joinButton: {
    borderRadius: 8, paddingVertical: 8, alignItems: 'center',
    borderWidth: 1.5,
  },
  joinButtonText: { fontSize: 12, fontWeight: '700' },
});
