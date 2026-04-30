import React, { useEffect, useState, useCallback } from 'react';
import {
  View, Text, ScrollView, StyleSheet, Image,
  TouchableOpacity, RefreshControl, ActivityIndicator,
  TextInput, Linking,
} from 'react-native';
import { Ionicons } from '@expo/vector-icons';
import { Colors } from '../../src/theme/colors';
import { api } from '../../src/api/client';
import { SafeAreaView } from 'react-native-safe-area-context';
import { AppHeader } from '../../src/components/AppHeader';
import { LinearGradient } from 'expo-linear-gradient';

interface RankingPlayer { rank: number; name: string; points: number; level: string; image: string | null; }
interface Tournament { id: string; name: string; category: string; date: string; location: string; classes: string[]; teamCount: number; deadline: string; externalUrl: string; }
interface EloEntry { rank: number; name: string; elo: number; wins: number; losses: number; image: string | null; }

const TABS = [
  { key: 'ranking', label: '🇸🇪 Ranking' },
  { key: 'tournaments', label: '🏆 Turneringar' },
  { key: 'series', label: '⚔️ Seriespel' },
] as const;

const GENDER_FILTERS = ['Alla', 'Herrar', 'Damer'];
const LEVEL_FILTERS = ['Alla', 'Elite', 'Advanced', 'Competitive', 'Intermediate', 'Rookie'];

