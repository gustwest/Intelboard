import React, { useState } from 'react';
import { View, Text, ScrollView, StyleSheet, TouchableOpacity, Linking } from 'react-native';
import { Ionicons } from '@expo/vector-icons';
import { Colors } from '../../src/theme/colors';
import { SafeAreaView } from 'react-native-safe-area-context';
import { AppHeader } from '../../src/components/AppHeader';

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
            <Text style={[s.filterPillText, activeFilter === f.key && s.filterPillTextActive]}>{f.label}</Text>
          </TouchableOpacity>
        ))}
      </ScrollView>

      {/* Map placeholder — react-native-maps requires EAS Build (native module) */}
      <View style={s.mapPlaceholder}>
        <Ionicons name="map" size={80} color={Colors.brandPrimary} />
        <Text style={s.mapTitle}>Karta</Text>
        <Text style={s.mapSubtitle}>
          Interaktiv karta med banor, klubbar och events kräver native build (EAS Build).
        </Text>
        <Text style={s.mapSubtitle}>
          Under tiden kan du öppna kartan i webbläsaren:
        </Text>
        <TouchableOpacity
          style={s.openWebBtn}
          onPress={() => Linking.openURL('https://beachvibes.app/map')}
        >
          <Ionicons name="open-outline" size={16} color="#fff" />
          <Text style={s.openWebBtnText}>Öppna karta i webbläsaren</Text>
        </TouchableOpacity>
      </View>
    </SafeAreaView>
  );
}

const s = StyleSheet.create({
  container: { flex: 1, backgroundColor: Colors.bgPrimary },
  filterRow: { paddingHorizontal: 16, gap: 8, paddingVertical: 10, borderBottomWidth: 1, borderBottomColor: Colors.borderSubtle },
  filterPill: { paddingHorizontal: 14, paddingVertical: 8, borderRadius: 100, backgroundColor: Colors.bgTertiary },
  filterPillActive: { backgroundColor: Colors.brandPrimary },
  filterPillText: { fontSize: 13, fontWeight: '600', color: Colors.textSecondary },
  filterPillTextActive: { color: '#fff' },
  mapPlaceholder: { flex: 1, justifyContent: 'center', alignItems: 'center', padding: 32, gap: 12 },
  mapTitle: { fontSize: 24, fontWeight: '800', color: Colors.textPrimary },
  mapSubtitle: { fontSize: 14, color: Colors.textSecondary, textAlign: 'center', lineHeight: 20 },
  openWebBtn: { flexDirection: 'row', alignItems: 'center', gap: 8, backgroundColor: Colors.brandPrimary, paddingHorizontal: 20, paddingVertical: 12, borderRadius: 12, marginTop: 8 },
  openWebBtnText: { color: '#fff', fontWeight: '700', fontSize: 14 },
});
