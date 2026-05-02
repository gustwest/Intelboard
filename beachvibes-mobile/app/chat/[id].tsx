import React, { useEffect, useState, useCallback, useRef } from 'react';
import {
  View, Text, FlatList, StyleSheet, Image,
  TouchableOpacity, TextInput, ActivityIndicator,
  KeyboardAvoidingView, Platform,
} from 'react-native';
import { Ionicons } from '@expo/vector-icons';
import { Colors } from '../../src/theme/colors';
import { api } from '../../src/api/client';
import { useAuth } from '../../src/auth/AuthProvider';
import { SafeAreaView } from 'react-native-safe-area-context';
import { useLocalSearchParams, router } from 'expo-router';
import { LinearGradient } from 'expo-linear-gradient';

interface Message {
  id: string;
  senderId: string;
  senderName: string;
  senderImage: string | null;
  body: string;
  createdAt: string;
}

interface ConvInfo {
  name: string;
  image: string | null;
  memberImages: string[];
  isGroup: boolean;
}

export default function ChatDetailScreen() {
  const { id } = useLocalSearchParams<{ id: string }>();
  const { user } = useAuth();
  const [messages, setMessages] = useState<Message[]>([]);
  const [convInfo, setConvInfo] = useState<ConvInfo | null>(null);
  const [loading, setLoading] = useState(true);
  const [text, setText] = useState('');
  const [sending, setSending] = useState(false);
  const flatListRef = useRef<FlatList>(null);

  const loadMessages = useCallback(async () => {
    try {
      const data = await api.get<{ conversation: ConvInfo; messages: Message[] }>(`/api/mobile/chat/${id}`);
      setConvInfo(data.conversation);
      setMessages(data.messages || []);
    } catch (err) { console.warn('Failed to load chat:', err); }
    finally { setLoading(false); }
  }, [id]);

  useEffect(() => { loadMessages(); }, [loadMessages]);

  // Poll for new messages every 5s
  useEffect(() => {
    const interval = setInterval(loadMessages, 5000);
    return () => clearInterval(interval);
  }, [loadMessages]);

  const sendMessage = async () => {
    const body = text.trim();
    if (!body) return;
    setSending(true);
    try {
      const msg = await api.post<Message>(`/api/mobile/chat/${id}`, { body });
      setMessages(prev => [...prev, msg]);
      setText('');
      setTimeout(() => flatListRef.current?.scrollToEnd({ animated: true }), 100);
    } catch { }
    finally { setSending(false); }
  };

  const isMe = (senderId: string) => senderId === user?.id;

  const renderMessage = ({ item }: { item: Message }) => {
    const mine = isMe(item.senderId);
    return (
      <View style={[s.msgRow, mine && s.msgRowMine]}>
        {!mine && (
          item.senderImage ? (
            <Image source={{ uri: item.senderImage }} style={s.msgAvatar} />
          ) : (
            <View style={[s.msgAvatar, { backgroundColor: Colors.brandAccent, justifyContent: 'center', alignItems: 'center' }]}>
              <Text style={{ color: '#fff', fontSize: 11, fontWeight: '700' }}>{item.senderName?.charAt(0)}</Text>
            </View>
          )
        )}
        <View style={[s.msgBubble, mine ? s.msgBubbleMine : s.msgBubbleOther]}>
          {!mine && <Text style={s.msgSender}>{item.senderName}</Text>}
          <Text style={[s.msgText, mine && { color: '#fff' }]}>{item.body}</Text>
          <Text style={[s.msgTime, mine && { color: 'rgba(255,255,255,0.6)' }]}>
            {new Date(item.createdAt).toLocaleTimeString('sv-SE', { hour: '2-digit', minute: '2-digit' })}
          </Text>
        </View>
      </View>
    );
  };

  return (
    <SafeAreaView style={s.container} edges={['top']}>
      {/* Header */}
      <View style={s.header}>
        <TouchableOpacity onPress={() => router.back()} style={s.backBtn}>
          <Ionicons name="chevron-back" size={24} color={Colors.textPrimary} />
        </TouchableOpacity>
        {convInfo?.image ? (
          <Image source={{ uri: convInfo.image }} style={s.headerAvatar} />
        ) : convInfo?.isGroup && convInfo?.memberImages?.length > 0 ? (
          <View style={s.headerAvatar}>
            {convInfo.memberImages.slice(0, 4).map((img, idx) => (
              <Image
                key={idx}
                source={{ uri: img }}
                style={[
                  s.hdrCollageImg,
                  convInfo.memberImages.length <= 2
                    ? { top: idx === 0 ? 0 : 16, left: idx === 0 ? 0 : 16 }
                    : [
                        { top: 0, left: idx < 2 ? idx * 16 : 0 },
                        { top: 0, left: 16 },
                        { top: 16, left: 0 },
                        { top: 16, left: 16 },
                      ][idx],
                ]}
              />
            ))}
          </View>
        ) : (
          <LinearGradient colors={convInfo?.isGroup ? ['#06b6d4', '#3b82f6'] : ['#ea580c', '#db2777']} style={[s.headerAvatar, { justifyContent: 'center', alignItems: 'center' }]}>
            <Ionicons name={convInfo?.isGroup ? 'people' : 'person'} size={16} color="#fff" />
          </LinearGradient>
        )}
        <Text style={s.headerTitle} numberOfLines={1}>{convInfo?.name || 'Chat'}</Text>
      </View>

      <KeyboardAvoidingView style={{ flex: 1 }} behavior={Platform.OS === 'ios' ? 'padding' : undefined} keyboardVerticalOffset={0}>
        {loading ? (
          <View style={s.center}><ActivityIndicator size="large" color={Colors.brandPrimary} /></View>
        ) : (
          <FlatList
            ref={flatListRef}
            data={messages}
            renderItem={renderMessage}
            keyExtractor={item => item.id}
            contentContainerStyle={s.msgList}
            showsVerticalScrollIndicator={false}
            onContentSizeChange={() => flatListRef.current?.scrollToEnd({ animated: false })}
          />
        )}

        {/* Input */}
        <View style={s.inputBar}>
          <TextInput
            style={s.textInput}
            placeholder="Skriv ett meddelande..."
            placeholderTextColor={Colors.textTertiary}
            value={text}
            onChangeText={setText}
            multiline
            maxLength={1000}
            returnKeyType="send"
            onSubmitEditing={sendMessage}
          />
          <TouchableOpacity
            style={[s.sendBtn, !text.trim() && { opacity: 0.3 }]}
            onPress={sendMessage}
            disabled={sending || !text.trim()}
          >
            {sending ? (
              <ActivityIndicator size="small" color={Colors.brandPrimary} />
            ) : (
              <LinearGradient colors={['#ea580c', '#db2777']} style={s.sendBtnGradient}>
                <Ionicons name="send" size={16} color="#fff" />
              </LinearGradient>
            )}
          </TouchableOpacity>
        </View>
      </KeyboardAvoidingView>
    </SafeAreaView>
  );
}

