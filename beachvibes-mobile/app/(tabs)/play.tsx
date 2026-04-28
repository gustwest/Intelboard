import React, { useEffect, useState, useCallback } from 'react';
import {
  View, Text, ScrollView, StyleSheet, Image,
  TouchableOpacity, RefreshControl, ActivityIndicator,
} from 'react-native';
import { Ionicons } from '@expo/vector-icons';
import { Colors } from '../../src/theme/colors';
import { api } from '../../src/api/client';
import { SafeAreaView } from 'react-native-safe-area-context';
import { router } from 'expo-router';

interface GroupItem {
  id: string;
  name: string;
  emoji: string | null;
  imageUrl: string | null;
  eventCount: number;
  memberCount: number;
}

interface EventItem {
  id: string;
  title: string;
  type: string;
  skillLevel: string | null;
  startsAt: string;
  endsAt: string;
  location: string | null;
  courtName: string | null;
  maxPlayers: number | null;
  participantCount: number;
  participants: { name: string; image: string | null }[];
  creator: { name: string; image: string | null } | null;
  userStatus: string | null;
  isCreator: boolean;
}

interface UpcomingItem {
  id: string;
  title: string;
  startsAt: string;
  location: string | null;
  participants: number;
  maxPlayers: number | null;
}

const TABS = [
  { key: 'my_games', label: 'Mina spel' },
  { key: 'respond', label: 'Svara' },
  { key: 'find', label: 'Hitta spel' },
  { key: 'history', label: 'Historik' },
] as const;

const skillStars: Record<string, string> = {
  ROOKIE: '⭐',
  INTERMEDIATE: '⭐⭐',
  COMPETITIVE: '⭐⭐⭐',
  ADVANCED: '⭐⭐⭐⭐',
  ELITE: '⭐⭐⭐⭐⭐',
};

