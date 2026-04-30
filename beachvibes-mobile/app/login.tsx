import React, { useState, useEffect } from 'react';
import {
  View, Text, StyleSheet, TouchableOpacity,
  ActivityIndicator, Image, Dimensions, Animated,
} from 'react-native';
import { Ionicons } from '@expo/vector-icons';
import { Colors } from '../src/theme/colors';
import { useAuth } from '../src/auth/AuthProvider';
import * as WebBrowser from 'expo-web-browser';
import * as Linking from 'expo-linking';
import { SafeAreaView } from 'react-native-safe-area-context';
import { router } from 'expo-router';
import { LinearGradient } from 'expo-linear-gradient';

const { width: SCREEN_WIDTH } = Dimensions.get('window');
const API_BASE = 'https://dvoucher-app-815335042776.europe-north1.run.app';

export default function LoginScreen() {
  const { login } = useAuth();
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const fadeAnim = useState(new Animated.Value(0))[0];
  const slideAnim = useState(new Animated.Value(30))[0];

  useEffect(() => {
    // Entrance animation
    Animated.parallel([
      Animated.timing(fadeAnim, {
        toValue: 1,
        duration: 800,
        useNativeDriver: true,
      }),
      Animated.timing(slideAnim, {
        toValue: 0,
        duration: 800,
        useNativeDriver: true,
      }),
    ]).start();
  }, []);

  // Listen for deep link callback from server-side OAuth
  useEffect(() => {
    const handleDeepLink = (event: { url: string }) => {
      const url = new URL(event.url);
      
      if (url.hostname === 'auth-callback') {
        const token = url.searchParams.get('token');
        const userJson = url.searchParams.get('user');
        const oauthError = url.searchParams.get('error');

        if (oauthError) {
          setError(`Inloggning misslyckades: ${oauthError}`);
          setLoading(false);
          return;
        }

        if (token && userJson) {
          try {
            const user = JSON.parse(userJson);
            login(token, user).then(() => {
              router.replace('/(tabs)/feed');
            });
          } catch (err) {
            setError('Kunde inte bearbeta inloggningsdata.');
            setLoading(false);
          }
        } else {
          setError('Ingen autentiseringsdata mottagen.');
          setLoading(false);
        }
      }
    };

    const subscription = Linking.addEventListener('url', handleDeepLink);

    Linking.getInitialURL().then((url) => {
      if (url) handleDeepLink({ url });
    });

    return () => subscription.remove();
  }, []);

  const handleGoogleLogin = async () => {
    setLoading(true);
    setError(null);
    try {
      const oauthUrl = `${API_BASE}/api/auth/mobile-oauth?scheme=beachvibes`;
      
      const result = await WebBrowser.openAuthSessionAsync(
        oauthUrl,
        'beachvibes://auth-callback'
      );

      if (result.type === 'cancel' || result.type === 'dismiss') {
        setLoading(false);
      }
    } catch (err: any) {
      console.error('OAuth error:', err);
      setError('Kunde inte öppna inloggningen.');
      setLoading(false);
    }
  };

  const features = [
    { icon: '⚡', title: 'Snabba Matcher', desc: 'Hitta och skapa events på sekunder' },
    { icon: '🤝', title: 'Ditt Gäng', desc: 'Hitta spelare som matchar din nivå' },
    { icon: '🏆', title: 'Tävla & Rankas', desc: 'Turneringar, ligor och ranking' },
    { icon: '🗺️', title: 'Hitta Banor', desc: 'Interaktiv karta med alla banor' },
  ];

  return (
    <View style={styles.container}>
      {/* Background gradient matching web */}
      <LinearGradient
        colors={['#0a0a12', '#0f1028', '#0d1a2e', '#0a0a12']}
        style={StyleSheet.absoluteFill}
        start={{ x: 0.5, y: 0 }}
        end={{ x: 0.5, y: 1 }}
      />

      {/* Blue glow effects like the web */}
      <View style={styles.glowLeft} />
      <View style={styles.glowRight} />

      <SafeAreaView style={styles.safeArea}>
        <Animated.View style={[styles.content, { opacity: fadeAnim, transform: [{ translateY: slideAnim }] }]}>
          
          {/* Badge like web's "Beach Volleyball Community" */}
          <View style={styles.badge}>
            <Text style={styles.badgeEmoji}>🏐</Text>
            <Text style={styles.badgeText}>Beach Volleyball Community</Text>
          </View>

          {/* Logo */}
          <View style={styles.logoSection}>
            <Image 
              source={require('../assets/logo.png')} 
              style={styles.logoImage}
              resizeMode="contain"
            />
            <View style={styles.brandRow}>
              <Text style={styles.brandBeach}>Beach</Text>
              <Text style={styles.brandVibes}>Vibes</Text>
            </View>
            <Text style={styles.tagline}>Where Sand Binds Souls</Text>
          </View>

          {/* Feature cards in a glassmorphic container */}
          <View style={styles.featuresCard}>
            {features.map((f, i) => (
              <View key={i} style={[styles.featureRow, i < features.length - 1 && styles.featureBorder]}>
                <Text style={styles.featureIcon}>{f.icon}</Text>
                <View style={styles.featureTextCol}>
                  <Text style={styles.featureTitle}>{f.title}</Text>
                  <Text style={styles.featureDesc}>{f.desc}</Text>
                </View>
              </View>
            ))}
          </View>
        </Animated.View>

        {/* Login section */}
        <View style={styles.loginSection}>
          {error && (
            <View style={styles.errorBox}>
              <Ionicons name="alert-circle" size={16} color="#ef4444" />
              <Text style={styles.errorText}>{error}</Text>
            </View>
          )}

          <TouchableOpacity
            style={styles.googleButton}
            onPress={handleGoogleLogin}
            disabled={loading}
            activeOpacity={0.85}
          >
            <LinearGradient
              colors={['#ea580c', '#db2777']}
              start={{ x: 0, y: 0 }}
              end={{ x: 1, y: 0 }}
              style={styles.googleGradient}
            >
              {loading ? (
                <ActivityIndicator color="#fff" />
              ) : (
                <>
                  <Ionicons name="logo-google" size={20} color="#fff" />
                  <Text style={styles.googleButtonText}>Fortsätt med Google</Text>
                </>
              )}
            </LinearGradient>
          </TouchableOpacity>

          {/* DEV BYPASS — remove before production */}
          {__DEV__ && (
            <TouchableOpacity
              style={styles.devButton}
              onPress={async () => {
                setLoading(true);
                setError(null);
                try {
                  const res = await fetch(
                    `${API_BASE}/api/auth/mobile-dev-token?email=guswes@gmail.com&key=beachvibes-dev-2026`
                  );
                  const data = await res.json();
                  if (!res.ok || !data.token) {
                    throw new Error(data.error || 'Dev token failed');
                  }
                  await login(data.token, data.user);
                  router.replace('/(tabs)/feed');
                } catch (err: any) {
                  setError(err.message || 'Dev login failed');
                  setLoading(false);
                }
              }}
              activeOpacity={0.7}
            >
              <Ionicons name="code-slash-outline" size={16} color="rgba(255,255,255,0.5)" />
              <Text style={styles.devButtonText}>Dev Login (simulator)</Text>
            </TouchableOpacity>
          )}

          <Text style={styles.terms}>
            Genom att fortsätta godkänner du våra villkor
          </Text>
        </View>
      </SafeAreaView>
    </View>
  );
}

