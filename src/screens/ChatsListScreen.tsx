import React, { useState, useEffect } from 'react';
import {
  View,
  Text,
  StyleSheet,
  FlatList,
  TouchableOpacity,
  SafeAreaView,
  TextInput,
  ActivityIndicator,
  Platform,
} from 'react-native';
import { useNavigation, useIsFocused } from '@react-navigation/native';
import { NativeStackNavigationProp } from '@react-navigation/native-stack';
import { LinearGradient } from 'expo-linear-gradient';
import { supabase } from '../lib/supabase';
import { useAuth } from '../context/AuthContext';
import { useTheme } from '../context/ThemeContext';
import { useLanguage } from '../context/LanguageContext';
import { useHaptics } from '../hooks/useHaptics';
import { categoryEmojis } from '../data/mockEvents';
import { RootStackParamList, EventCategory } from '../types';

type Nav = NativeStackNavigationProp<RootStackParamList, 'ChatsList'>;

interface ChatItem {
  id: string;
  title: string;
  category: EventCategory;
  datetime: string;
  status: string;
  lastMessageSender?: string;
  lastMessageText?: string;
}

export default function ChatsListScreen() {
  const navigation = useNavigation<Nav>();
  const isFocused = useIsFocused();
  const { user } = useAuth();
  const { theme, isDark } = useTheme();
  const { t } = useLanguage();
  const haptics = useHaptics();

  const [chats, setChats] = useState<ChatItem[]>([]);
  const [loading, setLoading] = useState(true);
  const [search, setSearch] = useState('');

  useEffect(() => {
    if (isFocused && user) {
      loadChats();
    }
  }, [isFocused, user?.id]);

  async function loadChats() {
    if (!user) return;
    setLoading(true);
    try {
      const { data: eventsData, error: eventsError } = await supabase
        .from('events')
        .select('id, title, category, datetime, status, event_participants!inner(user_id)')
        .eq('event_participants.user_id', user.id)
        .order('created_at', { ascending: false });

      if (eventsError) throw eventsError;

      if (eventsData && eventsData.length > 0) {
        const eventIds = eventsData.map(e => e.id);
        const { data: messagesData } = await supabase
          .from('messages')
          .select('event_id, text, user_name')
          .in('event_id', eventIds)
          .order('created_at', { ascending: false });

        const latestMsgMap: Record<string, { text: string; sender: string }> = {};
        if (messagesData) {
          for (const msg of messagesData) {
            if (!latestMsgMap[msg.event_id]) {
              latestMsgMap[msg.event_id] = {
                text: msg.text,
                sender: msg.user_name,
              };
            }
          }
        }

        const items: ChatItem[] = eventsData.map((e: any) => ({
          id: e.id,
          title: e.title,
          category: e.category as EventCategory,
          datetime: e.datetime,
          status: e.status ?? 'active',
          lastMessageSender: latestMsgMap[e.id]?.sender,
          lastMessageText: latestMsgMap[e.id]?.text,
        }));
        setChats(items);
      } else {
        setChats([]);
      }
    } catch (err: any) {
      console.error('Error loading chats:', err.message);
    } finally {
      setLoading(false);
    }
  }

  const filteredChats = chats.filter(c =>
    c.title.toLowerCase().includes(search.toLowerCase())
  );

  const getShadowStyle = () => ({
    shadowColor: isDark ? '#000' : '#0F172A',
    shadowOffset: { width: 0, height: 6 },
    shadowOpacity: isDark ? 0.35 : 0.05,
    shadowRadius: 14,
    elevation: 3,
  });

  return (
    <SafeAreaView style={[styles.container, { backgroundColor: theme.bg }]}>
      <View style={styles.header}>
        <View style={styles.titleBlock}>
          <Text style={[styles.pageTitle, { color: theme.text }]}>{t('chatsTitle') ?? 'Чаты'}</Text>
          <Text style={[styles.pageSubtitle, { color: theme.subtext }]}>
            {chats.length} {t('chatsTitle')?.toLowerCase() ?? 'чатов'}
          </Text>
        </View>
        <TextInput
          style={[
            styles.searchInput,
            {
              backgroundColor: theme.inputBg,
              borderColor: theme.border,
              color: theme.text,
              marginTop: 14,
            },
          ]}
          placeholder={t('searchEventsPlaceholder') ?? 'Поиск чатов...'}
          placeholderTextColor={theme.subtext + '80'}
          value={search}
          onChangeText={setSearch}
          clearButtonMode="while-editing"
        />
      </View>

      {loading ? (
        <View style={styles.center}>
          <ActivityIndicator size="large" color={theme.accent} />
        </View>
      ) : filteredChats.length === 0 ? (
        <View style={styles.center}>
          <Text style={[styles.emptyText, { color: theme.subtext }]}>
            {search ? (t('emptySearchTitle') ?? 'Ничего не найдено') : (t('chatsEmpty') ?? 'У вас пока нет активных чатов.')}
          </Text>
        </View>
      ) : (
        <FlatList
          data={filteredChats}
          keyExtractor={item => item.id}
          contentContainerStyle={styles.list}
          showsVerticalScrollIndicator={false}
          renderItem={({ item }) => {
            const isFinished = item.status === 'finished';
            const isCancelled = item.status === 'cancelled';
            return (
              <TouchableOpacity
                style={[
                  styles.card,
                  { backgroundColor: theme.card, borderColor: theme.border },
                  getShadowStyle(),
                ]}
                activeOpacity={0.85}
                onPress={() => {
                  haptics.light();
                  navigation.navigate('Chat', { eventId: item.id, eventTitle: item.title });
                }}
              >
                <View style={styles.cardRow}>
                  <LinearGradient
                    colors={[theme.accent + '20', theme.accent + '05']}
                    style={[styles.emojiContainer, { borderColor: theme.border }]}
                  >
                    <Text style={styles.emoji}>{categoryEmojis[item.category]}</Text>
                  </LinearGradient>

                  <View style={styles.infoBlock}>
                    <View style={styles.titleRow}>
                      <Text style={[styles.title, { color: theme.text }]} numberOfLines={1}>
                        {item.title}
                      </Text>
                      {isFinished && (
                        <View style={[styles.statusBadge, { backgroundColor: isDark ? 'rgba(99,102,241,0.15)' : '#EEF2FF', borderColor: theme.accent }]}>
                          <Text style={[styles.statusText, { color: theme.accent }]}>{t('statusFinished')}</Text>
                        </View>
                      )}
                      {isCancelled && (
                        <View style={[styles.statusBadge, { backgroundColor: isDark ? 'rgba(239,68,68,0.15)' : '#FEF2F2', borderColor: theme.danger }]}>
                          <Text style={[styles.statusText, { color: theme.danger }]}>{t('statusCancelled')}</Text>
                        </View>
                      )}
                    </View>

                    <Text style={[styles.meta, { color: theme.subtext }]} numberOfLines={1}>
                      {item.datetime}
                    </Text>

                    <View style={styles.messageRow}>
                      {item.lastMessageText ? (
                        <Text style={[styles.lastMessage, { color: theme.text }]} numberOfLines={1}>
                          <Text style={{ fontWeight: '700', color: theme.accent }}>
                            {item.lastMessageSender}:{' '}
                          </Text>
                          {item.lastMessageText}
                        </Text>
                      ) : (
                        <Text style={[styles.noMessage, { color: theme.subtext }]} numberOfLines={1}>
                          {t('chatEmpty') ?? 'Сообщений пока нет...'}
                        </Text>
                      )}
                    </View>
                  </View>
                </View>
              </TouchableOpacity>
            );
          }}
        />
      )}
    </SafeAreaView>
  );
}