export default function PlayScreen() {
  const [tab, setTab] = useState<string>('my_games');
  const [groups, setGroups] = useState<GroupItem[]>([]);
  const [events, setEvents] = useState<EventItem[]>([]);
  const [upcoming, setUpcoming] = useState<UpcomingItem[]>([]);
  const [loading, setLoading] = useState(true);
  const [refreshing, setRefreshing] = useState(false);

  const loadData = useCallback(async () => {
    try {
      const data = await api.get<{ groups: GroupItem[]; events: EventItem[]; upcoming: UpcomingItem[] }>(
        `/api/mobile/play?tab=${tab}`
      );
      setGroups(data.groups || []);
      setEvents(data.events || []);
      setUpcoming(data.upcoming || []);
    } catch (err) {
      console.warn('Failed to load play data:', err);
    } finally {
      setLoading(false);
      setRefreshing(false);
    }
  }, [tab]);

  useEffect(() => { setLoading(true); loadData(); }, [loadData]);

  const formatDate = (dateStr: string) => {
    const d = new Date(dateStr);
    const now = new Date();
    const tomorrow = new Date(now);
    tomorrow.setDate(tomorrow.getDate() + 1);

    const time = d.toLocaleTimeString('sv-SE', { hour: '2-digit', minute: '2-digit' });

    if (d.toDateString() === now.toDateString()) return `Idag ${time}`;
    if (d.toDateString() === tomorrow.toDateString()) return `Imorgon ${time}`;

    return d.toLocaleDateString('sv-SE', { weekday: 'short', day: 'numeric', month: 'short' }) + ` · ${time}`;
  };

  return (
    <SafeAreaView style={s.container} edges={['top']}>
      {/* Header */}
      <View style={s.header}>
        <Text style={s.logo}>BeachVibes</Text>
        <View style={s.headerRight}>
          <TouchableOpacity style={s.iconBtn}>
            <Ionicons name="notifications-outline" size={22} color={Colors.textSecondary} />
          </TouchableOpacity>
        </View>
      </View>

      <ScrollView
        style={s.scroll}
        showsVerticalScrollIndicator={false}
        refreshControl={
          <RefreshControl refreshing={refreshing} onRefresh={() => { setRefreshing(true); loadData(); }} tintColor={Colors.brandPrimary} />
        }
      >
        {/* Groups stories row */}
        {groups.length > 0 && (
          <View style={s.section}>
            <Text style={s.sectionLabel}>GRUPPER</Text>
            <ScrollView horizontal showsHorizontalScrollIndicator={false} contentContainerStyle={s.storiesRow}>
              {/* New group button */}
              <TouchableOpacity style={s.storyItem}>
                <View style={s.storyAddCircle}>
                  <Ionicons name="add" size={28} color={Colors.brandPrimary} />
                </View>
                <Text style={s.storyName} numberOfLines={1}>Ny grupp</Text>
              </TouchableOpacity>

              {groups.map((g) => (
                <TouchableOpacity key={g.id} style={s.storyItem}>
                  <View style={s.storyCircle}>
                    {g.imageUrl ? (
                      <Image source={{ uri: g.imageUrl }} style={s.storyImage} />
                    ) : (
                      <Text style={s.storyEmoji}>{g.emoji || '🏐'}</Text>
                    )}
                  </View>
                  <Text style={s.storyName} numberOfLines={1}>{g.name}</Text>
                </TouchableOpacity>
              ))}
            </ScrollView>
          </View>
        )}

        {/* Search / filter bar */}
        <TouchableOpacity style={s.searchBar}>
          <Ionicons name="search" size={18} color={Colors.textTertiary} />
          <Text style={s.searchText}>Hela Sverige</Text>
          <View style={{ flex: 1 }} />
          <Ionicons name="options-outline" size={20} color={Colors.textTertiary} />
        </TouchableOpacity>

        {/* Tabs */}
        <ScrollView horizontal showsHorizontalScrollIndicator={false} contentContainerStyle={s.tabsRow}>
          {TABS.map((t) => (
            <TouchableOpacity
              key={t.key}
              style={[s.tabPill, tab === t.key && s.tabPillActive]}
              onPress={() => setTab(t.key)}
            >
              <Text style={[s.tabPillText, tab === t.key && s.tabPillTextActive]}>
                {t.label}
              </Text>
            </TouchableOpacity>
          ))}
        </ScrollView>

        {/* Events list */}
        {loading ? (
          <View style={s.center}>
            <ActivityIndicator size="large" color={Colors.brandPrimary} />
          </View>
        ) : events.length === 0 ? (
          <View style={s.center}>
            <Ionicons name="calendar-outline" size={52} color={Colors.brandPrimary} />
            <Text style={s.emptyTitle}>Inga spel</Text>
            <Text style={s.emptyText}>
              {tab === 'find' ? 'Inga öppna spel just nu' : 'Du har inga kommande spel'}
            </Text>
          </View>
        ) : (
          <View style={s.eventsList}>
            {events.map((event) => (
              <TouchableOpacity key={event.id} style={s.eventCard} activeOpacity={0.7} onPress={() => router.push(`/event/${event.id}`)}>
                {/* Event header */}
                <View style={s.eventHeader}>
                  {event.creator?.image ? (
                    <Image source={{ uri: event.creator.image }} style={s.eventCreatorImg} />
                  ) : (
                    <View style={[s.eventCreatorImg, { backgroundColor: Colors.bgTertiary, justifyContent: 'center', alignItems: 'center' }]}>
                      <Ionicons name="person" size={16} color={Colors.textTertiary} />
                    </View>
                  )}
                  <View style={{ flex: 1 }}>
                    <Text style={s.eventTitle}>{event.title}</Text>
                    {event.skillLevel && (
                      <Text style={s.eventSkill}>
                        Nivå {skillStars[event.skillLevel] || event.skillLevel}
                      </Text>
                    )}
                  </View>
                  {event.userStatus === 'CONFIRMED' && (
                    <View style={s.statusBadge}>
                      <Text style={s.statusText}>DU ÄR MED</Text>
                    </View>
                  )}
                  {event.isCreator && (
                    <View style={[s.statusBadge, { backgroundColor: 'rgba(249,115,22,0.15)' }]}>
                      <Text style={[s.statusText, { color: Colors.brandPrimary }]}>✨ SKAPARE</Text>
                    </View>
                  )}
                </View>

                {/* Event meta */}
                <View style={s.eventMeta}>
                  <Ionicons name="calendar-outline" size={14} color={Colors.brandPrimary} />
                  <Text style={s.eventMetaText}>{formatDate(event.startsAt)}</Text>
                </View>
                {event.location && (
                  <View style={s.eventMeta}>
                    <Ionicons name="location-outline" size={14} color={Colors.brandPrimary} />
                    <Text style={s.eventMetaText}>{event.courtName || event.location}</Text>
                  </View>
                )}

                {/* Participants row */}
                <View style={s.participantsRow}>
                  <View style={s.avatarStack}>
                    {event.participants.slice(0, 4).map((p, i) => (
                      <View key={i} style={[s.stackAvatar, { marginLeft: i > 0 ? -8 : 0 }]}>
                        {p.image ? (
                          <Image source={{ uri: p.image }} style={s.stackAvatarImg} />
                        ) : (
                          <View style={[s.stackAvatarImg, { backgroundColor: Colors.bgTertiary, justifyContent: 'center', alignItems: 'center' }]}>
                            <Text style={{ color: Colors.textSecondary, fontSize: 10 }}>
                              {p.name?.charAt(0)}
                            </Text>
                          </View>
                        )}
                      </View>
                    ))}
                  </View>
                  <View style={{ flex: 1 }} />
                  <View style={s.countBadge}>
                    <Text style={s.countText}>
                      {event.participantCount}/{event.maxPlayers || '∞'} · behövs {Math.max(0, (event.maxPlayers || 0) - event.participantCount)}
                    </Text>
                  </View>
                </View>

                {/* Comment button */}
                <TouchableOpacity style={s.commentBtn}>
                  <Ionicons name="chatbubble-outline" size={14} color={Colors.textSecondary} />
                  <Text style={s.commentText}>Kommentera</Text>
                </TouchableOpacity>
              </TouchableOpacity>
            ))}
          </View>
        )}

        {/* Upcoming events (sidebar equivalent) */}
        {upcoming.length > 0 && (
          <View style={s.upcomingSection}>
            <Text style={s.upcomingSectionTitle}>🗓 Kommande event</Text>
            {upcoming.map((e) => (
              <TouchableOpacity key={e.id} style={s.upcomingItem} onPress={() => router.push(`/event/${e.id}`)}>
                <View style={s.upcomingDot} />
                <View style={{ flex: 1 }}>
                  <Text style={s.upcomingTitle}>{e.title}</Text>
                  <Text style={s.upcomingMeta}>
                    📅 {formatDate(e.startsAt)} · 📍 {e.location || '–'} · 👥 {e.participants}/{e.maxPlayers || '∞'}
                  </Text>
                </View>
              </TouchableOpacity>
            ))}
          </View>
        )}

        <View style={{ height: 100 }} />
      </ScrollView>

      {/* FAB */}
      <TouchableOpacity style={s.fab} activeOpacity={0.85}>
        <Ionicons name="add" size={22} color="#fff" />
        <Text style={s.fabText}>Skapa speltid</Text>
      </TouchableOpacity>
    </SafeAreaView>
  );
}

