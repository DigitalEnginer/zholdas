import React, { useState, useRef } from 'react';
import {
  View, Text, TextInput, TouchableOpacity, StyleSheet,
  ScrollView, KeyboardAvoidingView, Platform, SafeAreaView,
  Alert, Image, ActivityIndicator,
} from 'react-native';
import MapView, { Marker, PROVIDER_DEFAULT, Region } from 'react-native-maps';
import { useNavigation } from '@react-navigation/native';
import { NativeStackNavigationProp } from '@react-navigation/native-stack';
import * as ImagePicker from 'expo-image-picker';
import * as FileSystem from 'expo-file-system';
import * as Location from 'expo-location';
import { decode } from 'base64-arraybuffer';
import { RootStackParamList, EventCategory, GenderFilter } from '../types';
import { useEvents } from '../context/EventsContext';
import { useAuth } from '../context/AuthContext';
import { categoryEmojis, categoryLabels } from '../data/mockEvents';
import { supabase } from '../lib/supabase';

type Nav = NativeStackNavigationProp<RootStackParamList>;

const CATEGORIES: EventCategory[] = ['mountains', 'theatre', 'restaurant', 'sport', 'other'];
const ALMATY = { latitude: 43.238, longitude: 76.945 };

const GENDER_FILTERS: Array<{ key: GenderFilter; label: string; emoji: string }> = [
  { key: 'all', label: 'Все', emoji: '👥' },
  { key: 'male', label: 'Только мужчины', emoji: '👨' },
  { key: 'female', label: 'Только женщины', emoji: '👩' },
];

export default function CreateEventScreen() {
  const navigation = useNavigation<Nav>();
  const { createEvent } = useEvents();
  const { user } = useAuth();
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
      const base64 = await FileSystem.readAsStringAsync(localUri, { encoding: 'base64' as any });
      const filename = `event-${Date.now()}.jpg`;
      const { error } = await supabase.storage
        .from('event-photos')
        .upload(filename, decode(base64), { contentType: 'image/jpeg' });
      if (error) {
        setImageUri(localUri);
      } else {
        const { data: { publicUrl } } = supabase.storage.from('event-photos').getPublicUrl(filename);
        setImageUri(publicUrl);
      }
    } catch {
      setImageUri(localUri);
    } finally {
      setUploading(false);
    }
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
      const event = await createEvent({
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
      });
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
      <KeyboardAvoidingView style={styles.flex} behavior={Platform.OS === 'ios' ? 'padding' : 'height'}>
        <ScrollView showsVerticalScrollIndicator={false} keyboardShouldPersistTaps="handled">

          {/* Категория */}
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

          {/* Основные поля */}
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

          {/* Место */}
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
                <Marker coordinate={coordinate} pinColor="#5B4FCF" />
              </MapView>
            </View>
            <Text style={styles.coords}>
              {coordinate.latitude.toFixed(4)}, {coordinate.longitude.toFixed(4)}
            </Text>
          </View>

          {/* Аудитория */}
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
              <View style={styles.ageField}>
                <Text style={styles.ageHint}>от</Text>
                <TextInput
                  style={[styles.input, styles.ageInput]}
                  placeholder="18"
                  placeholderTextColor="#BBB"
                  value={minAge}
                  onChangeText={setMinAge}
                  keyboardType="number-pad"
                  maxLength={3}
                />
              </View>
              <Text style={styles.ageDash}>—</Text>
              <View style={styles.ageField}>
                <Text style={styles.ageHint}>до</Text>
                <TextInput
                  style={[styles.input, styles.ageInput]}
                  placeholder="99"
                  placeholderTextColor="#BBB"
                  value={maxAge}
                  onChangeText={setMaxAge}
                  keyboardType="number-pad"
                  maxLength={3}
                />
              </View>
              <Text style={styles.ageUnit}>лет</Text>
            </View>

            {(genderFilter !== 'all' || minAge || maxAge) && (
              <View style={styles.audienceBadge}>
                <Text style={styles.audienceText}>
                  {genderFilter === 'male' ? '👨 Мужчины' : genderFilter === 'female' ? '👩 Женщины' : '👥 Все'}
                  {(minAge || maxAge) ? ` · ${minAge || '?'}–${maxAge || '?'} лет` : ''}
                </Text>
              </View>
            )}
          </View>

          {/* Фото */}
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
              <TouchableOpacity onPress={() => setImageUri(null)} style={styles.removePhoto}>
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
            <Text style={styles.createBtnText}>{loading ? 'Создаём...' : '✨ Создать ивент'}</Text>
          </TouchableOpacity>

          <View style={{ height: 40 }} />
        </ScrollView>
      </KeyboardAvoidingView>
    </SafeAreaView>
  );
}

const styles = StyleSheet.create({
  container: { flex: 1, backgroundColor: '#F8F7FF' },
  flex: { flex: 1 },
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
  mapWrap: { borderRadius: 16, overflow: 'hidden', height: 200, marginTop: 8 },
  map: { flex: 1 },
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
  ageField: { flexDirection: 'row', alignItems: 'center', gap: 6 },
  ageHint: { fontSize: 13, color: '#999' },
  ageInput: { width: 70, textAlign: 'center' },
  ageDash: { fontSize: 18, color: '#CCC' },
  ageUnit: { fontSize: 13, color: '#999' },
  audienceBadge: {
    marginTop: 12, backgroundColor: '#F0EEFF', borderRadius: 10,
    paddingHorizontal: 12, paddingVertical: 7, alignSelf: 'flex-start',
  },
  audienceText: { fontSize: 13, color: '#5B4FCF', fontWeight: '700' },
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
