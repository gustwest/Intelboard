import React, { useState } from 'react';
import { View, TextInput, TouchableOpacity, Text, StyleSheet, KeyboardAvoidingView, Platform, Alert, ActivityIndicator } from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';
import { useLocalSearchParams, router } from 'expo-router';
import { Ionicons } from '@expo/vector-icons';
import { Colors } from '../src/theme/colors';
import { api } from '../src/api/client';
import { LinearGradient } from 'expo-linear-gradient';

export default function EditPostScreen() {
  const { id, initialBody } = useLocalSearchParams<{ id: string; initialBody: string }>();
  const [body, setBody] = useState(initialBody || '');
  const [saving, setSaving] = useState(false);

  const handleSave = async () => {
    if (!body.trim()) {
      Alert.alert('Ogiltigt', 'Inlägget kan inte vara tomt');
      return;
    }
    
    setSaving(true);
    try {
      await api.post('/api/mobile/feed/edit', { postId: id, body });
      router.back();
    } catch (err) {
      console.warn('Failed to edit post:', err);
      Alert.alert('Fel', 'Kunde inte spara inlägget');
    } finally {
      setSaving(false);
    }
  };

  return (
    <SafeAreaView style={styles.container} edges={['top']}>
      {/* Header */}
      <View style={styles.header}>
        <TouchableOpacity onPress={() => router.back()} style={styles.closeBtn}>
          <Ionicons name="close" size={28} color={Colors.textPrimary} />
        </TouchableOpacity>
        <Text style={styles.title}>Redigera inlägg</Text>
        <TouchableOpacity 
          onPress={handleSave} 
          disabled={saving || !body.trim()}
          style={[styles.saveBtn, (!body.trim() || saving) && styles.saveBtnDisabled]}
        >
          {saving ? (
            <ActivityIndicator size="small" color="#fff" />
          ) : (
            <Text style={styles.saveText}>Spara</Text>
          )}
        </TouchableOpacity>
      </View>

      <KeyboardAvoidingView 
        style={{ flex: 1 }} 
        behavior={Platform.OS === 'ios' ? 'padding' : undefined}
      >
        <TextInput
          style={styles.input}
          placeholder="Vad händer?"
          placeholderTextColor={Colors.textTertiary}
          multiline
          autoFocus
          value={body}
          onChangeText={setBody}
        />
      </KeyboardAvoidingView>
    </SafeAreaView>
  );
}

const styles = StyleSheet.create({
  container: {
    flex: 1,
    backgroundColor: Colors.bgPrimary,
  },
  header: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    paddingHorizontal: 16,
    paddingVertical: 12,
    borderBottomWidth: 1,
    borderBottomColor: Colors.borderSubtle,
  },
  closeBtn: {
    padding: 4,
  },
  title: {
    fontSize: 18,
    fontWeight: '700',
    color: Colors.textPrimary,
  },
  saveBtn: {
    backgroundColor: Colors.brandPrimary,
    paddingHorizontal: 16,
    paddingVertical: 8,
    borderRadius: 20,
  },
  saveBtnDisabled: {
    backgroundColor: Colors.bgTertiary,
  },
  saveText: {
    color: '#fff',
    fontWeight: '600',
    fontSize: 14,
  },
  input: {
    flex: 1,
    padding: 16,
    fontSize: 18,
    color: Colors.textPrimary,
    textAlignVertical: 'top',
  },
});
