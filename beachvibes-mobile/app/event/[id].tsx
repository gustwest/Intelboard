import React, { useEffect, useState } from 'react';
import {
  View, Text, ScrollView, StyleSheet, Image,
  TouchableOpacity, ActivityIndicator, Alert,
} from 'react-native';
import { Ionicons } from '@expo/vector-icons';
import { Colors } from '../../src/theme/colors';
import { api } from '../../src/api/client';
import { SafeAreaView } from 'react-native-safe-area-context';
import { useLocalSearchParams, router } from 'expo-router';
import { LinearGradient } from 'expo-linear-gradient';

interface EventDetail {
  id: string;
  title: string;
  description: string | null;
  type: string;
  skillLevel: string | null;
  startsAt: string;
  endsAt: string;
  locationName: string | null;
  address: string | null;
  maxPlayers: number | null;
  court: { name: string; address: string } | null;
  creator: { id: string; name: string; image: string | null } | null;
  isCreator: boolean;
  userStatus: string | null;
  confirmed: { id: string; name: string; image: string | null; role: string }[];
  waitlisted: { id: string; name: string; image: string | null }[];
  images: string[];
}

const skillLabels: Record<string, string> = {
  ROOKIE: '⭐ Rookie',
  INTERMEDIATE: '⭐⭐ Intermediate',
  COMPETITIVE: '⭐⭐⭐ Competitive',
  ADVANCED: '⭐⭐⭐⭐ Advanced',
  ELITE: '⭐⭐⭐⭐⭐ Elite',
};

