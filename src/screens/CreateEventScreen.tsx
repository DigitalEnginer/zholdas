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
import { categoryEmojis } from '../data/mockEvents';
import { deletePublicStorageImage, uploadImageToStorage } from '../lib/storage';
import { userMessageFromModerationError, validateEventContent } from '../lib/contentModeration';
import { useLanguage } from '../context/LanguageContext';
import {
  composeStartsAt,
  formatDateInput,
  formatEventDateTime,
  formatTimeInput,
  getDateOptions,
  normalizeTimeInput,
  parseDateInput,
} from '../lib/eventDateTime';

type Nav = NativeStackNavigationProp<RootStackParamList>;
type CreateEventRoute = RouteProp<RootStackParamList, 'CreateEvent'>;

const CATEGORIES: EventCategory[] = ['mountains', 'theatre', 'restaurant', 'sport', 'other'];
const ALMATY = { latitude: 43.238, longitude: 76.945 };
const TIME_OPTIONS = ['09:00', '12:00', '15:00', '18:00', '19:00', '20:00'];

const GENDER_FILTERS: Array<{ key: GenderFilter; emoji: string }> = [
  { key: 'all', emoji: '👥' },
  { key: 'male', emoji: '👨' },
  { key: 'female', emoji: '👩' },
];

export default function CreateEventScreen() {
  const navigation = useNavigation<Nav>();
  const route = useRoute<CreateEventRoute>();
  const { createEvent, updateEvent, events } = useEvents();
  const { user } = useAuth();
  const { theme, isDark } = useTheme();
  const { t, locale } = useLanguage();
  const eventId = route.params?.eventId;
  const editingEvent = eventId ? events.find(e => e.id === eventId) : undefined;
  const mapRef = useRef<MapView>(null);

  const [title, setTitle] = useState('');
  const [description, setDescription] = useState('');
  const [category, setCategory] = useState<EventCategory>('other');
  const [eventDate, setEventDate] = useState(formatDateInput(new Date()));
  const [eventTime, setEventTime] = useState('19:00');
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
  const dateOptions = React.useMemo(() => getDateOptions(8), []);

  React.useEffect(() => {
    navigation.setOptions({ title: eventId ? t('editEventTitle') : t('newEventTitle') });
  }, [eventId, navigation, t]);

  React.useEffect(() => {
    if (!editingEvent) return;
    setTitle(editingEvent.title);
    setDescription(editingEvent.description);
    setCategory(editingEvent.category);
    if (editingEvent.startsAt) {
      const startsAt = new Date(editingEvent.startsAt);
      if (!Number.isNaN(startsAt.getTime())) {
        setEventDate(formatDateInput(startsAt));
        setEventTime(formatTimeInput(startsAt));
      }
    }
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
        Alert.alert(t('addressNotFoundTitle'), t('addressNotFoundText'));
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

    const { status } = await ImagePicker.requestMediaLibraryPermissionsAsync();
    if (status !== 'granted') { Alert.alert('', t('photoPickError')); return; }

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
    const parsedDate = parseDateInput(eventDate);
    const normalizedTime = normalizeTimeInput(eventTime);
    const startsAt = parsedDate && normalizedTime ? composeStartsAt(parsedDate, normalizedTime) : null;
    if (!parsedDate || !normalizedTime || !startsAt) { Alert.alert(t('error'), t('datetimeRequired')); return; }
    if (!eventId && startsAt.getTime() < Date.now() - 60 * 1000) {
      Alert.alert(t('error'), t('eventDateInPast'));
      return;
    }
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
        datetime: formatEventDateTime(startsAt, locale),
        startsAt: startsAt.toISOString(),
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

      await createEvent(payload);
      Alert.alert(t('done'), t('eventCreated'), [
        {
          text: t('done'),
          onPress: () => navigation.reset({
            index: 0,
            routes: [{ name: 'Main' }],
          }),
        },
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
      <KeyboardAvoidingView style={styles.flex} behavior={Platform.OS === 'ios' ? 'padding' : 'height'}>
        <ScrollView showsVerticalScrollIndicator={false} keyboardShouldPersistTaps="handled">

          {/* Категория */}
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

          {/* Основные поля */}
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
            <ScrollView horizontal showsHorizontalScrollIndicator={false} contentContainerStyle={styles.dateRow}>
              {dateOptions.map(option => {
                const selected = eventDate === option.value;
                return (
                  <TouchableOpacity
                    key={option.value}
                    style={[
                      styles.dateChip,
                      {
                        backgroundColor: selected ? theme.accentLight : theme.card,
                        borderColor: selected ? theme.accent : theme.border,
                      },
                    ]}
                    onPress={() => setEventDate(option.value)}
                    activeOpacity={0.8}
                  >
                    <Text style={[styles.dateChipDay, { color: selected ? theme.accent : theme.text }]}>
                      {option.date.toLocaleDateString(locale === 'kk' ? 'kk-KZ' : 'ru-RU', { weekday: 'short' })}
                    </Text>
                    <Text style={[styles.dateChipDate, { color: selected ? theme.accent : theme.subtext }]}>
                      {option.date.toLocaleDateString(locale === 'kk' ? 'kk-KZ' : 'ru-RU', { day: 'numeric', month: 'short' })}
                    </Text>
                  </TouchableOpacity>
                );
              })}
            </ScrollView>

            <View style={styles.dateTimeInputs}>
              <TextInput
                style={[
                  styles.input,
                  styles.dateInput,
                  {
                    backgroundColor: theme.card,
                    borderColor: focusedInput === 'eventDate' ? theme.accent : theme.border,
                    color: theme.text,
                  }
                ]}
                placeholder="2026-06-16"
                placeholderTextColor={isDark ? '#475569' : '#94A3B8'}
                value={eventDate}
                onChangeText={setEventDate}
                maxLength={10}
                onFocus={() => setFocusedInput('eventDate')}
                onBlur={() => setFocusedInput(null)}
              />
              <TextInput
                style={[
                  styles.input,
                  styles.timeInput,
                  {
                    backgroundColor: theme.card,
                    borderColor: focusedInput === 'eventTime' ? theme.accent : theme.border,
                    color: theme.text,
                  }
                ]}
                placeholder="19:00"
                placeholderTextColor={isDark ? '#475569' : '#94A3B8'}
                value={eventTime}
                onChangeText={setEventTime}
                maxLength={5}
                onFocus={() => setFocusedInput('eventTime')}
                onBlur={() => setFocusedInput(null)}
              />
            </View>

            <View style={styles.timeRow}>
              {TIME_OPTIONS.map(time => {
                const selected = eventTime === time;
                return (
                  <TouchableOpacity
                    key={time}
                    style={[
                      styles.timeChip,
                      {
                        backgroundColor: selected ? theme.accent : theme.card,
                        borderColor: selected ? theme.accent : theme.border,
                      },
                    ]}
                    onPress={() => setEventTime(time)}
                    activeOpacity={0.8}
                  >
                    <Text style={[styles.timeChipText, { color: selected ? '#FFF' : theme.text }]}>{time}</Text>
                  </TouchableOpacity>
                );
              })}
            </View>

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

          {/* Место */}
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
              <View style={styles.ageField}>
                <Text style={[styles.ageHint, { color: theme.subtext }]}>{t('ageMin')}</Text>
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
                <Text style={[styles.ageHint, { color: theme.subtext }]}>{t('ageMax')}</Text>
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
              <Text style={[styles.ageUnit, { color: theme.subtext }]}>{t('ageUnit')}</Text>
            </View>

            {(genderFilter !== 'all' || minAge || maxAge) && (
              <View style={[styles.audienceBadge, { backgroundColor: theme.accentLight, borderColor: theme.border }]}>
                <Text style={[styles.audienceText, { color: theme.accent }]}>
                  {genderFilter === 'male' ? `👨 ${t('genderFilterMale')}` : genderFilter === 'female' ? `👩 ${t('genderFilterFemale')}` : `👥 ${t('genderFilterAll')}`}
                  {(minAge || maxAge) ? ` · ${minAge || '?'}–${maxAge || '?'} ${t('ageUnit')}` : ''}
                </Text>
              </View>
            )}
          </View>

          {/* Фото */}
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
  dateRow: { gap: 8, paddingBottom: 10 },
  dateChip: {
    minWidth: 92,
    borderWidth: 1.5,
    borderRadius: 16,
    paddingHorizontal: 12,
    paddingVertical: 11,
  },
  dateChipDay: { fontSize: 13, fontWeight: '900', textTransform: 'capitalize' },
  dateChipDate: { fontSize: 12, fontWeight: '700', marginTop: 3, textTransform: 'capitalize' },
  dateTimeInputs: { flexDirection: 'row', gap: 8 },
  dateInput: { flex: 1 },
  timeInput: { width: 104, textAlign: 'center', fontWeight: '800' },
  timeRow: { flexDirection: 'row', flexWrap: 'wrap', gap: 8, marginBottom: 8 },
  timeChip: {
    borderWidth: 1.5,
    borderRadius: 999,
    paddingHorizontal: 14,
    paddingVertical: 9,
  },
  timeChipText: { fontSize: 13, fontWeight: '900' },
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
