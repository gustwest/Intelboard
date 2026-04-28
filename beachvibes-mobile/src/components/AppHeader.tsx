import React from 'react';
import { View, Text, TouchableOpacity, Image, StyleSheet, Alert } from 'react-native';
import { Ionicons } from '@expo/vector-icons';
import { router } from 'expo-router';
import { Colors } from '../theme/colors';
import { useAuth } from '../auth/AuthProvider';

interface AppHeaderProps {
  title?: string;
  notificationCount?: number;
  showBack?: boolean;
}

export function AppHeader({ title = 'BeachVibes', notificationCount = 0, showBack = false }: AppHeaderProps) {
  const { user, logout } = useAuth();

  const handleAvatarPress = () => {
    Alert.alert(
      user?.name || 'Profil',
      user?.email || '',
      [
        { text: 'Min profil', onPress: () => router.push('/profile') },
        { text: 'Notiser', onPress: () => router.push('/notifications') },
        { text: 'Avbryt', style: 'cancel' },
        {
          text: 'Logga ut', style: 'destructive',
          onPress: async () => { await logout(); router.replace('/login'); },
        },
      ]
    );
  };

  return (
    <View style={s.header}>
      {showBack ? (
        <TouchableOpacity onPress={() => router.back()} style={s.backBtn}>
          <Ionicons name="chevron-back" size={24} color={Colors.textPrimary} />
        </TouchableOpacity>
      ) : (
        <Text style={s.logo}>{title}</Text>
      )}
      {showBack && <Text style={s.headerTitle} numberOfLines={1}>{title}</Text>}

      <View style={s.headerRight}>
        <TouchableOpacity style={s.iconBtn} onPress={() => router.push('/notifications')}>
          <Ionicons name="notifications-outline" size={22} color={Colors.textSecondary} />
          {notificationCount > 0 && (
            <View style={s.badge}>
              <Text style={s.badgeText}>{notificationCount > 99 ? '99+' : notificationCount}</Text>
            </View>
          )}
        </TouchableOpacity>
        <TouchableOpacity style={s.iconBtn} onPress={() => router.push('/(tabs)/chat')}>
          <Ionicons name="chatbubble-outline" size={22} color={Colors.textSecondary} />
        </TouchableOpacity>
        <TouchableOpacity onPress={handleAvatarPress}>
          {user?.image ? (
            <Image source={{ uri: user.image }} style={s.headerAvatar} />
          ) : (
            <View style={[s.headerAvatar, { backgroundColor: Colors.brandPrimary, justifyContent: 'center', alignItems: 'center' }]}>
              <Text style={{ color: '#fff', fontWeight: '700', fontSize: 14 }}>
                {user?.name?.charAt(0) || '?'}
              </Text>
            </View>
          )}
        </TouchableOpacity>
      </View>
    </View>
  );
}

const s = StyleSheet.create({
  header: {
    flexDirection: 'row', justifyContent: 'space-between', alignItems: 'center',
    paddingHorizontal: 16, paddingVertical: 10,
    borderBottomWidth: 1, borderBottomColor: Colors.borderSubtle,
    backgroundColor: Colors.bgPrimary,
  },
  logo: { fontSize: 22, fontWeight: '800', color: Colors.brandPrimary, letterSpacing: -0.5 },
  backBtn: { padding: 4 },
  headerTitle: { fontSize: 16, fontWeight: '700', color: Colors.textPrimary, flex: 1, textAlign: 'center' },
  headerRight: { flexDirection: 'row', alignItems: 'center', gap: 12 },
  iconBtn: { padding: 4, position: 'relative' },
  headerAvatar: { width: 32, height: 32, borderRadius: 16, overflow: 'hidden' },
  badge: {
    position: 'absolute', top: -4, right: -6,
    backgroundColor: Colors.error, borderRadius: 10,
    minWidth: 18, height: 18, justifyContent: 'center', alignItems: 'center',
    paddingHorizontal: 4, borderWidth: 2, borderColor: Colors.bgPrimary,
  },
  badgeText: { color: '#fff', fontSize: 10, fontWeight: '800' },
});
