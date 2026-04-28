import React, { useEffect, useState, useCallback } from 'react';
import {
  View, Text, ScrollView, StyleSheet, TouchableOpacity,
  RefreshControl, ActivityIndicator,
} from 'react-native';
import { Ionicons } from '@expo/vector-icons';
import { Colors } from '../src/theme/colors';
import { api } from '../src/api/client';
import { SafeAreaView } from 'react-native-safe-area-context';
import { AppHeader } from '../src/components/AppHeader';
import { router } from 'expo-router';

interface Notification {
  id: string;
  type: string;
  title: string;
  body: string;
  link: string | null;
  isRead: boolean;
  createdAt: string;
  icon: string;
}

const typeIcons: Record<string, string> = {
  event_invite: '🎟️',
  event_update: '📅',
  event_reminder: '⏰',
  comment: '💬',
  like: '❤️',
  connection: '🤝',
  system: '🔔',
};

export default function NotificationsScreen() {
  const [notifications, setNotifications] = useState<Notification[]>([]);
  const [loading, setLoading] = useState(true);
  const [refreshing, setRefreshing] = useState(false);

  const loadNotifications = useCallback(async () => {
    try {
      const data = await api.get<Notification[]>('/api/mobile/notifications');
      setNotifications(Array.isArray(data) ? data : []);
    } catch (err) {
      console.warn('Failed to load notifications:', err);
    } finally {
      setLoading(false);
      setRefreshing(false);
    }
  }, []);

  useEffect(() => { loadNotifications(); }, [loadNotifications]);

  const markAllRead = async () => {
    try {
      await api.post('/api/mobile/notifications/read-all', {});
      setNotifications(prev => prev.map(n => ({ ...n, isRead: true })));
    } catch {
      // silently fail
    }
  };

  const timeAgo = (dateStr: string) => {
    const diff = Date.now() - new Date(dateStr).getTime();
    const mins = Math.floor(diff / 60000);
    if (mins < 1) return 'Just nu';
    if (mins < 60) return `${mins} min sedan`;
    const hours = Math.floor(mins / 60);
    if (hours < 24) return `${hours}h sedan`;
    const days = Math.floor(hours / 24);
    return `${days}d sedan`;
  };

  const unreadCount = notifications.filter(n => !n.isRead).length;

  return (
    <SafeAreaView style={s.container} edges={['top']}>
      <AppHeader title="Notiser" showBack />

      {/* Subtitle bar */}
      <View style={s.subBar}>
        <Text style={s.subBarText}>
          {unreadCount > 0 ? `${unreadCount} olästa` : 'Alla lästa ✓'}
        </Text>
        {unreadCount > 0 && (
          <TouchableOpacity onPress={markAllRead}>
            <Text style={s.markAllText}>Markera alla som lästa</Text>
          </TouchableOpacity>
        )}
      </View>

      <ScrollView
        style={s.scroll}
        showsVerticalScrollIndicator={false}
        refreshControl={
          <RefreshControl refreshing={refreshing} onRefresh={() => { setRefreshing(true); loadNotifications(); }} tintColor={Colors.brandPrimary} />
        }
      >
        {loading ? (
          <View style={s.center}>
            <ActivityIndicator size="large" color={Colors.brandPrimary} />
          </View>
        ) : notifications.length === 0 ? (
          <View style={s.center}>
            <Ionicons name="notifications-off-outline" size={64} color={Colors.textTertiary} />
            <Text style={s.emptyTitle}>Inga notiser</Text>
            <Text style={s.emptyText}>Du har inga notifieringar ännu</Text>
          </View>
        ) : (
          notifications.map(n => (
            <TouchableOpacity
              key={n.id}
              style={[s.notifCard, !n.isRead && s.notifUnread]}
              activeOpacity={0.7}
              onPress={() => {
                if (n.link) {
                  // Navigate based on link type
                  if (n.link.includes('/events/')) {
                    const eventId = n.link.split('/events/')[1]?.split('?')[0];
                    if (eventId) router.push(`/event/${eventId}`);
                  }
                }
              }}
            >
              {!n.isRead && <View style={s.unreadDot} />}
              <Text style={s.notifIcon}>{typeIcons[n.type] || n.icon || '🔔'}</Text>
              <View style={s.notifContent}>
                <Text style={[s.notifTitle, !n.isRead && { fontWeight: '700' }]}>{n.title}</Text>
                {n.body ? <Text style={s.notifBody} numberOfLines={2}>{n.body}</Text> : null}
                <Text style={s.notifTime}>{timeAgo(n.createdAt)}</Text>
              </View>
              <Ionicons name="chevron-forward" size={16} color={Colors.textTertiary} />
            </TouchableOpacity>
          ))
        )}
        <View style={{ height: 100 }} />
      </ScrollView>
    </SafeAreaView>
  );
}

const s = StyleSheet.create({
  container: { flex: 1, backgroundColor: Colors.bgPrimary },
  subBar: {
    flexDirection: 'row', justifyContent: 'space-between', alignItems: 'center',
    paddingHorizontal: 16, paddingVertical: 10,
    borderBottomWidth: 1, borderBottomColor: Colors.borderSubtle,
  },
  subBarText: { fontSize: 14, color: Colors.textSecondary, fontWeight: '600' },
  markAllText: { fontSize: 13, color: Colors.brandPrimary, fontWeight: '600' },
  scroll: { flex: 1 },
  center: { paddingTop: 100, alignItems: 'center', gap: 10 },
  emptyTitle: { fontSize: 18, fontWeight: '700', color: Colors.textPrimary },
  emptyText: { fontSize: 14, color: Colors.textSecondary },
  notifCard: {
    flexDirection: 'row', alignItems: 'center', gap: 12,
    paddingHorizontal: 16, paddingVertical: 14,
    borderBottomWidth: 1, borderBottomColor: Colors.borderSubtle,
  },
  notifUnread: { backgroundColor: 'rgba(249,115,22,0.06)' },
  unreadDot: {
    position: 'absolute', left: 6, top: '50%',
    width: 8, height: 8, borderRadius: 4,
    backgroundColor: Colors.brandPrimary,
  },
  notifIcon: { fontSize: 24 },
  notifContent: { flex: 1, gap: 2 },
  notifTitle: { fontSize: 14, color: Colors.textPrimary, fontWeight: '500' },
  notifBody: { fontSize: 13, color: Colors.textSecondary, lineHeight: 18 },
  notifTime: { fontSize: 11, color: Colors.textTertiary, marginTop: 2 },
});