const styles = StyleSheet.create({
  container: { flex: 1 },
  header: { padding: 16, width: '100%', maxWidth: 760, alignSelf: 'center' },
  titleBlock: { marginBottom: 6 },
  pageTitle: { fontSize: 28, fontWeight: '800', marginBottom: 4 },
  pageSubtitle: { fontSize: 14 },
  searchInput: {
    borderRadius: 14,
    paddingHorizontal: 16,
    paddingVertical: 12,
    fontSize: 15,
    borderWidth: 1.5,
  },
  center: { flex: 1, justifyContent: 'center', alignItems: 'center', padding: 32 },
  emptyText: { fontSize: 15, fontWeight: '600', textAlign: 'center', lineHeight: 22 },
  list: { paddingHorizontal: 16, paddingBottom: 32, width: '100%', maxWidth: 728, alignSelf: 'center' },
  card: {
    borderRadius: 20,
    borderWidth: 1.5,
    padding: 16,
    marginBottom: 12,
  },
  cardRow: { flexDirection: 'row', gap: 14, alignItems: 'center' },
  emojiContainer: {
    width: 50,
    height: 50,
    borderRadius: 16,
    borderWidth: 1.5,
    justifyContent: 'center',
    alignItems: 'center',
  },
  emoji: { fontSize: 24 },
  infoBlock: { flex: 1 },
  titleRow: { flexDirection: 'row', justifyContent: 'space-between', alignItems: 'center', gap: 8, marginBottom: 2 },
  title: { fontSize: 16, fontWeight: '800', flex: 1 },
  statusBadge: {
    paddingHorizontal: 8,
    paddingVertical: 3,
    borderRadius: 8,
    borderWidth: 1,
  },
  statusText: { fontSize: 10, fontWeight: '800' },
  meta: { fontSize: 12, fontWeight: '500', marginBottom: 6 },
  messageRow: { marginTop: 4 },
  lastMessage: { fontSize: 13, fontWeight: '500' },
  noMessage: { fontSize: 13, fontStyle: 'italic' },
});
