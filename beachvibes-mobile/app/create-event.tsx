import React, { useState, useEffect } from 'react';
import {
  View, Text, ScrollView, StyleSheet,
  TouchableOpacity, TextInput, Alert, ActivityIndicator,
  KeyboardAvoidingView, Platform, FlatList,
} from 'react-native';
import { Ionicons } from '@expo/vector-icons';
import { Colors } from '../src/theme/colors';
import { api } from '../src/api/client';
import { SafeAreaView } from 'react-native-safe-area-context';
import { router } from 'expo-router';
import { LinearGradient } from 'expo-linear-gradient';

interface Court {
  id: string;
  name: string;
  location: string;
  type: string;
}

const SKILL_LEVELS = [
  { key: 'ROOKIE', label: '⭐ Rookie', desc: 'Nybörjare' },
  { key: 'INTERMEDIATE', label: '⭐⭐ Intermediate', desc: 'Hobbyspelare' },
  { key: 'COMPETITIVE', label: '⭐⭐⭐ Competitive', desc: 'Tävlingsinriktad' },
  { key: 'ADVANCED', label: '⭐⭐⭐⭐ Advanced', desc: 'Erfaren tävlande' },
  { key: 'ELITE', label: '⭐⭐⭐⭐⭐ Elite', desc: 'Topprankad' },
];

const PLAYER_COUNTS = [4, 6, 8, 10, 12];

