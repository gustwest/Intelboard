import React, { useEffect, useState, useCallback } from 'react';
import {
  View, Text, FlatList, StyleSheet, Image,
  TouchableOpacity, RefreshControl, ActivityIndicator,
} from 'react-native';
import { Ionicons } from '@expo/vector-icons';
import { Colors } from '../../src/theme/colors';
import { api } from '../../src/api/client';
import { SafeAreaView } from 'react-native-safe-area-context';
import { AppHeader } from '../../src/components/AppHeader';
import { LinearGradient } from 'expo-linear-gradient';
import { router } from 'expo-router';

interface Conversation {
  id: string;
  name: string;
  image: string | null;
  lastMessage: string;
  lastMessageAt: string;
  unreadCount: number;
  isGroup: boolean;
}

export default function ChatScreen() {
  const [conversations, setConversations] = useState<Conversation[]>([]);
  const [loading, setLoading] = useState(true);
  const [refreshing, setRefreshing] = useState(false);
  const [notifCount, setNotifCount] = useState(0);

  const loadData = useCallback(async () => {
    try {
      const [data, countData] = await Promise.all([
        api.get<Conversation[]>('/api/mobile/chat'),
        api.get<{ count: number }>('/api/mobile/notifications/count').catch(() => ({ count: 0 })),
      ]);
      setConversations(Array.isArray(data) ? data : []);
      setNotifCount(countData.count || 0);
    } catch (err) { console.warn('Failed to load chat:', err); }
    finally { setLoading(false); setRefreshing(false); }
  }, []);

  useEffect(() => { loadData(); }, [loadData]);

  const timeAgo = (dateStr: string) => {
    const diff = Date.now() - new Date(dateStr).getTime();
    const mins = Math.floor(diff / 60000);
    if (mins < 1) return 'Nu';
    if (mins < 60) return `${mins}m`;
    const hours = Math.floor(mins / 60);
    if (hours < 24) return `${hours}h`;
    return `${Math.floor(hours / 24)}d`;
  };

  const renderConversation = ({ item }: { item: Conversation }) => (
    <TouchableOpacity style={[s.convRow, item.unreadCount > 0 && s.convUnread]} activeOpacity={0.7} onPress={() => router.push(`/chat/${item.id}`)}>
      {item.image ? (
        <Image source={{ uri: item.image }} style={s.convAvatar} />
      ) : (
        <LinearGradient
          colors={item.isGroup ? ['#06b6d4', '#3b82f6'] : ['#ea580c', '#db2777']}
          style={[s.convAvatar, { justifyContent: 'center', alignItems: 'center' }]}
        >
          {item.isGroup ? (
            <Ionicons name="people" size={20} color="#fff" />
          ) : (
            <Text style={{ color: '#fff', fontSize: 16, fontWeight: '700' }}>{item.name?.charAt(0)}</Text>
          )}
        </LinearGradient>
      )}
      <View style={s.convContent}>
        <View style={s.convTopRow}>
          <Text style={[s.convName, item.unreadCount > 0 && { fontWeight: '800' }]} numberOfLines={1}>{item.name}</Text>
          <Text style={s.convTime}>{timeAgo(item.lastMessageAt)}</Text>
        </View>
        <Text style={[s.convMessage, item.unreadCount > 0 && { color: Colors.textPrimary, fontWeight: '600' }]} numberOfLines={1}>
          {item.lastMessage}
        </Text>
      </View>
      {item.unreadCount > 0 && (
        <LinearGradient colors={['#ea580c', '#db2777']} start={{x:0,y:0}} end={{x:1,y:0}} style={s.unreadBadge}>
          <Text style={s.unreadText}>{item.unreadCount}</Text>
        </LinearGradient>
      )}
    </TouchableOpacity>
  );

  return (
    <SafeAreaView style={s.container} edges={['top']}>
      <AppHeader title="Meddelanden" notificationCount={notifCount} />

      {loading ? (
        <View style={s.center}><ActivityIndicator size="large" color={Colors.brandPrimary} /></View>
      ) : conversations.length === 0 ? (
        <View style={s.center}>
          <View style={s.emptyIconWrap}>
            <Ionicons name="chatbubbles-outline" size={48} color={Colors.brandPrimary} />
          </View>
          <Text style={s.emptyTitle}>Inga meddelanden</Text>
          <Text style={s.emptyText}>Starta en konversation via en spelares profil</Text>
        </View>
      ) : (
        <FlatList
          data={conversations}
          renderItem={renderConversation}
          keyExtractor={item => item.id}
          showsVerticalScrollIndicator={false}
          refreshControl={<RefreshControl refreshing={refreshing} onRefresh={() => { setRefreshing(true); loadData(); }} tintColor={Colors.brandPrimary} />}
          contentContainerStyle={{ paddingBottom: 100 }}
        />
      )}
    </SafeAreaView>
  );
}

const s = StyleSheet.create({
  container: { flex: 1, backgroundColor: Colors.bgPrimary },
  center: { flex: 1, justifyContent: 'center', alignItems: 'center', gap: 14 },
  emptyIconWrap: {
    width: 80, height: 80, borderRadius: 40,
    backgroundColor: 'rgba(249,115,22,0.08)',
    justifyContent: 'center', alignItems: 'center',
  },
  emptyTitle: { fontSize: 20, fontWeight: '700', color: Colors.textPrimary },
  emptyText: { fontSize: 14, color: Colors.textSecondary, textAlign: 'center', paddingHorizontal: 40 },
  convRow: { flexDirection: 'row', alignItems: 'center', gap: 12, paddingHorizontal: 16, paddingVertical: 14, borderBottomWidth: 1, borderBottomColor: Colors.borderSubtle },
  convUnread: { backgroundColor: 'rgba(249,115,22,0.04)' },
  convAvatar: { width: 48, height: 48, borderRadius: 24, overflow: 'hidden' },
  convContent: { flex: 1, gap: 3 },
  convTopRow: { flexDirection: 'row', justifyContent: 'space-between', alignItems: 'center' },
  convName: { fontSize: 15, fontWeight: '600', color: Colors.textPrimary, flex: 1, marginRight: 8 },
  convTime: { fontSize: 12, color: Colors.textTertiary },
  convMessage: { fontSize: 13, color: Colors.textSecondary },
  unreadBadge: { borderRadius: 12, minWidth: 22, height: 22, justifyContent: 'center', alignItems: 'center', paddingHorizontal: 6 },
  unreadText: { color: '#fff', fontSize: 11, fontWeight: '800' },
});
