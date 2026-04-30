import React, { useEffect, useState, useCallback } from 'react';
import {
  View, Text, ScrollView, StyleSheet, Image,
  TouchableOpacity, RefreshControl, ActivityIndicator, Alert, Pressable
} from 'react-native';
import { Ionicons } from '@expo/vector-icons';
import { Colors } from '../../src/theme/colors';
import { api } from '../../src/api/client';
import { SafeAreaView } from 'react-native-safe-area-context';
import { AppHeader } from '../../src/components/AppHeader';
import { router, useFocusEffect } from 'expo-router';
import { LinearGradient } from 'expo-linear-gradient';

const API_BASE = 'https://dvoucher-app-815335042776.europe-north1.run.app';
const getAbsoluteUrl = (url: string | null | undefined) => {
  if (!url) return undefined;
  if (url.startsWith('//')) return `https:${url}`;
  if (url.startsWith('/')) return `${API_BASE}${url}`;
  return url;
};

interface GroupItem {
  id: string; name: string; emoji: string | null; imageUrl: string | null;
  eventCount: number; memberCount: number; isPinned?: boolean; unreadCount?: number;
}

interface EventItem {
  id: string; title: string; type: string; skillLevel: string | null;
  startsAt: string; endsAt: string; location: string | null; courtName: string | null;
  maxPlayers: number | null; participantCount: number;
  participants: { name: string; image: string | null }[];
  creator: { name: string; image: string | null } | null;
  userStatus: string | null; isCreator: boolean;
  groupName: string | null; isPrivate: boolean;
  commentCount: number; lastComment: string | null;
  isPaused?: boolean; isPast?: boolean;
  imageUrl?: string | null;
}

interface TabCounts { my_games: number; respond: number; find: number; paused: number; history: number; }

const TABS = [
  { key: 'my_games', label: 'Mina spel', icon: 'tennisball' as const },
  { key: 'respond', label: 'Svara', icon: 'mail' as const },
  { key: 'find', label: 'Hitta spel', icon: 'search' as const },
  { key: 'paused', label: 'Pausat', icon: 'pause-circle' as const },
  { key: 'history', label: 'Historik', icon: 'time' as const },
] as const;

const skillStars: Record<string, string> = {
  ROOKIE: '⭐', INTERMEDIATE: '⭐⭐', COMPETITIVE: '⭐⭐⭐',
  ADVANCED: '⭐⭐⭐⭐', ELITE: '⭐⭐⭐⭐⭐',
};

