import React, { useEffect, useState, useCallback } from 'react';
import { View, Text, StyleSheet, TouchableOpacity, ScrollView, ActivityIndicator, Image, Alert } from 'react-native';
import { SafeAreaView, useSafeAreaInsets } from 'react-native-safe-area-context';
import { useRouter, useLocalSearchParams } from 'expo-router';
import { Ionicons } from '@expo/vector-icons';
import { Colors } from '../../src/theme/colors';
import { api } from '../../src/api/client';
import { GroupTabs } from '../../src/components/groups/GroupTabs';
import { PollCard } from '../../src/components/groups/PollCard';
import { LinearGradient } from 'expo-linear-gradient';

const API_BASE = 'https://dvoucher-app-815335042776.europe-north1.run.app';
const getAbsoluteUrl = (url: string | null | undefined) => {
  if (!url) return undefined;
  if (url.startsWith('//')) return `https:${url}`;
  if (url.startsWith('/')) return `${API_BASE}${url}`;
  return url;
};

export default function GroupDetailScreen() {
  const router = useRouter();
  const { id } = useLocalSearchParams();
  const insets = useSafeAreaInsets();
  
  const [loading, setLoading] = useState(true);
  const [group, setGroup] = useState<any>(null);
  const [polls, setPolls] = useState<any[]>([]);
  
  const [posts, setPosts] = useState<any[]>([]);
  const [postsLoading, setPostsLoading] = useState(false);
  const [postsFetched, setPostsFetched] = useState(false);

  const [leaderboard, setLeaderboard] = useState<any[]>([]);
  const [challenges, setChallenges] = useState<any[]>([]);
  const [leagueLoading, setLeagueLoading] = useState(false);
  const [leagueFetched, setLeagueFetched] = useState(false);

  // Tabs: 'speltider' | 'flode' | 'league'
  const [activeTab, setActiveTab] = useState('speltider');
  
  // Sub-tabs for Speltider: 'inbjudningar' | 'mina' | 'paused' | 'historik'
  const [sessionTab, setSessionTab] = useState('mina');

  const loadData = useCallback(async () => {
    try {
      const res = await api.get(`/api/mobile/group/${id}`) as any;
      if (res.error) throw new Error(res.error);
      
      setGroup(res.group);
      setPolls(res.polls);
      setLoading(false);
    } catch (err) {
      console.warn('Failed to load group data:', err);
      Alert.alert('Fel', 'Kunde inte ladda gruppen');
      setLoading(false);
    }
  }, [id]);

  const loadFeed = useCallback(async () => {
    if (postsFetched || postsLoading) return;
    setPostsLoading(true);
    try {
      const res = await api.get(`/api/mobile/group/${id}/feed`) as any;
      if (res.posts) setPosts(res.posts);
      setPostsFetched(true);
    } catch (err) {
      console.warn('Failed to load feed:', err);
    } finally {
      setPostsLoading(false);
    }
  }, [id, postsFetched, postsLoading]);

  const loadLeague = useCallback(async () => {
    if (leagueFetched || leagueLoading) return;
    setLeagueLoading(true);
    try {
      const res = await api.get(`/api/mobile/group/${id}/league`) as any;
      if (res.leaderboard) setLeaderboard(res.leaderboard);
      if (res.challenges) setChallenges(res.challenges);
      setLeagueFetched(true);
    } catch (err) {
      console.warn('Failed to load league:', err);
    } finally {
      setLeagueLoading(false);
    }
  }, [id, leagueFetched, leagueLoading]);

  useEffect(() => {
    loadData();
  }, [loadData]);

  useEffect(() => {
    if (activeTab === 'flode') loadFeed();
    if (activeTab === 'league') loadLeague();
  }, [activeTab, loadFeed, loadLeague]);

  const [pinnedPolls, setPinnedPolls] = useState<Set<string>>(new Set());

  // Derived state for Speltider
  const getSessionSortKey = (p: any): number => {
    if (p.date) return new Date(p.date).getTime();
    if (p.alternativeDates && p.alternativeDates.length > 0) {
      return Math.min(...p.alternativeDates.map((d: string) => new Date(d).getTime()));
    }
    return new Date(p.createdAt).getTime();
  };

  const isPollPast = (p: any): boolean => {
    const now = Date.now();
    if (p.date) return new Date(p.date).getTime() < now;
    if (p.alternativeDates && p.alternativeDates.length > 0) {
      return p.alternativeDates.every((d: string) => new Date(d).getTime() < now);
    }
    return false;
  };

  const sessionBucketOf = (p: any): string => {
    if (isPollPast(p)) return 'historik';
    const r = p.myResponse;
    if (r === 'YES') return 'mina';
    if (r === 'NO' || r === 'MAYBE') return 'paused';
    return 'inbjudningar';
  };

  const getInbjudningarSortKey = (p: any): number => {
    const eventMs = getSessionSortKey(p);
    const deadlineRaw = p.rsvpDeadline;
    if (!deadlineRaw) return eventMs;
    return Math.min(new Date(deadlineRaw).getTime(), eventMs);
  };

  const openSessions = polls.filter((p) => sessionBucketOf(p) === sessionTab).sort((a, b) => {
    if (sessionTab === 'inbjudningar') {
      const ap = pinnedPolls.has(a.id) ? 0 : 1;
      const bp = pinnedPolls.has(b.id) ? 0 : 1;
      if (ap !== bp) return ap - bp;
      return getInbjudningarSortKey(a) - getInbjudningarSortKey(b);
    }
    if (sessionTab === 'historik') {
      return getSessionSortKey(b) - getSessionSortKey(a);
    }
    if (sessionTab === 'mina') {
      const reached = (p: any): boolean => {
        if (p.minPlayers == null) return false;
        const yesCount = p.responses?.yes?.length || 0;
        return yesCount >= p.minPlayers;
      };
      const ar = reached(a) ? 0 : 1;
      const br = reached(b) ? 0 : 1;
      if (ar !== br) return ar - br;
      return getSessionSortKey(a) - getSessionSortKey(b);
    }
    return getSessionSortKey(a) - getSessionSortKey(b);
  });

  const inbjudningarCount = polls.filter((p) => sessionBucketOf(p) === 'inbjudningar').length;
  const minaCount = polls.filter((p) => sessionBucketOf(p) === 'mina').length;
  const pausedCount = polls.filter((p) => sessionBucketOf(p) === 'paused').length;
  const historikCount = polls.filter((p) => sessionBucketOf(p) === 'historik').length;
  const unreadPollsCount = polls.filter((p) => p.hasUnread).length;

  if (loading) {
    return (
      <View style={s.container}>
        <View style={[s.headerRow, { paddingTop: insets.top + 8 }]}>
          <TouchableOpacity style={s.backBtn} onPress={() => router.back()}>
            <Ionicons name="chevron-back" size={28} color={Colors.textPrimary} />
          </TouchableOpacity>
        </View>
        <View style={{ flex: 1, justifyContent: 'center', alignItems: 'center' }}>
          <ActivityIndicator size="large" color={Colors.brandPrimary} />
        </View>
      </View>
    );
  }

  if (!group) {
    return (
      <View style={s.container}>
        <View style={[s.headerRow, { paddingTop: insets.top + 8 }]}>
          <TouchableOpacity style={s.backBtn} onPress={() => router.back()}>
            <Ionicons name="chevron-back" size={28} color={Colors.textPrimary} />
          </TouchableOpacity>
        </View>
        <View style={{ flex: 1, justifyContent: 'center', alignItems: 'center' }}>
          <Text style={{ color: Colors.textSecondary }}>Gruppen hittades inte</Text>
        </View>
      </View>
    );
  }

  return (
    <View style={s.container}>
      {/* Header med background image overlay */}
      <View style={s.header}>
        {group.imageUrl && (
          <>
            <Image source={{ uri: getAbsoluteUrl(group.imageUrl) }} style={s.headerBg} />
            <LinearGradient
              colors={['rgba(15, 17, 23, 0.2)', 'rgba(15, 17, 23, 0.55)', 'rgba(15, 17, 23, 0.95)', Colors.bgPrimary]}
              locations={[0, 0.5, 0.8, 1]}
              style={s.headerGradient}
            />
          </>
        )}
        <View style={[s.headerRow, { paddingTop: insets.top + 8 }]}>
          <TouchableOpacity style={s.backBtn} onPress={() => router.back()}>
            <Ionicons name="chevron-back" size={28} color={Colors.textPrimary} />
          </TouchableOpacity>
          
          <View style={s.headerTextCol}>
            <Text style={s.headerTitle} numberOfLines={1}>{group.name}</Text>
            <Text style={s.headerSubtitle}>{group.memberCount} medlemmar</Text>
          </View>
          
          <View style={s.headerRight}>
            <TouchableOpacity style={s.iconBtn}>
              <Ionicons name="notifications-outline" size={22} color={Colors.textPrimary} />
            </TouchableOpacity>
            <TouchableOpacity style={s.iconBtn}>
              <Ionicons name="people-outline" size={22} color={Colors.textPrimary} />
            </TouchableOpacity>
          </View>
        </View>
      </View>

      {/* Main Tabs */}
      <View style={s.mainTabs}>
        {['speltider', 'flode', 'league'].map((t) => (
          <TouchableOpacity key={t} style={s.mainTabBtn} onPress={() => setActiveTab(t)}>
            <View style={s.mainTabLabelContainer}>
              <Text style={[s.mainTabLabel, activeTab === t && s.mainTabLabelActive]}>
                {t === 'speltider' ? 'Speltider' : t === 'flode' ? 'Flöde' : 'Tävling'}
              </Text>
              {t === 'speltider' && unreadPollsCount > 0 && (
                <View style={s.tabBadge}><Text style={s.tabBadgeText}>{unreadPollsCount}</Text></View>
              )}
            </View>
            {activeTab === t && <View style={s.mainTabIndicator} />}
          </TouchableOpacity>
        ))}
      </View>

      {/* Content */}
      {activeTab === 'speltider' && (
        <View style={{ flex: 1 }}>
          <GroupTabs
            tabs={[
              { key: 'inbjudningar', label: 'Inbjudningar', count: inbjudningarCount },
              { key: 'mina', label: 'Mina spel', count: minaCount },
              { key: 'paused', label: 'Pausat', count: pausedCount },
              { key: 'historik', label: 'Historik', count: historikCount },
            ]}
            activeTab={sessionTab}
            onChange={setSessionTab}
          />
          <ScrollView style={s.scroll} contentContainerStyle={s.scrollContent}>
            {openSessions.length === 0 ? (
              <View style={s.emptyState}>
                <Ionicons name="calendar-outline" size={40} color={Colors.textTertiary} />
                <Text style={s.emptyTitle}>Inga spel här</Text>
              </View>
            ) : (
              openSessions.map((poll) => (
                <PollCard 
                  key={poll.id} 
                  poll={poll} 
                  onRespond={() => { /* optimistically handle respond later */ }} 
                  onPress={() => router.push(`/event/${poll.id}`)}
                />
              ))
            )}
          </ScrollView>
        </View>
      )}

      {activeTab === 'flode' && (
        <ScrollView style={s.scroll} contentContainerStyle={s.scrollContent}>
          {postsLoading ? (
            <ActivityIndicator size="large" color={Colors.brandPrimary} />
          ) : posts.length === 0 ? (
            <View style={s.emptyState}>
              <Ionicons name="images-outline" size={40} color={Colors.textTertiary} />
              <Text style={s.emptyTitle}>Inget i flödet än</Text>
            </View>
          ) : (
            posts.map(post => {
              let parsedImage = null;
              if (post.imageUrl) {
                try {
                  const arr = JSON.parse(post.imageUrl);
                  if (Array.isArray(arr) && arr.length > 0) parsedImage = arr[0];
                } catch {
                  parsedImage = post.imageUrl;
                }
              }
              return (
                <View key={post.id} style={s.postCard}>
                  <View style={s.postHeader}>
                    {post.authorImage ? (
                      <Image source={{ uri: getAbsoluteUrl(post.authorImage) }} style={s.postAvatar} />
                    ) : (
                      <View style={[s.postAvatarFallback, { backgroundColor: post.authorColor || Colors.borderSubtle }]}>
                        <Text style={s.postAvatarFallbackText}>{post.authorName?.charAt(0) || '?'}</Text>
                      </View>
                    )}
                    <View>
                      <Text style={s.postAuthor}>{post.authorName}</Text>
                      <Text style={s.postDate}>{new Date(post.createdAt).toLocaleDateString('sv-SE', { month: 'short', day: 'numeric', hour: '2-digit', minute: '2-digit' })}</Text>
                    </View>
                  </View>
                  <Text style={s.postBody}>{post.body}</Text>
                  {parsedImage && (
                    <Image source={{ uri: getAbsoluteUrl(parsedImage) }} style={s.postImage} resizeMode="cover" />
                  )}
                  <View style={s.postFooter}>
                    <TouchableOpacity style={s.postAction}>
                      <Ionicons name="heart-outline" size={20} color={Colors.textSecondary} />
                      <Text style={s.postActionText}>{post.likeCount || 0}</Text>
                    </TouchableOpacity>
                    <TouchableOpacity style={s.postAction}>
                      <Ionicons name="chatbubble-outline" size={20} color={Colors.textSecondary} />
                      <Text style={s.postActionText}>{post.commentCount || 0}</Text>
                    </TouchableOpacity>
                  </View>
                </View>
              );
            })
          )}
        </ScrollView>
      )}

      {activeTab === 'league' && (
        <ScrollView style={s.scroll} contentContainerStyle={s.scrollContent}>
          <Text style={s.sectionTitle}>Ranking</Text>
          {leagueLoading ? (
            <ActivityIndicator size="large" color={Colors.brandPrimary} />
          ) : leaderboard.length === 0 ? (
            <View style={s.emptyState}>
              <Ionicons name="trophy-outline" size={40} color={Colors.textTertiary} />
              <Text style={s.emptyTitle}>Ingen ranking än</Text>
            </View>
          ) : (
            <View style={s.leagueList}>
              {leaderboard.map(entry => {
                const isTop3 = entry.rank <= 3;
                return (
                  <View key={entry.userId} style={s.leagueRow}>
                    <Text style={[s.leagueRank, isTop3 && s.leagueRankTop]}>{entry.rank}</Text>
                    {entry.userImage ? (
                      <Image source={{ uri: getAbsoluteUrl(entry.userImage) }} style={s.leagueAvatar} />
                    ) : (
                      <View style={s.leagueAvatarFallback}>
                        <Ionicons name="person" size={16} color={Colors.textSecondary} />
                      </View>
                    )}
                    <View style={{ flex: 1 }}>
                      <Text style={s.leagueName}>{entry.userName}</Text>
                      <Text style={s.leagueDivision}>{entry.division}</Text>
                    </View>
                    <Text style={s.leagueRating}>{entry.rating}</Text>
                  </View>
                );
              })}
            </View>
          )}
        </ScrollView>
      )}
    </View>
  );
}

