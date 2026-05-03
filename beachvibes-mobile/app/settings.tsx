import React from 'react';
import {
  View, Text, ScrollView, StyleSheet,
  TouchableOpacity, Alert,
} from 'react-native';
import { Ionicons } from '@expo/vector-icons';
import { Colors } from '../src/theme/colors';
import { useAuth } from '../src/auth/AuthProvider';
import { SafeAreaView } from 'react-native-safe-area-context';
import { router } from 'expo-router';
import { LinearGradient } from 'expo-linear-gradient';

const MENU_SECTIONS = [
  {
    title: 'Konto',
    items: [
      { icon: 'person-outline', label: 'Redigera profil', color: Colors.brandPrimary, route: 'profile' },
      { icon: 'notifications-outline', label: 'Notiseringar', color: Colors.brandAccent, route: 'notifications' },
      { icon: 'shield-checkmark-outline', label: 'Sekretess', color: Colors.success },
    ],
  },
  {
    title: 'App',
    items: [
      { icon: 'color-palette-outline', label: 'Utseende', color: Colors.brandPink },
      { icon: 'language-outline', label: 'Språk', color: Colors.warning },
      { icon: 'help-circle-outline', label: 'Hjälp & Support', color: Colors.brandAccent },
    ],
  },
  {
    title: 'Om',
    items: [
      { icon: 'document-text-outline', label: 'Villkor', color: Colors.textSecondary },
      { icon: 'lock-closed-outline', label: 'Integritetspolicy', color: Colors.textSecondary },
      { icon: 'information-circle-outline', label: 'Version 1.0.0', color: Colors.textTertiary },
    ],
  },
];

export default function SettingsScreen() {
  const { logout, user } = useAuth();

  const handleLogout = () => {
    Alert.alert('Logga ut', 'Vill du logga ut från BeachVibes?', [
      { text: 'Avbryt', style: 'cancel' },
      {
        text: 'Logga ut',
        style: 'destructive',
        onPress: async () => {
          await logout();
          router.replace('/login');
        },
      },
    ]);
  };

  return (
    <SafeAreaView style={s.container} edges={['top']}>
      <View style={s.header}>
        <TouchableOpacity onPress={() => router.back()} style={s.backBtn}>
          <Ionicons name="chevron-back" size={24} color={Colors.textPrimary} />
        </TouchableOpacity>
        <Text style={s.headerTitle}>Inställningar</Text>
        <View style={{ width: 32 }} />
      </View>

      <ScrollView style={s.scroll} showsVerticalScrollIndicator={false}>
        {/* User info */}
        <View style={s.userCard}>
          <LinearGradient colors={['#ea580c', '#db2777']} style={s.userAvatar}>
            <Text style={s.userInitial}>{user?.name?.charAt(0) || '?'}</Text>
          </LinearGradient>
          <View style={{ flex: 1 }}>
            <Text style={s.userName}>{user?.name || 'Användare'}</Text>
            <Text style={s.userEmail}>{user?.email || ''}</Text>
          </View>
          <Ionicons name="chevron-forward" size={18} color={Colors.textTertiary} />
        </View>

        {MENU_SECTIONS.map((section, si) => (
          <View key={si} style={s.section}>
            <Text style={s.sectionTitle}>{section.title}</Text>
            <View style={s.sectionCard}>
              {section.items.map((item, ii) => (
                <TouchableOpacity
                  key={ii}
                  style={[s.menuRow, ii < section.items.length - 1 && s.menuRowBorder]}
                  onPress={() => 'route' in item && item.route ? router.push(`/${item.route}` as any) : null}
                  activeOpacity={0.7}
                >
                  <View style={[s.menuIcon, { backgroundColor: `${item.color}15` }]}>
                    <Ionicons name={item.icon as any} size={18} color={item.color} />
                  </View>
                  <Text style={s.menuLabel}>{item.label}</Text>
                  <Ionicons name="chevron-forward" size={16} color={Colors.textTertiary} />
                </TouchableOpacity>
              ))}
            </View>
          </View>
        ))}

        {/* Logout */}
        <TouchableOpacity style={s.logoutBtn} onPress={handleLogout}>
          <Ionicons name="log-out-outline" size={20} color={Colors.error} />
          <Text style={s.logoutText}>Logga ut</Text>
        </TouchableOpacity>

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
  headerTitle: { fontSize: 16, fontWeight: '700', color: Colors.textPrimary },
  scroll: { flex: 1 },
  userCard: {
    flexDirection: 'row', alignItems: 'center', gap: 14,
    margin: 16, padding: 16,
    backgroundColor: Colors.bgSecondary, borderRadius: 18,
    borderWidth: 1, borderColor: Colors.borderSubtle,
  },
  userAvatar: { width: 48, height: 48, borderRadius: 24, justifyContent: 'center', alignItems: 'center' },
  userInitial: { color: '#fff', fontSize: 20, fontWeight: '800' },
  userName: { fontSize: 16, fontWeight: '700', color: Colors.textPrimary },
  userEmail: { fontSize: 13, color: Colors.textSecondary, marginTop: 2 },
  section: { paddingHorizontal: 16, marginBottom: 16 },
  sectionTitle: { fontSize: 12, fontWeight: '700', color: Colors.textTertiary, textTransform: 'uppercase', letterSpacing: 0.5, marginBottom: 8 },
  sectionCard: { backgroundColor: Colors.bgSecondary, borderRadius: 16, borderWidth: 1, borderColor: Colors.borderSubtle, overflow: 'hidden' },
  menuRow: { flexDirection: 'row', alignItems: 'center', gap: 12, paddingVertical: 14, paddingHorizontal: 14 },
  menuRowBorder: { borderBottomWidth: 1, borderBottomColor: Colors.borderSubtle },
  menuIcon: { width: 32, height: 32, borderRadius: 10, justifyContent: 'center', alignItems: 'center' },
  menuLabel: { flex: 1, fontSize: 15, color: Colors.textPrimary, fontWeight: '500' },
  logoutBtn: {
    flexDirection: 'row', alignItems: 'center', justifyContent: 'center', gap: 8,
    marginHorizontal: 16, marginTop: 8, paddingVertical: 16,
    borderRadius: 16, backgroundColor: 'rgba(239,68,68,0.08)',
    borderWidth: 1, borderColor: 'rgba(239,68,68,0.2)',
  },
  logoutText: { fontSize: 15, fontWeight: '700', color: Colors.error },
});
