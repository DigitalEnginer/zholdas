import React, { useState } from 'react';
import {
  View, Text, TextInput, TouchableOpacity, ScrollView,
  SafeAreaView, StyleSheet, Alert, ActivityIndicator,
} from 'react-native';
import { useNavigation } from '@react-navigation/native';
import { useAuth, AVATARS } from '../context/AuthContext';
import { useTheme } from '../context/ThemeContext';

export default function EditProfileScreen() {
  const navigation = useNavigation();
  const { user, updateUser } = useAuth();
  const { theme } = useTheme();

  const currentAvatarIndex = AVATARS.indexOf(user?.avatar ?? '🧑');
  const [name, setName] = useState(user?.name ?? '');
  const [bio, setBio] = useState(user?.bio ?? '');
  const [avatarIndex, setAvatarIndex] = useState(currentAvatarIndex >= 0 ? currentAvatarIndex : 0);
  const [loading, setLoading] = useState(false);

  async function handleSave() {
    if (!name.trim()) { Alert.alert('', 'Введи имя'); return; }
    setLoading(true);
    try {
      await updateUser({
        name: name.trim(),
        bio: bio.trim(),
        avatar: AVATARS[avatarIndex],
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
      <ScrollView showsVerticalScrollIndicator={false}>
        <View style={styles.avatarSection}>
          <Text style={styles.avatarPreview}>{AVATARS[avatarIndex]}</Text>
          <Text style={[styles.hint, { color: theme.subtext }]}>Выбери аватар</Text>
          <View style={styles.avatarGrid}>
            {AVATARS.map((a, i) => (
              <TouchableOpacity
                key={i}
                style={[
                  styles.avatarOption,
                  { backgroundColor: theme.card, borderColor: 'transparent' },
                  avatarIndex === i && { borderColor: theme.accent, backgroundColor: theme.accentLight },
                ]}
                onPress={() => setAvatarIndex(i)}
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
          disabled={loading}
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
  avatarSection: { alignItems: 'center', paddingVertical: 28 },
  avatarPreview: { fontSize: 76, marginBottom: 12 },
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
    letterSpacing: 0.8, marginTop: 20, marginBottom: 8,
  },
  input: {
    borderRadius: 14, paddingHorizontal: 16, paddingVertical: 13,
    fontSize: 15, borderWidth: 1.5,
  },
  bioInput: { minHeight: 90, textAlignVertical: 'top' },
  saveBtn: {
    margin: 16, marginTop: 28, backgroundColor: '#5B4FCF',
    borderRadius: 16, paddingVertical: 16, alignItems: 'center',
  },
  saveBtnDisabled: { backgroundColor: '#C5BFFF' },
  saveBtnText: { fontSize: 16, fontWeight: '800', color: '#FFF' },
});
