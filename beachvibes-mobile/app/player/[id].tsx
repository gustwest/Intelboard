import React, { useEffect, useState } from 'react';
import {
  View, Text, ScrollView, StyleSheet, Image,
  TouchableOpacity, ActivityIndicator, Linking,
} from 'react-native';
import { Ionicons } from '@expo/vector-icons';
import { Colors } from '../../src/theme/colors';
import { api } from '../../src/api/client';
import { SafeAreaView } from 'react-native-safe-area-context';
import { useLocalSearchParams, router } from 'expo-router';
import { LinearGradient } from 'expo-linear-gradient';

interface PlayerProfile {
  id: string;
  name: string;
  email: string | null;
  image: string | null;
  bio: string | null;
  city: string | null;
  region: string | null;
  skillLevel: string | null;
  beachinfoClass: string | null;
  memberSince: string;
  stats: {
    eventsJoined: number;
    matchesPlayed: number;
    wins: number;
    losses: number;
  };
  mutualConnections: number;
  isConnected: boolean;
}

const skillLabels: Record<string, string> = {
  ROOKIE: '⭐ Rookie',
  INTERMEDIATE: '⭐⭐ Intermediate',
  COMPETITIVE: '⭐⭐⭐ Competitive',
  ADVANCED: '⭐⭐⭐⭐ Advanced',
  ELITE: '⭐⭐⭐⭐⭐ Elite',
};

