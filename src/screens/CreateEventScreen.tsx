import React, { useState, useRef } from 'react';
import {
  View, Text, TextInput, TouchableOpacity, StyleSheet,
  ScrollView, KeyboardAvoidingView, Platform, SafeAreaView,
  Alert, Image, ActivityIndicator,
} from 'react-native';
import MapView, { Marker, PROVIDER_DEFAULT, Region } from 'react-native-maps';
import { RouteProp, useNavigation, useRoute } from '@react-navigation/native';
import { NativeStackNavigationProp } from '@react-navigation/native-stack';
import * as ImagePicker from 'expo-image-picker';
import * as Location from 'expo-location';
import { RootStackParamList, EventCategory, GenderFilter } from '../types';
import { useEvents } from '../context/EventsContext';
import { useAuth } from '../context/AuthContext';
import { useTheme } from '../context/ThemeContext';
import { categoryEmojis, categoryLabels } from '../data/mockEvents';
import { deletePublicStorageImage, uploadImageToStorage } from '../lib/storage';
import { userMessageFromModerationError, validateEventContent } from '../lib/contentModeration';

type Nav = NativeStackNavigationProp<RootStackParamList>;
type CreateEventRoute = RouteProp<RootStackParamList, 'CreateEvent'>;

const CATEGORIES: EventCategory[] = ['mountains', 'theatre', 'restaurant', 'sport', 'other'];
const ALMATY = { latitude: 43.238, longitude: 76.945 };

const GENDER_FILTERS: Array<{ key: GenderFilter; label: string; emoji: string }> = [
  { key: 'all', label: 'Все', emoji: '👥' },
  { key: 'male', label: 'Только мужчины', emoji: '👨' },
  { key: 'female', label: 'Только женщины', emoji: '👩' },
];

