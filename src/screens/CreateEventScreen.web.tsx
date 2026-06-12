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
import { categoryEmojis, categoryLabels } from '../data/mockEvents';
import { deletePublicStorageImage, uploadImageToStorage } from '../lib/storage';

type Nav = NativeStackNavigationProp<RootStackParamList>;
type CreateEventRoute = RouteProp<RootStackParamList, 'CreateEvent'>;

const CATEGORIES: EventCategory[] = ['mountains', 'theatre', 'restaurant', 'sport', 'other'];
const ALMATY = { latitude: 43.238, longitude: 76.945 };
const ALMATY_CENTER: [number, number] = [43.238, 76.945];

const GENDER_FILTERS: Array<{ key: GenderFilter; label: string; emoji: string }> = [
  { key: 'all', label: 'Все', emoji: '👥' },
  { key: 'male', label: 'Только мужчины', emoji: '👨' },
  { key: 'female', label: 'Только женщины', emoji: '👩' },
];

const markerIcon = L.divIcon({
  className: '',
  html: `
    <div style="
      width: 34px; height: 34px; border-radius: 17px;
      background: #5B4FCF; border: 3px solid white;
      box-shadow: 0 8px 20px rgba(26, 26, 46, 0.22);
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

  React.useEffect(() => {
    navigation.setOptions({ title: eventId ? 'Редактировать ивент' : 'Новый ивент' });
  }, [eventId, navigation]);

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
        Alert.alert('Адрес не найден', 'Попробуй написать подробнее, например: "ул. Абая 10, Алматы"');
        return;
      }
      setCoordinate({ latitude: Number(results[0].lat), longitude: Number(results[0].lon) });
      setAddress(q);
    } catch {
      Alert.alert('Ошибка', 'Не удалось найти адрес');
    } finally {
      setGeocoding(false);
    }
  }

  async function pickImage() {
    if (!user) {
      Alert.alert('', 'Сначала войди в аккаунт');
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
      Alert.alert('Не удалось загрузить фото', e.message ?? 'Проверь Supabase Storage');
    } finally {
      setUploading(false);
    }
  }

  async function removeEventPhoto() {
    await deletePublicStorageImage('event-photos', imageUri);
    setImageUri(null);
  }

  async function handleCreate() {
    if (!title.trim()) { Alert.alert('Ошибка', 'Введите название'); return; }
    if (!datetime.trim()) { Alert.alert('Ошибка', 'Укажите время'); return; }
    const max = parseInt(maxParticipants, 10);
    if (!max || max < 2) { Alert.alert('Ошибка', 'Минимум 2 участника'); return; }

    const minA = minAge ? parseInt(minAge, 10) : undefined;
    const maxA = maxAge ? parseInt(maxAge, 10) : undefined;
    if (minA && maxA && minA > maxA) { Alert.alert('Ошибка', 'Мин. возраст не может быть больше макс.'); return; }

    setLoading(true);
    try {
      const payload = {
        title: title.trim(),
        description: description.trim() || 'Присоединяйся!',
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
        Alert.alert('Готово!', 'Ивент обновлен', [
          { text: 'К деталям', onPress: () => navigation.replace('EventDetails', { eventId }) },
        ]);
        return;
      }

      const event = await createEvent(payload);
      Alert.alert('Готово!', 'Ивент создан', [
        { text: 'Открыть чат', onPress: () => navigation.replace('Chat', { eventId: event.id, eventTitle: event.title }) },
        { text: 'На карту', onPress: () => navigation.navigate('Main') },
      ]);
    } catch (e: any) {
      Alert.alert('Ошибка', e.message ?? 'Не удалось создать ивент');
    } finally {
      setLoading(false);
    }
  }

  return (
    <SafeAreaView style={styles.container}>
      <ScrollView showsVerticalScrollIndicator={false} keyboardShouldPersistTaps="handled">
        <View style={styles.section}>
          <Text style={styles.label}>Категория</Text>
          <ScrollView horizontal showsHorizontalScrollIndicator={false}>
            <View style={styles.row}>
              {CATEGORIES.map(cat => (
                <TouchableOpacity
                  key={cat}
                  style={[styles.catBtn, category === cat && styles.catBtnActive]}
                  onPress={() => setCategory(cat)}
                >
                  <Text style={styles.catEmoji}>{categoryEmojis[cat]}</Text>
                  <Text style={[styles.catLabel, category === cat && styles.catLabelActive]}>
                    {categoryLabels[cat]}
                  </Text>
                </TouchableOpacity>
              ))}
            </View>
          </ScrollView>
        </View>

        <View style={styles.section}>
          <Text style={styles.label}>Название *</Text>
          <TextInput
            style={styles.input}
            placeholder="Напр. Поход на Кок-Жайляу"
            placeholderTextColor="#BBB"
            value={title}
            onChangeText={setTitle}
            maxLength={60}
          />

          <Text style={styles.label}>Описание</Text>
          <TextInput
            style={[styles.input, styles.inputMulti]}
            placeholder="Расскажи подробнее об ивенте..."
            placeholderTextColor="#BBB"
            value={description}
            onChangeText={setDescription}
            multiline
            numberOfLines={3}
            maxLength={300}
          />

          <Text style={styles.label}>Когда? *</Text>
          <TextInput
            style={styles.input}
            placeholder="Напр. Воскресенье, 08:00"
            placeholderTextColor="#BBB"
            value={datetime}
            onChangeText={setDatetime}
            maxLength={40}
          />

          <Text style={styles.label}>Макс. участников</Text>
          <TextInput
            style={styles.input}
            placeholder="10"
            placeholderTextColor="#BBB"
            value={maxParticipants}
            onChangeText={setMaxParticipants}
            keyboardType="number-pad"
            maxLength={3}
          />
        </View>

        <View style={styles.section}>
          <Text style={styles.label}>Место</Text>
          <View style={styles.addressRow}>
            <TextInput
              style={[styles.input, styles.addressInput]}
              placeholder="Введи адрес, напр. ул. Абая 10"
              placeholderTextColor="#BBB"
              value={addressInput}
              onChangeText={setAddressInput}
              returnKeyType="search"
              onSubmitEditing={handleGeocode}
            />
            <TouchableOpacity
              style={[styles.geocodeBtn, geocoding && styles.geocodeBtnDisabled]}
              onPress={handleGeocode}
              disabled={geocoding}
              activeOpacity={0.8}
            >
              {geocoding
                ? <ActivityIndicator color="#FFF" size="small" />
                : <Text style={styles.geocodeBtnText}>Найти</Text>
              }
            </TouchableOpacity>
          </View>

          {address ? (
            <Text style={styles.addressFound}>📍 {address}</Text>
          ) : (
            <Text style={styles.hint}>Или нажми на карту чтобы выбрать место вручную</Text>
          )}

          <View style={styles.mapWrap}>
            <MapContainer center={ALMATY_CENTER} zoom={12} style={leafletMapStyle}>
              <TileLayer
                attribution='&copy; <a href="https://www.openstreetmap.org/copyright">OpenStreetMap</a>'
                url="https://{s}.tile.openstreetmap.org/{z}/{x}/{y}.png"
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
          <Text style={styles.coords}>
            {coordinate.latitude.toFixed(4)}, {coordinate.longitude.toFixed(4)}
          </Text>
        </View>

        <View style={styles.section}>
          <Text style={styles.label}>Аудитория</Text>
          <Text style={styles.sublabel}>Для кого</Text>
          <View style={styles.row}>
            {GENDER_FILTERS.map(opt => (
              <TouchableOpacity
                key={opt.key}
                style={[styles.filterBtn, genderFilter === opt.key && styles.filterBtnActive]}
                onPress={() => setGenderFilter(opt.key)}
                activeOpacity={0.8}
              >
                <Text style={styles.filterEmoji}>{opt.emoji}</Text>
                <Text style={[styles.filterLabel, genderFilter === opt.key && styles.filterLabelActive]}>
                  {opt.label}
                </Text>
              </TouchableOpacity>
            ))}
          </View>

          <Text style={styles.sublabel}>Возрастной диапазон (необязательно)</Text>
          <View style={styles.ageRow}>
            <TextInput
              style={[styles.input, styles.ageInput]}
              placeholder="от"
              placeholderTextColor="#BBB"
              value={minAge}
              onChangeText={setMinAge}
              keyboardType="number-pad"
              maxLength={3}
            />
            <Text style={styles.ageDash}>—</Text>
            <TextInput
              style={[styles.input, styles.ageInput]}
              placeholder="до"
              placeholderTextColor="#BBB"
              value={maxAge}
              onChangeText={setMaxAge}
              keyboardType="number-pad"
              maxLength={3}
            />
            <Text style={styles.ageUnit}>лет</Text>
          </View>
        </View>

        <View style={styles.section}>
          <Text style={styles.label}>Фото (необязательно)</Text>
          <TouchableOpacity style={styles.photoBtn} onPress={pickImage} disabled={uploading} activeOpacity={0.8}>
            {uploading ? (
              <ActivityIndicator color="#5B4FCF" />
            ) : imageUri ? (
              <Image source={{ uri: imageUri }} style={styles.photoPreview} />
            ) : (
              <View style={styles.photoPlaceholder}>
                <Text style={styles.photoIcon}>📷</Text>
                <Text style={styles.photoHint}>Добавить фото</Text>
              </View>
            )}
          </TouchableOpacity>
          {imageUri && (
            <TouchableOpacity onPress={removeEventPhoto} style={styles.removePhoto}>
              <Text style={styles.removePhotoText}>✕ Удалить фото</Text>
            </TouchableOpacity>
          )}
        </View>

        <TouchableOpacity
          style={[styles.createBtn, (loading || uploading) && styles.createBtnDisabled]}
          onPress={handleCreate}
          disabled={loading || uploading}
          activeOpacity={0.85}
        >
          <Text style={styles.createBtnText}>
            {loading ? (eventId ? 'Сохраняем...' : 'Создаём...') : eventId ? 'Сохранить изменения' : '✨ Создать ивент'}
          </Text>
        </TouchableOpacity>

        <View style={{ height: 40 }} />
      </ScrollView>
    </SafeAreaView>
  );
}

const leafletMapStyle: React.CSSProperties = { height: '100%', width: '100%' };

const styles = StyleSheet.create({
  container: { flex: 1, backgroundColor: '#F8F7FF' },
  section: { padding: 16, paddingBottom: 0 },
  label: {
    fontSize: 13, fontWeight: '700', color: '#888',
    textTransform: 'uppercase', letterSpacing: 0.8,
    marginBottom: 8, marginTop: 16,
  },
  sublabel: { fontSize: 12, color: '#AAA', fontWeight: '600', marginBottom: 8, marginTop: 12 },
  hint: { fontSize: 12, color: '#AAA', marginBottom: 8 },
  row: { flexDirection: 'row', gap: 8, flexWrap: 'wrap' },
  catBtn: {
    alignItems: 'center', paddingHorizontal: 14, paddingVertical: 10,
    borderRadius: 14, backgroundColor: '#FFF',
    borderWidth: 1.5, borderColor: '#E8E5FF',
  },
  catBtnActive: { backgroundColor: '#5B4FCF', borderColor: '#5B4FCF' },
  catEmoji: { fontSize: 20, marginBottom: 4 },
  catLabel: { fontSize: 11, color: '#555', fontWeight: '600' },
  catLabelActive: { color: '#FFF' },
  input: {
    backgroundColor: '#FFF', borderRadius: 14,
    paddingHorizontal: 16, paddingVertical: 12,
    fontSize: 15, color: '#1A1A2E',
    borderWidth: 1.5, borderColor: '#E8E5FF',
  },
  inputMulti: { minHeight: 80, textAlignVertical: 'top' },
  addressRow: { flexDirection: 'row', gap: 8, alignItems: 'center' },
  addressInput: { flex: 1 },
  geocodeBtn: {
    backgroundColor: '#5B4FCF', borderRadius: 14,
    paddingHorizontal: 16, paddingVertical: 12,
    justifyContent: 'center', alignItems: 'center', minWidth: 70,
  },
  geocodeBtnDisabled: { backgroundColor: '#C5BFFF' },
  geocodeBtnText: { color: '#FFF', fontWeight: '700', fontSize: 14 },
  addressFound: { fontSize: 13, color: '#5B4FCF', fontWeight: '600', marginTop: 8, marginBottom: 4 },
  mapWrap: { borderRadius: 16, overflow: 'hidden', height: 240, marginTop: 8 },
  coords: { fontSize: 11, color: '#AAA', marginTop: 6, textAlign: 'center' },
  filterBtn: {
    flex: 1, alignItems: 'center', paddingVertical: 10, paddingHorizontal: 4,
    borderRadius: 14, backgroundColor: '#FFF',
    borderWidth: 1.5, borderColor: '#E8E5FF',
  },
  filterBtnActive: { backgroundColor: '#F0EEFF', borderColor: '#5B4FCF' },
  filterEmoji: { fontSize: 18, marginBottom: 4 },
  filterLabel: { fontSize: 10, color: '#777', fontWeight: '600', textAlign: 'center' },
  filterLabelActive: { color: '#5B4FCF' },
  ageRow: { flexDirection: 'row', alignItems: 'center', gap: 8, marginTop: 4 },
  ageInput: { width: 80, textAlign: 'center' },
  ageDash: { fontSize: 18, color: '#CCC' },
  ageUnit: { fontSize: 13, color: '#999' },
  photoBtn: {
    borderRadius: 16, overflow: 'hidden',
    borderWidth: 1.5, borderColor: '#E8E5FF',
    borderStyle: 'dashed', minHeight: 120,
    justifyContent: 'center', alignItems: 'center', backgroundColor: '#FFF',
  },
  photoPreview: { width: '100%', height: 160, borderRadius: 14 },
  photoPlaceholder: { alignItems: 'center', paddingVertical: 24 },
  photoIcon: { fontSize: 36, marginBottom: 8 },
  photoHint: { fontSize: 14, color: '#888' },
  removePhoto: { alignItems: 'center', marginTop: 8 },
  removePhotoText: { fontSize: 13, color: '#FF4D4D' },
  createBtn: {
    margin: 16, marginTop: 24, backgroundColor: '#5B4FCF',
    borderRadius: 16, paddingVertical: 16, alignItems: 'center',
  },
  createBtnDisabled: { backgroundColor: '#C5BFFF' },
  createBtnText: { fontSize: 17, fontWeight: '800', color: '#FFF' },
});