export default function PlayScreen() {
  const [tab, setTab] = useState<string>('my_games');
  const [groups, setGroups] = useState<GroupItem[]>([]);
  const [events, setEvents] = useState<EventItem[]>([]);
  const [tabCounts, setTabCounts] = useState<TabCounts>({ my_games: 0, respond: 0, find: 0, paused: 0, history: 0 });
  const [loading, setLoading] = useState(true);
  const [refreshing, setRefreshing] = useState(false);
  const [notifCount, setNotifCount] = useState(0);

  const loadData = useCallback(async () => {
    try {
      const [data, countData] = await Promise.all([
        api.get<{ groups: GroupItem[]; events: EventItem[]; counts?: TabCounts }>(`/api/mobile/play?tab=${tab}`),
        api.get<{ count: number }>('/api/mobile/notifications/count').catch(() => ({ count: 0 })),
      ]);
      setGroups(data.groups || []);
      setEvents(data.events || []);
      if (data.counts) setTabCounts(data.counts);
      setNotifCount(countData.count || 0);
    } catch (err) { console.warn('Failed to load play data:', err); }
    finally { setLoading(false); setRefreshing(false); }
  }, [tab]);

  useFocusEffect(
    useCallback(() => {
      setLoading(true);
      loadData();
    }, [loadData])
  );

  const handleInviteResponse = async (eventId: string, response: 'YES' | 'MAYBE' | 'NO') => {
    try {
      await api.post(`/api/mobile/events/${eventId}`, { action: 'respond', response });
      loadData();
    } catch { Alert.alert('Fel', 'Kunde inte svara på inbjudan'); }
  };

  const handleLeave = async (eventId: string) => {
    Alert.alert('Hoppa av?', 'Vill du lämna detta spel?', [
      { text: 'Avbryt', style: 'cancel' },
      { text: 'Hoppa av', style: 'destructive', onPress: async () => {
        try { await api.post(`/api/mobile/events/${eventId}`, { action: 'leave' }); loadData(); }
        catch { Alert.alert('Fel', 'Kunde inte hoppa av'); }
      }},
    ]);
  };

  const formatDate = (dateStr: string) => {
    const d = new Date(dateStr);
    const now = new Date();
    const tomorrow = new Date(now); tomorrow.setDate(tomorrow.getDate() + 1);
    const time = d.toLocaleTimeString('sv-SE', { hour: '2-digit', minute: '2-digit' });
    if (d.toDateString() === now.toDateString()) return `Idag ${time}`;
    if (d.toDateString() === tomorrow.toDateString()) return `Imorgon ${time}`;
    return d.toLocaleDateString('sv-SE', { weekday: 'short', day: 'numeric', month: 'short' }) + ` · ${time}`;
  };

  return (
    <SafeAreaView style={s.container} edges={['top']}>
      <AppHeader notificationCount={notifCount} />

      <ScrollView
        style={s.scroll} showsVerticalScrollIndicator={false}
        refreshControl={<RefreshControl refreshing={refreshing} onRefresh={() => { setRefreshing(true); loadData(); }} tintColor={Colors.brandPrimary} />}
      >
        {/* Groups stories row */}
        {groups.length > 0 && (
          <View style={s.section}>
            <Text style={s.sectionLabel}>GRUPPER</Text>
            <ScrollView horizontal showsHorizontalScrollIndicator={false} contentContainerStyle={s.storiesRow}>
              <Pressable style={s.storyItem} onPress={() => Alert.alert('Ny grupp', 'Funktionen byggs just nu')}>
                {({ pressed }) => (
                  <>
                    <LinearGradient
                      colors={['#f97316', '#ef4444', '#ec4899', '#a855f7']}
                      start={{ x: 0, y: 0 }}
                      end={{ x: 1, y: 1 }}
                      style={[s.storyRing, { borderWidth: 0 }, pressed && s.storyRingPressed]}
                    >
                      <Ionicons name="add" size={32} color="#fff" style={{ opacity: 0.9 }} />
                    </LinearGradient>
                    <Text style={s.storyName} numberOfLines={1}>Ny grupp</Text>
                  </>
                )}
              </Pressable>
              {groups.map((g) => {
                const hasActivity = (g.unreadCount || 0) > 0;
                return (
                  <Pressable key={g.id} style={s.storyItem} onPress={() => router.push(`/group/${g.id}`)}>
                    {({ pressed }) => (
                      <>
                        <LinearGradient
                          colors={(g.isPinned && !hasActivity) ? [Colors.brandPrimary, Colors.brandPrimary] : ['#f97316', '#ef4444', '#ec4899', '#a855f7']}
                          start={{ x: 0, y: 0 }}
                          end={{ x: 1, y: 1 }}
                          style={[s.storyRing, !hasActivity && { opacity: 0.85 }, pressed && s.storyRingPressed]}
                        >
                          <View style={s.storyInner}>
                            {g.imageUrl ? <Image source={{ uri: getAbsoluteUrl(g.imageUrl) }} style={s.storyImage} /> : <Text style={s.storyEmoji}>{g.emoji || '🏐'}</Text>}
                            {g.isPinned && <View style={s.pinIcon}><Text style={{ fontSize: 12 }}>📌</Text></View>}
                          </View>
                        </LinearGradient>
                        {(g.unreadCount || 0) > 0 && (
                          <View style={s.storyBadge}><Text style={s.storyBadgeText}>{(g.unreadCount || 0) > 9 ? '9+' : g.unreadCount}</Text></View>
                        )}
                        <Text style={s.storyName} numberOfLines={1}>{g.name}</Text>
                      </>
                    )}
                  </Pressable>
                );
              })}
            </ScrollView>
          </View>
        )}

        {/* Search/filter bar */}
        <TouchableOpacity style={s.searchBar}>
          <Ionicons name="search" size={18} color={Colors.textTertiary} />
          <Text style={s.searchText}>Hela Sverige</Text>
          <View style={{ flex: 1 }} />
          <Ionicons name="options-outline" size={20} color={Colors.textTertiary} />
        </TouchableOpacity>

        {/* Tabs with counts */}
        <ScrollView horizontal showsHorizontalScrollIndicator={false} contentContainerStyle={s.tabsRow}>
          {TABS.map((t) => {
            const count = tabCounts[t.key as keyof TabCounts] || 0;
            const isActive = tab === t.key;
            const isPaused = t.key === 'paused';
            const isRespond = t.key === 'respond' && count > 0;
            return (
              <TouchableOpacity key={t.key} style={[s.tabPill, isActive && s.tabPillActive, isRespond && !isActive && s.tabPillNotify]} onPress={() => setTab(t.key)}>
                <Text style={[s.tabPillText, isActive && s.tabPillTextActive]}>
                  {t.label}{count > 0 ? ` ${count}` : ''}
                </Text>
                {isPaused && count > 0 && !isActive && <View style={s.pausedDot} />}
              </TouchableOpacity>
            );
          })}
        </ScrollView>

        {/* Events list */}
        {loading ? (
          <View style={s.center}><ActivityIndicator size="large" color={Colors.brandPrimary} /></View>
        ) : events.length === 0 ? (
          <View style={s.center}>
            <View style={s.emptyIconWrap}>
              <Ionicons name="calendar-outline" size={40} color={Colors.brandPrimary} />
            </View>
            <Text style={s.emptyTitle}>Inga spel</Text>
            <Text style={s.emptyText}>{tab === 'find' ? 'Inga öppna spel just nu' : 'Du har inga kommande spel'}</Text>
          </View>
        ) : (
          <View style={s.eventsList}>
            {events.map((event) => (
              <TouchableOpacity key={event.id} style={[s.eventCard, event.isPast && { opacity: 0.6 }]} activeOpacity={0.7} onPress={() => router.push(`/event/${event.id}`)}>
                {/* Group name + lock */}
                {event.groupName && (
                  <View style={s.groupNameRow}>
                    <Text style={s.groupNameText}>{event.groupName.toUpperCase()}</Text>
                    {event.isPrivate && <Ionicons name="lock-closed" size={12} color={Colors.textTertiary} />}
                  </View>
                )}

                {/* Event header */}
                <View style={s.eventHeader}>
                  {event.imageUrl ? (
                    <Image source={{ uri: getAbsoluteUrl(event.imageUrl) }} style={s.eventThumb} />
                  ) : event.creator?.image ? (
                    <Image source={{ uri: getAbsoluteUrl(event.creator.image) }} style={s.eventCreatorImg} />
                  ) : (
                    <LinearGradient colors={['#ea580c', '#db2777']} style={[s.eventCreatorImg, { justifyContent: 'center', alignItems: 'center' }]}>
                      <Ionicons name="person" size={16} color="#fff" />
                    </LinearGradient>
                  )}
                  <View style={{ flex: 1 }}>
                    <View style={{ flexDirection: 'row', alignItems: 'center', gap: 6 }}>
                      <Text style={s.eventTitle} numberOfLines={1}>{event.title}</Text>
                      {event.isPrivate && !event.groupName && <Ionicons name="lock-closed" size={13} color={Colors.textTertiary} />}
                    </View>
                    {event.skillLevel && <Text style={s.eventSkill}>Nivå {skillStars[event.skillLevel] || event.skillLevel}</Text>}
                  </View>
                  {event.userStatus === 'CONFIRMED' && <View style={s.statusBadge}><Text style={s.statusText}>DU ÄR MED</Text></View>}
                  {event.isCreator && <View style={[s.statusBadge, { backgroundColor: 'rgba(249,115,22,0.15)' }]}><Text style={[s.statusText, { color: Colors.brandPrimary }]}>✨ SKAPARE</Text></View>}
                  {event.isPast && <View style={[s.statusBadge, { backgroundColor: 'rgba(107,114,128,0.15)' }]}><Text style={[s.statusText, { color: Colors.textTertiary }]}>Passerat</Text></View>}
                </View>

                {/* Meta */}
                <View style={s.eventMeta}>
                  <Ionicons name="calendar-outline" size={14} color={Colors.brandPrimary} />
                  <Text style={s.eventMetaText}>{formatDate(event.startsAt)}</Text>
                </View>
                {event.location && (
                  <View style={s.eventMeta}>
                    <Ionicons name="location-outline" size={14} color={Colors.brandPink} />
                    <Text style={s.eventMetaText}>{event.courtName || event.location}</Text>
                  </View>
                )}

                {/* Participants */}
                <View style={s.participantsRow}>
                  <View style={s.avatarStack}>
                    {event.participants.slice(0, 4).map((p, i) => (
                      <View key={i} style={[s.stackAvatar, { marginLeft: i > 0 ? -8 : 0 }]}>
                        {p.image ? <Image source={{ uri: getAbsoluteUrl(p.image) }} style={s.stackAvatarImg} /> : (
                          <View style={[s.stackAvatarImg, { backgroundColor: Colors.bgTertiary, justifyContent: 'center', alignItems: 'center' }]}>
                            <Text style={{ color: Colors.textSecondary, fontSize: 10 }}>{p.name?.charAt(0)}</Text>
                          </View>
                        )}
                      </View>
                    ))}
                  </View>
                  <View style={{ flex: 1 }} />
                  <View style={s.countBadge}>
                    <Text style={s.countText}>{event.participantCount}/{event.maxPlayers || '∞'} · behövs {Math.max(0, (event.maxPlayers || 0) - event.participantCount)}</Text>
                  </View>
                </View>

                {/* Invite response buttons (for respond tab) */}
                {tab === 'respond' && event.userStatus === 'INVITED' && (
                  <View style={s.inviteRow}>
                    <TouchableOpacity style={s.inviteNo} onPress={() => handleInviteResponse(event.id, 'NO')}>
                      <Text style={s.inviteNoText}>Nej</Text>
                    </TouchableOpacity>
                    <TouchableOpacity style={s.inviteMaybe} onPress={() => handleInviteResponse(event.id, 'MAYBE')}>
                      <Text style={s.inviteMaybeText}>Intresserad</Text>
                    </TouchableOpacity>
                    <TouchableOpacity style={s.inviteYes} onPress={() => handleInviteResponse(event.id, 'YES')}>
                      <Text style={s.inviteYesText}>Ja</Text>
                    </TouchableOpacity>
                  </View>
                )}

                {/* Leave button for my_games */}
                {tab === 'my_games' && event.userStatus === 'CONFIRMED' && !event.isCreator && (
                  <TouchableOpacity style={s.leaveBtn} onPress={() => handleLeave(event.id)}>
                    <Text style={s.leaveBtnText}>Kan inte längre — hoppa av</Text>
                  </TouchableOpacity>
                )}

                {/* Comment preview */}
                <View style={s.commentBtn}>
                  <Ionicons name="chatbubble-outline" size={14} color={Colors.textSecondary} />
                  <Text style={s.commentText}>
                    {event.commentCount > 0 ? `${event.commentCount} kommentar${event.commentCount > 1 ? 'er' : ''}` : 'Kommentera'}
                  </Text>
                  {event.lastComment && <Text style={s.lastCommentText} numberOfLines={1}> · {event.lastComment}</Text>}
                </View>
              </TouchableOpacity>
            ))}
          </View>
        )}
        <View style={{ height: 100 }} />
      </ScrollView>

      {/* FAB with gradient */}
      <TouchableOpacity style={s.fab} activeOpacity={0.85} onPress={() => router.push('/create-event')}>
        <LinearGradient colors={['#ea580c', '#db2777']} start={{x:0,y:0}} end={{x:1,y:0}} style={s.fabGradient}>
          <Ionicons name="add" size={22} color="#fff" />
          <Text style={s.fabText}>Skapa speltid</Text>
        </LinearGradient>
      </TouchableOpacity>
    </SafeAreaView>
  );
}