export default function CreateEventScreen() {
  const navigation = useNavigation<Nav>();
  const route = useRoute<CreateEventRoute>();
  const { createEvent, updateEvent, events } = useEvents();
  const { user } = useAuth();
  const { theme, isDark } = useTheme();
  const eventId = route.params?.eventId;
  const editingEvent = eventId ? events.find(e => e.id === eventId) : undefined;
  const mapRef = useRef<MapView>(null);

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
      const results = await Location.geocodeAsync(fullQuery);
      if (results.length === 0) {
        Alert.alert('Адрес не найден', 'Попробуй написать подробнее, например: "ул. Абая 10, Алматы"');
        return;
      }
      const { latitude, longitude } = results[0];
      setCoordinate({ latitude, longitude });
      setAddress(q);
      const region: Region = {
        latitude, longitude,
        latitudeDelta: 0.02, longitudeDelta: 0.02,
      };
      mapRef.current?.animateToRegion(region, 600);
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

    const { status } = await ImagePicker.requestMediaLibraryPermissionsAsync();
    if (status !== 'granted') { Alert.alert('', 'Нужен доступ к фото'); return; }

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
    const moderation = validateEventContent(title, description);
    if (!moderation.ok) { Alert.alert('Модерация', moderation.message); return; }

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
      Alert.alert('Ошибка', userMessageFromModerationError(e.message) ?? 'Не удалось создать ивент');
    } finally {
      setLoading(false);
    }
  }

  const shadowHex = isDark ? '#000' : '#0F172A';
  const shadowOpacity = isDark ? 0.35 : 0.04;

  return (
    <SafeAreaView style={[styles.container, { backgroundColor: theme.bg }]}>
      <KeyboardAvoidingView style={styles.flex} behavior={Platform.OS === 'ios' ? 'padding' : 'height'}>
        <ScrollView showsVerticalScrollIndicator={false} keyboardShouldPersistTaps="handled">

          {/* Категория */}
          <View style={styles.section}>
            <Text style={[styles.label, { color: theme.subtext }]}>Категория *</Text>
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
                    {categoryEmojis[cat]} {categoryLabels[cat]}
                  </Text>
                </TouchableOpacity>
              ))}
            </ScrollView>
          </View>

          {/* Основные поля */}
          <View style={styles.section}>
            <Text style={[styles.label, { color: theme.subtext }]}>Название *</Text>
            <TextInput
              style={[
                styles.input,
                {
                  backgroundColor: theme.card,
                  borderColor: focusedInput === 'title' ? theme.accent : theme.border,
                  color: theme.text,
                }
              ]}
              placeholder="Напр. Поход на Кок-Жайляу"
              placeholderTextColor={isDark ? '#475569' : '#94A3B8'}
              value={title}
              onChangeText={setTitle}
              maxLength={60}
              onFocus={() => setFocusedInput('title')}
              onBlur={() => setFocusedInput(null)}
            />

            <Text style={[styles.label, { color: theme.subtext }]}>Описание</Text>
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
              placeholder="Расскажи подробнее об ивенте..."
              placeholderTextColor={isDark ? '#475569' : '#94A3B8'}
              value={description}
              onChangeText={setDescription}
              multiline
              numberOfLines={3}
              maxLength={300}
              onFocus={() => setFocusedInput('description')}
              onBlur={() => setFocusedInput(null)}
            />

            <Text style={[styles.label, { color: theme.subtext }]}>Когда? *</Text>
            <TextInput
              style={[
                styles.input,
                {
                  backgroundColor: theme.card,
                  borderColor: focusedInput === 'datetime' ? theme.accent : theme.border,
                  color: theme.text,
                }
              ]}
              placeholder="Напр. Воскресенье, 08:00"
              placeholderTextColor={isDark ? '#475569' : '#94A3B8'}
              value={datetime}
              onChangeText={setDatetime}
              maxLength={40}
              onFocus={() => setFocusedInput('datetime')}
              onBlur={() => setFocusedInput(null)}
            />

            <Text style={[styles.label, { color: theme.subtext }]}>Макс. участников</Text>
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

          {/* Место */}
          <View style={styles.section}>
            <Text style={[styles.label, { color: theme.subtext }]}>Место</Text>

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
                placeholder="Введи адрес, напр. ул. Абая 10"
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
                  : <Text style={styles.geocodeBtnText}>Найти</Text>
                }
              </TouchableOpacity>
            </View>

            {address ? (
              <Text style={[styles.addressFound, { color: theme.accent }]}>📍 {address}</Text>
            ) : (
              <Text style={[styles.hint, { color: theme.subtext }]}>Или нажми на карту чтобы выбрать место вручную</Text>
            )}

            <View style={[styles.mapWrap, { borderColor: theme.border, shadowColor: shadowHex, shadowOpacity }]}>
              <MapView
                ref={mapRef}
                style={styles.map}
                provider={PROVIDER_DEFAULT}
                initialRegion={{ ...ALMATY, latitudeDelta: 0.12, longitudeDelta: 0.12 }}
                onPress={e => {
                  setCoordinate(e.nativeEvent.coordinate);
                  setAddress('');
                }}
              >
                <Marker coordinate={coordinate} pinColor={theme.accent} />
              </MapView>
            </View>
            <Text style={[styles.coords, { color: theme.subtext }]}>
              {coordinate.latitude.toFixed(4)}, {coordinate.longitude.toFixed(4)}
            </Text>
          </View>

          {/* Аудитория */}
          <View style={styles.section}>
            <Text style={[styles.label, { color: theme.subtext }]}>Аудитория</Text>

            <Text style={[styles.sublabel, { color: theme.subtext }]}>Для кого</Text>
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
                    {opt.emoji} {opt.label}
                  </Text>
                </TouchableOpacity>
              ))}
            </View>

            <Text style={[styles.sublabel, { color: theme.subtext }]}>Возрастной диапазон (необязательно)</Text>
            <View style={styles.ageRow}>
              <View style={styles.ageField}>
                <Text style={[styles.ageHint, { color: theme.subtext }]}>от</Text>
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
                  placeholder="18"
                  placeholderTextColor={isDark ? '#475569' : '#94A3B8'}
                  value={minAge}
                  onChangeText={setMinAge}
                  keyboardType="number-pad"
                  maxLength={3}
                  onFocus={() => setFocusedInput('minAge')}
                  onBlur={() => setFocusedInput(null)}
                />
              </View>
              <Text style={[styles.ageDash, { color: theme.border }]}>—</Text>
              <View style={styles.ageField}>
                <Text style={[styles.ageHint, { color: theme.subtext }]}>до</Text>
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
                  placeholder="99"
                  placeholderTextColor={isDark ? '#475569' : '#94A3B8'}
                  value={maxAge}
                  onChangeText={setMaxAge}
                  keyboardType="number-pad"
                  maxLength={3}
                  onFocus={() => setFocusedInput('maxAge')}
                  onBlur={() => setFocusedInput(null)}
                />
              </View>
              <Text style={[styles.ageUnit, { color: theme.subtext }]}>лет</Text>
            </View>

            {(genderFilter !== 'all' || minAge || maxAge) && (
              <View style={[styles.audienceBadge, { backgroundColor: theme.accentLight, borderColor: theme.border }]}>
                <Text style={[styles.audienceText, { color: theme.accent }]}>
                  {genderFilter === 'male' ? '👨 Мужчины' : genderFilter === 'female' ? '👩 Женщины' : '👥 Все'}
                  {(minAge || maxAge) ? ` · ${minAge || '?'}–${maxAge || '?'} лет` : ''}
                </Text>
              </View>
            )}
          </View>

          {/* Фото */}
          <View style={styles.section}>
            <Text style={[styles.label, { color: theme.subtext }]}>Фото (необязательно)</Text>
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
                  <Text style={[styles.photoHint, { color: theme.subtext }]}>Добавить фото</Text>
                </View>
              )}
            </TouchableOpacity>
            {imageUri && (
              <TouchableOpacity onPress={removeEventPhoto} style={styles.removePhoto}>
                <Text style={[styles.removePhotoText, { color: theme.danger }]}>✕ Удалить фото</Text>
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
              {loading ? (eventId ? 'Сохраняем...' : 'Создаём...') : eventId ? 'Сохранить изменения' : '✨ Создать ивент'}
            </Text>
          </TouchableOpacity>

          <View style={{ height: 40 }} />
        </ScrollView>
      </KeyboardAvoidingView>
    </SafeAreaView>
  );
}

