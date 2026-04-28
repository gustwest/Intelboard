import React from 'react';
import { View, Text, StyleSheet } from 'react-native';
import { Ionicons } from '@expo/vector-icons';
import { Colors } from '../../src/theme/colors';
import { SafeAreaView } from 'react-native-safe-area-context';

export default function MapScreen() {
  return (
    <SafeAreaView style={styles.container} edges={['top']}>
      <View style={styles.header}>
        <Text style={styles.title}>Karta 🗺</Text>
      </View>
      <View style={styles.mapPlaceholder}>
        <Ionicons name="map-outline" size={64} color={Colors.brandAccent} />
        <Text style={styles.placeholderTitle}>Karta kommer snart</Text>
        <Text style={styles.placeholderText}>
          Hitta banor, events och spelare nära dig
        </Text>
      </View>
    </SafeAreaView>
  );
}

const styles = StyleSheet.create({
  container: { flex: 1, backgroundColor: Colors.bgPrimary },
  header: { paddingHorizontal: 20, paddingVertical: 12 },
  title: { fontSize: 28, fontWeight: '700', color: Colors.textPrimary },
  mapPlaceholder: {
    flex: 1, justifyContent: 'center', alignItems: 'center',
    gap: 12, paddingHorizontal: 40, marginTop: -60,
  },
  placeholderTitle: { fontSize: 20, fontWeight: '700', color: Colors.textPrimary },
  placeholderText: { fontSize: 14, color: Colors.textSecondary, textAlign: 'center' },
});