export default function EventDetailScreen() {
  const { id } = useLocalSearchParams<{ id: string }>();
  const [event, setEvent] = useState<EventDetail | null>(null);
  const [loading, setLoading] = useState(true);
  const [joining, setJoining] = useState(false);

  useEffect(() => {
    if (!id) return;
    api.get<EventDetail>(`/api/mobile/events/${id}`)
      .then(setEvent)
      .catch(err => console.warn('Failed to load event:', err))
      .finally(() => setLoading(false));
  }, [id]);

  const handleJoin = async () => {
    if (!event) return;
    setJoining(true);
    try {
      const result = await api.post<{ status: string; participantCount?: number }>(
        `/api/mobile/events/${event.id}`, { action: 'join' }
      );
      if (result.status === 'joined' || result.status === 'waitlisted') {
        Alert.alert(
          result.status === 'joined' ? '🏐 Du är med!' : '⏳ Väntelista',
          result.status === 'joined'
            ? 'Du har gått med i eventet!'
            : 'Eventet är fullt, du har ställts i kö.'
        );
        setEvent(prev => prev ? { ...prev, userStatus: result.status === 'joined' ? 'CONFIRMED' : 'WAITLISTED' } : prev);
      } else if (result.status === 'already') {
        Alert.alert('Info', 'Du är redan med i detta event');
      }
    } catch {
      Alert.alert('Fel', 'Kunde inte gå med i eventet');
    } finally {
      setJoining(false);
    }
  };

  const handleLeave = async () => {
    if (!event) return;
    Alert.alert('Hoppa av?', 'Vill du lämna detta event?', [
      { text: 'Avbryt', style: 'cancel' },
      {
        text: 'Lämna', style: 'destructive', onPress: async () => {
          try {
            await api.post(`/api/mobile/events/${event.id}`, { action: 'leave' });
            setEvent(prev => prev ? { ...prev, userStatus: null } : prev);
            Alert.alert('Klart', 'Du har lämnat eventet');
          } catch {
            Alert.alert('Fel', 'Kunde inte lämna eventet');
          }
        }
      },
    ]);
  };

  const formatDateTime = (start: string, end: string) => {
    const s = new Date(start);
    const e = new Date(end);
    const date = s.toLocaleDateString('sv-SE', { weekday: 'long', day: 'numeric', month: 'long' });
    const time = `${s.toLocaleTimeString('sv-SE', { hour: '2-digit', minute: '2-digit' })}–${e.toLocaleTimeString('sv-SE', { hour: '2-digit', minute: '2-digit' })}`;
    return { date, time };
  };

  if (loading) {
    return (
      <View style={[s.container, { justifyContent: 'center', alignItems: 'center' }]}>
        <ActivityIndicator size="large" color={Colors.brandPrimary} />
      </View>
    );
  }

  if (!event) {
    return (
      <SafeAreaView style={s.container}>
        <Text style={{ color: Colors.textPrimary, textAlign: 'center', marginTop: 60 }}>
          Event hittades inte
        </Text>
      </SafeAreaView>
    );
  }

  const { date, time } = formatDateTime(event.startsAt, event.endsAt);
  const spotsLeft = event.maxPlayers ? event.maxPlayers - event.confirmed.length : null;

  return (
    <SafeAreaView style={s.container} edges={['top']}>
      {/* Header */}
      <View style={s.header}>
        <TouchableOpacity onPress={() => router.back()} style={s.backBtn}>
          <Ionicons name="chevron-back" size={24} color={Colors.textPrimary} />
        </TouchableOpacity>
        <Text style={s.headerTitle} numberOfLines={1}>{event.title}</Text>
        {event.isCreator ? (
          <TouchableOpacity onPress={() => router.push(`/edit-event?id=${event.id}`)} style={{ width: 32, alignItems: 'center' }}>
            <Ionicons name="pencil" size={20} color={Colors.textPrimary} />
          </TouchableOpacity>
        ) : (
          <View style={{ width: 32 }} />
        )}
      </View>

      <ScrollView style={s.scroll} showsVerticalScrollIndicator={false}>
        {/* Event images */}
        {event.images.length > 0 && (
          <ScrollView horizontal showsHorizontalScrollIndicator={false} style={s.imageRow}>
            {event.images.map((url, i) => (
              <Image key={i} source={{ uri: url }} style={s.eventImage} />
            ))}
          </ScrollView>
        )}

        {/* Title + creator */}
        <View style={s.section}>
          <Text style={s.title}>{event.title}</Text>
          {event.creator && (
            <View style={s.creatorRow}>
              {event.creator.image ? (
                <Image source={{ uri: event.creator.image }} style={s.creatorImg} />
              ) : (
                <View style={[s.creatorImg, { backgroundColor: Colors.bgTertiary, justifyContent: 'center', alignItems: 'center' }]}>
                  <Ionicons name="person" size={14} color={Colors.textTertiary} />
                </View>
              )}
              <Text style={s.creatorName}>av {event.creator.name}</Text>
            </View>
          )}
        </View>

        {/* Info cards */}
        <View style={s.infoGrid}>
          <View style={s.infoCard}>
            <Ionicons name="calendar" size={20} color={Colors.brandPrimary} />
            <Text style={s.infoLabel}>Datum</Text>
            <Text style={s.infoValue}>{date}</Text>
          </View>
          <View style={s.infoCard}>
            <Ionicons name="time" size={20} color={Colors.brandAccent} />
            <Text style={s.infoLabel}>Tid</Text>
            <Text style={s.infoValue}>{time}</Text>
          </View>
          <View style={s.infoCard}>
            <Ionicons name="location" size={20} color={Colors.brandPink} />
            <Text style={s.infoLabel}>Plats</Text>
            <Text style={s.infoValue}>{event.court?.name || event.locationName || '–'}</Text>
          </View>
          {event.skillLevel && (
            <View style={s.infoCard}>
              <Text style={{ fontSize: 18 }}>🏐</Text>
              <Text style={s.infoLabel}>Nivå</Text>
              <Text style={s.infoValue}>{skillLabels[event.skillLevel] || event.skillLevel}</Text>
            </View>
          )}
        </View>

        {/* Description */}
        {event.description && (
          <View style={s.section}>
            <Text style={s.sectionTitle}>Beskrivning</Text>
            <Text style={s.description}>{event.description}</Text>
          </View>
        )}

        {/* Participants */}
        <View style={s.section}>
          <View style={s.sectionHeader}>
            <Text style={s.sectionTitle}>Deltagare</Text>
            <View style={s.spotsBadge}>
              <Text style={s.spotsText}>
                {event.confirmed.length}/{event.maxPlayers || '∞'}
                {spotsLeft !== null && spotsLeft > 0 ? ` · ${spotsLeft} platser kvar` : ''}
              </Text>
            </View>
          </View>

          {event.confirmed.map(p => (
            <View key={p.id} style={s.participantRow}>
              {p.image ? (
                <Image source={{ uri: p.image }} style={s.participantImg} />
              ) : (
                <View style={[s.participantImg, { backgroundColor: Colors.bgTertiary, justifyContent: 'center', alignItems: 'center' }]}>
                  <Text style={{ color: Colors.textSecondary, fontSize: 12, fontWeight: '700' }}>{p.name?.charAt(0)}</Text>
                </View>
              )}
              <Text style={s.participantName}>{p.name}</Text>
              {p.role === 'ORGANIZER' && (
                <View style={s.organizerBadge}>
                  <Text style={s.organizerText}>Arrangör</Text>
                </View>
              )}
            </View>
          ))}

          {event.waitlisted.length > 0 && (
            <>
              <Text style={[s.sectionTitle, { marginTop: 12, fontSize: 13 }]}>
                ⏳ Väntelista ({event.waitlisted.length})
              </Text>
              {event.waitlisted.map(p => (
                <View key={p.id} style={s.participantRow}>
                  {p.image ? (
                    <Image source={{ uri: p.image }} style={s.participantImg} />
                  ) : (
                    <View style={[s.participantImg, { backgroundColor: Colors.bgTertiary, justifyContent: 'center', alignItems: 'center' }]}>
                      <Text style={{ color: Colors.textSecondary, fontSize: 12 }}>{p.name?.charAt(0)}</Text>
                    </View>
                  )}
                  <Text style={[s.participantName, { color: Colors.textTertiary }]}>{p.name}</Text>
                </View>
              ))}
            </>
          )}
        </View>

        <View style={{ height: 120 }} />
      </ScrollView>

      {/* Bottom action */}
      <View style={s.bottomBar}>
        {event.userStatus === 'CONFIRMED' ? (
          <View style={s.bottomRow}>
            <View style={s.joinedBadge}>
              <Ionicons name="checkmark-circle" size={20} color={Colors.success} />
              <Text style={s.joinedText}>Du är med!</Text>
            </View>
            <TouchableOpacity style={s.leaveBtn} onPress={handleLeave}>
              <Text style={s.leaveBtnText}>Hoppa av</Text>
            </TouchableOpacity>
          </View>
        ) : event.isCreator ? (
          <View style={s.joinedBadge}>
            <Ionicons name="star" size={20} color={Colors.brandPrimary} />
            <Text style={[s.joinedText, { color: Colors.brandPrimary }]}>Du är arrangör</Text>
          </View>
        ) : (
          <TouchableOpacity
            style={s.joinBtn}
            onPress={handleJoin}
            disabled={joining}
            activeOpacity={0.85}
          >
            <LinearGradient colors={['#ea580c', '#db2777']} start={{x:0,y:0}} end={{x:1,y:0}} style={s.joinBtnGradient}>
              {joining ? (
                <ActivityIndicator color="#fff" />
              ) : (
                <>
                  <Ionicons name="add-circle-outline" size={20} color="#fff" />
                  <Text style={s.joinBtnText}>Gå med</Text>
                </>
              )}
            </LinearGradient>
          </TouchableOpacity>
        )}
      </View>
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
  headerTitle: { fontSize: 16, fontWeight: '700', color: Colors.textPrimary, flex: 1, textAlign: 'center' },
  scroll: { flex: 1 },
  imageRow: { marginBottom: 8 },
  eventImage: { width: 320, height: 200, marginLeft: 16, borderRadius: 14, backgroundColor: Colors.bgTertiary },

  section: { paddingHorizontal: 16, paddingVertical: 12 },
  sectionHeader: { flexDirection: 'row', justifyContent: 'space-between', alignItems: 'center', marginBottom: 12 },
  sectionTitle: { fontSize: 16, fontWeight: '700', color: Colors.textPrimary },
  title: { fontSize: 24, fontWeight: '800', color: Colors.textPrimary, marginBottom: 8 },
  creatorRow: { flexDirection: 'row', alignItems: 'center', gap: 8 },
  creatorImg: { width: 28, height: 28, borderRadius: 14, overflow: 'hidden' },
  creatorName: { fontSize: 14, color: Colors.textSecondary },

  infoGrid: {
    flexDirection: 'row', flexWrap: 'wrap', gap: 10,
    paddingHorizontal: 16, paddingBottom: 8,
  },
  infoCard: {
    width: '47%', backgroundColor: Colors.bgSecondary,
    borderRadius: 14, padding: 14, gap: 4,
    borderWidth: 1, borderColor: Colors.borderSubtle,
  },
  infoLabel: { fontSize: 11, color: Colors.textTertiary, fontWeight: '600', textTransform: 'uppercase' },
  infoValue: { fontSize: 14, color: Colors.textPrimary, fontWeight: '600' },

  description: { fontSize: 14, color: Colors.textSecondary, lineHeight: 20 },

  spotsBadge: {
    borderWidth: 1, borderColor: Colors.brandPrimary, borderRadius: 100,
    paddingHorizontal: 10, paddingVertical: 4,
  },
  spotsText: { fontSize: 12, color: Colors.brandPrimary, fontWeight: '600' },

  participantRow: {
    flexDirection: 'row', alignItems: 'center', gap: 10,
    paddingVertical: 6,
  },
  participantImg: { width: 36, height: 36, borderRadius: 18, overflow: 'hidden' },
  participantName: { flex: 1, fontSize: 15, color: Colors.textPrimary, fontWeight: '500' },
  organizerBadge: { backgroundColor: 'rgba(249,115,22,0.12)', paddingHorizontal: 8, paddingVertical: 3, borderRadius: 8 },
  organizerText: { fontSize: 11, color: Colors.brandPrimary, fontWeight: '600' },

  bottomBar: {
    position: 'absolute', bottom: 0, left: 0, right: 0,
    backgroundColor: Colors.bgSecondary,
    borderTopWidth: 1, borderTopColor: Colors.borderSubtle,
    padding: 16, paddingBottom: 34,
  },
  bottomRow: { flexDirection: 'row', justifyContent: 'space-between', alignItems: 'center' },
  joinBtn: {
    borderRadius: 16, overflow: 'hidden',
  },
  joinBtnGradient: {
    flexDirection: 'row', alignItems: 'center', justifyContent: 'center',
    gap: 8, paddingVertical: 16, borderRadius: 16,
  },
  joinBtnText: { color: '#fff', fontSize: 16, fontWeight: '700' },
  joinedBadge: { flexDirection: 'row', alignItems: 'center', gap: 8 },
  joinedText: { fontSize: 16, fontWeight: '700', color: Colors.success },
  leaveBtn: {
    backgroundColor: 'rgba(239,68,68,0.1)', paddingHorizontal: 16, paddingVertical: 10,
    borderRadius: 12, borderWidth: 1, borderColor: 'rgba(239,68,68,0.3)',
  },
  leaveBtnText: { color: Colors.error, fontSize: 14, fontWeight: '600' },
});
