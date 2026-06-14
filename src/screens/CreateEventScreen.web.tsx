import 'leaflet/dist/leaflet.css';
import React, { useState } from 'react';
import {
  View, Text, TextInput, TouchableOpacity, StyleSheet,
  ScrollView, SafeAreaView, Alert, Image, ActivityIndicator,
} from 'react-native';
import { MapContainer, Marker, TileLayer, useMap, useMapEvents } from 'react-leaflet';
import L from 'leaflet';
import { RouteProp, useNavigation, useRoute } from '@react-navigation/native';
import { NativeStackNavigationProp } from '@react-navigation/native-stack';
import * as ImagePicker from 'expo-image-picker';
import { RootStackParamList, EventCategory, GenderFilter } from '../types';
import { useEvents } from '../context/EventsContext';
import { useAuth } from '../context/AuthContext';
import { useTheme } from '../context/ThemeContext';
import { categoryEmojis } from '../data/mockEvents';
import { deletePublicStorageImage, uploadImageToStorage } from '../lib/storage';
import { userMessageFromModerationError, validateEventContent } from '../lib/contentModeration';
import { useLanguage } from '../context/LanguageContext';

type Nav = NativeStackNavigationProp<RootStackParamList>;
type CreateEventRoute = RouteProp<RootStackParamList, 'CreateEvent'>;

const CATEGORIES: EventCategory[] = ['mountains', 'theatre', 'restaurant', 'sport', 'other'];
const ALMATY = { latitude: 43.238, longitude: 76.945 };
const ALMATY_CENTER: [number, number] = [43.238, 76.945];

const GENDER_FILTERS: Array<{ key: GenderFilter; emoji: string }> = [
  { key: 'all', emoji: '👥' },
  { key: 'male', emoji: '👨' },
  { key: 'female', emoji: '👩' },
];

const markerIcon = L.divIcon({
  className: '',
  html: `
    <div style="
      width: 34px; height: 34px; border-radius: 17px;
      background: #6366F1; border: 3px solid white;
      box-shadow: 0 8px 20px rgba(16, 24, 40, 0.22);
      display: flex; align-items: center; justify-content: center;
      color: white; font-weight: 900;
    ">●</div>
  `,
  iconSize: [34, 34],
  iconAnchor: [17, 17],
});

function MapClickTarget({ onPick }: { onPick: (coordinate: typeof ALMATY) => void }) {
  useMapEvents({
    click: e => onPick({ latitude: e.latlng.lat, longitude: e.latlng.lng }),
  });
  return null;
}

function RecenterMap({ coordinate }: { coordinate: typeof ALMATY }) {
  const map = useMap();
  React.useEffect(() => {
    map.setView([coordinate.latitude, coordinate.longitude], Math.max(map.getZoom(), 13));
  }, [coordinate.latitude, coordinate.longitude, map]);
  return null;
}

