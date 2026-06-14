import React, { useState, useRef } from 'react';
import {
  View, Text, StyleSheet, TouchableOpacity, Animated, ScrollView, Alert,
} from 'react-native';
import MapView, { Marker, Polyline, PROVIDER_DEFAULT, Region } from 'react-native-maps';
import { useNavigation } from '@react-navigation/native';
import { NativeStackNavigationProp } from '@react-navigation/native-stack';
import { EventCategory, RootStackParamList } from '../types';
import { categoryEmojis, eventStatusColors } from '../data/mockEvents';
import EventMarker from '../components/EventMarker';
import { useEvents } from '../context/EventsContext';
import { useAuth } from '../context/AuthContext';
import { useLocation, getDistance } from '../hooks/useLocation';
import { useLanguage } from '../context/LanguageContext';

type Nav = NativeStackNavigationProp<RootStackParamList, 'Main'>;

const ALMATY_REGION = {
  latitude: 43.238, longitude: 76.945,
  latitudeDelta: 0.18, longitudeDelta: 0.18,
};

const MIN_DELTA = 0.01;
const MAX_DELTA = 0.7;

const MAP_FILTERS: Array<{ key: 'all' | EventCategory; labelKey: string; emoji: string }> = [
  { key: 'all', labelKey: 'filterAll', emoji: '🌟' },
  { key: 'mountains', labelKey: 'filterMountains', emoji: '⛰️' },
  { key: 'theatre', labelKey: 'filterTheatre', emoji: '🎭' },
  { key: 'restaurant', labelKey: 'filterRestaurant', emoji: '🍽️' },
  { key: 'sport', labelKey: 'filterSport', emoji: '⚽' },
  { key: 'other', labelKey: 'filterOther', emoji: '✨' },
];