const s = StyleSheet.create({
  container: { flex: 1, backgroundColor: Colors.bgPrimary },
  scroll: { flex: 1 },
  center: { paddingTop: 80, alignItems: 'center', gap: 12 },
  emptyIconWrap: {
    width: 72, height: 72, borderRadius: 36,
    backgroundColor: 'rgba(249,115,22,0.08)',
    justifyContent: 'center', alignItems: 'center',
  },
  emptyTitle: { fontSize: 18, fontWeight: '700', color: Colors.textPrimary },
  emptyText: { fontSize: 14, color: Colors.textSecondary, textAlign: 'center', paddingHorizontal: 40 },
  section: { paddingTop: 12 },
  sectionLabel: { color: Colors.textTertiary, fontSize: 12, fontWeight: '600', paddingHorizontal: 16, marginBottom: 8, letterSpacing: 0.5 },
  storiesRow: { paddingHorizontal: 12, gap: 14, paddingBottom: 12, paddingTop: 6 },
  storyItem: { alignItems: 'center', width: 68, position: 'relative' },
  storyRing: { width: 66, height: 66, borderRadius: 33, justifyContent: 'center', alignItems: 'center', marginBottom: 6, shadowColor: '#ea580c', shadowOffset: { width: 0, height: 2 }, shadowOpacity: 0.35, shadowRadius: 8, elevation: 4 },
  storyRingPressed: { shadowOpacity: 0.8, shadowRadius: 16, elevation: 12 },
  storyInner: { width: 60, height: 60, borderRadius: 30, backgroundColor: Colors.bgTertiary, justifyContent: 'center', alignItems: 'center', overflow: 'hidden', borderWidth: 2, borderColor: Colors.bgPrimary },
  storyImage: { width: '100%', height: '100%', borderRadius: 30 },
  storyEmoji: { fontSize: 28 },
  storyName: { fontSize: 11, color: Colors.textSecondary, marginTop: 4, textAlign: 'center' },
  pinIcon: { position: 'absolute', top: -4, right: -4, zIndex: 5 },
  storyBadge: { position: 'absolute', top: -4, right: -2, backgroundColor: Colors.error, borderRadius: 10, minWidth: 20, height: 20, justifyContent: 'center', alignItems: 'center', paddingHorizontal: 4, borderWidth: 2, borderColor: Colors.bgPrimary, zIndex: 10, elevation: 4 },
  storyBadgeText: { color: '#fff', fontSize: 10, fontWeight: '800' },
  searchBar: { flexDirection: 'row', alignItems: 'center', gap: 8, backgroundColor: Colors.bgSecondary, marginHorizontal: 16, marginVertical: 8, paddingHorizontal: 14, paddingVertical: 12, borderRadius: 14, borderWidth: 1, borderColor: Colors.borderSubtle },
  searchText: { fontSize: 14, color: Colors.textSecondary },
  tabsRow: { paddingHorizontal: 16, gap: 8, paddingVertical: 8 },
  tabPill: { paddingHorizontal: 16, paddingVertical: 8, borderRadius: 100, backgroundColor: Colors.bgTertiary, position: 'relative' },
  tabPillActive: { backgroundColor: Colors.brandPrimary },
  tabPillNotify: { borderWidth: 1, borderColor: 'rgba(249,115,22,0.4)' },
  tabPillText: { fontSize: 13, fontWeight: '600', color: Colors.textSecondary },
  tabPillTextActive: { color: '#fff' },
  pausedDot: { position: 'absolute', top: 4, right: 4, width: 8, height: 8, borderRadius: 4, backgroundColor: Colors.error },
  eventsList: { gap: 2, paddingTop: 8 },
  eventCard: { backgroundColor: Colors.bgSecondary, marginHorizontal: 12, borderRadius: 16, padding: 16, gap: 8, marginBottom: 10, borderWidth: 1, borderColor: Colors.borderSubtle },
  groupNameRow: { flexDirection: 'row', alignItems: 'center', gap: 6, marginBottom: 2 },
  groupNameText: { fontSize: 11, fontWeight: '800', color: Colors.textTertiary, letterSpacing: 0.8 },
  eventHeader: { flexDirection: 'row', alignItems: 'center', gap: 10 },
  eventCreatorImg: { width: 36, height: 36, borderRadius: 18, overflow: 'hidden' },
  eventThumb: { width: 48, height: 48, borderRadius: 12, overflow: 'hidden' },
  eventTitle: { fontSize: 16, fontWeight: '700', color: Colors.textPrimary },
  eventSkill: { fontSize: 12, color: Colors.textSecondary, marginTop: 1 },
  eventMeta: { flexDirection: 'row', alignItems: 'center', gap: 6 },
  eventMetaText: { fontSize: 13, color: Colors.textSecondary },
  participantsRow: { flexDirection: 'row', alignItems: 'center', gap: 8, paddingTop: 4 },
  avatarStack: { flexDirection: 'row' },
  stackAvatar: { borderWidth: 2, borderColor: Colors.bgSecondary, borderRadius: 14, overflow: 'hidden' },
  stackAvatarImg: { width: 24, height: 24, borderRadius: 12 },
  countBadge: { borderWidth: 1, borderColor: Colors.brandPrimary, borderRadius: 100, paddingHorizontal: 8, paddingVertical: 3 },
  countText: { fontSize: 11, color: Colors.brandPrimary, fontWeight: '600' },
  statusBadge: { backgroundColor: 'rgba(34,197,94,0.12)', paddingHorizontal: 8, paddingVertical: 3, borderRadius: 100 },
  statusText: { fontSize: 10, fontWeight: '700', color: Colors.success, letterSpacing: 0.5 },
  // Invite response
  inviteRow: { flexDirection: 'row', gap: 8, paddingTop: 4 },
  inviteNo: { flex: 1, backgroundColor: 'rgba(239,68,68,0.1)', paddingVertical: 10, borderRadius: 12, alignItems: 'center' },
  inviteNoText: { color: Colors.error, fontWeight: '700', fontSize: 14 },
  inviteMaybe: { flex: 1, backgroundColor: 'rgba(234,179,8,0.1)', paddingVertical: 10, borderRadius: 12, alignItems: 'center' },
  inviteMaybeText: { color: '#eab308', fontWeight: '700', fontSize: 14 },
  inviteYes: { flex: 1, backgroundColor: 'rgba(34,197,94,0.1)', paddingVertical: 10, borderRadius: 12, alignItems: 'center' },
  inviteYesText: { color: Colors.success, fontWeight: '700', fontSize: 14 },
  // Leave button
  leaveBtn: { backgroundColor: 'rgba(120,53,15,0.1)', paddingVertical: 10, borderRadius: 12, alignItems: 'center', marginTop: 4 },
  leaveBtnText: { color: '#92400e', fontWeight: '600', fontSize: 13 },
  // Comments
  commentBtn: { flexDirection: 'row', alignItems: 'center', gap: 6, paddingTop: 4 },
  commentText: { fontSize: 13, color: Colors.textSecondary },
  lastCommentText: { fontSize: 12, color: Colors.textTertiary, flex: 1 },
  fab: { position: 'absolute', bottom: 45, right: 16, borderRadius: 26, shadowColor: '#ea580c', shadowOffset: { width: 0, height: 4 }, shadowOpacity: 0.35, shadowRadius: 12, elevation: 8 },
  fabGradient: { flexDirection: 'row', alignItems: 'center', gap: 6, paddingHorizontal: 18, paddingVertical: 14, borderRadius: 26 },
  fabText: { color: '#fff', fontWeight: '700', fontSize: 14 },
});
