import React from 'react';
import { StyleSheet, TouchableOpacity, Text, View, Platform } from 'react-native';
import { LinearGradient } from 'expo-linear-gradient';
import { Colors, Gradients } from '../../theme/colors';
import { Ionicons } from '@expo/vector-icons';

interface FABProps {
  icon: keyof typeof Ionicons.glyphMap;
  label: string;
  onPress: () => void;
  extended?: boolean;
}

export function FAB({ icon, label, onPress, extended = false }: FABProps) {
  return (
    <View style={s.container}>
      <TouchableOpacity
        activeOpacity={0.8}
        onPress={onPress}
        style={s.shadowWrapper}
      >
        <LinearGradient
          colors={[...Gradients.brand]}
          start={{ x: 0, y: 0 }}
          end={{ x: 1, y: 1 }}
          style={[s.fab, extended && s.extended]}
        >
          <Ionicons name={icon} size={24} color="#fff" />
          {extended && <Text style={s.label}>{label}</Text>}
        </LinearGradient>
      </TouchableOpacity>
    </View>
  );
}

const s = StyleSheet.create({
  container: {
    position: 'absolute',
    right: 16,
    // Minskat med ca 50% till menyraden
    bottom: 6,
    zIndex: 100,
  },
  shadowWrapper: {
    shadowColor: Colors.brandPink,
    shadowOffset: { width: 0, height: 8 },
    shadowOpacity: 0.35,
    shadowRadius: 24,
    elevation: 8,
    borderRadius: 28,
  },
  fab: {
    height: 56,
    width: 56,
    borderRadius: 28,
    alignItems: 'center',
    justifyContent: 'center',
    flexDirection: 'row',
  },
  extended: {
    width: 'auto',
    paddingLeft: 16,
    paddingRight: 20,
    gap: 8,
  },
  label: {
    color: '#fff',
    fontSize: 16,
    fontWeight: '600',
  },
});