export default function MapScreen() {
  const navigation = useNavigation<Nav>();
  const { events, joinEvent, leaveEvent, isJoined } = useEvents();
  const { user } = useAuth();
  const { t } = useLanguage();
  const userLocation = useLocation();
  const mapRef = useRef<MapView>(null);
  const [selectedId, setSelectedId] = useState<string | null>(null);
  const [routeTargetId, setRouteTargetId] = useState<string | null>(null);
  const [routeCoordinates, setRouteCoordinates] = useState<Array<{ latitude: number; longitude: number }>>([]);
  const [routeInfo, setRouteInfo] = useState<{ distance: string; duration: string } | null>(null);
  const [mapFilter, setMapFilter] = useState<'all' | EventCategory>('all');
  const [region, setRegion] = useState<Region>(ALMATY_REGION);
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
      Alert.alert('', t('joinErrorClosed'));
      return;
    }
    if (isJoined(selectedEvent.id, user.id)) leaveEvent(selectedEvent.id, user.id);
    else joinEvent(selectedEvent.id, user.id).catch(e => Alert.alert(t('error'), e.message));
  }

  function formatRouteDistance(meters: number) {
    if (meters < 1000) return `${Math.round(meters)} ${t('metersUnit')}`;
    return `${(meters / 1000).toFixed(1)} ${t('kmUnit')}`;
  }

  function formatRouteDuration(seconds: number) {
    const minutes = Math.max(1, Math.round(seconds / 60));
    if (minutes < 60) return `${minutes} ${t('minUnit')}`;
    const hours = Math.floor(minutes / 60);
    const rest = minutes % 60;
    return rest ? `${hours} ${t('hourUnit')} ${rest} ${t('minUnit')}` : `${hours} ${t('hourUnit')}`;
  }

  async function showRoute() {
    if (!selectedEvent) return;
    if (!userLocation) {
      Alert.alert('', t('allowLocationForRoute'));
      return;
    }

    setRouteTargetId(selectedEvent.id);
    setRouteInfo(null);

    try {
      const start = `${userLocation.longitude},${userLocation.latitude}`;
      const end = `${selectedEvent.coordinate.longitude},${selectedEvent.coordinate.latitude}`;
      const response = await fetch(
        `https://router.project-osrm.org/route/v1/driving/${start};${end}?overview=full&geometries=geojson`
      );

      if (!response.ok) throw new Error('Route service unavailable');

      const data = await response.json();
      const route = data.routes?.[0];
      const coordinates = route?.geometry?.coordinates;

      if (!Array.isArray(coordinates) || coordinates.length === 0) {
        throw new Error('Route not found');
      }

      const nextCoordinates = coordinates.map(([longitude, latitude]: [number, number]) => ({
        latitude,
        longitude,
      }));

      setRouteCoordinates(nextCoordinates);
      setRouteInfo({
        distance: formatRouteDistance(route.distance ?? 0),
        duration: formatRouteDuration(route.duration ?? 0),
      });

      mapRef.current?.fitToCoordinates(nextCoordinates, {
        edgePadding: { top: 180, right: 70, bottom: 360, left: 70 },
        animated: true,
      });
    } catch {
      const fallbackCoordinates = [userLocation, selectedEvent.coordinate];
      setRouteCoordinates(fallbackCoordinates);
      setRouteInfo({
        distance: getDistance(userLocation, selectedEvent.coordinate),
        duration: t('approximately'),
      });
      mapRef.current?.fitToCoordinates(fallbackCoordinates, {
        edgePadding: { top: 180, right: 70, bottom: 360, left: 70 },
        animated: true,
      });
    }
  }

  function zoom(multiplier: number) {
    const nextRegion = {
      ...region,
      latitudeDelta: Math.max(MIN_DELTA, Math.min(MAX_DELTA, region.latitudeDelta * multiplier)),
      longitudeDelta: Math.max(MIN_DELTA, Math.min(MAX_DELTA, region.longitudeDelta * multiplier)),
    };
    setRegion(nextRegion);
    mapRef.current?.animateToRegion(nextRegion, 220);
  }

  return (
    <View style={styles.container}>
      <MapView
        ref={mapRef}
        style={styles.map}
        provider={PROVIDER_DEFAULT}
        initialRegion={ALMATY_REGION}
        onRegionChangeComplete={setRegion}
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
        {routeCoordinates.length > 0 && (
          <Polyline
            coordinates={routeCoordinates}
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
        <Text style={styles.headerSubtitle}>{filteredEvents.length} {t('mapEventsInAlmaty')}</Text>
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
              <Text style={[styles.filterLabel, mapFilter === f.key && styles.filterLabelActive]}>{t(f.labelKey)}</Text>
            </TouchableOpacity>
          ))}
        </ScrollView>
      </View>

      <View style={styles.zoomControls}>
        <TouchableOpacity style={styles.zoomButton} onPress={() => zoom(0.55)} activeOpacity={0.85}>
          <Text style={styles.zoomButtonText}>+</Text>
        </TouchableOpacity>
        <View style={styles.zoomDivider} />
        <TouchableOpacity style={styles.zoomButton} onPress={() => zoom(1.8)} activeOpacity={0.85}>
          <Text style={styles.zoomButtonText}>−</Text>
        </TouchableOpacity>
      </View>

      {routeTarget && (
        <View style={styles.routeBanner}>
          <View style={{ flex: 1 }}>
            <Text style={styles.routeBannerTitle}>{t('routeShown')}</Text>
            <Text style={styles.routeBannerText} numberOfLines={1}>
              {routeInfo
                ? `${routeInfo.distance} · ${routeInfo.duration} ${t('routeTo')} "${routeTarget.title}"`
                : userLocation
                  ? `${getDistance(userLocation, routeTarget.coordinate)} ${t('routeTo')} "${routeTarget.title}"`
                  : routeTarget.title}
            </Text>
          </View>
          <TouchableOpacity
            style={styles.routeClose}
            onPress={() => {
              setRouteTargetId(null);
              setRouteCoordinates([]);
              setRouteInfo(null);
            }}
          >
            <Text style={styles.routeCloseText}>×</Text>
          </TouchableOpacity>
        </View>
      )}

      <TouchableOpacity
        style={styles.createFab}
        onPress={() => navigation.navigate('CreateEvent')}
        activeOpacity={0.85}
      >
        <Text style={styles.createFabText}>+ {t('createEventBtn')}</Text>
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
              <Text style={styles.categoryText}>{t(`filter${selectedEvent.category === 'mountains' ? 'Mountains' : selectedEvent.category === 'theatre' ? 'Theatre' : selectedEvent.category === 'restaurant' ? 'Restaurant' : selectedEvent.category === 'sport' ? 'Sport' : 'Other'}`)}</Text>
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
                {t((selectedEvent.status ?? 'active') === 'active' ? 'statusActive' : (selectedEvent.status ?? 'active') === 'finished' ? 'statusFinished' : 'statusCancelled')}
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
              👥 {selectedEvent.participantsCount}/{selectedEvent.maxParticipants} {t('participants').toLowerCase()}
              {!!selectedEvent.hiddenParticipantsCount ? ` · ${t('hiddenCount')} ${selectedEvent.hiddenParticipantsCount}` : ''}
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
              <Text style={styles.detailsBtnText}>{t('detailsBtn')}</Text>
            </TouchableOpacity>
            <TouchableOpacity
              style={styles.routeBtn}
              onPress={showRoute}
            >
              <Text style={styles.routeBtnText}>{t('routeBtn')}</Text>
            </TouchableOpacity>
            <TouchableOpacity
              style={[styles.joinBtn, user && isJoined(selectedEvent.id, user.id) && styles.joinBtnActive]}
              onPress={() => {
                if (user && isJoined(selectedEvent.id, user.id)) {
                  // Already joined → open chat instead of leaving
                  closeSheet();
                  navigation.navigate('Chat', { eventId: selectedEvent.id, eventTitle: selectedEvent.title });
                } else {
                  handleJoin();
                }
              }}
              disabled={!user || (!isJoined(selectedEvent.id, user.id) && (selectedEvent.status ?? 'active') !== 'active')}
            >
              <Text style={[styles.joinBtnText, user && isJoined(selectedEvent.id, user.id) && styles.joinBtnTextActive]}>
                {user && isJoined(selectedEvent.id, user.id)
                  ? '💬 ' + t('chatShort')
                  : (selectedEvent.status ?? 'active') !== 'active'
                    ? t((selectedEvent.status ?? 'active') === 'finished' ? 'statusFinished' : 'statusCancelled')
                    : t('joinBtn')}
              </Text>
            </TouchableOpacity>
            {user && isJoined(selectedEvent.id, user.id) && (
              <TouchableOpacity
                style={styles.chatBtn}
                onPress={() => {
                  closeSheet();
                  navigation.navigate('EventDetails', { eventId: selectedEvent.id });
                }}
              >
                <Text style={styles.chatBtnText}>{t('detailsBtn')}</Text>
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
    borderWidth: 1, borderColor: 'rgba(228,231,236,0.95)',
    shadowColor: '#101828', shadowOffset: { width: 0, height: 8 },
    shadowOpacity: 0.1, shadowRadius: 18, elevation: 4,
  },
  headerTitle: { fontSize: 18, fontWeight: '900', color: '#111827' },
  headerSubtitle: { fontSize: 12, color: '#667085', marginTop: 2 },
  filterBar: {
    position: 'absolute', top: 148, left: 0, right: 0,
  },
  filterScroll: { paddingHorizontal: 16, gap: 8 },
  filterChip: {
    flexDirection: 'row', alignItems: 'center', gap: 4,
    paddingHorizontal: 12, paddingVertical: 7, borderRadius: 14,
    backgroundColor: 'rgba(255,255,255,0.95)',
    borderWidth: 1.5, borderColor: '#E4E7EC',
    shadowColor: '#101828', shadowOffset: { width: 0, height: 4 },
    shadowOpacity: 0.08, shadowRadius: 12, elevation: 2,
  },
  filterChipActive: { backgroundColor: '#4F46E5', borderColor: '#4F46E5' },
  filterEmoji: { fontSize: 13 },
  filterLabel: { fontSize: 12, color: '#475467', fontWeight: '700' },
  filterLabelActive: { color: '#FFF' },
  zoomControls: {
    position: 'absolute',
    right: 16,
    top: 206,
    width: 44,
    borderRadius: 16,
    backgroundColor: 'rgba(255,255,255,0.96)',
    overflow: 'hidden',
    borderWidth: 1, borderColor: '#E4E7EC',
    shadowColor: '#101828',
    shadowOffset: { width: 0, height: 2 },
    shadowOpacity: 0.12,
    shadowRadius: 8,
    elevation: 4,
  },
  zoomButton: {
    width: 44,
    height: 42,
    justifyContent: 'center',
    alignItems: 'center',
  },
  zoomButtonText: {
    color: '#111827',
    fontSize: 26,
    fontWeight: '800',
    lineHeight: 28,
  },
  zoomDivider: { height: 1, backgroundColor: '#E4E7EC' },
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
    borderWidth: 1, borderColor: '#E4E7EC',
    shadowColor: '#101828',
    shadowOffset: { width: 0, height: 2 },
    shadowOpacity: 0.1,
    shadowRadius: 8,
    elevation: 4,
  },
  routeBannerTitle: { color: '#2E9E5D', fontSize: 13, fontWeight: '900' },
  routeBannerText: { color: '#475467', fontSize: 12, marginTop: 2 },
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
    backgroundColor: '#4F46E5', borderRadius: 16,
    paddingHorizontal: 18, paddingVertical: 12,
    shadowColor: '#4F46E5', shadowOffset: { width: 0, height: 6 },
    shadowOpacity: 0.35, shadowRadius: 10, elevation: 6,
  },
  createFabText: { fontSize: 14, fontWeight: '800', color: '#FFF' },
  overlay: {
    position: 'absolute', top: 0, left: 0, right: 0, bottom: 0,
    backgroundColor: 'transparent',
  },
  sheet: {
    position: 'absolute', bottom: 0, left: 0, right: 0,
    backgroundColor: '#FFF', borderTopLeftRadius: 20, borderTopRightRadius: 20,
    padding: 20, paddingBottom: 36,
    borderWidth: 1, borderColor: '#E4E7EC',
    shadowColor: '#101828', shadowOffset: { width: 0, height: -8 },
    shadowOpacity: 0.12, shadowRadius: 22, elevation: 12,
  },
  sheetHandle: {
    width: 40, height: 4, backgroundColor: '#D0D5DD',
    borderRadius: 2, alignSelf: 'center', marginBottom: 16,
  },
  sheetHeader: {
    flexDirection: 'row', justifyContent: 'space-between',
    alignItems: 'center', marginBottom: 10,
  },
  categoryBadge: {
    flexDirection: 'row', alignItems: 'center', gap: 6,
    backgroundColor: '#EEF2FF', paddingHorizontal: 12, paddingVertical: 5, borderRadius: 14,
  },
  categoryText: { fontSize: 12, color: '#4338CA', fontWeight: '700' },
  closeBtn: {
    width: 30, height: 30, borderRadius: 15,
    backgroundColor: '#F9FAFB', justifyContent: 'center', alignItems: 'center',
  },
  closeBtnText: { fontSize: 14, color: '#667085' },
  sheetTitle: { fontSize: 22, fontWeight: '900', color: '#111827', marginBottom: 6 },
  statusBadge: { alignSelf: 'flex-start', paddingHorizontal: 10, paddingVertical: 4, borderRadius: 12, marginBottom: 8 },
  statusText: { fontSize: 12, fontWeight: '800' },
  sheetMeta: { flexDirection: 'row', gap: 12, marginBottom: 10 },
  sheetTime: { fontSize: 14, color: '#4338CA', fontWeight: '700' },
  sheetDist: { fontSize: 14, color: '#4338CA', fontWeight: '700' },
  sheetDesc: { fontSize: 14, color: '#667085', lineHeight: 20, marginBottom: 14 },
  sheetParticipants: { marginBottom: 18 },
  participantsLabel: { fontSize: 13, color: '#475467', marginBottom: 8, fontWeight: '600' },
  progressBar: { height: 6, backgroundColor: '#EEF2FF', borderRadius: 999, overflow: 'hidden' },
  progressFill: { height: '100%', backgroundColor: '#4F46E5', borderRadius: 999 },
  sheetActions: { flexDirection: 'row', flexWrap: 'wrap', gap: 10 },
  detailsBtn: {
    width: '47.5%', borderRadius: 14, paddingVertical: 13, alignItems: 'center',
    backgroundColor: '#EEF2FF',
  },
  detailsBtnText: { fontSize: 14, fontWeight: '800', color: '#4338CA' },
  routeBtn: {
    width: '47.5%', borderRadius: 14, paddingVertical: 13, alignItems: 'center',
    backgroundColor: '#EAF7EF',
  },
  routeBtnText: { fontSize: 14, fontWeight: '800', color: '#2E9E5D' },
  joinBtn: {
    width: '47.5%', paddingVertical: 13, borderRadius: 14,
    borderWidth: 2, borderColor: '#4F46E5', alignItems: 'center',
  },
  joinBtnActive: { backgroundColor: '#4F46E5' },
  joinBtnText: { fontSize: 14, fontWeight: '800', color: '#4338CA' },
  joinBtnTextActive: { color: '#FFF' },
  chatBtn: {
    width: '47.5%', paddingVertical: 13,
    borderRadius: 14, backgroundColor: '#EEF2FF', alignItems: 'center',
  },
  chatBtnText: { fontSize: 14, fontWeight: '800', color: '#4338CA' },
});
