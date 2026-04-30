import React, { useEffect, useState, useCallback } from 'react';
import {
  View, Text, ScrollView, StyleSheet, Image,
  TouchableOpacity, RefreshControl, ActivityIndicator,
} from 'react-native';
import { Ionicons } from '@expo/vector-icons';
import { Colors } from '../src/theme/colors';
import { api } from '../src/api/client';
import { useAuth } from '../src/auth/AuthProvider';
import { SafeAreaView } from 'react-native-safe-area-context';
import { AppHeader } from '../src/components/AppHeader';
import { LinearGradient } from 'expo-linear-gradient';

interface ProfileData {
  id: string;
  name: string;
  email: string;
  image: string | null;
  bio: string | null;
  city: string | null;
  region: string | null;
  skillLevel: string | null;
  beachinfoClass: string | null;
  memberSince: string;
  stats: {
    eventsJoined: number;
    eventsCreated: number;
    matchesPlayed: number;
    wins: number;
    losses: number;
    connections: number;
  };
  courtName: string | null;
  selfRating: number | null;
}

const skillLabels: Record<string, string> = {
  ROOKIE: '⭐ Rookie',
  INTERMEDIATE: '⭐⭐ Intermediate',
  COMPETITIVE: '⭐⭐⭐ Competitive',
  ADVANCED: '⭐⭐⭐⭐ Advanced',
  ELITE: '⭐⭐⭐⭐⭐ Elite',
};

export default function ProfileScreen() {
  const { user } = useAuth();
  const [profile, setProfile] = useState<ProfileData | null>(null);
  const [loading, setLoading] = useState(true);
  const [refreshing, setRefreshing] = useState(false);

  const loadProfile = useCallback(async () => {
    try {
      const data = await api.get<ProfileData>('/api/mobile/profile');
      setProfile(data);
    } catch (err) {
      console.warn('Failed to load profile:', err);
    } finally {
      setLoading(false);
      setRefreshing(false);
    }
  }, []);

  useEffect(() => { loadProfile(); }, [loadProfile]);

  if (loading) {
    return (
      <SafeAreaView style={s.container} edges={['top']}>
        <AppHeader title="Min profil" showBack />
        <View style={s.center}>
          <ActivityIndicator size="large" color={Colors.brandPrimary} />
        </View>
      </SafeAreaView>
    );
  }

  const p = profile;

  return (
    <SafeAreaView style={s.container} edges={['top']}>
      <AppHeader title="Min profil" showBack />

      <ScrollView
        style={s.scroll}
        showsVerticalScrollIndicator={false}
        refreshControl={
          <RefreshControl refreshing={refreshing} onRefresh={() => { setRefreshing(true); loadProfile(); }} tintColor={Colors.brandPrimary} />
        }
      >
        {/* Hero section with gradient background */}
        <LinearGradient
          colors={['rgba(249,115,22,0.12)', 'rgba(236,72,153,0.08)', 'transparent']}
          style={s.heroGradient}
        >
          <View style={s.hero}>
            {p?.image ? (
              <View style={s.avatarBorder}>
                <Image source={{ uri: p.image }} style={s.avatar} />
              </View>
            ) : (
              <LinearGradient colors={['#ea580c', '#db2777']} style={s.avatarBorder}>
                <View style={s.avatar}>
                  <Text style={{ color: '#fff', fontWeight: '800', fontSize: 32 }}>
                    {p?.name?.charAt(0) || user?.name?.charAt(0) || '?'}
                  </Text>
                </View>
              </LinearGradient>
            )}
            <Text style={s.name}>{p?.name || user?.name}</Text>
            {p?.city && (
              <View style={s.locationRow}>
                <Ionicons name="location" size={14} color={Colors.brandPrimary} />
                <Text style={s.locationText}>{p.city}{p.region ? `, ${p.region}` : ''}</Text>
              </View>
            )}
            {p?.skillLevel && (
              <LinearGradient colors={['rgba(249,115,22,0.15)', 'rgba(236,72,153,0.15)']} start={{x:0,y:0}} end={{x:1,y:0}} style={s.skillBadge}>
                <Text style={s.skillText}>{skillLabels[p.skillLevel] || p.skillLevel}</Text>
              </LinearGradient>
            )}
            {p?.bio && <Text style={s.bio}>{p.bio}</Text>}
            <Text style={s.memberSince}>
              Medlem sedan {p?.memberSince ? new Date(p.memberSince).toLocaleDateString('sv-SE', { month: 'long', year: 'numeric' }) : '–'}
            </Text>
          </View>
        </LinearGradient>

        {/* Stats grid */}
        {p?.stats && (
          <View style={s.statsGrid}>
            {[
              { value: p.stats.eventsJoined, label: 'Events', icon: 'calendar', color: Colors.brandPrimary },
              { value: p.stats.matchesPlayed, label: 'Matcher', icon: 'tennisball', color: Colors.brandAccent },
              { value: p.stats.wins, label: 'Vinster', icon: 'trophy', color: Colors.success },
              { value: p.stats.losses, label: 'Förluster', icon: 'close-circle', color: Colors.error },
              { value: p.stats.connections, label: 'Kontakter', icon: 'people', color: Colors.brandPink },
              { value: p.stats.eventsCreated, label: 'Skapade', icon: 'add-circle', color: Colors.warning },
            ].map((stat, i) => (
              <View key={i} style={s.statItem}>
                <Ionicons name={stat.icon as any} size={18} color={stat.color} />
                <Text style={[s.statNumber, { color: stat.color }]}>{stat.value}</Text>
                <Text style={s.statLabel}>{stat.label}</Text>
              </View>
            ))}
          </View>
        )}

        {/* Details */}
        <View style={s.section}>
          <Text style={s.sectionTitle}>Detaljer</Text>

          <View style={s.detailRow}>
            <View style={[s.detailIcon, { backgroundColor: 'rgba(249,115,22,0.1)' }]}>
              <Ionicons name="mail-outline" size={16} color={Colors.brandPrimary} />
            </View>
            <Text style={s.detailLabel}>Email</Text>
            <Text style={s.detailValue}>{p?.email || user?.email}</Text>
          </View>

          {p?.beachinfoClass && (
            <View style={s.detailRow}>
              <View style={[s.detailIcon, { backgroundColor: 'rgba(6,182,212,0.1)' }]}>
                <Ionicons name="ribbon-outline" size={16} color={Colors.brandAccent} />
              </View>
              <Text style={s.detailLabel}>Klass</Text>
              <Text style={s.detailValue}>{p.beachinfoClass}</Text>
            </View>
          )}

          {p?.courtName && (
            <View style={s.detailRow}>
              <View style={[s.detailIcon, { backgroundColor: 'rgba(236,72,153,0.1)' }]}>
                <Ionicons name="location-outline" size={16} color={Colors.brandPink} />
              </View>
              <Text style={s.detailLabel}>Hembana</Text>
              <Text style={s.detailValue}>{p.courtName}</Text>
            </View>
          )}

          {p?.selfRating !== null && p?.selfRating !== undefined && (
            <View style={s.detailRow}>
              <View style={[s.detailIcon, { backgroundColor: 'rgba(251,191,36,0.1)' }]}>
                <Ionicons name="star-outline" size={16} color={Colors.warning} />
              </View>
              <Text style={s.detailLabel}>Self-rating</Text>
              <Text style={s.detailValue}>{'⭐'.repeat(p.selfRating)}</Text>
            </View>
          )}
        </View>

        <View style={{ height: 120 }} />
      </ScrollView>
    </SafeAreaView>
  );
}

