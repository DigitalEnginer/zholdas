import React, { useState, useRef, useEffect } from 'react';
import {
  View, Text, FlatList, TextInput, TouchableOpacity,
  StyleSheet, KeyboardAvoidingView, Platform, SafeAreaView, Alert, Modal,
} from 'react-native';
import { Share } from 'react-native';
import * as ImagePicker from 'expo-image-picker';
import { useRoute, useNavigation, RouteProp } from '@react-navigation/native';
import { NativeStackNavigationProp } from '@react-navigation/native-stack';
import { EventStatus, RootStackParamList, Message } from '../types';
import ChatMessage from '../components/ChatMessage';
import CustomConfirmModal from '../components/CustomConfirmModal';
import { useAuth } from '../context/AuthContext';
import { useEvents } from '../context/EventsContext';
import { useTheme } from '../context/ThemeContext';
import { useLanguage } from '../context/LanguageContext';
import { useHaptics } from '../hooks/useHaptics';
import { supabase } from '../lib/supabase';
import { uploadImageToStorage } from '../lib/storage';
import { userMessageFromModerationError, validateChatMessage } from '../lib/contentModeration';

type ChatRoute = RouteProp<RootStackParamList, 'Chat'>;

const BACKEND_URL = process.env.EXPO_PUBLIC_BACKEND_URL ?? 'http://localhost:8000';

function transformDbMessage(raw: any): Message {
  return {
    id: raw.id,
    eventId: raw.event_id,
    userId: raw.user_id,
    userName: raw.user_name,
    text: raw.text,
    imageUri: raw.image_url ?? undefined,
    timestamp: new Date(raw.created_at),
    isAI: raw.is_ai,
    reactions: raw.reactions ?? {},
  };
}

async function askOpenAI(
  question: string,
  eventTitle: string,
  eventId: string,
  fallbackResponses: string[],
): Promise<{ reply: string; saved: boolean }> {
  try {
    const { data: { session } } = await supabase.auth.getSession();
    const accessToken = session?.access_token;

    if (!accessToken) {
      return { reply: fallbackResponses[Math.floor(Math.random() * fallbackResponses.length)], saved: false };
    }

    const response = await fetch(`${BACKEND_URL}/chat`, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        'Authorization': `Bearer ${accessToken}`,
      },
      body: JSON.stringify({
        message: question,
        event_id: eventId,
        event_title: eventTitle,
      }),
    });

    if (!response.ok) {
      const data = await response.json().catch(() => null);
      return {
        reply: data?.detail ?? fallbackResponses[Math.floor(Math.random() * fallbackResponses.length)],
        saved: false,
      };
    }

    const data = await response.json();
    return {
      reply: data.reply ?? fallbackResponses[Math.floor(Math.random() * fallbackResponses.length)],
      saved: !!data.saved,
    };
  } catch {
    return { reply: fallbackResponses[Math.floor(Math.random() * fallbackResponses.length)], saved: false };
  }
}