const s = StyleSheet.create({
  container: { flex: 1, backgroundColor: Colors.bgPrimary },
  header: {
    flexDirection: 'row', justifyContent: 'space-between', alignItems: 'center',
    paddingHorizontal: 16, paddingVertical: 10,
    borderBottomWidth: 1, borderBottomColor: Colors.borderSubtle,
  },
  logo: { fontSize: 22, fontWeight: '800', color: Colors.brandPrimary, letterSpacing: -0.5 },
  headerRight: { flexDirection: 'row', alignItems: 'center', gap: 12 },
  iconBtn: { padding: 4 },
  scroll: { flex: 1 },
  center: { paddingTop: 100, alignItems: 'center', gap: 10 },
  emptyTitle: { fontSize: 18, fontWeight: '700', color: Colors.textPrimary },
  emptyText: { fontSize: 14, color: Colors.textSecondary },

  // Groups stories
  section: { paddingTop: 12 },
  sectionLabel: { color: Colors.textTertiary, fontSize: 12, fontWeight: '600', paddingHorizontal: 16, marginBottom: 8, letterSpacing: 0.5 },
  storiesRow: { paddingHorizontal: 12, gap: 14, paddingBottom: 12 },
  storyItem: { alignItems: 'center', width: 68 },
  storyAddCircle: {
    width: 56, height: 56, borderRadius: 28, backgroundColor: 'rgba(249,115,22,0.1)',
    justifyContent: 'center', alignItems: 'center', borderWidth: 2, borderColor: Colors.brandPrimary, borderStyle: 'dashed',
  },
  storyCircle: {
    width: 56, height: 56, borderRadius: 28, backgroundColor: Colors.bgTertiary,
    justifyContent: 'center', alignItems: 'center', borderWidth: 2,
    borderColor: 'rgba(249,115,22,0.4)', overflow: 'hidden',
  },
  storyImage: { width: 56, height: 56 },
  storyEmoji: { fontSize: 24 },
  storyName: { fontSize: 11, color: Colors.textSecondary, marginTop: 4, textAlign: 'center' },

  // Search bar
  searchBar: {
    flexDirection: 'row', alignItems: 'center', gap: 8,
    backgroundColor: Colors.bgSecondary, marginHorizontal: 16, marginVertical: 8,
    paddingHorizontal: 14, paddingVertical: 12, borderRadius: 12,
    borderWidth: 1, borderColor: Colors.borderSubtle,
  },
  searchText: { fontSize: 14, color: Colors.textSecondary },

  // Tabs
  tabsRow: { paddingHorizontal: 16, gap: 8, paddingVertical: 8 },
  tabPill: {
    paddingHorizontal: 16, paddingVertical: 8, borderRadius: 100,
    backgroundColor: Colors.bgTertiary,
  },
  tabPillActive: { backgroundColor: Colors.brandPrimary },
  tabPillText: { fontSize: 13, fontWeight: '600', color: Colors.textSecondary },
  tabPillTextActive: { color: '#fff' },

  // Events
  eventsList: { gap: 2, paddingTop: 8 },
  eventCard: {
    backgroundColor: Colors.bgSecondary, marginHorizontal: 12,
    borderRadius: 14, padding: 16, gap: 8, marginBottom: 10,
    borderWidth: 1, borderColor: Colors.borderSubtle,
  },
  eventHeader: { flexDirection: 'row', alignItems: 'center', gap: 10 },
  eventCreatorImg: { width: 36, height: 36, borderRadius: 18, overflow: 'hidden' },
  eventTitle: { fontSize: 16, fontWeight: '700', color: Colors.textPrimary },
  eventSkill: { fontSize: 12, color: Colors.textSecondary, marginTop: 1 },

  eventMeta: { flexDirection: 'row', alignItems: 'center', gap: 6 },
  eventMetaText: { fontSize: 13, color: Colors.textSecondary },

  participantsRow: { flexDirection: 'row', alignItems: 'center', gap: 8, paddingTop: 4 },
  avatarStack: { flexDirection: 'row' },
  stackAvatar: { borderWidth: 2, borderColor: Colors.bgSecondary, borderRadius: 14, overflow: 'hidden' },
  stackAvatarImg: { width: 24, height: 24, borderRadius: 12 },

  countBadge: {
    borderWidth: 1, borderColor: Colors.brandPrimary, borderRadius: 100,
    paddingHorizontal: 8, paddingVertical: 3,
  },
  countText: { fontSize: 11, color: Colors.brandPrimary, fontWeight: '600' },

  statusBadge: {
    backgroundColor: 'rgba(34,197,94,0.12)', paddingHorizontal: 8, paddingVertical: 3,
    borderRadius: 100,
  },
  statusText: { fontSize: 10, fontWeight: '700', color: Colors.success, letterSpacing: 0.5 },

  commentBtn: { flexDirection: 'row', alignItems: 'center', gap: 6, paddingTop: 4 },
  commentText: { fontSize: 13, color: Colors.textSecondary },

  // Upcoming sidebar
  upcomingSection: {
    marginHorizontal: 12, marginTop: 16, padding: 16,
    backgroundColor: Colors.bgSecondary, borderRadius: 14,
    borderWidth: 1, borderColor: Colors.borderSubtle,
  },
  upcomingSectionTitle: { fontSize: 16, fontWeight: '700', color: Colors.textPrimary, marginBottom: 12 },
  upcomingItem: { flexDirection: 'row', alignItems: 'flex-start', gap: 10, paddingVertical: 8, borderTopWidth: 1, borderTopColor: Colors.borderSubtle },
  upcomingDot: { width: 8, height: 8, borderRadius: 4, backgroundColor: Colors.brandPrimary, marginTop: 5 },
  upcomingTitle: { fontSize: 14, fontWeight: '600', color: Colors.textPrimary },
  upcomingMeta: { fontSize: 12, color: Colors.textSecondary, marginTop: 2 },

  // FAB
  fab: {
    position: 'absolute', bottom: 90, right: 16,
    backgroundColor: Colors.brandPrimary, borderRadius: 26,
    flexDirection: 'row', alignItems: 'center', gap: 6,
    paddingHorizontal: 18, paddingVertical: 14,
    shadowColor: Colors.brandPrimary, shadowOffset: { width: 0, height: 4 },
    shadowOpacity: 0.35, shadowRadius: 12, elevation: 8,
  },
  fabText: { color: '#fff', fontWeight: '700', fontSize: 14 },
});
