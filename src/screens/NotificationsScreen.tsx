import React, { useEffect, useState } from 'react';
import { ActivityIndicator, SafeAreaView, ScrollView, StyleSheet, Text, TouchableOpacity, View } from 'react-native';
import { useNavigation } from '@react-navigation/native';
import { NativeStackNavigationProp } from '@react-navigation/native-stack';
import { useAuth } from '../context/AuthContext';
import { useTheme } from '../context/ThemeContext';
import { RootStackParamList } from '../types';
import { supabase } from '../lib/supabase';

type Nav = NativeStackNavigationProp<RootStackParamList>;
type NotificationTab = 'all' | 'unread';

interface NotificationItem {
  id: string;
  title: string;
  body: string | null;
  type: string;
  is_read: boolean;
  created_at: string;
}

export default function NotificationsScreen() {
  const { user } = useAuth();
  const { theme } = useTheme();
  const navigation = useNavigation<Nav>();
  const [items, setItems] = useState<NotificationItem[]>([]);
  const [loading, setLoading] = useState(true);
  const [activeTab, setActiveTab] = useState<NotificationTab>('all');

  useEffect(() => {
    loadNotifications();
  }, [user?.id]);

  useEffect(() => {
    if (!user) return;

    const channel = supabase
      .channel(`notifications-screen-${user.id}`)
      .on(
        'postgres_changes',
        { event: '*', schema: 'public', table: 'notifications', filter: `recipient_id=eq.${user.id}` },
        loadNotifications
      )
      .subscribe();

    return () => { supabase.removeChannel(channel); };
  }, [user?.id]);

  async function loadNotifications() {
    if (!user) return;
    const { data } = await supabase
      .from('notifications')
      .select('id, title, body, type, is_read, created_at')
      .eq('recipient_id', user.id)
      .order('created_at', { ascending: false })
      .limit(50);

    setItems((data ?? []) as NotificationItem[]);
    setLoading(false);
  }

  async function markRead(id: string) {
    await supabase.from('notifications').update({ is_read: true }).eq('id', id);
    setItems(prev => prev.map(item => item.id === id ? { ...item, is_read: true } : item));
  }

  async function handlePress(item: NotificationItem) {
    await markRead(item.id);

    if (item.type === 'friend_request' || item.type === 'friend_accept') {
      navigation.navigate('Friends');
    } else if (item.type === 'report_created') {
      navigation.navigate('ModeratorDashboard');
    } else if (
      item.type === 'event_joined'
      || item.type === 'event_left'
      || item.type === 'event_finished'
      || item.type === 'event_cancelled'
      || item.type === 'chat_message'
      || item.type === 'broadcast'
    ) {
      navigation.navigate('Main');
    }
  }

  async function markAllRead() {
    if (!user) return;
    await supabase.from('notifications').update({ is_read: true }).eq('recipient_id', user.id);
    setItems(prev => prev.map(item => ({ ...item, is_read: true })));
  }

  return (
    <SafeAreaView style={[styles.container, { backgroundColor: theme.bg }]}>
      {loading ? (
        <ActivityIndicator color={theme.accent} style={{ flex: 1 }} />
      ) : (
        <ScrollView contentContainerStyle={styles.content} showsVerticalScrollIndicator={false}>
          <View style={[styles.tabs, { backgroundColor: theme.card }]}>
            {[
              { key: 'all', label: `Все ${items.length}` },
              { key: 'unread', label: `Новые ${items.filter(item => !item.is_read).length}` },
            ].map(tab => {
              const selected = activeTab === tab.key;
              return (
                <TouchableOpacity
                  key={tab.key}
                  style={[styles.tab, selected && { backgroundColor: theme.accent }]}
                  onPress={() => setActiveTab(tab.key as NotificationTab)}
                >
                  <Text style={[styles.tabText, { color: selected ? '#FFF' : theme.subtext }]}>{tab.label}</Text>
                </TouchableOpacity>
              );
            })}
          </View>
          {items.length > 0 && (
            <TouchableOpacity style={[styles.readAll, { borderColor: theme.border }]} onPress={markAllRead}>
              <Text style={[styles.readAllText, { color: theme.subtext }]}>Отметить все прочитанными</Text>
            </TouchableOpacity>
          )}
          {(activeTab === 'unread' ? items.filter(item => !item.is_read) : items).length === 0 ? (
            <Text style={[styles.empty, { color: theme.subtext }]}>Уведомлений пока нет</Text>
          ) : (
            (activeTab === 'unread' ? items.filter(item => !item.is_read) : items).map(item => (
              <TouchableOpacity
                key={item.id}
                style={[styles.card, { backgroundColor: theme.card, borderColor: item.is_read ? theme.border : theme.accent }]}
                onPress={() => handlePress(item)}
                activeOpacity={0.8}
              >
                <View style={[styles.dot, { backgroundColor: item.is_read ? theme.border : theme.accent }]} />
                <View style={styles.body}>
                  <Text style={[styles.title, { color: theme.text }]}>{item.title}</Text>
                  {item.body ? <Text style={[styles.text, { color: theme.subtext }]}>{item.body}</Text> : null}
                </View>
              </TouchableOpacity>
            ))
          )}
        </ScrollView>
      )}
    </SafeAreaView>
  );
}

const styles = StyleSheet.create({
  container: { flex: 1 },
  content: { padding: 16, paddingBottom: 36, width: '100%', maxWidth: 820, alignSelf: 'center' },
  tabs: { flexDirection: 'row', gap: 6, borderRadius: 16, padding: 6, marginBottom: 12, borderWidth: 1, borderColor: '#E4E7EC' },
  tab: { flex: 1, borderRadius: 12, paddingVertical: 10, alignItems: 'center' },
  tabText: { fontSize: 13, fontWeight: '800' },
  readAll: { borderWidth: 1, borderRadius: 14, padding: 12, alignItems: 'center', marginBottom: 12 },
  readAllText: { fontSize: 13, fontWeight: '800' },
  empty: { marginTop: 40, textAlign: 'center', fontSize: 15 },
  card: {
    flexDirection: 'row', borderWidth: 1.5, borderRadius: 14, padding: 14, marginBottom: 10,
    shadowColor: '#101828', shadowOffset: { width: 0, height: 4 },
    shadowOpacity: 0.04, shadowRadius: 12, elevation: 1,
  },
  dot: { width: 10, height: 10, borderRadius: 5, marginRight: 12, marginTop: 5 },
  body: { flex: 1 },
  title: { fontSize: 15, fontWeight: '800' },
  text: { fontSize: 13, lineHeight: 18, marginTop: 4 },
});