const s = StyleSheet.create({
  container: { flex: 1, backgroundColor: Colors.bgPrimary },
  header: {
    position: 'relative',
    overflow: 'hidden',
    backgroundColor: Colors.bgPrimary,
    borderBottomWidth: 1,
    borderBottomColor: Colors.borderSubtle
  },
  headerBg: {
    position: 'absolute',
    top: 0, left: 0, right: 0, bottom: 0,
    opacity: 0.35,
  },
  headerGradient: {
    position: 'absolute',
    top: 0, left: 0, right: 0, bottom: 0,
  },
  headerRow: {
    flexDirection: 'row', alignItems: 'center',
    paddingHorizontal: 16, paddingVertical: 12,
    minHeight: 52,
    zIndex: 1,
  },
  backBtn: { padding: 4, marginLeft: -4, marginRight: 12 },
  headerTextCol: { flex: 1 },
  headerTitle: { fontSize: 16, fontWeight: '600', color: Colors.textPrimary },
  headerSubtitle: { fontSize: 13, color: Colors.textTertiary },
  headerRight: { flexDirection: 'row', alignItems: 'center', gap: 12 },
  iconBtn: { padding: 4 },
  
  mainTabs: { flexDirection: 'row', borderBottomWidth: 1, borderBottomColor: Colors.borderSubtle, backgroundColor: Colors.bgPrimary },
  mainTabBtn: { flex: 1, alignItems: 'center', justifyContent: 'center', paddingVertical: 14, position: 'relative' },
  mainTabLabelContainer: { flexDirection: 'row', alignItems: 'center', gap: 6 },
  mainTabLabel: { fontSize: 15, fontWeight: '500', color: Colors.textSecondary },
  mainTabLabelActive: { color: Colors.textPrimary, fontWeight: '600' },
  mainTabIndicator: { position: 'absolute', bottom: -1, left: '20%', right: '20%', height: 3, backgroundColor: Colors.brandPrimary, borderRadius: 3 },
  tabBadge: { backgroundColor: Colors.brandPrimary, borderRadius: 10, minWidth: 20, height: 20, justifyContent: 'center', alignItems: 'center', paddingHorizontal: 4 },
  tabBadgeText: { color: '#fff', fontSize: 11, fontWeight: '800' },
  
  scroll: { flex: 1 },
  scrollContent: { padding: 16, gap: 16 },
  
  emptyState: { flex: 1, justifyContent: 'center', alignItems: 'center', padding: 40, gap: 12 },
  emptyTitle: { fontSize: 16, fontWeight: '500', color: Colors.textSecondary },
  
  // Feed styles
  postCard: { backgroundColor: Colors.bgSecondary, padding: 16, marginBottom: 16, borderRadius: 12, borderWidth: 1, borderColor: Colors.borderSubtle },
  postHeader: { flexDirection: 'row', alignItems: 'center', gap: 12, marginBottom: 12 },
  postAvatar: { width: 40, height: 40, borderRadius: 20 },
  postAvatarFallback: { width: 40, height: 40, borderRadius: 20, justifyContent: 'center', alignItems: 'center' },
  postAvatarFallbackText: { color: '#fff', fontSize: 16, fontWeight: '600', textTransform: 'uppercase' },
  postAuthor: { fontSize: 15, fontWeight: '600', color: Colors.textPrimary },
  postDate: { fontSize: 12, color: Colors.textTertiary, marginTop: 2 },
  postBody: { fontSize: 15, color: Colors.textPrimary, lineHeight: 22 },
  postImage: { width: '100%', height: 200, borderRadius: 8, marginTop: 12 },
  postFooter: { flexDirection: 'row', gap: 16, marginTop: 16, paddingTop: 16, borderTopWidth: 1, borderTopColor: Colors.borderSubtle },
  postAction: { flexDirection: 'row', alignItems: 'center', gap: 6 },
  postActionText: { color: Colors.textSecondary, fontSize: 14 },
  
  // League styles
  sectionTitle: { fontSize: 18, fontWeight: '700', color: Colors.textPrimary, marginBottom: 16 },
  leagueList: { gap: 8 },
  leagueRow: { flexDirection: 'row', alignItems: 'center', gap: 12, padding: 12, backgroundColor: Colors.bgSecondary, borderRadius: 12, borderWidth: 1, borderColor: Colors.borderSubtle },
  leagueRank: { fontSize: 16, fontWeight: '700', color: Colors.textTertiary, width: 24, textAlign: 'center' },
  leagueRankTop: { color: Colors.brandPrimary },
  leagueAvatar: { width: 36, height: 36, borderRadius: 18 },
  leagueAvatarFallback: { width: 36, height: 36, borderRadius: 18, backgroundColor: Colors.bgTertiary, justifyContent: 'center', alignItems: 'center' },
  leagueName: { fontSize: 15, fontWeight: '600', color: Colors.textPrimary },
  leagueDivision: { fontSize: 12, color: Colors.textTertiary, marginTop: 2, textTransform: 'uppercase', letterSpacing: 0.5 },
  leagueRating: { fontSize: 16, fontWeight: '700', color: Colors.brandPrimary },
});
