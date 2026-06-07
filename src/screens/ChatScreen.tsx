import React, { useState, useRef, useEffect } from 'react';
import {
  View, Text, FlatList, TextInput, TouchableOpacity,
  StyleSheet, KeyboardAvoidingView, Platform, SafeAreaView, Alert,
} from 'react-native';
import { Share } from 'react-native';
import { useRoute, useNavigation, RouteProp } from '@react-navigation/native';
import { NativeStackNavigationProp } from '@react-navigation/native-stack';
import { RootStackParamList, Message } from '../types';
import ChatMessage from '../components/ChatMessage';
import { useAuth } from '../context/AuthContext';
import { useEvents } from '../context/EventsContext';
import { useTheme } from '../context/ThemeContext';
import { useHaptics } from '../hooks/useHaptics';
import { supabase } from '../lib/supabase';

type ChatRoute = RouteProp<RootStackParamList, 'Chat'>;

const OPENAI_API_KEY = process.env.EXPO_PUBLIC_OPENAI_API_KEY ?? '';

function transformDbMessage(raw: any): Message {
  return {
    id: raw.id,
    eventId: raw.event_id,
    userId: raw.user_id,
    userName: raw.user_name,
    text: raw.text,
    timestamp: new Date(raw.created_at),
    isAI: raw.is_ai,
    reactions: raw.reactions ?? {},
  };
}

async function askOpenAI(question: string, eventTitle: string): Promise<string> {
  if (!OPENAI_API_KEY || OPENAI_API_KEY === 'YOUR_OPENAI_API_KEY') {
    await new Promise(r => setTimeout(r, 1200));
    const responses = [
      `Отличный вопрос про "${eventTitle}"! Рекомендую прийти за 10-15 минут до начала.`,
      `По ивенту "${eventTitle}": обычно все очень дружелюбны, не стесняйся знакомиться!`,
      `Для "${eventTitle}" советую взять воду и хорошее настроение 😊`,
      `Ивент "${eventTitle}" — популярное место. Участники договариваются в этом чате.`,
    ];
    return responses[Math.floor(Math.random() * responses.length)];
  }

  const response = await fetch('https://api.openai.com/v1/chat/completions', {
    method: 'POST',
    headers: {
      'Content-Type': 'application/json',
      'Authorization': `Bearer ${OPENAI_API_KEY}`,
    },
    body: JSON.stringify({
      model: 'gpt-4o-mini',
      max_tokens: 256,
      messages: [
        {
          role: 'system',
          content: `Ты — дружелюбный AI-ассистент приложения "Жолдас" для поиска компании в Алматы.
Сейчас ты в чате ивента "${eventTitle}".
Отвечай коротко, по-русски, дружелюбно. Помогай участникам организоваться.`,
        },
        { role: 'user', content: question },
      ],
    }),
  });
  const data = await response.json();
  return data.choices?.[0]?.message?.content ?? 'Не могу ответить сейчас, попробуй позже.';
}