const s = StyleSheet.create({
  container: { flex: 1, backgroundColor: Colors.bgPrimary },
  scroll: { flex: 1 },
  center: { flex: 1, justifyContent: 'center', alignItems: 'center' },

  heroGradient: { paddingTop: 8 },
  hero: { alignItems: 'center', paddingVertical: 24, paddingHorizontal: 16, gap: 8 },
  avatarBorder: { 
    width: 96, height: 96, borderRadius: 48, 
    justifyContent: 'center', alignItems: 'center',
    padding: 3,
  },
  avatar: { 
    width: 90, height: 90, borderRadius: 45, overflow: 'hidden',
    backgroundColor: Colors.bgPrimary, justifyContent: 'center', alignItems: 'center',
  },
  name: { fontSize: 24, fontWeight: '800', color: Colors.textPrimary },
  locationRow: { flexDirection: 'row', alignItems: 'center', gap: 4 },
  locationText: { fontSize: 14, color: Colors.textSecondary },
  skillBadge: {
    paddingHorizontal: 14, paddingVertical: 6,
    borderRadius: 100, marginTop: 4,
  },
  skillText: { fontSize: 13, color: Colors.brandPrimary, fontWeight: '600' },
  bio: { fontSize: 14, color: Colors.textSecondary, textAlign: 'center', lineHeight: 20, marginTop: 4 },
  memberSince: { fontSize: 12, color: Colors.textTertiary, marginTop: 4 },

  statsGrid: {
    flexDirection: 'row', flexWrap: 'wrap', justifyContent: 'center',
    paddingHorizontal: 16, paddingBottom: 16, gap: 8,
  },
  statItem: {
    width: '30%', backgroundColor: Colors.bgSecondary,
    borderRadius: 16, padding: 14, alignItems: 'center', gap: 4,
    borderWidth: 1, borderColor: Colors.borderSubtle,
  },
  statNumber: { fontSize: 22, fontWeight: '800' },
  statLabel: { fontSize: 11, color: Colors.textTertiary, fontWeight: '600', marginTop: 2 },

  section: {
    paddingHorizontal: 16, paddingTop: 16,
    borderTopWidth: 1, borderTopColor: Colors.borderSubtle,
  },
  sectionTitle: { fontSize: 16, fontWeight: '700', color: Colors.textPrimary, marginBottom: 12 },
  detailRow: {
    flexDirection: 'row', alignItems: 'center', gap: 12,
    paddingVertical: 12, borderBottomWidth: 1, borderBottomColor: Colors.borderSubtle,
  },
  detailIcon: {
    width: 32, height: 32, borderRadius: 10,
    justifyContent: 'center', alignItems: 'center',
  },
  detailLabel: { fontSize: 14, color: Colors.textSecondary, width: 80 },
  detailValue: { flex: 1, fontSize: 14, color: Colors.textPrimary, fontWeight: '500' },
});