const styles = StyleSheet.create({
  container: { 
    flex: 1, 
    backgroundColor: '#0a0a12',
  },
  safeArea: { 
    flex: 1, 
    justifyContent: 'space-between',
  },
  content: {
    flex: 1,
    paddingHorizontal: 28,
    justifyContent: 'center',
    gap: 24,
  },
  
  // Blue glow effects (matching web's edge glows)
  glowLeft: {
    position: 'absolute',
    left: -60,
    top: '30%',
    width: 120,
    height: 300,
    backgroundColor: '#1e40af',
    borderRadius: 150,
    opacity: 0.15,
  },
  glowRight: {
    position: 'absolute',
    right: -60,
    top: '20%',
    width: 120,
    height: 300,
    backgroundColor: '#3b82f6',
    borderRadius: 150,
    opacity: 0.1,
  },

  // Badge
  badge: {
    flexDirection: 'row',
    alignItems: 'center',
    alignSelf: 'center',
    gap: 8,
    borderWidth: 1,
    borderColor: 'rgba(255,255,255,0.12)',
    borderRadius: 24,
    paddingHorizontal: 16,
    paddingVertical: 8,
    backgroundColor: 'rgba(255,255,255,0.04)',
  },
  badgeEmoji: { fontSize: 14 },
  badgeText: { 
    fontSize: 13, 
    color: 'rgba(255,255,255,0.7)', 
    fontWeight: '500',
    letterSpacing: 0.3,
  },

  // Logo
  logoSection: { 
    alignItems: 'center', 
    gap: 6,
  },
  logoImage: {
    width: 100,
    height: 100,
    marginBottom: 4,
  },
  brandRow: {
    flexDirection: 'row',
    alignItems: 'baseline',
  },
  brandBeach: {
    fontSize: 32,
    fontWeight: '800',
    color: '#22d3ee', // cyan like web
    letterSpacing: -0.5,
  },
  brandVibes: {
    fontSize: 32,
    fontWeight: '800',
    color: '#e879f9', // magenta/pink like web
    letterSpacing: -0.5,
  },
  tagline: { 
    fontSize: 15, 
    color: 'rgba(255,255,255,0.5)', 
    fontStyle: 'italic',
    letterSpacing: 0.5,
    marginTop: 2,
  },

  // Feature card (glassmorphic)
  featuresCard: {
    backgroundColor: 'rgba(255,255,255,0.03)',
    borderWidth: 1,
    borderColor: 'rgba(255,255,255,0.08)',
    borderRadius: 20,
    padding: 16,
    gap: 0,
  },
  featureRow: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 14,
    paddingVertical: 12,
    paddingHorizontal: 4,
  },
  featureBorder: {
    borderBottomWidth: 1,
    borderBottomColor: 'rgba(255,255,255,0.05)',
  },
  featureIcon: {
    fontSize: 22,
    width: 36,
    textAlign: 'center',
  },
  featureTextCol: {
    flex: 1,
    gap: 2,
  },
  featureTitle: {
    fontSize: 15,
    fontWeight: '700',
    color: 'rgba(255,255,255,0.92)',
    letterSpacing: -0.2,
  },
  featureDesc: {
    fontSize: 13,
    color: 'rgba(255,255,255,0.45)',
    fontWeight: '400',
  },

  // Login section
  loginSection: { 
    paddingHorizontal: 28,
    paddingBottom: 16,
    gap: 12,
  },
  errorBox: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 8,
    backgroundColor: 'rgba(239,68,68,0.1)', 
    borderRadius: 14,
    padding: 14, 
    borderWidth: 1, 
    borderColor: 'rgba(239,68,68,0.25)',
  },
  errorText: { 
    color: '#fca5a5', 
    fontSize: 13, 
    flex: 1,
  },
  googleButton: {
    borderRadius: 16,
    overflow: 'hidden',
  },
  googleGradient: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'center',
    gap: 10,
    paddingVertical: 17,
    borderRadius: 16,
  },
  googleButtonText: { 
    fontSize: 16, 
    fontWeight: '700', 
    color: '#fff',
    letterSpacing: 0.3,
  },
  terms: { 
    fontSize: 11, 
    color: 'rgba(255,255,255,0.3)', 
    textAlign: 'center', 
    marginTop: 2,
  },
  devButton: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'center',
    gap: 6,
    paddingVertical: 12,
    borderRadius: 12,
    borderWidth: 1,
    borderColor: 'rgba(255,255,255,0.08)',
    backgroundColor: 'rgba(255,255,255,0.03)',
  },
  devButtonText: {
    fontSize: 13,
    color: 'rgba(255,255,255,0.4)',
    fontWeight: '500',
  },
});