export default function ChatScreen() {
  const route = useRoute<ChatRoute>();
  const navigation = useNavigation<NativeStackNavigationProp<RootStackParamList>>();
  const { eventId, eventTitle } = route.params;
  const { user } = useAuth();
  const { events, leaveEvent, isJoined } = useEvents();
  const { theme } = useTheme();
  const haptics = useHaptics();
  const event = events.find(e => e.id === eventId);
  const isCreator = !!user && event?.createdBy === user.id;
  const joined = !!user && isJoined(eventId, user.id);

  const [messages, setMessages] = useState<Message[]>([]);
  const [inputText, setInputText] = useState('');
  const [isAITyping, setIsAITyping] = useState(false);
  const listRef = useRef<FlatList>(null);

  useEffect(() => {
    navigation.setOptions({
      title: eventTitle,
      headerRight: () => (
        <View style={{ flexDirection: 'row', gap: 8, marginRight: 4 }}>
          <TouchableOpacity onPress={handleShare}>
            <Text style={{ fontSize: 20 }}>📤</Text>
          </TouchableOpacity>
          {isCreator && (
            <TouchableOpacity onPress={handleCreatorMenu}>
              <Text style={{ fontSize: 20 }}>⋯</Text>
            </TouchableOpacity>
          )}
        </View>
      ),
    });
  }, [eventTitle, isCreator]);

  useEffect(() => {
    loadMessages();

    const channel = supabase
      .channel(`chat-${eventId}`)
      .on(
        'postgres_changes',
        { event: 'INSERT', schema: 'public', table: 'messages', filter: `event_id=eq.${eventId}` },
        (payload: any) => {
          setMessages(prev => [...prev, transformDbMessage(payload.new)]);
          setTimeout(() => listRef.current?.scrollToEnd({ animated: true }), 100);
        }
      )
      .subscribe();

    return () => { supabase.removeChannel(channel); };
  }, [eventId]);

  async function loadMessages() {
    const { data } = await supabase
      .from('messages')
      .select('*')
      .eq('event_id', eventId)
      .order('created_at', { ascending: true });

    if (data) {
      setMessages(data.map(transformDbMessage));
      setTimeout(() => listRef.current?.scrollToEnd({ animated: false }), 150);
    }
  }

  async function sendMessage(text: string, isAI = false) {
    await supabase.from('messages').insert({
      event_id: eventId,
      user_id: isAI ? 'ai' : (user?.id ?? 'anon'),
      user_name: isAI ? 'Жолдас AI' : (user?.name ?? 'Вы'),
      text,
      is_ai: isAI,
    });
  }

  function handleSend() {
    const text = inputText.trim();
    if (!text) return;
    haptics.light();
    setInputText('');
    sendMessage(text);
  }

  async function handleShare() {
    haptics.medium();
    await Share.share({
      message: `Присоединяйся к ивенту "${eventTitle}" в приложении Жолдас! 🤝`,
      title: eventTitle,
    });
  }

  function handleLeave() {
    if (!user) return;
    Alert.alert('Покинуть ивент?', 'Ты выйдешь из группы и чата', [
      { text: 'Отмена', style: 'cancel' },
      {
        text: 'Покинуть', style: 'destructive', onPress: async () => {
          haptics.medium();
          await leaveEvent(eventId, user.id);
          navigation.goBack();
        },
      },
    ]);
  }

  function handleCreatorMenu() {
    Alert.alert(eventTitle, 'Управление ивентом', [
      {
        text: '🗑 Удалить ивент', style: 'destructive', onPress: () => {
          Alert.alert('Удалить ивент?', 'Это действие нельзя отменить', [
            { text: 'Отмена', style: 'cancel' },
            {
              text: 'Удалить', style: 'destructive', onPress: async () => {
                await supabase.from('events').delete().eq('id', eventId);
                haptics.medium();
                navigation.navigate('Main');
              },
            },
          ]);
        },
      },
      { text: 'Отмена', style: 'cancel' },
    ]);
  }

  async function handleAI() {
    const question = inputText.trim() || `Расскажи об ивенте "${eventTitle}"`;
    setInputText('');
    if (inputText.trim()) sendMessage(inputText.trim());
    setIsAITyping(true);
    try {
      const answer = await askOpenAI(question, eventTitle);
      await sendMessage(answer, true);
    } catch {
      await sendMessage('Сервис AI временно недоступен. Попробуй позже.', true);
    } finally {
      setIsAITyping(false);
    }
  }

  function handleAvatarPress(userId: string, userName: string) {
    navigation.navigate('UserProfile', { userId, userName, userAvatar: '👤' });
  }

  return (
    <SafeAreaView style={[styles.container, { backgroundColor: theme.bg }]}>
      {event && (
        <View style={styles.eventBanner}>
          <Text style={styles.bannerText}>👥 {event.participantsCount} участников · {event.datetime}</Text>
          <View style={styles.bannerActions}>
            <TouchableOpacity
              onPress={() => navigation.navigate('Review', { eventId, eventTitle })}
              style={styles.reviewBtn}
            >
              <Text style={styles.reviewBtnText}>⭐ Оценить</Text>
            </TouchableOpacity>
            {joined && !isCreator && (
              <TouchableOpacity onPress={handleLeave} style={styles.leaveBtn}>
                <Text style={styles.leaveBtnText}>↩ Выйти</Text>
              </TouchableOpacity>
            )}
          </View>
        </View>
      )}
      <KeyboardAvoidingView
        style={styles.flex}
        behavior={Platform.OS === 'ios' ? 'padding' : 'height'}
        keyboardVerticalOffset={90}
      >
        <FlatList
          ref={listRef}
          data={messages}
          keyExtractor={item => item.id}
          renderItem={({ item }) => (
            <ChatMessage
              message={item}
              isOwn={item.userId === (user?.id ?? 'anon')}
              onAvatarPress={item.userId !== (user?.id ?? 'anon')
                ? () => handleAvatarPress(item.userId, item.userName)
                : undefined}
            />
          )}
          contentContainerStyle={styles.list}
          showsVerticalScrollIndicator={false}
          ListEmptyComponent={
            <View style={styles.emptyChat}>
              <Text style={styles.emptyChatText}>Будьте первым! Напишите в чат 👋</Text>
            </View>
          }
        />

        {isAITyping && (
          <View style={styles.typingIndicator}>
            <Text style={styles.typingText}>🤖 Жолдас AI думает...</Text>
          </View>
        )}

        <View style={[styles.inputRow, { backgroundColor: theme.card, borderTopColor: theme.border }]}>
          <TextInput
            style={[styles.input, { backgroundColor: theme.bg, borderColor: theme.border, color: theme.text }]}
            value={inputText}
            onChangeText={setInputText}
            placeholder="Написать сообщение..."
            placeholderTextColor={theme.subtext}
            multiline
            maxLength={500}
            returnKeyType="send"
            onSubmitEditing={handleSend}
          />
          <TouchableOpacity style={styles.aiBtn} onPress={handleAI} activeOpacity={0.75}>
            <Text style={styles.aiBtnText}>@ai</Text>
          </TouchableOpacity>
          <TouchableOpacity
            style={[styles.sendBtn, !inputText.trim() && styles.sendBtnDisabled]}
            onPress={handleSend}
            disabled={!inputText.trim()}
            activeOpacity={0.8}
          >
            <Text style={styles.sendBtnText}>↑</Text>
          </TouchableOpacity>
        </View>
      </KeyboardAvoidingView>
    </SafeAreaView>
  );
}

