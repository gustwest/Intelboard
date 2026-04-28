import React from 'react';
import { View, Text, StyleSheet } from 'react-native';
import { Ionicons } from '@expo/vector-icons';
import { Colors } from '../../src/theme/colors';
import { SafeAreaView } from 'react-native-safe-area-context';

export default function CompeteScreen() {
  return (
    <SafeAreaView style={styles.container} edges={['top']}>
      <View style={styles.header}>
        <Text style={styles.title}>Compete 🏆</Text>
      </View>
      <View style={styles.emptyState}>
        <View style={styles.iconCircle}>
          <Ionicons name="trophy-outline" size={48} color={Colors.brandPrimary} />
        </View>
        <Text style={styles.emptyTitle}>Ranking kommer snart!</Text>
        <Text style={styles.emptyText}>
          Spela din första rankinggrundande match för att komma igång.
        </Text>
        <View style={styles.statRow}>
          <View style={styles.statBox}>
            <Text style={styles.statValue}>—</Text>
            <Text style={styles.statLabel}>Ranking</Text>
          </View>
          <View style={styles.statBox}>
            <Text style={styles.statValue}>0</Text>
            <Text style={styles.statLabel}>Matcher</Text>
          </View>
          <View style={styles.statBox}>
            <Text style={styles.statValue}>—</Text>
            <Text style={styles.statLabel}>Win Rate</Text>
          </View>
        </View>
      </View>
    </SafeAreaView>
  );
}

const styles = StyleSheet.create({
  container: { flex: 1, backgroundColor: Colors.bgPrimary },
  header: { paddingHorizontal: 20, paddingVertical: 12 },
  title: { fontSize: 28, fontWeight: '700', color: Colors.textPrimary },
  emptyState: { flex: 1, justifyContent: 'center', alignItems: 'center', paddingHorizontal: 40, gap: 16, marginTop: -60 },
  iconCircle: { width: 96, height: 96, borderRadius: 48, backgroundColor: 'rgba(249,115,22,0.1)', justifyContent: 'center', alignItems: 'center', marginBottom: 8 },
  emptyTitle: { fontSize: 22, fontWeight: '700', color: Colors.textPrimary },
  emptyText: { fontSize: 14, color: Colors.textSecondary, textAlign: 'center', lineHeight: 20 },
  statRow: { flexDirection: 'row', gap: 16, marginTop: 16 },
  statBox: { flex: 1, backgroundColor: Colors.bgSecondary, borderRadius: 16, padding: 16, alignItems: 'center', gap: 4, borderWidth: 1, borderColor: Colors.borderSubtle },
  statValue: { fontSize: 24, fontWeight: '700', color: Colors.textPrimary },
  statLabel: { fontSize: 12, color: Colors.textSecondary, fontWeight: '500' },
});