export default function ChatScreen() {
  const route = useRoute<ChatRoute>();
  const navigation = useNavigation<NativeStackNavigationProp<RootStackParamList>>();
  const { eventId, eventTitle } = route.params;
  const { user } = useAuth();
  const { events, leaveEvent, isJoined, updateEventStatus, updateEvent, isLoading: eventsLoading } = useEvents();
  const { theme, isDark } = useTheme();
  const haptics = useHaptics();
  const { t } = useLanguage();
  const event = events.find(e => e.id === eventId);

  const [confirmModal, setConfirmModal] = useState<{
    visible: boolean;
    title: string;
    message: string;
    confirmText?: string;
    cancelText?: string;
    isDestructive?: boolean;
    showCancel?: boolean;
    showInput?: boolean;
    inputPlaceholder?: string;
    defaultValue?: string;
    onConfirm: (text?: string) => void;
  } | null>(null);

  const showAlert = (title?: string, message?: string, onConfirm?: () => void) => {
    setConfirmModal({
      visible: true,
      title: title ?? '',
      message: message ?? '',
      confirmText: 'OK',
      showCancel: false,
      onConfirm: () => {
        if (onConfirm) onConfirm();
      },
    });
  };

  // Redirect if event is deleted while looking at chat
  useEffect(() => {
    if (!eventsLoading && !event) {
      showAlert('', t('eventDeleted') ?? 'Ивент был удален организатором', () => {
        navigation.navigate('ChatsList');
      });
    }
  }, [event, eventsLoading]);
  const canManageEvent = !!user && (event?.createdBy === user.id || user.role === 'moderator' || user.role === 'admin');
  const canModerateChat = canManageEvent;
  const joined = !!user && isJoined(eventId, user.id);
  const eventStatus = event?.status ?? 'active';
  const isActive = eventStatus === 'active';
  const eventStatusText = eventStatus === 'finished' ? t('statusFinished') : eventStatus === 'cancelled' ? t('statusCancelled') : t('statusActive');

  const [messages, setMessages] = useState<Message[]>([]);
  const [bannedUserIds, setBannedUserIds] = useState<Set<string>>(new Set());
  const [blockedUserIds, setBlockedUserIds] = useState<Set<string>>(new Set());
  const [inputText, setInputText] = useState('');
  const [isAITyping, setIsAITyping] = useState(false);
  const [uploadingPhoto, setUploadingPhoto] = useState(false);
  const [showCreatorMenu, setShowCreatorMenu] = useState(false);
  const listRef = useRef<FlatList>(null);

  useEffect(() => {
    navigation.setOptions({
      title: eventTitle,
      headerRight: () => (
        <View style={{ flexDirection: 'row', gap: 12, marginRight: 4, alignItems: 'center' }}>
          <TouchableOpacity onPress={handleShare} style={{ padding: 6 }}>
            <Text style={{ fontSize: 20, color: theme.accent }}>↗</Text>
          </TouchableOpacity>
          {canManageEvent && (
            <TouchableOpacity onPress={handleCreatorMenu} style={{ padding: 6 }}>
              <Text style={{ fontSize: 20, color: theme.accent }}>•••</Text>
            </TouchableOpacity>
          )}
        </View>
      ),
    });
  }, [eventTitle, canManageEvent, eventStatus, theme.accent]);

  useEffect(() => {
    loadMessages();

    const channel = supabase
      .channel(`chat-${eventId}`)
      .on(
        'postgres_changes',
        { event: 'INSERT', schema: 'public', table: 'messages', filter: `event_id=eq.${eventId}` },
        (payload: any) => {
          if (bannedUserIds.has(payload.new.user_id) || blockedUserIds.has(payload.new.user_id)) return;
          setMessages(prev => [...prev, transformDbMessage(payload.new)]);
          setTimeout(() => listRef.current?.scrollToEnd({ animated: true }), 100);
        },
      )
      .on(
        'postgres_changes',
        { event: 'DELETE', schema: 'public', table: 'messages', filter: `event_id=eq.${eventId}` },
        (payload: any) => {
          setMessages(prev => prev.filter(message => message.id !== payload.old.id));
        },
      )
      .subscribe();

    return () => { supabase.removeChannel(channel); };
  }, [eventId, bannedUserIds, blockedUserIds]);

  async function loadMessages() {
    const { data } = await supabase
      .from('messages')
      .select('*')
      .eq('event_id', eventId)
      .order('created_at', { ascending: true });

    if (data) {
      const userIds = Array.from(new Set(
        data
          .map((m: any) => m.user_id)
          .filter((id: string) => id && id !== 'ai'),
      ));
      const { data: bannedProfiles } = userIds.length > 0
        ? await supabase.from('profiles').select('id').in('id', userIds).eq('is_banned', true)
        : { data: [] };
      const nextBannedIds = new Set((bannedProfiles ?? []).map((p: any) => p.id));
      const { data: blocks } = user
        ? await supabase.from('blocks').select('blocked_id').eq('blocker_id', user.id)
        : { data: [] };
      const nextBlockedIds = new Set((blocks ?? []).map((b: any) => b.blocked_id));

      setBannedUserIds(nextBannedIds);
      setBlockedUserIds(nextBlockedIds);
      setMessages(data.filter((m: any) => !nextBannedIds.has(m.user_id) && !nextBlockedIds.has(m.user_id)).map(transformDbMessage));
      setTimeout(() => listRef.current?.scrollToEnd({ animated: false }), 150);
    }
  }

  async function sendMessage(text: string, isAI = false, imageUri?: string) {
    if (!isAI && !user) {
      throw new Error(t('passwordRequired'));
    }

    const { error } = await supabase.from('messages').insert({
      event_id: eventId,
      user_id: isAI ? 'ai' : (user?.id ?? 'anon'),
      user_name: isAI ? 'Жолдас AI' : (user?.name ?? t('userLabel')),
      text,
      image_url: imageUri ?? null,
      is_ai: isAI,
    });

    if (error) throw new Error(userMessageFromModerationError(error.message) ?? error.message);
  }

  async function handleSend() {
    const text = inputText.trim();
    if (!text) return;

    // Auto-route to AI if message starts with @ai
    if (text.toLowerCase().startsWith('@ai')) {
      const aiQuestion = text.slice(3).trim();
      setInputText('');
      handleAI(aiQuestion || undefined);
      return;
    }

    const moderation = validateChatMessage(text);
    if (!moderation.ok) {
      showAlert(t('moderationPanel'), moderation.message);
      return;
    }
    if (!joined && event?.createdBy !== user?.id && user?.role !== 'moderator' && user?.role !== 'admin') {
      showAlert('', t('chatJoinFirst'));
      return;
    }

    haptics.light();
    setInputText('');
    try {
      await sendMessage(text);
    } catch (e: any) {
      setInputText(text);
      showAlert(t('messageSendError'), e.message ?? t('error'));
    }
  }

  async function handlePickPhoto() {
    if (!user || (eventStatus !== 'active' && eventStatus !== 'finished')) return;

    const { status } = await ImagePicker.requestMediaLibraryPermissionsAsync();
    if (status !== 'granted') {
      showAlert('', t('photoPickError'));
      return;
    }

    const result = await ImagePicker.launchImageLibraryAsync({
      mediaTypes: ImagePicker.MediaTypeOptions.Images,
      allowsEditing: true,
      aspect: [4, 3],
      quality: 0.75,
    });
    if (result.canceled) return;

    setUploadingPhoto(true);
    try {
      const publicUrl = await uploadImageToStorage({
        bucket: 'chat-photos',
        path: `${user.id}/${eventId}/message-${Date.now()}`,
        uri: result.assets[0].uri,
      });
      await sendMessage(inputText.trim(), false, publicUrl);
      setInputText('');
      haptics.medium();
    } catch (e: any) {
      showAlert(t('photoSendError'), e.message ?? t('error'));
    } finally {
      setUploadingPhoto(false);
    }
  }

  async function handleShare() {
    haptics.medium();
    await Share.share({
      message: `${t('chatShareMsg')} "${eventTitle}"`,
      title: eventTitle,
    });
  }

  function handleLeave() {
    if (!user) return;

    const doLeave = async () => {
      haptics.medium();
      try {
        await leaveEvent(eventId, user.id);
        navigation.goBack();
      } catch (err: any) {
        showAlert(t('error'), err.message ?? t('error'));
      }
    };

    setConfirmModal({
      visible: true,
      title: t('chatLeavePrompt') ?? 'Покинуть чат?',
      message: t('chatLeaveText') ?? 'Вы выйдете из этого чата и группы.',
      confirmText: t('leaveBtn') ?? 'Выйти',
      cancelText: t('cancel') ?? 'Отмена',
      isDestructive: true,
      onConfirm: doLeave,
    });
  }

  async function changeEventStatus(status: EventStatus, cancelReason?: string) {
    try {
      await updateEventStatus(eventId, status, cancelReason);
      haptics.medium();
    } catch (e: any) {
      showAlert(t('error'), e.message ?? t('error'));
    }
  }

  function cancelEvent() {
    setConfirmModal({
      visible: true,
      title: t('cancelReason') ?? 'Укажите причину отмены',
      message: '',
      confirmText: t('cancel') ?? 'Отменить ивент',
      cancelText: t('back') ?? 'Назад',
      isDestructive: true,
      showInput: true,
      inputPlaceholder: t('cancelReason') ?? 'Причина отмены...',
      onConfirm: (reason) => {
        changeEventStatus('cancelled', reason || t('cancelNotice'));
      },
    });
  }

  function handleRenameGroup() {
    setConfirmModal({
      visible: true,
      title: t('renameGroupChat') ?? 'Переименовать группу',
      message: '',
      confirmText: 'OK',
      cancelText: t('cancel') ?? 'Отмена',
      showInput: true,
      defaultValue: eventTitle,
      inputPlaceholder: t('enterNewGroupName') ?? 'Введите новое название группы:',
      onConfirm: (newTitle) => {
        if (newTitle && newTitle.trim()) {
          saveNewGroupName(newTitle.trim());
        }
      },
    });
  }

  async function saveNewGroupName(newTitle: string) {
    try {
      await updateEvent(eventId, { title: newTitle });
      navigation.setOptions({ title: newTitle });
      haptics.medium();
    } catch (e: any) {
      showAlert(t('error'), e.message);
    }
  }

  function handleCreatorMenu() {
    setShowCreatorMenu(true);
  }

  async function handleAI(forcedQuestion?: string) {
    if (!isActive) {
      showAlert('', t('chatEmpty'));
      return;
    }
    const question = forcedQuestion ?? (inputText.trim() || `${t('aiDefaultQuestion')} "${eventTitle}"`);
    const moderation = validateChatMessage(question);
    if (!moderation.ok) {
      showAlert(t('moderationPanel'), moderation.message);
      return;
    }
    setInputText('');
    if (!forcedQuestion && inputText.trim()) sendMessage(inputText.trim());
    setIsAITyping(true);
    try {
      const fallbackResponses = [t('aiFallback1'), t('aiFallback2'), t('aiFallback3')];
      const answer = await askOpenAI(question, eventTitle, eventId, fallbackResponses);
      if (!answer.saved) {
        // Show locally instead of saving to Supabase to avoid RLS violation
        const localAIMsg: Message = {
          id: `ai-local-${Date.now()}`,
          eventId: eventId,
          userId: 'ai',
          userName: 'Жолдас AI',
          text: answer.reply,
          timestamp: new Date(),
          isAI: true,
          reactions: {},
        };
        setMessages(prev => [...prev, localAIMsg]);
        setTimeout(() => listRef.current?.scrollToEnd({ animated: true }), 100);
      }
    } catch {
      // Show error locally instead of saving to Supabase
      const errorAIMsg: Message = {
        id: `ai-local-err-${Date.now()}`,
        eventId: eventId,
        userId: 'ai',
        userName: 'Жолдас AI',
        text: t('aiUnavailable'),
        timestamp: new Date(),
        isAI: true,
        reactions: {},
      };
      setMessages(prev => [...prev, errorAIMsg]);
      setTimeout(() => listRef.current?.scrollToEnd({ animated: true }), 100);
    } finally {
      setIsAITyping(false);
    }
  }

  function handleAvatarPress(userId: string, userName: string) {
    navigation.navigate('UserProfile', { userId, userName, userAvatar: '👤' });
  }

  function reportMessage(message: Message) {
    if (!user || message.userId === 'ai' || message.userId === user.id) return;

    const doReport = async () => {
      const { error } = await supabase.from('reports').insert({
        reporter_id: user.id,
        reported_user_id: message.userId,
        reason: t('reportTitle'),
        details: [
          'type:message',
          `message_id:${message.id}`,
          `event_id:${eventId}`,
          `event_title:${eventTitle}`,
          `message_text:${message.text.slice(0, 500)}`,
          `image_url:${message.imageUri ?? ''}`,
        ].join('\n'),
      });

      if (error) {
        showAlert(t('error'), error.message);
        return;
      }

      haptics.medium();
      showAlert(t('done'), t('done'));
    };

    setConfirmModal({
      visible: true,
      title: t('reportTitle') ?? 'Пожаловаться?',
      message: t('reportText') ?? 'Вы хотите пожаловаться на это сообщение?',
      confirmText: t('send') ?? 'Отправить',
      cancelText: t('cancel') ?? 'Отмена',
      isDestructive: true,
      onConfirm: doReport,
    });
  }

  function deleteMessage(message: Message) {
    if (!canModerateChat) return;

    const doDeleteMsg = async () => {
      const { error } = await supabase
        .from('messages')
        .delete()
        .eq('id', message.id);

      if (error) {
        showAlert(t('error'), error.message);
        return;
      }

      haptics.medium();
      setMessages(prev => prev.filter(item => item.id !== message.id));
    };

    setConfirmModal({
      visible: true,
      title: t('deleteMsgTitle') ?? 'Удалить сообщение?',
      message: t('deleteMsgText') ?? 'Сообщение пропадет из чата у участников.',
      confirmText: t('delete') ?? 'Удалить',
      cancelText: t('cancel') ?? 'Отмена',
      isDestructive: true,
      onConfirm: doDeleteMsg,
    });
  }

  return (
    <SafeAreaView style={[styles.container, { backgroundColor: theme.bg }]}>
      <Modal
        visible={showCreatorMenu}
        transparent={true}
        animationType="fade"
        onRequestClose={() => setShowCreatorMenu(false)}
      >
        <TouchableOpacity
          style={styles.modalOverlay}
          activeOpacity={1}
          onPress={() => setShowCreatorMenu(false)}
        >
          <View style={[styles.modalContent, { backgroundColor: theme.card, borderColor: theme.border }]}>
            <Text style={[styles.modalTitle, { color: theme.text }]}>{eventTitle}</Text>
            <Text style={[styles.modalSubtitle, { color: theme.subtext }]}>{t('eventManageTitle')}</Text>

            {eventStatus === 'finished' ? (
              <>
                <TouchableOpacity
                  style={[styles.modalOption, { borderBottomColor: theme.border }]}
                  onPress={() => {
                    setShowCreatorMenu(false);
                    setTimeout(() => handleRenameGroup(), 100);
                  }}
                >
                  <Text style={[styles.modalOptionText, { color: theme.accent }]}>✏️ {t('renameGroupChat') ?? 'Переименовать группу'}</Text>
                </TouchableOpacity>
              </>
            ) : eventStatus === 'active' ? (
              <>
                <TouchableOpacity
                  style={[styles.modalOption, { borderBottomColor: theme.border }]}
                  onPress={() => {
                    setShowCreatorMenu(false);
                    setTimeout(() => changeEventStatus('finished' as EventStatus), 100);
                  }}
                >
                  <Text style={[styles.modalOptionText, { color: theme.text }]}>✅ {t('finishEventAction')}</Text>
                </TouchableOpacity>

                <TouchableOpacity
                  style={[styles.modalOption, { borderBottomColor: theme.border }]}
                  onPress={() => {
                    setShowCreatorMenu(false);
                    setTimeout(() => cancelEvent(), 100);
                  }}
                >
                  <Text style={[styles.modalOptionText, { color: theme.danger }]}>🚫 {t('cancelEventAction')}</Text>
                </TouchableOpacity>
              </>
            ) : (
              <>
                <TouchableOpacity
                  style={[styles.modalOption, { borderBottomColor: theme.border }]}
                  onPress={() => {
                    setShowCreatorMenu(false);
                    setTimeout(() => changeEventStatus('active' as EventStatus), 100);
                  }}
                >
                  <Text style={[styles.modalOptionText, { color: theme.text }]}>🔄 {t('reactivateEventAction')}</Text>
                </TouchableOpacity>
              </>
            )}

            <TouchableOpacity
              style={[styles.modalOption, { borderBottomColor: theme.border }]}
              onPress={() => {
                setShowCreatorMenu(false);
                setTimeout(() => {
                  const doDelete = async () => {
                    try {
                      // 1. Delete related messages first
                      await supabase.from('messages').delete().eq('event_id', eventId);
                      // 2. Delete related participants
                      await supabase.from('event_participants').delete().eq('event_id', eventId);
                      // 3. Delete reviews if any
                      await supabase.from('reviews').delete().eq('event_id', eventId);
                      
                      // 4. Finally delete the event
                      const { error } = await supabase.from('events').delete().eq('id', eventId);
                      if (error) {
                        showAlert(t('error'), error.message);
                      } else {
                        haptics.medium();
                        navigation.navigate('ChatsList');
                      }
                    } catch (err: any) {
                      showAlert(t('error'), err.message ?? t('error'));
                    }
                  };

                  setConfirmModal({
                    visible: true,
                    title: t('deleteEventPrompt') ?? 'Удалить ивент?',
                    message: t('deleteEventText') ?? 'Ивент пропадет из приложения.',
                    confirmText: t('delete') ?? 'Удалить',
                    isDestructive: true,
                    onConfirm: doDelete,
                  });
                }, 100);
              }}
            >
              <Text style={[styles.modalOptionText, { color: theme.danger }]}>🗑️ {t('deleteEventAction')}</Text>
            </TouchableOpacity>

            <TouchableOpacity
              style={[styles.modalCloseBtn, { backgroundColor: theme.inputBg, borderColor: theme.border }]}
              onPress={() => setShowCreatorMenu(false)}
            >
              <Text style={[styles.modalCloseBtnText, { color: theme.text }]}>{t('cancel')}</Text>
            </TouchableOpacity>
          </View>
        </TouchableOpacity>
      </Modal>

      {event && (
        <View style={[styles.eventBanner, { backgroundColor: theme.accentLight, borderBottomColor: theme.border }]}>
          <Text style={[styles.bannerText, { color: theme.accent }]}>
            {event.participantsCount} {t('participants')}
            {!!event.hiddenParticipantsCount ? ` · ${t('hiddenCount')} ${event.hiddenParticipantsCount}` : ''}
            {' · '}{event.datetime}
            {!isActive ? ` · ${eventStatusText}` : ''}
          </Text>
          <View style={styles.bannerActions}>
            <TouchableOpacity
              onPress={() => navigation.navigate('EventParticipants', { eventId, eventTitle })}
              style={[styles.participantsBtn, { backgroundColor: theme.card, borderColor: theme.border, borderWidth: 1 }]}
            >
              <Text style={[styles.participantsBtnText, { color: theme.accent }]}>{t('participants')}</Text>
            </TouchableOpacity>
            {joined && event?.createdBy !== user?.id && (
              <TouchableOpacity
                onPress={handleLeave}
                style={[
                  styles.leaveBtn,
                  {
                    backgroundColor: isDark ? 'rgba(239, 68, 68, 0.15)' : '#FFF1F1',
                    borderColor: isDark ? 'rgba(239, 68, 68, 0.3)' : '#FFD0D0',
                    borderWidth: 1,
                  },
                ]}
              >
                <Text style={[styles.leaveBtnText, { color: theme.danger }]}>{t('leaveBtn')}</Text>
              </TouchableOpacity>
            )}
          </View>
        </View>
      )}
      {event?.cancelReason ? (
        <View style={styles.cancelNotice}>
          <Text style={styles.cancelNoticeTitle}>{t('cancelNotice')}</Text>
          <Text style={styles.cancelNoticeText}>{event.cancelReason}</Text>
        </View>
      ) : null}
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
              onReport={user && item.userId !== user.id && item.userId !== 'ai'
                ? () => reportMessage(item)
                : undefined}
              onDelete={canModerateChat ? () => deleteMessage(item) : undefined}
            />
          )}
          contentContainerStyle={styles.list}
          showsVerticalScrollIndicator={false}
          ListEmptyComponent={
            <View style={[styles.emptyChat, { backgroundColor: theme.card, borderColor: theme.border }]}>
              <Text style={[styles.emptyChatIcon, { color: theme.subtext }]}>💬</Text>
              <Text style={[styles.emptyChatText, { color: theme.subtext }]}>{t('chatEmpty')}</Text>
            </View>
          }
        />

        {isAITyping && (
          <View style={styles.typingIndicator}>
            <Text style={[styles.typingText, { color: theme.accent }]}>{t('aiTyping')}</Text>
          </View>
        )}

        <View style={[styles.inputRow, { backgroundColor: theme.card, borderTopColor: theme.border }]}>
          <TextInput
            style={[styles.input, { backgroundColor: theme.inputBg, borderColor: theme.border, color: theme.text }]}
            value={inputText}
            onChangeText={setInputText}
            placeholder={eventStatus === 'active' ? t('chatPlaceholder') + ' · @ai вопрос' : eventStatus === 'finished' ? t('chatPlaceholder') + ' (Ивент завершен)' : t('chatClosed')}
            placeholderTextColor={theme.subtext}
            multiline
            maxLength={500}
            returnKeyType="send"
            onSubmitEditing={handleSend}
            editable={eventStatus === 'active' || eventStatus === 'finished'}
          />
          <TouchableOpacity
            style={[
              styles.photoBtn,
              {
                backgroundColor: theme.inputBg,
                borderColor: theme.border,
              },
              (!(eventStatus === 'active' || eventStatus === 'finished') || uploadingPhoto) && styles.actionDisabled,
            ]}
            onPress={handlePickPhoto}
            disabled={!(eventStatus === 'active' || eventStatus === 'finished') || uploadingPhoto}
            activeOpacity={0.75}
          >
            <Text style={[styles.photoBtnText, { color: theme.subtext }]}>{uploadingPhoto ? '...' : '📷'}</Text>
          </TouchableOpacity>
          <TouchableOpacity
            style={[
              styles.aiBtn,
              {
                backgroundColor: isDark ? 'rgba(99, 102, 241, 0.15)' : '#EFF6FF',
                borderColor: isDark ? 'rgba(99, 102, 241, 0.4)' : '#C7D2FE',
              },
              !isActive && styles.actionDisabled,
            ]}
            onPress={() => handleAI()}
            disabled={!isActive}
            activeOpacity={0.75}
          >
            <Text style={[styles.aiBtnText, { color: isDark ? '#A5B4FC' : '#4F46E5' }]}>AI</Text>
          </TouchableOpacity>
          <TouchableOpacity
            style={[
              styles.sendBtn,
              {
                backgroundColor: theme.accent,
              },
              (!inputText.trim() || !(eventStatus === 'active' || eventStatus === 'finished')) && { backgroundColor: isDark ? '#1E293B' : '#E2E8F0' },
            ]}
            onPress={handleSend}
            disabled={!inputText.trim() || !(eventStatus === 'active' || eventStatus === 'finished')}
            activeOpacity={0.8}
          >
            <Text style={[styles.sendBtnText, { color: (!inputText.trim() || !(eventStatus === 'active' || eventStatus === 'finished')) ? theme.subtext : '#FFF' }]}>↑</Text>
          </TouchableOpacity>
        </View>
      </KeyboardAvoidingView>
      {confirmModal && (
        <CustomConfirmModal
          visible={confirmModal.visible}
          title={confirmModal.title}
          message={confirmModal.message}
          confirmText={confirmModal.confirmText}
          cancelText={confirmModal.cancelText}
          isDestructive={confirmModal.isDestructive}
          showCancel={confirmModal.showCancel}
          showInput={confirmModal.showInput}
          inputPlaceholder={confirmModal.inputPlaceholder}
          defaultValue={confirmModal.defaultValue}
          onConfirm={(text) => {
            confirmModal.onConfirm(text);
            setConfirmModal(null);
          }}
          onCancel={() => setConfirmModal(null)}
        />
      )}
    </SafeAreaView>
  );
}