export default function CreateEventScreen() {
  const navigation = useNavigation<Nav>();
  const route = useRoute<CreateEventRoute>();
  const { createEvent, updateEvent, events } = useEvents();
  const { user } = useAuth();
  const { theme, isDark } = useTheme();
  const { t } = useLanguage();
  const eventId = route.params?.eventId;
  const editingEvent = eventId ? events.find(e => e.id === eventId) : undefined;

  const [title, setTitle] = useState('');
  const [description, setDescription] = useState('');
  const [category, setCategory] = useState<EventCategory>('other');
  const [datetime, setDatetime] = useState('');
  const [maxParticipants, setMaxParticipants] = useState('10');
  const [coordinate, setCoordinate] = useState(ALMATY);
  const [address, setAddress] = useState('');
  const [addressInput, setAddressInput] = useState('');
  const [geocoding, setGeocoding] = useState(false);
  const [imageUri, setImageUri] = useState<string | null>(null);
  const [uploading, setUploading] = useState(false);
  const [loading, setLoading] = useState(false);
  const [genderFilter, setGenderFilter] = useState<GenderFilter>('all');
  const [minAge, setMinAge] = useState('');
  const [maxAge, setMaxAge] = useState('');
  const [focusedInput, setFocusedInput] = useState<string | null>(null);

  React.useEffect(() => {
    navigation.setOptions({ title: eventId ? t('editEventTitle') : t('newEventTitle') });
  }, [eventId, navigation, t]);

  React.useEffect(() => {
    if (!editingEvent) return;
    setTitle(editingEvent.title);
    setDescription(editingEvent.description);
    setCategory(editingEvent.category);
    setDatetime(editingEvent.datetime);
    setMaxParticipants(String(editingEvent.maxParticipants));
    setCoordinate(editingEvent.coordinate);
    setAddress(editingEvent.address ?? '');
    setAddressInput(editingEvent.address ?? '');
    setImageUri(editingEvent.imageUri ?? null);
    setGenderFilter(editingEvent.genderFilter ?? 'all');
    setMinAge(editingEvent.minAge ? String(editingEvent.minAge) : '');
    setMaxAge(editingEvent.maxAge ? String(editingEvent.maxAge) : '');
  }, [editingEvent?.id]);

  async function handleGeocode() {
    const q = addressInput.trim();
    if (!q) return;
    setGeocoding(true);
    try {
      const fullQuery = q.toLowerCase().includes('алматы') || q.toLowerCase().includes('almaty')
        ? q
        : `${q}, Алматы`;
      const response = await fetch(
        `https://nominatim.openstreetmap.org/search?format=json&limit=1&q=${encodeURIComponent(fullQuery)}`,
        { headers: { 'Accept-Language': 'ru,en' } },
      );
      if (!response.ok) throw new Error('Geocoder unavailable');
      const results = await response.json();
      if (!Array.isArray(results) || results.length === 0) {
        Alert.alert(t('addressNotFoundTitle'), t('addressNotFoundText'));
        return;
      }
      setCoordinate({ latitude: Number(results[0].lat), longitude: Number(results[0].lon) });
      setAddress(q);
    } catch {
      Alert.alert(t('error'), t('addressSearchError'));
    } finally {
      setGeocoding(false);
    }
  }

  async function pickImage() {
    if (!user) {
      Alert.alert('', t('loginFirst'));
      return;
    }

    const result = await ImagePicker.launchImageLibraryAsync({
      mediaTypes: ImagePicker.MediaTypeOptions.Images,
      allowsEditing: true,
      aspect: [16, 9],
      quality: 0.7,
    });
    if (result.canceled) return;

    const localUri = result.assets[0].uri;
    setUploading(true);
    try {
      const publicUrl = await uploadImageToStorage({
        bucket: 'event-photos',
        path: `${user.id}/event-${eventId ?? 'new'}-${Date.now()}`,
        uri: localUri,
      });
      await deletePublicStorageImage('event-photos', imageUri);
      setImageUri(publicUrl);
    } catch (e: any) {
      Alert.alert(t('photoUploadError'), e.message ?? t('storageCheck'));
    } finally {
      setUploading(false);
    }
  }

  async function removeEventPhoto() {
    await deletePublicStorageImage('event-photos', imageUri);
    setImageUri(null);
  }

  async function handleCreate() {
    if (!title.trim()) { Alert.alert(t('error'), t('titleRequired')); return; }
    if (!datetime.trim()) { Alert.alert(t('error'), t('datetimeRequired')); return; }
    const max = parseInt(maxParticipants, 10);
    if (!max || max < 2) { Alert.alert(t('error'), t('minParticipantsError')); return; }
    const moderation = validateEventContent(title, description);
    if (!moderation.ok) { Alert.alert(t('moderationTitle'), moderation.message); return; }

    const minA = minAge ? parseInt(minAge, 10) : undefined;
    const maxA = maxAge ? parseInt(maxAge, 10) : undefined;
    if (minA && maxA && minA > maxA) { Alert.alert(t('error'), t('ageRangeError')); return; }

    setLoading(true);
    try {
      const payload = {
        title: title.trim(),
        description: description.trim() || t('defaultEventDescription'),
        category,
        datetime: datetime.trim(),
        maxParticipants: max,
        coordinate,
        address: address || undefined,
        createdBy: user?.id,
        imageUri: imageUri ?? undefined,
        genderFilter,
        minAge: minA,
        maxAge: maxA,
      };

      if (eventId) {
        await updateEvent(eventId, payload);
        Alert.alert(t('done'), t('eventUpdated'), [
          { text: t('toDetails'), onPress: () => navigation.replace('EventDetails', { eventId }) },
        ]);
        return;
      }

      const event = await createEvent(payload);
      Alert.alert(t('done'), t('eventCreated'), [
        { text: t('openChatAction'), onPress: () => navigation.replace('Chat', { eventId: event.id, eventTitle: event.title }) },
        { text: t('toMap'), onPress: () => navigation.navigate('Main') },
      ]);
    } catch (e: any) {
      Alert.alert(t('error'), userMessageFromModerationError(e.message) ?? t('eventCreateSubmit'));
    } finally {
      setLoading(false);
    }
  }

  const shadowHex = isDark ? '#000' : '#0F172A';
  const shadowOpacity = isDark ? 0.35 : 0.04;

  return (
    <SafeAreaView style={[styles.container, { backgroundColor: theme.bg }]}>
      <ScrollView showsVerticalScrollIndicator={false} keyboardShouldPersistTaps="handled">
        <View style={styles.section}>
          <Text style={[styles.label, { color: theme.subtext }]}>{t('category')} *</Text>
          <ScrollView horizontal showsHorizontalScrollIndicator={false} contentContainerStyle={styles.row}>
            {CATEGORIES.map(cat => (
              <TouchableOpacity
                key={cat}
                style={[
                  styles.catBtn,
                  {
                    backgroundColor: category === cat ? theme.accentLight : theme.card,
                    borderColor: category === cat ? theme.accent : theme.border,
                    shadowColor: shadowHex,
                    shadowOpacity: category === cat ? 0.05 : 0,
                  }
                ]}
                onPress={() => setCategory(cat)}
                activeOpacity={0.8}
              >
                <Text style={[styles.catLabel, { color: category === cat ? theme.accent : theme.text }]}>
                  {categoryEmojis[cat]} {t(`filter${cat === 'mountains' ? 'Mountains' : cat === 'theatre' ? 'Theatre' : cat === 'restaurant' ? 'Restaurant' : cat === 'sport' ? 'Sport' : 'Other'}`)}
                </Text>
              </TouchableOpacity>
            ))}
          </ScrollView>
        </View>

        <View style={styles.section}>
          <Text style={[styles.label, { color: theme.subtext }]}>{t('titleLabel')}</Text>
          <TextInput
            style={[
              styles.input,
              {
                backgroundColor: theme.card,
                borderColor: focusedInput === 'title' ? theme.accent : theme.border,
                color: theme.text,
              }
            ]}
            placeholder={t('createEventTitlePlaceholder')}
            placeholderTextColor={isDark ? '#475569' : '#94A3B8'}
            value={title}
            onChangeText={setTitle}
            maxLength={60}
            onFocus={() => setFocusedInput('title')}
            onBlur={() => setFocusedInput(null)}
          />

          <Text style={[styles.label, { color: theme.subtext }]}>{t('descLabel')}</Text>
          <TextInput
            style={[
              styles.input,
              styles.inputMulti,
              {
                backgroundColor: theme.card,
                borderColor: focusedInput === 'description' ? theme.accent : theme.border,
                color: theme.text,
              }
            ]}
            placeholder={t('createEventDescPlaceholder')}
            placeholderTextColor={isDark ? '#475569' : '#94A3B8'}
            value={description}
            onChangeText={setDescription}
            multiline
            numberOfLines={3}
            maxLength={300}
            onFocus={() => setFocusedInput('description')}
            onBlur={() => setFocusedInput(null)}
          />

          <Text style={[styles.label, { color: theme.subtext }]}>{t('datetimeLabel')}</Text>
          <TextInput
            style={[
              styles.input,
              {
                backgroundColor: theme.card,
                borderColor: focusedInput === 'datetime' ? theme.accent : theme.border,
                color: theme.text,
              }
            ]}
            placeholder={t('createEventDatetimePlaceholder')}
            placeholderTextColor={isDark ? '#475569' : '#94A3B8'}
            value={datetime}
            onChangeText={setDatetime}
            maxLength={40}
            onFocus={() => setFocusedInput('datetime')}
            onBlur={() => setFocusedInput(null)}
          />

          <Text style={[styles.label, { color: theme.subtext }]}>{t('maxParticipantsLabel')}</Text>
          <TextInput
            style={[
              styles.input,
              {
                backgroundColor: theme.card,
                borderColor: focusedInput === 'maxParticipants' ? theme.accent : theme.border,
                color: theme.text,
              }
            ]}
            placeholder="10"
            placeholderTextColor={isDark ? '#475569' : '#94A3B8'}
            value={maxParticipants}
            onChangeText={setMaxParticipants}
            keyboardType="number-pad"
            maxLength={3}
            onFocus={() => setFocusedInput('maxParticipants')}
            onBlur={() => setFocusedInput(null)}
          />
        </View>

        <View style={styles.section}>
          <Text style={[styles.label, { color: theme.subtext }]}>{t('location')}</Text>
          <View style={styles.addressRow}>
            <TextInput
              style={[
                styles.input,
                styles.addressInput,
                {
                  backgroundColor: theme.card,
                  borderColor: focusedInput === 'address' ? theme.accent : theme.border,
                  color: theme.text,
                }
              ]}
              placeholder={t('addressPlaceholder')}
              placeholderTextColor={isDark ? '#475569' : '#94A3B8'}
              value={addressInput}
              onChangeText={setAddressInput}
              returnKeyType="search"
              onSubmitEditing={handleGeocode}
              onFocus={() => setFocusedInput('address')}
              onBlur={() => setFocusedInput(null)}
            />
            <TouchableOpacity
              style={[
                styles.geocodeBtn,
                { backgroundColor: theme.accent },
                geocoding && { backgroundColor: theme.accentLight }
              ]}
              onPress={handleGeocode}
              disabled={geocoding}
              activeOpacity={0.8}
            >
              {geocoding
                ? <ActivityIndicator color="#FFF" size="small" />
                : <Text style={styles.geocodeBtnText}>{t('findAddressBtn')}</Text>
              }
            </TouchableOpacity>
          </View>

          {address ? (
            <Text style={[styles.addressFound, { color: theme.accent }]}>📍 {address}</Text>
          ) : (
            <Text style={[styles.hint, { color: theme.subtext }]}>{t('mapPickHint')}</Text>
          )}

          <View style={[styles.mapWrap, { borderColor: theme.border, shadowColor: shadowHex, shadowOpacity }]}>
            <MapContainer center={ALMATY_CENTER} zoom={12} style={leafletMapStyle}>
              <TileLayer
                attribution='&copy; <a href="https://www.openstreetmap.org/copyright">OpenStreetMap</a> &copy; <a href="https://carto.com/attributions">CARTO</a>'
                url={isDark ? "https://{s}.basemaps.cartocdn.com/dark_all/{z}/{x}/{y}{r}.png" : "https://{s}.basemaps.cartocdn.com/rastertiles/voyager/{z}/{x}/{y}{r}.png"}
              />
              <Marker position={[coordinate.latitude, coordinate.longitude]} icon={markerIcon} />
              <MapClickTarget
                onPick={nextCoordinate => {
                  setCoordinate(nextCoordinate);
                  setAddress('');
                }}
              />
              <RecenterMap coordinate={coordinate} />
            </MapContainer>
          </View>
          <Text style={[styles.coords, { color: theme.subtext }]}>
            {coordinate.latitude.toFixed(4)}, {coordinate.longitude.toFixed(4)}
          </Text>
        </View>

        <View style={styles.section}>
          <Text style={[styles.label, { color: theme.subtext }]}>{t('genderFilterLabel')}</Text>
          <Text style={[styles.sublabel, { color: theme.subtext }]}>{t('audienceForWho')}</Text>
          <View style={styles.row}>
            {GENDER_FILTERS.map(opt => (
              <TouchableOpacity
                key={opt.key}
                style={[
                  styles.filterBtn,
                  {
                    backgroundColor: genderFilter === opt.key ? theme.accentLight : theme.card,
                    borderColor: genderFilter === opt.key ? theme.accent : theme.border,
                  }
                ]}
                onPress={() => setGenderFilter(opt.key)}
                activeOpacity={0.8}
              >
                <Text style={[styles.filterLabel, { color: genderFilter === opt.key ? theme.accent : theme.text }]}>
                  {opt.emoji} {opt.key === 'male' ? t('genderFilterMale') : opt.key === 'female' ? t('genderFilterFemale') : t('genderFilterAll')}
                </Text>
              </TouchableOpacity>
            ))}
          </View>

          <Text style={[styles.sublabel, { color: theme.subtext }]}>{t('ageRangeLabel')}</Text>
          <View style={styles.ageRow}>
            <TextInput
              style={[
                styles.input,
                styles.ageInput,
                {
                  backgroundColor: theme.card,
                  borderColor: focusedInput === 'minAge' ? theme.accent : theme.border,
                  color: theme.text,
                }
              ]}
              placeholder={t('ageMin')}
              placeholderTextColor={isDark ? '#475569' : '#94A3B8'}
              value={minAge}
              onChangeText={setMinAge}
              keyboardType="number-pad"
              maxLength={3}
              onFocus={() => setFocusedInput('minAge')}
              onBlur={() => setFocusedInput(null)}
            />
            <Text style={[styles.ageDash, { color: theme.border }]}>—</Text>
            <TextInput
              style={[
                styles.input,
                styles.ageInput,
                {
                  backgroundColor: theme.card,
                  borderColor: focusedInput === 'maxAge' ? theme.accent : theme.border,
                  color: theme.text,
                }
              ]}
              placeholder={t('ageMax')}
              placeholderTextColor={isDark ? '#475569' : '#94A3B8'}
              value={maxAge}
              onChangeText={setMaxAge}
              keyboardType="number-pad"
              maxLength={3}
              onFocus={() => setFocusedInput('maxAge')}
              onBlur={() => setFocusedInput(null)}
            />
            <Text style={[styles.ageUnit, { color: theme.subtext }]}>{t('ageUnit')}</Text>
          </View>
        </View>

        <View style={styles.section}>
          <Text style={[styles.label, { color: theme.subtext }]}>{t('photoLabel')}</Text>
          <TouchableOpacity
            style={[
              styles.photoBtn,
              {
                backgroundColor: theme.card,
                borderColor: theme.border,
              }
            ]}
            onPress={pickImage}
            disabled={uploading}
            activeOpacity={0.8}
          >
            {uploading ? (
              <ActivityIndicator color={theme.accent} />
            ) : imageUri ? (
              <Image source={{ uri: imageUri }} style={styles.photoPreview} />
            ) : (
              <View style={styles.photoPlaceholder}>
                <Text style={[styles.photoIcon, { color: theme.subtext }]}>📷</Text>
                <Text style={[styles.photoHint, { color: theme.subtext }]}>{t('photoHint')}</Text>
              </View>
            )}
          </TouchableOpacity>
          {imageUri && (
            <TouchableOpacity onPress={removeEventPhoto} style={styles.removePhoto}>
              <Text style={[styles.removePhotoText, { color: theme.danger }]}>✕ {t('photoRemove')}</Text>
            </TouchableOpacity>
          )}
        </View>

        <TouchableOpacity
          style={[
            styles.createBtn,
            { backgroundColor: theme.accent },
            (loading || uploading) && { backgroundColor: theme.accentLight }
          ]}
          onPress={handleCreate}
          disabled={loading || uploading}
          activeOpacity={0.85}
        >
          <Text style={styles.createBtnText}>
            {loading ? (eventId ? t('saving') : t('creating')) : eventId ? t('eventSaveSubmit') : t('createEventSubmitDecorated')}
          </Text>
        </TouchableOpacity>

        <View style={{ height: 40 }} />
      </ScrollView>
    </SafeAreaView>
  );
}