const s = StyleSheet.create({
  container: { flex: 1, backgroundColor: Colors.bgPrimary },
  center: { flex: 1, justifyContent: 'center', alignItems: 'center' },
  header: {
    flexDirection: 'row', alignItems: 'center', gap: 10,
    paddingHorizontal: 12, paddingVertical: 10,
    borderBottomWidth: 1, borderBottomColor: Colors.borderSubtle,
  },
  backBtn: { padding: 4 },
  headerAvatar: { width: 34, height: 34, borderRadius: 17, overflow: 'hidden' },
  headerTitle: { flex: 1, fontSize: 16, fontWeight: '700', color: Colors.textPrimary },
  msgList: { padding: 16, paddingBottom: 8, gap: 8 },
  msgRow: { flexDirection: 'row', alignItems: 'flex-end', gap: 8 },
  msgRowMine: { flexDirection: 'row-reverse' },
  msgAvatar: { width: 28, height: 28, borderRadius: 14, overflow: 'hidden' },
  msgBubble: { maxWidth: '75%', borderRadius: 18, paddingHorizontal: 14, paddingVertical: 10 },
  msgBubbleOther: { backgroundColor: Colors.bgTertiary, borderBottomLeftRadius: 4 },
  msgBubbleMine: { backgroundColor: Colors.brandPrimary, borderBottomRightRadius: 4 },
  msgSender: { fontSize: 11, fontWeight: '700', color: Colors.brandAccentLight, marginBottom: 3 },
  msgText: { fontSize: 15, color: Colors.textPrimary, lineHeight: 20 },
  msgTime: { fontSize: 10, color: Colors.textTertiary, marginTop: 4, textAlign: 'right' },
  inputBar: {
    flexDirection: 'row', alignItems: 'flex-end', gap: 8,
    padding: 12, borderTopWidth: 1, borderTopColor: Colors.borderSubtle,
    backgroundColor: Colors.bgSecondary,
  },
  textInput: {
    flex: 1, backgroundColor: Colors.bgTertiary, borderRadius: 22,
    paddingHorizontal: 16, paddingVertical: 10,
    fontSize: 15, color: Colors.textPrimary, maxHeight: 100,
  },
  sendBtn: { borderRadius: 20, overflow: 'hidden' },
  sendBtnGradient: { width: 38, height: 38, borderRadius: 19, justifyContent: 'center', alignItems: 'center' },
  hdrCollageImg: {
    width: 20, height: 20, borderRadius: 10,
    position: 'absolute',
    borderWidth: 1.5, borderColor: Colors.bgPrimary,
  },
});