const styles = StyleSheet.create({
  container: { flex: 1 },
  flex: { flex: 1 },
  eventBanner: {
    flexDirection: 'row', justifyContent: 'space-between', alignItems: 'center',
    paddingHorizontal: 16, paddingVertical: 12,
    borderBottomWidth: 1,
  },
  bannerText: { fontSize: 13, fontWeight: '700', flex: 1 },
  bannerActions: { flexDirection: 'row', gap: 8 },
  participantsBtn: {
    paddingHorizontal: 12, paddingVertical: 6, borderRadius: 12,
  },
  participantsBtnText: { fontSize: 12, fontWeight: '700' },
  reviewBtn: {
    borderRadius: 12,
    paddingHorizontal: 12, paddingVertical: 6,
  },
  reviewBtnText: { fontSize: 12, color: '#FFF', fontWeight: '700' },
  leaveBtn: {
    borderRadius: 12,
    paddingHorizontal: 12, paddingVertical: 6,
  },
  leaveBtnText: { fontSize: 12, fontWeight: '700' },
  cancelNotice: { backgroundColor: '#FEE4E2', paddingHorizontal: 16, paddingVertical: 10 },
  cancelNoticeTitle: { color: '#B42318', fontSize: 12, fontWeight: '900' },
  cancelNoticeText: { color: '#B42318', fontSize: 12, lineHeight: 17, marginTop: 2 },
  list: { paddingVertical: 12, paddingBottom: 8, width: '100%', maxWidth: 920, alignSelf: 'center' },
  emptyChat: {
    alignItems: 'center',
    borderWidth: 1,
    borderStyle: 'dashed',
    borderRadius: 16,
    marginHorizontal: 16,
    marginTop: 48,
    paddingVertical: 28,
  },
  emptyChatIcon: { fontSize: 30, marginBottom: 8 },
  emptyChatText: { fontSize: 14, fontWeight: '700' },
  typingIndicator: { paddingHorizontal: 16, paddingVertical: 8 },
  typingText: { fontSize: 12, fontStyle: 'italic', fontWeight: '600' },
  inputRow: {
    flexDirection: 'row', alignItems: 'center',
    paddingHorizontal: 12, paddingVertical: 10,
    borderTopWidth: 1, gap: 8,
    width: '100%', maxWidth: 980, alignSelf: 'center',
    shadowColor: '#101828', shadowOffset: { width: 0, height: -6 },
    shadowOpacity: 0.04, shadowRadius: 14, elevation: 4,
  },
  input: {
    flex: 1, borderRadius: 20,
    paddingHorizontal: 16, paddingVertical: 10, fontSize: 15,
    maxHeight: 100, borderWidth: 1,
  },
  aiBtn: {
    width: 42, height: 42, borderRadius: 21,
    justifyContent: 'center', alignItems: 'center',
    borderWidth: 1,
  },
  actionDisabled: { opacity: 0.5 },
  aiBtnText: { fontSize: 12, fontWeight: '800' },
  photoBtn: {
    width: 42, height: 42, borderRadius: 21,
    justifyContent: 'center', alignItems: 'center',
    borderWidth: 1,
  },
  photoBtnText: { fontSize: 18 },
  sendBtn: {
    width: 42, height: 42, borderRadius: 21,
    justifyContent: 'center', alignItems: 'center',
  },
  sendBtnText: { fontSize: 18, color: '#FFF', fontWeight: '700' },
  modalOverlay: {
    flex: 1,
    backgroundColor: 'rgba(0, 0, 0, 0.6)',
    justifyContent: 'center',
    alignItems: 'center',
  },
  modalContent: {
    borderRadius: 20,
    borderWidth: 1.5,
    padding: 20,
    width: '85%',
    maxWidth: 360,
    alignItems: 'stretch',
  },
  modalTitle: {
    fontSize: 18,
    fontWeight: '900',
    textAlign: 'center',
    marginBottom: 4,
  },
  modalSubtitle: {
    fontSize: 13,
    fontWeight: '600',
    textAlign: 'center',
    marginBottom: 16,
  },
  modalOption: {
    paddingVertical: 14,
    borderBottomWidth: 1,
    alignItems: 'center',
  },
  modalOptionText: {
    fontSize: 15,
    fontWeight: '700',
  },
  modalCloseBtn: {
    marginTop: 16,
    paddingVertical: 12,
    borderRadius: 12,
    alignItems: 'center',
    borderWidth: 1.5,
  },
  modalCloseBtnText: {
    fontSize: 14,
    fontWeight: '800',
  },
});
