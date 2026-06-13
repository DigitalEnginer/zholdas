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
  const { theme, isDark } = useTheme();

  const currentAvatarIndex = AVATARS.indexOf(user?.avatar ?? '🧑');
  const [name, setName] = useState(user?.name ?? '');
  const [bio, setBio] = useState(user?.bio ?? '');
  const [avatarIndex, setAvatarIndex] = useState(currentAvatarIndex >= 0 ? currentAvatarIndex : 0);
  const [avatarValue, setAvatarValue] = useState(user?.avatar ?? AVATARS[avatarIndex]);
  const [loading, setLoading] = useState(false);
  const [uploadingAvatar, setUploadingAvatar] = useState(false);

  const [isNameFocused, setIsNameFocused] = useState(false);
  const [isBioFocused, setIsBioFocused] = useState(false);

  const getShadowStyle = () => ({
    shadowColor: isDark ? '#000' : '#0F172A',
    shadowOffset: { width: 0, height: 6 },
    shadowOpacity: isDark ? 0.35 : 0.08,
    shadowRadius: 12,
    elevation: 3,
  });

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
            size={100}
            backgroundColor={theme.accentLight}
            borderColor={theme.accent}
            textSize={50}
          />
          <TouchableOpacity
            style={[
              styles.photoAvatarBtn,
              {
                backgroundColor: theme.accentLight,
                borderColor: theme.accent,
                borderWidth: 1.5,
              }
            ]}
            onPress={pickAvatarPhoto}
            disabled={uploadingAvatar}
            activeOpacity={0.8}
          >
            {uploadingAvatar ? (
              <ActivityIndicator color={theme.accent} size="small" />
            ) : (
              <Text style={[styles.photoAvatarText, { color: theme.accent }]}>Выбрать фото</Text>
            )}
          </TouchableOpacity>
          <Text style={[styles.hint, { color: theme.subtext }]}>Или выбери emoji-аватар</Text>
          <View style={styles.avatarGrid}>
            {AVATARS.map((a, i) => {
              const isActive = avatarValue === a;
              return (
                <TouchableOpacity
                  key={i}
                  style={[
                    styles.avatarTile,
                    {
                      backgroundColor: theme.card,
                      borderColor: theme.border,
                    },
                    isActive && {
                      borderColor: theme.accent,
                      backgroundColor: theme.accentLight,
                      shadowColor: theme.accent,
                      shadowOffset: { width: 0, height: 4 },
                      shadowOpacity: 0.15,
                      shadowRadius: 8,
                      elevation: 2,
                    },
                  ]}
                  onPress={() => {
                    setAvatarIndex(i);
                    setAvatarValue(a);
                  }}
                  activeOpacity={0.7}
                >
                  <Text style={styles.avatarTileText}>{a}</Text>
                  {isActive && <View style={[styles.activeOverlay, { backgroundColor: theme.accent + '15' }]} />}
                </TouchableOpacity>
              );
            })}
          </View>
        </View>

        <View style={styles.form}>
          <Text style={[styles.label, { color: theme.subtext }]}>Имя</Text>
          <TextInput
            style={[
              styles.input,
              {
                backgroundColor: theme.inputBg,
                borderColor: isNameFocused ? theme.accent : theme.border,
                color: theme.text
              }
            ]}
            value={name}
            onChangeText={setName}
            onFocus={() => setIsNameFocused(true)}
            onBlur={() => setIsNameFocused(false)}
            placeholder="Твоё имя"
            placeholderTextColor={theme.subtext + '80'}
            maxLength={40}
          />

          <Text style={[styles.label, { color: theme.subtext }]}>О себе</Text>
          <TextInput
            style={[
              styles.input,
              styles.bioInput,
              {
                backgroundColor: theme.inputBg,
                borderColor: isBioFocused ? theme.accent : theme.border,
                color: theme.text
              }
            ]}
            value={bio}
            onChangeText={setBio}
            onFocus={() => setIsBioFocused(true)}
            onBlur={() => setIsBioFocused(false)}
            placeholder="Расскажи о себе..."
            placeholderTextColor={theme.subtext + '80'}
            multiline
            numberOfLines={3}
            maxLength={150}
          />
        </View>

        <TouchableOpacity
          style={[
            styles.saveBtn,
            { backgroundColor: theme.accent },
            getShadowStyle(),
            (loading || uploadingAvatar) && { backgroundColor: theme.border, shadowOpacity: 0, elevation: 0 }
          ]}
          onPress={handleSave}
          disabled={loading || uploadingAvatar}
          activeOpacity={0.85}
        >
          {loading ? (
            <ActivityIndicator color="#FFF" />
          ) : (
            <Text style={styles.saveBtnText}>Сохранить изменения</Text>
          )}
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
    borderRadius: 20,
    paddingHorizontal: 20,
    paddingVertical: 10,
    marginTop: 16,
    marginBottom: 12,
    minWidth: 140,
    alignItems: 'center',
  },
  photoAvatarText: { fontSize: 13, fontWeight: '800' },
  hint: { fontSize: 13, marginBottom: 16, fontWeight: '600' },
  avatarGrid: { flexDirection: 'row', flexWrap: 'wrap', justifyContent: 'center', gap: 10, paddingHorizontal: 16 },
  avatarTile: {
    width: 62,
    height: 62,
    borderRadius: 16,
    justifyContent: 'center',
    alignItems: 'center',
    borderWidth: 1.5,
    position: 'relative',
    overflow: 'hidden',
  },
  avatarTileText: { fontSize: 28 },
  activeOverlay: {
    ...StyleSheet.absoluteFillObject,
  },
  form: { paddingHorizontal: 20 },
  label: {
    fontSize: 12, fontWeight: '700', textTransform: 'uppercase',
    marginTop: 24, marginBottom: 8, letterSpacing: 0.5,
  },
  input: {
    borderRadius: 14, paddingHorizontal: 16, paddingVertical: 14,
    fontSize: 15, borderWidth: 1.5,
  },
  bioInput: { minHeight: 100, textAlignVertical: 'top' },
  saveBtn: {
    margin: 20, marginTop: 32,
    borderRadius: 14, paddingVertical: 16, alignItems: 'center',
  },
  saveBtnText: { fontSize: 16, fontWeight: '800', color: '#FFF' },
});