const leafletMapStyle: React.CSSProperties = { height: '100%', width: '100%' };

const styles = StyleSheet.create({
  container: { flex: 1 },
  section: { padding: 16, paddingBottom: 0, width: '100%', maxWidth: 820, alignSelf: 'center' },
  label: {
    fontSize: 12, fontWeight: '700',
    textTransform: 'uppercase',
    marginBottom: 8, marginTop: 16,
    letterSpacing: 0.5,
  },
  sublabel: { fontSize: 12, fontWeight: '700', marginBottom: 8, marginTop: 12 },
  hint: { fontSize: 12, marginBottom: 8 },
  row: { flexDirection: 'row', gap: 8, paddingBottom: 4, flexWrap: 'wrap' },
  catBtn: {
    alignItems: 'center', paddingHorizontal: 16, paddingVertical: 10,
    borderRadius: 14, borderWidth: 1.5,
    flexDirection: 'row', gap: 6,
    shadowOffset: { width: 0, height: 2 }, shadowRadius: 4, elevation: 1,
  },
  catLabel: { fontSize: 13, fontWeight: '700' },
  input: {
    borderRadius: 14,
    paddingHorizontal: 16, paddingVertical: 12,
    fontSize: 15, borderWidth: 1.5,
    marginBottom: 10,
  },
  inputMulti: { minHeight: 80, textAlignVertical: 'top' },
  addressRow: { flexDirection: 'row', gap: 8, alignItems: 'center' },
  addressInput: { flex: 1, marginBottom: 0 },
  geocodeBtn: {
    borderRadius: 14,
    paddingHorizontal: 16, paddingVertical: 12,
    justifyContent: 'center', alignItems: 'center', minWidth: 70,
  },
  geocodeBtnText: { color: '#FFF', fontWeight: '700', fontSize: 14 },
  addressFound: { fontSize: 13, fontWeight: '700', marginTop: 8, marginBottom: 4 },
  mapWrap: { borderRadius: 16, overflow: 'hidden', height: 240, marginTop: 8, borderWidth: 1, shadowOffset: { width: 0, height: 4 }, shadowRadius: 10, elevation: 2 },
  coords: { fontSize: 11, marginTop: 6, textAlign: 'center' },
  filterBtn: {
    flex: 1, alignItems: 'center', paddingVertical: 12, paddingHorizontal: 6,
    borderRadius: 14, borderWidth: 1.5,
  },
  filterLabel: { fontSize: 12, fontWeight: '700', textAlign: 'center' },
  ageRow: { flexDirection: 'row', alignItems: 'center', gap: 8, marginTop: 4 },
  ageInput: { width: 80, textAlign: 'center', marginBottom: 0 },
  ageDash: { fontSize: 18 },
  ageUnit: { fontSize: 13 },
  photoBtn: {
    borderRadius: 16, overflow: 'hidden',
    borderWidth: 1.5, borderStyle: 'dashed', minHeight: 120,
    justifyContent: 'center', alignItems: 'center',
  },
  photoPreview: { width: '100%', height: 160, borderRadius: 14 },
  photoPlaceholder: { alignItems: 'center', paddingVertical: 24 },
  photoIcon: { fontSize: 36, marginBottom: 8 },
  photoHint: { fontSize: 14 },
  removePhoto: { alignItems: 'center', marginTop: 8 },
  removePhotoText: { fontSize: 13, fontWeight: '600' },
  createBtn: {
    margin: 16, marginTop: 24,
    borderRadius: 16, paddingVertical: 16, alignItems: 'center',
    width: '100%', maxWidth: 788, alignSelf: 'center',
  },
  createBtnText: { fontSize: 16, fontWeight: '800', color: '#FFF' },
});