const styles = StyleSheet.create({
  container: { flex: 1 },
  flex: { flex: 1 },
  section: { padding: 16, paddingBottom: 0 },
  label: {
    fontSize: 12, fontWeight: '700',
    textTransform: 'uppercase',
    marginBottom: 8, marginTop: 16,
    letterSpacing: 0.5,
  },
  sublabel: { fontSize: 12, fontWeight: '700', marginBottom: 8, marginTop: 12 },
  hint: { fontSize: 12, marginBottom: 8 },
  row: { flexDirection: 'row', gap: 8, paddingBottom: 4 },
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
  mapWrap: { borderRadius: 16, overflow: 'hidden', height: 200, marginTop: 8, borderWidth: 1, shadowOffset: { width: 0, height: 4 }, shadowRadius: 10, elevation: 2 },
  map: { flex: 1 },
  coords: { fontSize: 11, marginTop: 6, textAlign: 'center' },
  filterBtn: {
    flex: 1, alignItems: 'center', paddingVertical: 12, paddingHorizontal: 6,
    borderRadius: 14, borderWidth: 1.5,
  },
  filterLabel: { fontSize: 12, fontWeight: '700', textAlign: 'center' },
  ageRow: { flexDirection: 'row', alignItems: 'center', gap: 8, marginTop: 4 },
  ageField: { flexDirection: 'row', alignItems: 'center', gap: 6 },
  ageHint: { fontSize: 13 },
  ageInput: { width: 70, textAlign: 'center', marginBottom: 0 },
  ageDash: { fontSize: 18 },
  ageUnit: { fontSize: 13 },
  audienceBadge: {
    marginTop: 12, borderRadius: 10, borderWidth: 1,
    paddingHorizontal: 12, paddingVertical: 7, alignSelf: 'flex-start',
  },
  audienceText: { fontSize: 13, fontWeight: '700' },
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
  },
  createBtnText: { fontSize: 16, fontWeight: '800', color: '#FFF' },
});