export default function PlayerDetailScreen() {
  const { id } = useLocalSearchParams<{ id: string }>();
  const [player, setPlayer] = useState<PlayerProfile | null>(null);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    if (!id) return;
    api.get<PlayerProfile>(`/api/mobile/profile/${id}`)
      .then(setPlayer)
      .catch(err => console.warn('Failed to load player:', err))
      .finally(() => setLoading(false));
  }, [id]);

  if (loading) {
    return (
      <View style={[s.container, { justifyContent: 'center', alignItems: 'center' }]}>
        <ActivityIndicator size="large" color={Colors.brandPrimary} />
      </View>
    );
  }

  if (!player) {
    return (
      <SafeAreaView style={s.container} edges={['top']}>
        <View style={s.header}>
          <TouchableOpacity onPress={() => router.back()} style={s.backBtn}>
            <Ionicons name="chevron-back" size={24} color={Colors.textPrimary} />
          </TouchableOpacity>
          <Text style={s.headerTitle}>Profil</Text>
          <View style={{ width: 32 }} />
        </View>
        <View style={{ flex: 1, justifyContent: 'center', alignItems: 'center' }}>
          <Ionicons name="person-outline" size={48} color={Colors.textTertiary} />
          <Text style={{ color: Colors.textSecondary, fontSize: 16, marginTop: 12 }}>Spelaren hittades inte</Text>
        </View>
      </SafeAreaView>
    );
  }

  return (
    <SafeAreaView style={s.container} edges={['top']}>
      <View style={s.header}>
        <TouchableOpacity onPress={() => router.back()} style={s.backBtn}>
          <Ionicons name="chevron-back" size={24} color={Colors.textPrimary} />
        </TouchableOpacity>
        <Text style={s.headerTitle} numberOfLines={1}>{player.name}</Text>
        <View style={{ width: 32 }} />
      </View>

      <ScrollView style={s.scroll} showsVerticalScrollIndicator={false}>
        <LinearGradient
          colors={['rgba(249,115,22,0.12)', 'rgba(236,72,153,0.08)', 'transparent']}
          style={s.heroGradient}
        >
          <View style={s.hero}>
            {player.image ? (
              <View style={s.avatarBorder}>
                <Image source={{ uri: player.image }} style={s.avatar} />
              </View>
            ) : (
              <LinearGradient colors={['#ea580c', '#db2777']} style={s.avatarBorder}>
                <View style={[s.avatar, { justifyContent: 'center', alignItems: 'center' }]}>
                  <Text style={{ color: '#fff', fontWeight: '800', fontSize: 32 }}>
                    {player.name?.charAt(0) || '?'}
                  </Text>
                </View>
              </LinearGradient>
            )}
            <Text style={s.name}>{player.name}</Text>
            {player.city && (
              <View style={s.locationRow}>
                <Ionicons name="location" size={14} color={Colors.brandPrimary} />
                <Text style={s.locationText}>{player.city}{player.region ? `, ${player.region}` : ''}</Text>
              </View>
            )}
            {player.skillLevel && (
              <LinearGradient colors={['rgba(249,115,22,0.15)', 'rgba(236,72,153,0.15)']} start={{x:0,y:0}} end={{x:1,y:0}} style={s.skillBadge}>
                <Text style={s.skillText}>{skillLabels[player.skillLevel] || player.skillLevel}</Text>
              </LinearGradient>
            )}
            {player.bio && <Text style={s.bio}>{player.bio}</Text>}
            <Text style={s.memberSince}>
              Medlem sedan {player.memberSince ? new Date(player.memberSince).toLocaleDateString('sv-SE', { month: 'long', year: 'numeric' }) : '–'}
            </Text>
          </View>
        </LinearGradient>

        {/* Action buttons */}
        <View style={s.actionRow}>
          <TouchableOpacity style={s.actionBtn}>
            <LinearGradient colors={['#ea580c', '#db2777']} start={{x:0,y:0}} end={{x:1,y:0}} style={s.actionBtnGradient}>
              <Ionicons name={player.isConnected ? 'checkmark-circle' : 'person-add-outline'} size={18} color="#fff" />
              <Text style={s.actionBtnText}>{player.isConnected ? 'Kontakt' : 'Lägg till'}</Text>
            </LinearGradient>
          </TouchableOpacity>
          <TouchableOpacity style={s.actionBtnOutline}>
            <Ionicons name="chatbubble-outline" size={18} color={Colors.brandPrimary} />
            <Text style={s.actionBtnOutlineText}>Meddelande</Text>
          </TouchableOpacity>
        </View>

        {/* Stats */}
        <View style={s.statsGrid}>
          {[
            { value: player.stats.eventsJoined, label: 'Events', icon: 'calendar', color: Colors.brandPrimary },
            { value: player.stats.matchesPlayed, label: 'Matcher', icon: 'tennisball', color: Colors.brandAccent },
            { value: player.stats.wins, label: 'Vinster', icon: 'trophy', color: Colors.success },
            { value: player.stats.losses, label: 'Förluster', icon: 'close-circle', color: Colors.error },
          ].map((stat, i) => (
            <View key={i} style={s.statItem}>
              <Ionicons name={stat.icon as any} size={18} color={stat.color} />
              <Text style={[s.statNumber, { color: stat.color }]}>{stat.value}</Text>
              <Text style={s.statLabel}>{stat.label}</Text>
            </View>
          ))}
        </View>

        {/* Details */}
        <View style={s.section}>
          {player.beachinfoClass && (
            <View style={s.detailRow}>
              <View style={[s.detailIcon, { backgroundColor: 'rgba(6,182,212,0.1)' }]}>
                <Ionicons name="ribbon-outline" size={16} color={Colors.brandAccent} />
              </View>
              <Text style={s.detailLabel}>Klass</Text>
              <Text style={s.detailValue}>{player.beachinfoClass}</Text>
            </View>
          )}
          {player.mutualConnections > 0 && (
            <View style={s.detailRow}>
              <View style={[s.detailIcon, { backgroundColor: 'rgba(34,197,94,0.1)' }]}>
                <Ionicons name="people-outline" size={16} color={Colors.success} />
              </View>
              <Text style={s.detailLabel}>Gemensamma</Text>
              <Text style={s.detailValue}>{player.mutualConnections} kontakter</Text>
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
  header: {
    flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between',
    paddingHorizontal: 12, paddingVertical: 10,
    borderBottomWidth: 1, borderBottomColor: Colors.borderSubtle,
  },
  backBtn: { padding: 4 },
  headerTitle: { fontSize: 16, fontWeight: '700', color: Colors.textPrimary, flex: 1, textAlign: 'center' },
  scroll: { flex: 1 },
  heroGradient: { paddingTop: 8 },
  hero: { alignItems: 'center', paddingVertical: 24, paddingHorizontal: 16, gap: 8 },
  avatarBorder: { width: 96, height: 96, borderRadius: 48, justifyContent: 'center', alignItems: 'center', padding: 3 },
  avatar: { width: 90, height: 90, borderRadius: 45, overflow: 'hidden', backgroundColor: Colors.bgPrimary },
  name: { fontSize: 24, fontWeight: '800', color: Colors.textPrimary },
  locationRow: { flexDirection: 'row', alignItems: 'center', gap: 4 },
  locationText: { fontSize: 14, color: Colors.textSecondary },
  skillBadge: { paddingHorizontal: 14, paddingVertical: 6, borderRadius: 100, marginTop: 4 },
  skillText: { fontSize: 13, color: Colors.brandPrimary, fontWeight: '600' },
  bio: { fontSize: 14, color: Colors.textSecondary, textAlign: 'center', lineHeight: 20, marginTop: 4 },
  memberSince: { fontSize: 12, color: Colors.textTertiary, marginTop: 4 },
  actionRow: { flexDirection: 'row', gap: 10, paddingHorizontal: 16, paddingVertical: 12 },
  actionBtn: { flex: 1, borderRadius: 14, overflow: 'hidden' },
  actionBtnGradient: { flexDirection: 'row', alignItems: 'center', justifyContent: 'center', gap: 6, paddingVertical: 14, borderRadius: 14 },
  actionBtnText: { color: '#fff', fontWeight: '700', fontSize: 14 },
  actionBtnOutline: { flex: 1, flexDirection: 'row', alignItems: 'center', justifyContent: 'center', gap: 6, paddingVertical: 14, borderRadius: 14, borderWidth: 1, borderColor: Colors.brandPrimary },
  actionBtnOutlineText: { color: Colors.brandPrimary, fontWeight: '700', fontSize: 14 },
  statsGrid: { flexDirection: 'row', paddingHorizontal: 16, gap: 8, paddingBottom: 16 },
  statItem: { flex: 1, backgroundColor: Colors.bgSecondary, borderRadius: 16, padding: 14, alignItems: 'center', gap: 4, borderWidth: 1, borderColor: Colors.borderSubtle },
  statNumber: { fontSize: 22, fontWeight: '800' },
  statLabel: { fontSize: 11, color: Colors.textTertiary, fontWeight: '600' },
  section: { paddingHorizontal: 16, borderTopWidth: 1, borderTopColor: Colors.borderSubtle, paddingTop: 16 },
  detailRow: { flexDirection: 'row', alignItems: 'center', gap: 12, paddingVertical: 12, borderBottomWidth: 1, borderBottomColor: Colors.borderSubtle },
  detailIcon: { width: 32, height: 32, borderRadius: 10, justifyContent: 'center', alignItems: 'center' },
  detailLabel: { fontSize: 14, color: Colors.textSecondary, width: 90 },
  detailValue: { flex: 1, fontSize: 14, color: Colors.textPrimary, fontWeight: '500' },
});
