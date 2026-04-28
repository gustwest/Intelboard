import React, { useState } from 'react';
import {
  View, Text, StyleSheet, TouchableOpacity,
  ActivityIndicator, Image, Dimensions,
} from 'react-native';
import { Ionicons } from '@expo/vector-icons';
import { Colors, Gradients } from '../src/theme/colors';
import { useAuth } from '../src/auth/AuthProvider';
import { apiRequest } from '../src/api/client';
import * as WebBrowser from 'expo-web-browser';
import * as AuthSession from 'expo-auth-session';
import { SafeAreaView } from 'react-native-safe-area-context';
import { router } from 'expo-router';
import { LinearGradient } from 'expo-linear-gradient';

WebBrowser.maybeCompleteAuthSession();

const GOOGLE_CLIENT_ID = '815335042776-YOUR_GOOGLE_CLIENT_ID.apps.googleusercontent.com';
const API_BASE = 'https://dvoucher-app-815335042776.europe-north1.run.app';

export default function LoginScreen() {
  const { login } = useAuth();
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const handleGoogleLogin = async () => {
    setLoading(true);
    setError(null);
    try {
      // For now, use a demo login flow until Google OAuth is configured
      // This calls the mobile-token endpoint with a test flow
      const response = await apiRequest<{
        token: string;
        user: { id: string; name: string; email: string; image: string | null };
      }>('/api/auth/mobile-token', {
        method: 'POST',
        body: { provider: 'demo' },
        skipAuth: true,
      });

      if (response.token && response.user) {
        await login(response.token, response.user);
        router.replace('/(tabs)/feed');
      }
    } catch (err: any) {
      console.error('Login failed:', err);
      setError('Inloggningen misslyckades. Försök igen.');
    } finally {
      setLoading(false);
    }
  };

  // Quick demo login for development
  const handleDemoLogin = async () => {
    setLoading(true);
    setError(null);
    try {
      const response = await apiRequest<{
        token: string;
        user: { id: string; name: string; email: string; image: string | null };
      }>('/api/auth/mobile-token', {
        method: 'POST',
        body: { provider: 'demo', email: 'guswes@gmail.com' },
        skipAuth: true,
      });

      if (response.token && response.user) {
        await login(response.token, response.user);
        router.replace('/(tabs)/feed');
      }
    } catch (err: any) {
      setError(err.message || 'Demo login misslyckades');
    } finally {
      setLoading(false);
    }
  };

  return (
    <View style={styles.container}>
      {/* Background gradient */}
      <LinearGradient
        colors={['#0f1117', '#1a1127', '#1a2744']}
        style={StyleSheet.absoluteFill}
        start={{ x: 0, y: 0 }}
        end={{ x: 1, y: 1 }}
      />

      <SafeAreaView style={styles.safeArea}>
        {/* Logo area */}
        <View style={styles.logoSection}>
          <View style={styles.logoCircle}>
            <Text style={styles.logoEmoji}>🏐</Text>
          </View>
          <Text style={styles.appName}>BeachVibes</Text>
          <Text style={styles.tagline}>Where Sand Binds Souls</Text>
        </View>

        {/* Features */}
        <View style={styles.features}>
          {[
            { icon: 'tennisball-outline', text: 'Hitta och skapa events' },
            { icon: 'people-outline', text: 'Träffa andra spelare' },
            { icon: 'trophy-outline', text: 'Tävla och följ ranking' },
            { icon: 'map-outline', text: 'Upptäck banor nära dig' },
          ].map((f, i) => (
            <View key={i} style={styles.featureRow}>
              <Ionicons name={f.icon as any} size={20} color={Colors.brandPrimary} />
              <Text style={styles.featureText}>{f.text}</Text>
            </View>
          ))}
        </View>

        {/* Login buttons */}
        <View style={styles.loginSection}>
          {error && (
            <View style={styles.errorBox}>
              <Text style={styles.errorText}>{error}</Text>
            </View>
          )}

          <TouchableOpacity
            style={styles.googleButton}
            onPress={handleGoogleLogin}
            disabled={loading}
          >
            {loading ? (
              <ActivityIndicator color="#fff" />
            ) : (
              <>
                <Ionicons name="logo-google" size={20} color="#fff" />
                <Text style={styles.googleButtonText}>Fortsätt med Google</Text>
              </>
            )}
          </TouchableOpacity>

          <TouchableOpacity
            style={styles.demoButton}
            onPress={handleDemoLogin}
            disabled={loading}
          >
            <Ionicons name="flash-outline" size={20} color={Colors.brandPrimary} />
            <Text style={styles.demoButtonText}>Demo-inloggning</Text>
          </TouchableOpacity>

          <Text style={styles.terms}>
            Genom att fortsätta godkänner du våra villkor
          </Text>
        </View>
      </SafeAreaView>
    </View>
  );
}

const styles = StyleSheet.create({
  container: { flex: 1 },
  safeArea: { flex: 1, justifyContent: 'space-between', paddingHorizontal: 32 },
  logoSection: { alignItems: 'center', marginTop: 60, gap: 8 },
  logoCircle: {
    width: 100, height: 100, borderRadius: 50,
    backgroundColor: 'rgba(249,115,22,0.15)',
    justifyContent: 'center', alignItems: 'center', marginBottom: 8,
  },
  logoEmoji: { fontSize: 48 },
  appName: { fontSize: 36, fontWeight: '800', color: Colors.textPrimary, letterSpacing: -1 },
  tagline: { fontSize: 15, color: Colors.textSecondary, fontStyle: 'italic' },
  features: { gap: 14, paddingHorizontal: 8 },
  featureRow: { flexDirection: 'row', alignItems: 'center', gap: 14 },
  featureText: { fontSize: 15, color: Colors.textSecondary, fontWeight: '500' },
  loginSection: { gap: 14, marginBottom: 24 },
  errorBox: {
    backgroundColor: 'rgba(239,68,68,0.12)', borderRadius: 12,
    padding: 12, borderWidth: 1, borderColor: 'rgba(239,68,68,0.3)',
  },
  errorText: { color: Colors.errorLight, fontSize: 13, textAlign: 'center' },
  googleButton: {
    flexDirection: 'row', alignItems: 'center', justifyContent: 'center',
    gap: 10, backgroundColor: Colors.brandPrimary, borderRadius: 16,
    paddingVertical: 16,
  },
  googleButtonText: { fontSize: 16, fontWeight: '700', color: '#fff' },
  demoButton: {
    flexDirection: 'row', alignItems: 'center', justifyContent: 'center',
    gap: 10, backgroundColor: Colors.bgSecondary, borderRadius: 16,
    paddingVertical: 16, borderWidth: 1, borderColor: Colors.borderDefault,
  },
  demoButtonText: { fontSize: 15, fontWeight: '600', color: Colors.textPrimary },
  terms: { fontSize: 11, color: Colors.textTertiary, textAlign: 'center', marginTop: 4 },
});