const styles = StyleSheet.create({
  container: { flex: 1 },
  flex: { flex: 1 },
  eventBanner: {
    flexDirection: 'row', justifyContent: 'space-between', alignItems: 'center',
    backgroundColor: '#F0EEFF', paddingHorizontal: 16, paddingVertical: 8,
  },
  bannerText: { fontSize: 12, color: '#5B4FCF', fontWeight: '600', flex: 1 },
  bannerActions: { flexDirection: 'row', gap: 6 },
  reviewBtn: {
    backgroundColor: '#5B4FCF', borderRadius: 12,
    paddingHorizontal: 10, paddingVertical: 4,
  },
  reviewBtnText: { fontSize: 12, color: '#FFF', fontWeight: '700' },
  leaveBtn: {
    backgroundColor: '#FFE8E8', borderRadius: 12,
    paddingHorizontal: 10, paddingVertical: 4,
  },
  leaveBtnText: { fontSize: 12, color: '#FF4D4D', fontWeight: '700' },
  list: { paddingVertical: 12, paddingBottom: 8 },
  emptyChat: { alignItems: 'center', paddingTop: 60 },
  emptyChatText: { fontSize: 14, color: '#AAA' },
  typingIndicator: { paddingHorizontal: 16, paddingVertical: 6 },
  typingText: { fontSize: 12, color: '#E07B2C', fontStyle: 'italic' },
  inputRow: {
    flexDirection: 'row', alignItems: 'flex-end',
    paddingHorizontal: 12, paddingVertical: 10,
    borderTopWidth: 1, gap: 8,
  },
  input: {
    flex: 1, borderRadius: 22,
    paddingHorizontal: 16, paddingVertical: 10, fontSize: 15,
    maxHeight: 100, borderWidth: 1,
  },
  aiBtn: {
    backgroundColor: '#FFF3DC', borderRadius: 20,
    paddingHorizontal: 12, paddingVertical: 10,
    borderWidth: 1.5, borderColor: '#F5A623',
  },
  aiBtnText: { fontSize: 13, fontWeight: '700', color: '#E07B2C' },
  sendBtn: {
    width: 42, height: 42, borderRadius: 21,
    backgroundColor: '#5B4FCF', justifyContent: 'center', alignItems: 'center',
  },
  sendBtnDisabled: { backgroundColor: '#D0CAFF' },
  sendBtnText: { fontSize: 18, color: '#FFF', fontWeight: '700' },
});
