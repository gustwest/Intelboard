import React from 'react';
import { View, Text, StyleSheet } from 'react-native';
import { Ionicons } from '@expo/vector-icons';
import { Colors } from '../../src/theme/colors';
import { SafeAreaView } from 'react-native-safe-area-context';

export default function ChatScreen() {
  return (
    <SafeAreaView style={styles.container} edges={['top']}>
      <View style={styles.header}>
        <Text style={styles.title}>Chat 💬</Text>
      </View>
      <View style={styles.emptyState}>
        <View style={styles.iconCircle}>
          <Ionicons name="chatbubbles-outline" size={48} color={Colors.brandAccent} />
        </View>
        <Text style={styles.emptyTitle}>Inga meddelanden ännu</Text>
        <Text style={styles.emptyText}>
          Starta en konversation med andra spelare!
        </Text>
      </View>
    </SafeAreaView>
  );
}

const styles = StyleSheet.create({
  container: { flex: 1, backgroundColor: Colors.bgPrimary },
  header: { paddingHorizontal: 20, paddingVertical: 12 },
  title: { fontSize: 28, fontWeight: '700', color: Colors.textPrimary },
  emptyState: {
    flex: 1, justifyContent: 'center', alignItems: 'center',
    gap: 16, paddingHorizontal: 40, marginTop: -60,
  },
  iconCircle: {
    width: 96, height: 96, borderRadius: 48,
    backgroundColor: 'rgba(6,182,212,0.1)',
    justifyContent: 'center', alignItems: 'center', marginBottom: 8,
  },
  emptyTitle: { fontSize: 22, fontWeight: '700', color: Colors.textPrimary },
  emptyText: { fontSize: 14, color: Colors.textSecondary, textAlign: 'center' },
});