export default function CreateEventScreen() {
  const [title, setTitle] = useState('');
  const [description, setDescription] = useState('');
  const [date, setDate] = useState('');
  const [time, setTime] = useState('');
  const [maxPlayers, setMaxPlayers] = useState(8);
  const [skillLevel, setSkillLevel] = useState('');
  const [submitting, setSubmitting] = useState(false);
  const [courts, setCourts] = useState<Court[]>([]);
  const [selectedCourt, setSelectedCourt] = useState<Court | null>(null);
  const [courtSearch, setCourtSearch] = useState('');
  const [showCourtPicker, setShowCourtPicker] = useState(false);

  useEffect(() => {
    api.get<Court[]>('/api/mobile/courts')
      .then(data => setCourts(Array.isArray(data) ? data : []))
      .catch(() => {});
  }, []);

  const handleSubmit = async () => {
    if (!title.trim()) {
      Alert.alert('Fyll i titel', 'Evenemanget behöver ett namn');
      return;
    }

    setSubmitting(true);
    try {
      const eventData = {
        title: title.trim(),
        description: description.trim(),
        courtId: selectedCourt?.id || undefined,
        locationName: selectedCourt?.name || 'Ej angiven',
        date,
        startTime: time, // API requires startTime, not time
        duration: 2, // Default duration
        maxPlayers,
        skillLevel: skillLevel || undefined,
        type: 'GAME',
      };
      const result = await api.post<{ success: boolean; event: any }>('/api/mobile/events', eventData);
      if (result?.success) {
        Alert.alert('Skapat!', 'Speltiden har skapats', [{ text: 'OK', onPress: () => router.back() }]);
      } else {
        router.back();
      }
    } catch (err: any) {
      console.warn('Failed to create event:', err);
      Alert.alert('Fel', err.message || 'Kunde inte skapa evenemang');
    } finally {
      setSubmitting(false);
    }
  };

  return (
    <SafeAreaView style={s.container} edges={['top']}>
      {/* Header */}
      <View style={s.header}>
        <TouchableOpacity onPress={() => router.back()} style={s.backBtn}>
          <Ionicons name="close" size={24} color={Colors.textPrimary} />
        </TouchableOpacity>
        <Text style={s.headerTitle}>Skapa speltid</Text>
        <View style={{ width: 32 }} />
      </View>

      <KeyboardAvoidingView style={{ flex: 1 }} behavior={Platform.OS === 'ios' ? 'padding' : undefined}>
        <ScrollView style={s.scroll} showsVerticalScrollIndicator={false} keyboardShouldPersistTaps="handled">

          {/* Title */}
          <View style={s.field}>
            <Text style={s.label}>Titel *</Text>
            <TextInput
              style={s.input}
              placeholder="T.ex. 'Afterwork beach volley'"
              placeholderTextColor={Colors.textTertiary}
              value={title}
              onChangeText={setTitle}
            />
          </View>

          {/* Description */}
          <View style={s.field}>
            <Text style={s.label}>Beskrivning</Text>
            <TextInput
              style={[s.input, s.inputMulti]}
              placeholder="Beskriv speltiden..."
              placeholderTextColor={Colors.textTertiary}
              value={description}
              onChangeText={setDescription}
              multiline
              numberOfLines={3}
            />
          </View>

          {/* Court picker */}
          <View style={s.field}>
            <Text style={s.label}>Bana</Text>
            <TouchableOpacity
              style={s.inputRow}
              onPress={() => setShowCourtPicker(!showCourtPicker)}
            >
              <Ionicons name="location-outline" size={18} color={Colors.brandPrimary} />
              <Text style={[{ flex: 1, fontSize: 15 }, selectedCourt ? { color: Colors.textPrimary } : { color: Colors.textTertiary }]}>
                {selectedCourt ? selectedCourt.name : 'Välj bana...'}
              </Text>
              <Ionicons name={showCourtPicker ? 'chevron-up' : 'chevron-down'} size={18} color={Colors.textTertiary} />
            </TouchableOpacity>
            {selectedCourt && (
              <Text style={{ fontSize: 12, color: Colors.textTertiary, marginTop: 4, marginLeft: 4 }}>
                📍 {selectedCourt.location}
              </Text>
            )}
            {showCourtPicker && (
              <View style={s.courtPickerContainer}>
                <TextInput
                  style={s.courtSearchInput}
                  placeholder="Sök bana..."
                  placeholderTextColor={Colors.textTertiary}
                  value={courtSearch}
                  onChangeText={setCourtSearch}
                />
                <ScrollView style={{ maxHeight: 200 }} nestedScrollEnabled>
                  {courts
                    .filter(c => c.name.toLowerCase().includes(courtSearch.toLowerCase()) || c.location?.toLowerCase().includes(courtSearch.toLowerCase()))
                    .slice(0, 20)
                    .map(court => (
                      <TouchableOpacity
                        key={court.id}
                        style={[s.courtOption, selectedCourt?.id === court.id && s.courtOptionActive]}
                        onPress={() => { setSelectedCourt(court); setShowCourtPicker(false); setCourtSearch(''); }}
                      >
                        <View style={{ flex: 1 }}>
                          <Text style={s.courtName}>{court.name}</Text>
                          <Text style={s.courtLocation}>{court.location}</Text>
                        </View>
                        {selectedCourt?.id === court.id && <Ionicons name="checkmark-circle" size={20} color={Colors.brandPrimary} />}
                      </TouchableOpacity>
                    ))}
                </ScrollView>
              </View>
            )}
          </View>

          {/* Date & Time */}
          <View style={s.row}>
            <View style={[s.field, { flex: 1 }]}>
              <Text style={s.label}>Datum</Text>
              <View style={s.inputRow}>
                <Ionicons name="calendar-outline" size={16} color={Colors.brandAccent} />
                <TextInput
                  style={[s.input, { flex: 1, borderWidth: 0, padding: 0 }]}
                  placeholder="YYYY-MM-DD"
                  placeholderTextColor={Colors.textTertiary}
                  value={date}
                  onChangeText={setDate}
                />
              </View>
            </View>
            <View style={[s.field, { flex: 1 }]}>
              <Text style={s.label}>Tid</Text>
              <View style={s.inputRow}>
                <Ionicons name="time-outline" size={16} color={Colors.brandPink} />
                <TextInput
                  style={[s.input, { flex: 1, borderWidth: 0, padding: 0 }]}
                  placeholder="HH:MM"
                  placeholderTextColor={Colors.textTertiary}
                  value={time}
                  onChangeText={setTime}
                />
              </View>
            </View>
          </View>

          {/* Player count */}
          <View style={s.field}>
            <Text style={s.label}>Antal spelare</Text>
            <View style={s.chipRow}>
              {PLAYER_COUNTS.map(n => (
                <TouchableOpacity
                  key={n}
                  style={[s.chip, maxPlayers === n && s.chipActive]}
                  onPress={() => setMaxPlayers(n)}
                >
                  {maxPlayers === n ? (
                    <LinearGradient colors={['#ea580c', '#db2777']} start={{x:0,y:0}} end={{x:1,y:0}} style={s.chipGradient}>
                      <Text style={s.chipTextActive}>{n}</Text>
                    </LinearGradient>
                  ) : (
                    <Text style={s.chipText}>{n}</Text>
                  )}
                </TouchableOpacity>
              ))}
            </View>
          </View>

          {/* Skill level */}
          <View style={s.field}>
            <Text style={s.label}>Nivå (valfritt)</Text>
            {SKILL_LEVELS.map(sl => (
              <TouchableOpacity
                key={sl.key}
                style={[s.skillRow, skillLevel === sl.key && s.skillRowActive]}
                onPress={() => setSkillLevel(skillLevel === sl.key ? '' : sl.key)}
              >
                <View style={s.radioOuter}>
                  {skillLevel === sl.key && (
                    <LinearGradient colors={['#ea580c', '#db2777']} style={s.radioInner} />
                  )}
                </View>
                <View style={{ flex: 1 }}>
                  <Text style={[s.skillLabel, skillLevel === sl.key && { color: Colors.textPrimary }]}>{sl.label}</Text>
                  <Text style={s.skillDesc}>{sl.desc}</Text>
                </View>
              </TouchableOpacity>
            ))}
          </View>

          <View style={{ height: 100 }} />
        </ScrollView>
      </KeyboardAvoidingView>

      {/* Submit button */}
      <View style={s.footer}>
        <TouchableOpacity
          style={s.submitBtn}
          onPress={handleSubmit}
          disabled={submitting}
          activeOpacity={0.85}
        >
          <LinearGradient colors={['#ea580c', '#db2777']} start={{x:0,y:0}} end={{x:1,y:0}} style={s.submitGradient}>
            {submitting ? (
              <ActivityIndicator color="#fff" />
            ) : (
              <>
                <Ionicons name="add-circle-outline" size={20} color="#fff" />
                <Text style={s.submitText}>Skapa speltid</Text>
              </>
            )}
          </LinearGradient>
        </TouchableOpacity>
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
  headerTitle: { fontSize: 16, fontWeight: '700', color: Colors.textPrimary },
  scroll: { flex: 1, padding: 16 },
  field: { marginBottom: 20 },
  label: { fontSize: 13, fontWeight: '700', color: Colors.textSecondary, marginBottom: 8, textTransform: 'uppercase', letterSpacing: 0.5 },
  input: {
    backgroundColor: Colors.bgSecondary, borderRadius: 14,
    paddingHorizontal: 16, paddingVertical: 14,
    fontSize: 15, color: Colors.textPrimary,
    borderWidth: 1, borderColor: Colors.borderSubtle,
  },
  inputMulti: { minHeight: 80, textAlignVertical: 'top' },
  inputRow: {
    flexDirection: 'row', alignItems: 'center', gap: 10,
    backgroundColor: Colors.bgSecondary, borderRadius: 14,
    paddingHorizontal: 14, paddingVertical: 14,
    borderWidth: 1, borderColor: Colors.borderSubtle,
  },
  row: { flexDirection: 'row', gap: 12 },
  chipRow: { flexDirection: 'row', gap: 8 },
  chip: {
    borderRadius: 12, overflow: 'hidden',
    backgroundColor: Colors.bgSecondary,
    borderWidth: 1, borderColor: Colors.borderSubtle,
    minWidth: 48, height: 44,
    justifyContent: 'center', alignItems: 'center',
  },
  chipActive: { borderColor: 'transparent' },
  chipGradient: { width: '100%', height: '100%', justifyContent: 'center', alignItems: 'center', borderRadius: 12 },
  chipText: { fontSize: 15, fontWeight: '600', color: Colors.textSecondary },
  chipTextActive: { fontSize: 15, fontWeight: '700', color: '#fff' },
  skillRow: {
    flexDirection: 'row', alignItems: 'center', gap: 12,
    paddingVertical: 12, paddingHorizontal: 14,
    borderRadius: 14, marginBottom: 6,
    backgroundColor: Colors.bgSecondary,
    borderWidth: 1, borderColor: Colors.borderSubtle,
  },
  skillRowActive: { borderColor: Colors.brandPrimary, backgroundColor: 'rgba(249,115,22,0.04)' },
  radioOuter: {
    width: 20, height: 20, borderRadius: 10,
    borderWidth: 2, borderColor: Colors.borderSubtle,
    justifyContent: 'center', alignItems: 'center',
  },
  radioInner: { width: 12, height: 12, borderRadius: 6 },
  skillLabel: { fontSize: 14, fontWeight: '600', color: Colors.textSecondary },
  skillDesc: { fontSize: 12, color: Colors.textTertiary },
  footer: {
    padding: 16, borderTopWidth: 1, borderTopColor: Colors.borderSubtle,
    backgroundColor: Colors.bgPrimary,
  },
  submitBtn: { borderRadius: 16, overflow: 'hidden' },
  submitGradient: {
    flexDirection: 'row', alignItems: 'center', justifyContent: 'center',
    gap: 8, paddingVertical: 16, borderRadius: 16,
  },
  submitText: { color: '#fff', fontSize: 16, fontWeight: '700' },
  // Court picker
  courtPickerContainer: { marginTop: 8, backgroundColor: Colors.bgTertiary, borderRadius: 14, borderWidth: 1, borderColor: Colors.borderSubtle, overflow: 'hidden' },
  courtSearchInput: { paddingHorizontal: 14, paddingVertical: 10, fontSize: 14, color: Colors.textPrimary, borderBottomWidth: 1, borderBottomColor: Colors.borderSubtle },
  courtOption: { flexDirection: 'row', alignItems: 'center', paddingHorizontal: 14, paddingVertical: 12, borderBottomWidth: 1, borderBottomColor: Colors.borderSubtle },
  courtOptionActive: { backgroundColor: 'rgba(249,115,22,0.06)' },
  courtName: { fontSize: 14, fontWeight: '600', color: Colors.textPrimary },
  courtLocation: { fontSize: 12, color: Colors.textTertiary, marginTop: 2 },
});
