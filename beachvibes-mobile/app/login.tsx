import React, { useState, useEffect } from 'react';
import {
  View, Text, StyleSheet, TouchableOpacity,
  ActivityIndicator,
} from 'react-native';
import { Ionicons } from '@expo/vector-icons';
import { Colors } from '../src/theme/colors';
import { useAuth } from '../src/auth/AuthProvider';
import { apiRequest } from '../src/api/client';
import * as WebBrowser from 'expo-web-browser';
import * as Google from 'expo-auth-session/providers/google';
import { SafeAreaView } from 'react-native-safe-area-context';
import { router } from 'expo-router';
import { LinearGradient } from 'expo-linear-gradient';

WebBrowser.maybeCompleteAuthSession();

// Web client ID from Google Cloud Console (same as web app)
const GOOGLE_WEB_CLIENT_ID = '815335042776-7p9osbj1e8ktr96j627a2bqqfc0bcvj3.apps.googleusercontent.com';

export default function LoginScreen() {
  const { login } = useAuth();
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);

  // Google Auth Session — uses web client ID (works in Expo Go)
  const [request, response, promptAsync] = Google.useIdTokenAuthRequest({
    clientId: GOOGLE_WEB_CLIENT_ID,
  });

  // Handle Google OAuth response
  useEffect(() => {
    if (response?.type === 'success') {
      const idToken = response.params.id_token;
      if (idToken) {
        handleGoogleToken(idToken);
      }
    } else if (response?.type === 'error') {
      setError('Google-inloggning avbröts. Försök igen.');
      setLoading(false);
    } else if (response?.type === 'dismiss') {
      setLoading(false);
    }
  }, [response]);

  const handleGoogleToken = async (idToken: string) => {
    setLoading(true);
    setError(null);
    try {
      const result = await apiRequest<{
        token: string;
        user: { id: string; name: string; email: string; image: string | null };
      }>('/api/auth/mobile-token', {
        method: 'POST',
        body: { provider: 'google', id_token: idToken },
        skipAuth: true,
      });

      if (result.token && result.user) {
        await login(result.token, result.user);
        router.replace('/(tabs)/feed');
      }
    } catch (err: any) {
      console.error('Google login failed:', err);
      setError('Inloggningen misslyckades. Kontrollera din internetanslutning.');
    } finally {
      setLoading(false);
    }
  };

  const handleGoogleLogin = async () => {
    setLoading(true);
    setError(null);
    try {
      await promptAsync();
    } catch (err) {
      setError('Kunde inte starta Google-inloggningen.');
      setLoading(false);
    }
  };

  return (
    <View style={styles.container}>
      <LinearGradient
        colors={['#0f1117', '#1a1127', '#1a2744']}
        style={StyleSheet.absoluteFill}
        start={{ x: 0, y: 0 }}
        end={{ x: 1, y: 1 }}
      />

      <SafeAreaView style={styles.safeArea}>
        {/* Logo */}
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
            style={[styles.googleButton, !request && { opacity: 0.6 }]}
            onPress={handleGoogleLogin}
            disabled={loading || !request}
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
  terms: { fontSize: 11, color: Colors.textTertiary, textAlign: 'center', marginTop: 4 },
});
