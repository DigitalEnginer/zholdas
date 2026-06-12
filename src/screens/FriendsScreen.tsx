import React, { useEffect, useState } from 'react';
import {
  ActivityIndicator, Alert, SafeAreaView, ScrollView,
  StyleSheet, Text, TouchableOpacity, View,
} from 'react-native';
import { useNavigation } from '@react-navigation/native';
import { NativeStackNavigationProp } from '@react-navigation/native-stack';
import { useAuth } from '../context/AuthContext';
import { useTheme } from '../context/ThemeContext';
import { RootStackParamList } from '../types';
import { supabase } from '../lib/supabase';
import AvatarImage from '../components/AvatarImage';

type Nav = NativeStackNavigationProp<RootStackParamList>;
type RequestStatus = 'pending' | 'accepted' | 'declined';
type FriendsTab = 'friends' | 'incoming' | 'outgoing';

interface FriendRequest {
  id: string;
  from_user_id: string;
  to_user_id: string;
  status: RequestStatus;
  created_at: string;
}

interface ProfileSummary {
  id: string;
  name: string;
  avatar: string;
}

export default function FriendsScreen() {
  const { user } = useAuth();
  const { theme } = useTheme();
  const navigation = useNavigation<Nav>();
  const [requests, setRequests] = useState<FriendRequest[]>([]);
  const [profiles, setProfiles] = useState<Record<string, ProfileSummary>>({});
  const [loading, setLoading] = useState(true);
  const [activeTab, setActiveTab] = useState<FriendsTab>('friends');

  useEffect(() => {
    loadFriends();
  }, [user?.id]);

  async function loadFriends() {
    if (!user) return;
    setLoading(true);

    const { data, error } = await supabase
      .from('friend_requests')
      .select('id, from_user_id, to_user_id, status, created_at')
      .or(`from_user_id.eq.${user.id},to_user_id.eq.${user.id}`)
      .order('created_at', { ascending: false });

    if (error) {
      Alert.alert('Не удалось загрузить друзей', error.message);
      setLoading(false);
      return;
    }

    const rows = (data ?? []) as FriendRequest[];
    const ids = Array.from(new Set(rows.flatMap(r => [r.from_user_id, r.to_user_id])));
    if (ids.length > 0) {
      const { data: profileData } = await supabase
        .from('profiles')
        .select('id, name, avatar')
        .in('id', ids);

      const nextProfiles: Record<string, ProfileSummary> = {};
      (profileData ?? []).forEach((p: any) => {
        nextProfiles[p.id] = {
          id: p.id,
          name: p.name ?? 'Пользователь',
          avatar: p.avatar ?? '👤',
        };
      });
      setProfiles(nextProfiles);
    }

    setRequests(rows);
    setLoading(false);
  }

  async function updateRequest(id: string, status: RequestStatus) {
    const { error } = await supabase.from('friend_requests').update({ status }).eq('id', id);
    if (error) {
      Alert.alert('Ошибка', error.message);
      return;
    }
    setRequests(prev => prev.map(r => r.id === id ? { ...r, status } : r));
  }

  async function deleteRequest(id: string) {
    const { error } = await supabase.from('friend_requests').delete().eq('id', id);
    if (error) {
      Alert.alert('Ошибка', error.message);
      return;
    }
    setRequests(prev => prev.filter(r => r.id !== id));
  }

  function openProfile(profile: ProfileSummary) {
    navigation.navigate('UserProfile', {
      userId: profile.id,
      userName: profile.name,
      userAvatar: profile.avatar,
    });
  }

  function renderRequest(request: FriendRequest) {
    if (!user) return null;
    const otherId = request.from_user_id === user.id ? request.to_user_id : request.from_user_id;
    const profile = profiles[otherId] ?? { id: otherId, name: 'Пользователь', avatar: '👤' };
    const incoming = request.to_user_id === user.id;

    return (
      <View key={request.id} style={[styles.row, { borderTopColor: theme.border }]}>
        <TouchableOpacity style={styles.person} onPress={() => openProfile(profile)} activeOpacity={0.75}>
          <AvatarImage value={profile.avatar} size={40} backgroundColor={theme.accentLight} textSize={22} />
          <View style={styles.personText}>
            <Text style={[styles.name, { color: theme.text }]}>{profile.name}</Text>
            <Text style={[styles.meta, { color: theme.subtext }]}>
              {request.status === 'accepted' ? 'В друзьях' : incoming ? 'Хочет добавить вас' : 'Заявка отправлена'}
            </Text>
          </View>
        </TouchableOpacity>
        {incoming && request.status === 'pending' && (
          <View style={styles.actions}>
            <TouchableOpacity style={[styles.actionBtn, { backgroundColor: theme.accent }]} onPress={() => updateRequest(request.id, 'accepted')}>
              <Text style={styles.actionText}>Принять</Text>
            </TouchableOpacity>
            <TouchableOpacity style={[styles.actionBtn, { backgroundColor: '#999' }]} onPress={() => updateRequest(request.id, 'declined')}>
              <Text style={styles.actionText}>Нет</Text>
            </TouchableOpacity>
          </View>
        )}
        {!incoming && request.status === 'pending' && (
          <View style={styles.actions}>
            <TouchableOpacity style={[styles.actionBtn, { backgroundColor: '#999' }]} onPress={() => deleteRequest(request.id)}>
              <Text style={styles.actionText}>Отменить</Text>
            </TouchableOpacity>
          </View>
        )}
        {request.status === 'accepted' && (
          <View style={styles.actions}>
            <TouchableOpacity style={[styles.actionBtn, { backgroundColor: '#D92D20' }]} onPress={() => deleteRequest(request.id)}>
              <Text style={styles.actionText}>Удалить</Text>
            </TouchableOpacity>
          </View>
        )}
      </View>
    );
  }

  if (loading) {
    return (
      <SafeAreaView style={[styles.container, { backgroundColor: theme.bg }]}>
        <ActivityIndicator color={theme.accent} style={{ flex: 1 }} />
      </SafeAreaView>
    );
  }

  const accepted = requests.filter(r => r.status === 'accepted');
  const incoming = requests.filter(r => r.status === 'pending' && r.to_user_id === user?.id);
  const outgoing = requests.filter(r => r.status === 'pending' && r.from_user_id === user?.id);
  const tabs: Array<{ key: FriendsTab; label: string; data: FriendRequest[] }> = [
    { key: 'friends', label: `Друзья ${accepted.length}`, data: accepted },
    { key: 'incoming', label: `Входящие ${incoming.length}`, data: incoming },
    { key: 'outgoing', label: `Исходящие ${outgoing.length}`, data: outgoing },
  ];
  const currentTab = tabs.find(tab => tab.key === activeTab) ?? tabs[0];

  return (
    <SafeAreaView style={[styles.container, { backgroundColor: theme.bg }]}>
      <ScrollView contentContainerStyle={styles.content} showsVerticalScrollIndicator={false}>
        <View style={[styles.tabs, { backgroundColor: theme.card }]}>
          {tabs.map(tab => {
            const selected = activeTab === tab.key;
            return (
              <TouchableOpacity
                key={tab.key}
                style={[styles.tab, selected && { backgroundColor: theme.accent }]}
                onPress={() => setActiveTab(tab.key)}
                activeOpacity={0.75}
              >
                <Text style={[styles.tabText, { color: selected ? '#FFF' : theme.subtext }]}>{tab.label}</Text>
              </TouchableOpacity>
            );
          })}
        </View>

        <View style={[styles.section, { backgroundColor: theme.card }]}>
          <Text style={[styles.sectionTitle, { color: theme.subtext }]}>{currentTab.label}</Text>
          {currentTab.data.length === 0 ? (
            <Text style={[styles.empty, { color: theme.subtext }]}>Пусто</Text>
          ) : (
            currentTab.data.map(renderRequest)
          )}
        </View>
      </ScrollView>
    </SafeAreaView>
  );
}