export default function CompeteScreen() {
  const [tab, setTab] = useState<string>('ranking');
  const [search, setSearch] = useState('');
  const [gender, setGender] = useState('Alla');
  const [level, setLevel] = useState('Alla');
  const [rankings, setRankings] = useState<RankingPlayer[]>([]);
  const [tournaments, setTournaments] = useState<Tournament[]>([]);
  const [elo, setElo] = useState<EloEntry[]>([]);
  const [loading, setLoading] = useState(true);
  const [notifCount, setNotifCount] = useState(0);

  const loadData = useCallback(async () => {
    try {
      const [data, countData] = await Promise.all([
        api.get<{ rankings?: RankingPlayer[]; tournaments?: Tournament[]; elo?: EloEntry[] }>(
          `/api/mobile/compete?tab=${tab}&gender=${gender}&level=${level}&q=${search}`
        ),
        api.get<{ count: number }>('/api/mobile/notifications/count').catch(() => ({ count: 0 })),
      ]);
      if (data.rankings) setRankings(data.rankings);
      if (data.tournaments) setTournaments(data.tournaments);
      if (data.elo) setElo(data.elo);
      setNotifCount(countData.count || 0);
    } catch (err) { console.warn('Failed to load compete:', err); }
    finally { setLoading(false); }
  }, [tab, gender, level, search]);

  useEffect(() => { setLoading(true); loadData(); }, [loadData]);

  const renderMedal = (rank: number) => {
    if (rank === 1) return <Text style={s.medal}>🥇</Text>;
    if (rank === 2) return <Text style={s.medal}>🥈</Text>;
    if (rank === 3) return <Text style={s.medal}>🥉</Text>;
    return <Text style={[s.cellText, { width: 36, fontWeight: '700' }]}>{rank}</Text>;
  };

  return (
    <SafeAreaView style={s.container} edges={['top']}>
      <AppHeader notificationCount={notifCount} />

      {/* Tabs */}
      <ScrollView horizontal showsHorizontalScrollIndicator={false} contentContainerStyle={s.tabsRow}>
        {TABS.map(t => (
          <TouchableOpacity key={t.key} style={[s.tabPill, tab === t.key && s.tabPillActive]} onPress={() => setTab(t.key)}>
            {tab === t.key ? (
              <LinearGradient colors={['#ea580c', '#db2777']} start={{x:0,y:0}} end={{x:1,y:0}} style={s.tabPillGradient}>
                <Text style={s.tabPillTextActive}>{t.label}</Text>
              </LinearGradient>
            ) : (
              <Text style={s.tabPillText}>{t.label}</Text>
            )}
          </TouchableOpacity>
        ))}
      </ScrollView>

      <ScrollView style={s.scroll} showsVerticalScrollIndicator={false}>
        {loading ? (
          <View style={s.center}><ActivityIndicator size="large" color={Colors.brandPrimary} /></View>
        ) : tab === 'ranking' ? (
          <View>
            {/* Search */}
            <View style={s.searchBar}>
              <Ionicons name="search" size={18} color={Colors.textTertiary} />
              <TextInput style={s.searchInput} placeholder="Sök spelare..." placeholderTextColor={Colors.textTertiary} value={search} onChangeText={setSearch} returnKeyType="search" />
            </View>

            {/* Gender filter */}
            <ScrollView horizontal showsHorizontalScrollIndicator={false} contentContainerStyle={s.filterRow}>
              {GENDER_FILTERS.map(g => (
                <TouchableOpacity key={g} style={[s.filterChip, gender === g && s.filterChipActive]} onPress={() => setGender(g)}>
                  <Text style={[s.filterChipText, gender === g && s.filterChipTextActive]}>{g}</Text>
                </TouchableOpacity>
              ))}
            </ScrollView>

            {/* Level filter */}
            <ScrollView horizontal showsHorizontalScrollIndicator={false} contentContainerStyle={s.filterRow}>
              {LEVEL_FILTERS.map(l => (
                <TouchableOpacity key={l} style={[s.filterChip, level === l && s.filterChipActive]} onPress={() => setLevel(l)}>
                  <Text style={[s.filterChipText, level === l && s.filterChipTextActive]}>{l}</Text>
                </TouchableOpacity>
              ))}
            </ScrollView>

            {/* Ranking table */}
            <View style={s.tableHeader}>
              <Text style={[s.tableCol, { width: 40 }]}>#</Text>
              <Text style={[s.tableCol, { flex: 1 }]}>Spelare</Text>
              <Text style={[s.tableCol, { width: 60, textAlign: 'right' }]}>Poäng</Text>
              <Text style={[s.tableCol, { width: 80, textAlign: 'right' }]}>Nivå</Text>
            </View>
            {rankings.map(p => (
              <View key={p.rank} style={[s.tableRow, p.rank <= 3 && s.topRow]}>
                {renderMedal(p.rank)}
                <View style={{ flex: 1, flexDirection: 'row', alignItems: 'center', gap: 8 }}>
                  {p.image ? <Image source={{ uri: p.image }} style={s.rankAvatar} /> : (
                    <LinearGradient colors={['#ea580c', '#db2777']} style={[s.rankAvatar, { justifyContent: 'center', alignItems: 'center' }]}>
                      <Text style={{ fontSize: 10, color: '#fff', fontWeight: '700' }}>{p.name?.charAt(0)}</Text>
                    </LinearGradient>
                  )}
                  <Text style={[s.cellText, p.rank <= 3 && { fontWeight: '700' }]} numberOfLines={1}>{p.name}</Text>
                </View>
                <Text style={[s.cellText, { width: 60, textAlign: 'right', fontWeight: '700', color: Colors.brandPrimary }]}>{p.points}</Text>
                <Text style={[s.cellLevel, { width: 80, textAlign: 'right' }]}>{p.level}</Text>
              </View>
            ))}
            {rankings.length === 0 && <Text style={s.noData}>Inga spelare hittades</Text>}
          </View>
        ) : tab === 'tournaments' ? (
          <View style={s.tournamentList}>
            {tournaments.map(t => (
              <TouchableOpacity key={t.id} style={s.tournCard} onPress={() => t.externalUrl && Linking.openURL(t.externalUrl)}>
                <Text style={s.tournName}>{t.name}</Text>
                <View style={s.tournCategoryBadge}>
                  <Text style={s.tournCategory}>{t.category}</Text>
                </View>
                <View style={s.tournMeta}>
                  <Ionicons name="calendar-outline" size={14} color={Colors.brandPrimary} />
                  <Text style={s.tournMetaText}>{t.date}</Text>
                </View>
                <View style={s.tournMeta}>
                  <Ionicons name="location-outline" size={14} color={Colors.brandPink} />
                  <Text style={s.tournMetaText}>{t.location}</Text>
                </View>
                <View style={s.tournChips}>
                  {t.classes.map((c, i) => <View key={i} style={s.classChip}><Text style={s.classChipText}>{c}</Text></View>)}
                </View>
                <View style={s.tournFooter}>
                  <Text style={s.tournTeams}>{t.teamCount} lag</Text>
                  <Text style={s.tournDeadline}>Deadline: {t.deadline}</Text>
                </View>
                <View style={s.externalLink}>
                  <Ionicons name="open-outline" size={14} color={Colors.brandPrimary} />
                  <Text style={s.externalLinkText}>Öppna i Profixio</Text>
                </View>
              </TouchableOpacity>
            ))}
            {tournaments.length === 0 && (
              <View style={s.center}>
                <View style={s.emptyIconWrap}>
                  <Ionicons name="trophy-outline" size={40} color={Colors.brandPrimary} />
                </View>
                <Text style={s.noData}>Inga turneringar just nu</Text>
              </View>
            )}
          </View>
        ) : (
          <View style={s.seriesSection}>
            <LinearGradient colors={['rgba(249,115,22,0.08)', 'rgba(236,72,153,0.08)']} style={s.infoCard}>
              <Text style={s.infoTitle}>⚔️ Så funkar seriespel</Text>
              <Text style={s.infoText}>Utmana andra spelare i BeachVibes ELO-systemet. Vinn matcher och klättra på rankingen!</Text>
            </LinearGradient>
            <View style={s.seriesBtns}>
              <TouchableOpacity style={s.seriesBtn}>
                <LinearGradient colors={['#ea580c', '#db2777']} start={{x:0,y:0}} end={{x:1,y:0}} style={s.seriesBtnGradient}>
                  <Ionicons name="add-circle-outline" size={18} color="#fff" />
                  <Text style={s.seriesBtnText}>Skapa seriespel</Text>
                </LinearGradient>
              </TouchableOpacity>
              <TouchableOpacity style={s.seriesBtn}>
                <LinearGradient colors={['#06b6d4', '#3b82f6']} start={{x:0,y:0}} end={{x:1,y:0}} style={s.seriesBtnGradient}>
                  <Ionicons name="search" size={18} color="#fff" />
                  <Text style={s.seriesBtnText}>Hitta match</Text>
                </LinearGradient>
              </TouchableOpacity>
            </View>

            {/* ELO Leaderboard */}
            <Text style={s.eloTitle}>🏆 BeachVibes ELO</Text>
            <View style={s.tableHeader}>
              <Text style={[s.tableCol, { width: 36 }]}>#</Text>
              <Text style={[s.tableCol, { flex: 1 }]}>Spelare</Text>
              <Text style={[s.tableCol, { width: 50, textAlign: 'right' }]}>ELO</Text>
              <Text style={[s.tableCol, { width: 50, textAlign: 'right' }]}>W-L</Text>
            </View>
            {elo.map(e => (
              <View key={e.rank} style={[s.tableRow, e.rank <= 3 && s.topRow]}>
                {renderMedal(e.rank)}
                <View style={{ flex: 1, flexDirection: 'row', alignItems: 'center', gap: 8 }}>
                  {e.image ? <Image source={{ uri: e.image }} style={s.rankAvatar} /> : (
                    <LinearGradient colors={['#ea580c', '#db2777']} style={[s.rankAvatar, { justifyContent: 'center', alignItems: 'center' }]}>
                      <Text style={{ fontSize: 10, color: '#fff', fontWeight: '700' }}>{e.name?.charAt(0)}</Text>
                    </LinearGradient>
                  )}
                  <Text style={s.cellText} numberOfLines={1}>{e.name}</Text>
                </View>
                <Text style={[s.cellText, { width: 50, textAlign: 'right', fontWeight: '700', color: Colors.brandPrimary }]}>{e.elo}</Text>
                <Text style={[s.cellText, { width: 50, textAlign: 'right' }]}>{e.wins}-{e.losses}</Text>
              </View>
            ))}
            {elo.length === 0 && <Text style={s.noData}>Inga ELO-matcher ännu</Text>}
          </View>
        )}
        <View style={{ height: 100 }} />
      </ScrollView>
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
  tabsRow: { paddingHorizontal: 16, gap: 8, paddingVertical: 10, borderBottomWidth: 1, borderBottomColor: Colors.borderSubtle },
  tabPill: { borderRadius: 100, backgroundColor: Colors.bgTertiary, overflow: 'hidden' },
  tabPillActive: { backgroundColor: 'transparent' },
  tabPillGradient: { paddingHorizontal: 16, paddingVertical: 8, borderRadius: 100 },
  tabPillText: { fontSize: 13, fontWeight: '600', color: Colors.textSecondary, paddingHorizontal: 16, paddingVertical: 8 },
  tabPillTextActive: { color: '#fff', fontSize: 13, fontWeight: '600' },
  searchBar: { flexDirection: 'row', alignItems: 'center', gap: 8, backgroundColor: Colors.bgSecondary, marginHorizontal: 16, marginTop: 12, paddingHorizontal: 14, paddingVertical: 10, borderRadius: 14, borderWidth: 1, borderColor: Colors.borderSubtle },
  searchInput: { flex: 1, fontSize: 14, color: Colors.textPrimary },
  filterRow: { paddingHorizontal: 16, gap: 6, paddingVertical: 8 },
  filterChip: { paddingHorizontal: 12, paddingVertical: 6, borderRadius: 100, backgroundColor: Colors.bgTertiary },
  filterChipActive: { backgroundColor: Colors.brandPrimary },
  filterChipText: { fontSize: 12, fontWeight: '600', color: Colors.textSecondary },
  filterChipTextActive: { color: '#fff' },
  tableHeader: { flexDirection: 'row', paddingHorizontal: 16, paddingVertical: 10, borderBottomWidth: 1, borderBottomColor: Colors.borderSubtle },
  tableCol: { fontSize: 11, fontWeight: '700', color: Colors.textTertiary, textTransform: 'uppercase' },
  tableRow: { flexDirection: 'row', alignItems: 'center', paddingHorizontal: 16, paddingVertical: 10, borderBottomWidth: 1, borderBottomColor: Colors.borderSubtle },
  topRow: { backgroundColor: 'rgba(249,115,22,0.04)' },
  cellText: { fontSize: 14, color: Colors.textPrimary },
  cellLevel: { fontSize: 12, color: Colors.textSecondary },
  medal: { width: 36, fontSize: 18, textAlign: 'center' },
  rankAvatar: { width: 28, height: 28, borderRadius: 14, overflow: 'hidden' },
  noData: { fontSize: 14, color: Colors.textTertiary, textAlign: 'center', paddingVertical: 40 },
  tournamentList: { padding: 16, gap: 12 },
  tournCard: { backgroundColor: Colors.bgSecondary, borderRadius: 16, padding: 16, gap: 6, borderWidth: 1, borderColor: Colors.borderSubtle },
  tournName: { fontSize: 16, fontWeight: '700', color: Colors.textPrimary },
  tournCategoryBadge: { alignSelf: 'flex-start', backgroundColor: 'rgba(249,115,22,0.12)', paddingHorizontal: 10, paddingVertical: 3, borderRadius: 100 },
  tournCategory: { fontSize: 12, color: Colors.brandPrimary, fontWeight: '600' },
  tournMeta: { flexDirection: 'row', alignItems: 'center', gap: 6 },
  tournMetaText: { fontSize: 13, color: Colors.textSecondary },
  tournChips: { flexDirection: 'row', flexWrap: 'wrap', gap: 4, marginTop: 4 },
  classChip: { backgroundColor: 'rgba(6,182,212,0.1)', paddingHorizontal: 8, paddingVertical: 3, borderRadius: 100 },
  classChipText: { fontSize: 11, color: Colors.brandAccent, fontWeight: '600' },
  tournFooter: { flexDirection: 'row', justifyContent: 'space-between', marginTop: 4 },
  tournTeams: { fontSize: 12, color: Colors.textSecondary, fontWeight: '600' },
  tournDeadline: { fontSize: 12, color: Colors.error, fontWeight: '600' },
  externalLink: { flexDirection: 'row', alignItems: 'center', gap: 4, marginTop: 6 },
  externalLinkText: { fontSize: 13, color: Colors.brandPrimary, fontWeight: '600' },
  seriesSection: { padding: 16, gap: 16 },
  infoCard: { padding: 18, borderRadius: 18, borderWidth: 1, borderColor: Colors.borderSubtle, gap: 8 },
  infoTitle: { fontSize: 16, fontWeight: '700', color: Colors.textPrimary },
  infoText: { fontSize: 14, color: Colors.textSecondary, lineHeight: 20 },
  seriesBtns: { flexDirection: 'row', gap: 10 },
  seriesBtn: { flex: 1, borderRadius: 14, overflow: 'hidden' },
  seriesBtnGradient: { flexDirection: 'row', alignItems: 'center', justifyContent: 'center', gap: 6, paddingVertical: 14, borderRadius: 14 },
  seriesBtnText: { color: '#fff', fontWeight: '700', fontSize: 14 },
  eloTitle: { fontSize: 18, fontWeight: '800', color: Colors.textPrimary, marginTop: 8 },
});
