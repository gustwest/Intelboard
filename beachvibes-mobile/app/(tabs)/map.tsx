import React, { useState } from 'react';
import { View, Text, ScrollView, StyleSheet, TouchableOpacity, Linking } from 'react-native';
import { Ionicons } from '@expo/vector-icons';
import { Colors } from '../../src/theme/colors';
import { SafeAreaView } from 'react-native-safe-area-context';
import { AppHeader } from '../../src/components/AppHeader';
import { LinearGradient } from 'expo-linear-gradient';

const FILTERS = [
  { key: 'courts', label: '🏐 Banor', icon: 'tennisball-outline' as const },
  { key: 'clubs', label: '🏢 Klubbar', icon: 'business-outline' as const },
  { key: 'events', label: '🏆 Events', icon: 'trophy-outline' as const },
];

export default function MapScreen() {
  const [activeFilter, setActiveFilter] = useState('courts');

  return (
    <SafeAreaView style={s.container} edges={['top']}>
      <AppHeader notificationCount={0} />

      {/* Filter pills */}
      <ScrollView horizontal showsHorizontalScrollIndicator={false} contentContainerStyle={s.filterRow}>
        {FILTERS.map(f => (
          <TouchableOpacity
            key={f.key}
            style={[s.filterPill, activeFilter === f.key && s.filterPillActive]}
            onPress={() => setActiveFilter(f.key)}
          >
            {activeFilter === f.key ? (
              <LinearGradient colors={['#ea580c', '#db2777']} start={{x:0,y:0}} end={{x:1,y:0}} style={s.filterPillGradient}>
                <Text style={s.filterPillTextActive}>{f.label}</Text>
              </LinearGradient>
            ) : (
              <Text style={s.filterPillText}>{f.label}</Text>
            )}
          </TouchableOpacity>
        ))}
      </ScrollView>

      {/* Map placeholder — react-native-maps requires EAS Build (native module) */}
      <View style={s.mapPlaceholder}>
        <View style={s.iconWrap}>
          <LinearGradient colors={['rgba(249,115,22,0.15)', 'rgba(236,72,153,0.15)']} style={s.iconGradient}>
            <Ionicons name="map" size={56} color={Colors.brandPrimary} />
          </LinearGradient>
        </View>
        <Text style={s.mapTitle}>Karta</Text>
        <Text style={s.mapSubtitle}>
          Interaktiv karta med banor, klubbar och events kräver native build (EAS Build).
        </Text>
        <Text style={s.mapHint}>
          Under tiden kan du öppna kartan i webbläsaren:
        </Text>
        <TouchableOpacity
          style={s.openWebBtn}
          onPress={() => Linking.openURL('https://beachvibes.app/map')}
        >
          <LinearGradient colors={['#ea580c', '#db2777']} start={{x:0,y:0}} end={{x:1,y:0}} style={s.openWebBtnGradient}>
            <Ionicons name="open-outline" size={16} color="#fff" />
            <Text style={s.openWebBtnText}>Öppna karta i webbläsaren</Text>
          </LinearGradient>
        </TouchableOpacity>

        {/* Quick stats */}
        <View style={s.statsRow}>
          <View style={s.statCard}>
            <Ionicons name="tennisball" size={20} color={Colors.brandPrimary} />
            <Text style={s.statNumber}>200+</Text>
            <Text style={s.statLabel}>Banor</Text>
          </View>
          <View style={s.statCard}>
            <Ionicons name="business" size={20} color={Colors.brandAccent} />
            <Text style={s.statNumber}>80+</Text>
            <Text style={s.statLabel}>Klubbar</Text>
          </View>
          <View style={s.statCard}>
            <Ionicons name="location" size={20} color={Colors.brandPink} />
            <Text style={s.statNumber}>50+</Text>
            <Text style={s.statLabel}>Städer</Text>
          </View>
        </View>
      </View>
    </SafeAreaView>
  );
}

const s = StyleSheet.create({
  container: { flex: 1, backgroundColor: Colors.bgPrimary },
  filterRow: { paddingHorizontal: 16, gap: 8, paddingVertical: 10, borderBottomWidth: 1, borderBottomColor: Colors.borderSubtle },
  filterPill: { borderRadius: 100, backgroundColor: Colors.bgTertiary, overflow: 'hidden' },
  filterPillActive: { backgroundColor: 'transparent' },
  filterPillGradient: { paddingHorizontal: 14, paddingVertical: 8, borderRadius: 100 },
  filterPillText: { fontSize: 13, fontWeight: '600', color: Colors.textSecondary, paddingHorizontal: 14, paddingVertical: 8 },
  filterPillTextActive: { fontSize: 13, fontWeight: '600', color: '#fff' },
  mapPlaceholder: { flex: 1, justifyContent: 'center', alignItems: 'center', padding: 32, gap: 14 },
  iconWrap: { marginBottom: 8 },
  iconGradient: { width: 100, height: 100, borderRadius: 50, justifyContent: 'center', alignItems: 'center' },
  mapTitle: { fontSize: 24, fontWeight: '800', color: Colors.textPrimary },
  mapSubtitle: { fontSize: 14, color: Colors.textSecondary, textAlign: 'center', lineHeight: 20 },
  mapHint: { fontSize: 13, color: Colors.textTertiary, textAlign: 'center' },
  openWebBtn: { borderRadius: 14, overflow: 'hidden', marginTop: 4 },
  openWebBtnGradient: { flexDirection: 'row', alignItems: 'center', gap: 8, paddingHorizontal: 20, paddingVertical: 14, borderRadius: 14 },
  openWebBtnText: { color: '#fff', fontWeight: '700', fontSize: 14 },
  statsRow: { flexDirection: 'row', gap: 12, marginTop: 20 },
  statCard: { backgroundColor: Colors.bgSecondary, borderRadius: 16, padding: 16, alignItems: 'center', gap: 6, flex: 1, borderWidth: 1, borderColor: Colors.borderSubtle },
  statNumber: { fontSize: 20, fontWeight: '800', color: Colors.textPrimary },
  statLabel: { fontSize: 11, color: Colors.textTertiary, fontWeight: '600' },
});