const styles = StyleSheet.create({
  container: { flex: 1 },
  content: { padding: 16, paddingBottom: 36, width: '100%', maxWidth: 820, alignSelf: 'center' },
  tabs: { flexDirection: 'row', gap: 6, borderRadius: 16, padding: 6, marginBottom: 12, borderWidth: 1, borderColor: '#E4E7EC' },
  tab: { flex: 1, borderRadius: 12, paddingVertical: 10, alignItems: 'center' },
  tabText: { fontSize: 12, fontWeight: '800' },
  section: {
    borderRadius: 16, overflow: 'hidden', marginBottom: 12,
    borderWidth: 1, borderColor: '#E4E7EC',
    shadowColor: '#101828', shadowOffset: { width: 0, height: 6 },
    shadowOpacity: 0.05, shadowRadius: 16, elevation: 2,
  },
  sectionTitle: {
    fontSize: 12,
    fontWeight: '800',
    textTransform: 'uppercase',
    paddingHorizontal: 16,
    paddingTop: 14,
    paddingBottom: 8,
  },
  empty: { paddingHorizontal: 16, paddingBottom: 16, fontSize: 14 },
  row: { padding: 16, borderTopWidth: 1 },
  person: { flexDirection: 'row', alignItems: 'center', gap: 12 },
  personText: { flex: 1 },
  name: { fontSize: 16, fontWeight: '800' },
  meta: { fontSize: 12, marginTop: 3 },
  actions: { flexDirection: 'row', gap: 8, marginTop: 12 },
  actionBtn: { borderRadius: 14, paddingHorizontal: 12, paddingVertical: 7 },
  actionText: { color: '#FFF', fontSize: 12, fontWeight: '800' },
});
