import React, { useState } from 'react';
import {
  View, Text, TextInput, TouchableOpacity, ScrollView,
  SafeAreaView, StyleSheet, Alert, ActivityIndicator,
} from 'react-native';
import * as ImagePicker from 'expo-image-picker';
import { useNavigation } from '@react-navigation/native';
import { useAuth, AVATARS } from '../context/AuthContext';
import { useTheme } from '../context/ThemeContext';
import AvatarImage from '../components/AvatarImage';
import { deletePublicStorageImage, uploadImageToStorage } from '../lib/storage';

export default function EditProfileScreen() {
  const navigation = useNavigation();
  const { user, updateUser } = useAuth();
  const { theme } = useTheme();

  const currentAvatarIndex = AVATARS.indexOf(user?.avatar ?? '🧑');
  const [name, setName] = useState(user?.name ?? '');
  const [bio, setBio] = useState(user?.bio ?? '');
  const [avatarIndex, setAvatarIndex] = useState(currentAvatarIndex >= 0 ? currentAvatarIndex : 0);
  const [avatarValue, setAvatarValue] = useState(user?.avatar ?? AVATARS[avatarIndex]);
  const [loading, setLoading] = useState(false);
  const [uploadingAvatar, setUploadingAvatar] = useState(false);

  async function pickAvatarPhoto() {
    if (!user) return;

    const { status } = await ImagePicker.requestMediaLibraryPermissionsAsync();
    if (status !== 'granted') {
      Alert.alert('', 'Нужен доступ к фото');
      return;
    }

    const result = await ImagePicker.launchImageLibraryAsync({
      mediaTypes: ImagePicker.MediaTypeOptions.Images,
      allowsEditing: true,
      aspect: [1, 1],
      quality: 0.75,
    });
    if (result.canceled) return;

    setUploadingAvatar(true);
    try {
      const publicUrl = await uploadImageToStorage({
        bucket: 'profile-photos',
        path: `${user.id}/avatar-${Date.now()}`,
        uri: result.assets[0].uri,
      });
      await deletePublicStorageImage('profile-photos', avatarValue);
      setAvatarValue(publicUrl);
    } catch (e: any) {
      Alert.alert('Не удалось загрузить фото', e.message ?? 'Проверь Supabase Storage');
    } finally {
      setUploadingAvatar(false);
    }
  }

  async function handleSave() {
    if (!name.trim()) { Alert.alert('', 'Введи имя'); return; }
    setLoading(true);
    try {
      await updateUser({
        name: name.trim(),
        bio: bio.trim(),
        avatar: avatarValue,
      });
      navigation.goBack();
    } catch {
      Alert.alert('Ошибка', 'Не удалось сохранить');
    } finally {
      setLoading(false);
    }
  }

  return (
    <SafeAreaView style={[styles.container, { backgroundColor: theme.bg }]}>
      <ScrollView showsVerticalScrollIndicator={false} contentContainerStyle={styles.content}>
        <View style={styles.avatarSection}>
          <AvatarImage
            value={avatarValue}
            size={96}
            backgroundColor={theme.accentLight}
            borderColor={theme.accent}
            textSize={48}
          />
          <TouchableOpacity
            style={[styles.photoAvatarBtn, { backgroundColor: theme.accent }]}
            onPress={pickAvatarPhoto}
            disabled={uploadingAvatar}
            activeOpacity={0.8}
          >
            {uploadingAvatar
              ? <ActivityIndicator color="#FFF" size="small" />
              : <Text style={styles.photoAvatarText}>Выбрать фото</Text>
            }
          </TouchableOpacity>
          <Text style={[styles.hint, { color: theme.subtext }]}>Или выбери emoji-аватар</Text>
          <View style={styles.avatarGrid}>
            {AVATARS.map((a, i) => (
              <TouchableOpacity
                key={i}
                style={[
                  styles.avatarOption,
                  { backgroundColor: theme.card, borderColor: 'transparent' },
                  avatarIndex === i && { borderColor: theme.accent, backgroundColor: theme.accentLight },
                ]}
                onPress={() => {
                  setAvatarIndex(i);
                  setAvatarValue(a);
                }}
                activeOpacity={0.7}
              >
                <Text style={styles.avatarOptionText}>{a}</Text>
              </TouchableOpacity>
            ))}
          </View>
        </View>

        <View style={styles.form}>
          <Text style={[styles.label, { color: theme.subtext }]}>Имя</Text>
          <TextInput
            style={[styles.input, { backgroundColor: theme.card, borderColor: theme.border, color: theme.text }]}
            value={name}
            onChangeText={setName}
            placeholder="Твоё имя"
            placeholderTextColor={theme.subtext}
            maxLength={40}
          />

          <Text style={[styles.label, { color: theme.subtext }]}>О себе</Text>
          <TextInput
            style={[styles.input, styles.bioInput, { backgroundColor: theme.card, borderColor: theme.border, color: theme.text }]}
            value={bio}
            onChangeText={setBio}
            placeholder="Расскажи о себе..."
            placeholderTextColor={theme.subtext}
            multiline
            numberOfLines={3}
            maxLength={150}
          />
        </View>

        <TouchableOpacity
          style={[styles.saveBtn, loading && styles.saveBtnDisabled]}
          onPress={handleSave}
          disabled={loading || uploadingAvatar}
          activeOpacity={0.85}
        >
          {loading
            ? <ActivityIndicator color="#FFF" />
            : <Text style={styles.saveBtnText}>Сохранить изменения</Text>
          }
        </TouchableOpacity>
        <View style={{ height: 40 }} />
      </ScrollView>
    </SafeAreaView>
  );
}

const styles = StyleSheet.create({
  container: { flex: 1 },
  content: { width: '100%', maxWidth: 720, alignSelf: 'center', paddingBottom: 40 },
  avatarSection: { alignItems: 'center', paddingVertical: 28 },
  photoAvatarBtn: {
    borderRadius: 18,
    paddingHorizontal: 18,
    paddingVertical: 9,
    marginTop: 12,
    marginBottom: 10,
    minWidth: 124,
    alignItems: 'center',
  },
  photoAvatarText: { color: '#FFF', fontSize: 13, fontWeight: '800' },
  hint: { fontSize: 13, marginBottom: 16 },
  avatarGrid: { flexDirection: 'row', flexWrap: 'wrap', justifyContent: 'center', gap: 10, paddingHorizontal: 16 },
  avatarOption: {
    width: 56, height: 56, borderRadius: 28,
    justifyContent: 'center', alignItems: 'center', borderWidth: 2,
  },
  avatarOptionText: { fontSize: 28 },
  form: { paddingHorizontal: 16 },
  label: {
    fontSize: 13, fontWeight: '700', textTransform: 'uppercase',
    marginTop: 20, marginBottom: 8,
  },
  input: {
    borderRadius: 14, paddingHorizontal: 16, paddingVertical: 13,
    fontSize: 15, borderWidth: 1.5,
  },
  bioInput: { minHeight: 90, textAlignVertical: 'top' },
  saveBtn: {
    margin: 16, marginTop: 28, backgroundColor: '#4F46E5',
    borderRadius: 14, paddingVertical: 16, alignItems: 'center',
  },
  saveBtnDisabled: { backgroundColor: '#C7D2FE' },
  saveBtnText: { fontSize: 16, fontWeight: '800', color: '#FFF' },
});
