import React, { useState } from 'react';
import { View, Text, StyleSheet, TouchableOpacity, Image, Pressable } from 'react-native';
import { Ionicons } from '@expo/vector-icons';
import { Colors } from '../../theme/colors';
import { format } from 'date-fns';
import { sv } from 'date-fns/locale';

interface PollCardProps {
  poll: any;
  onRespond: (response: 'YES' | 'MAYBE' | 'NO') => void;
  onPress?: () => void;
}

const API_BASE = 'https://dvoucher-app-815335042776.europe-north1.run.app';
const getAbsoluteUrl = (url: string | null | undefined) => {
  if (!url) return undefined;
  if (url.startsWith('//')) return `https:${url}`;
  if (url.startsWith('/')) return `${API_BASE}${url}`;
  return url;
};

export function PollCard({ poll, onRespond, onPress }: PollCardProps) {
  const isPast = (() => {
    const now = Date.now();
    if (poll.date) return new Date(poll.date).getTime() < now;
    if (poll.alternativeDates && poll.alternativeDates.length > 0) {
      return poll.alternativeDates.every((d: string) => new Date(d).getTime() < now);
    }
    return false;
  })();

  const dateStr = poll.date
    ? format(new Date(poll.date), 'EEEE d MMM HH:mm', { locale: sv })
    : poll.alternativeDates?.length > 0
    ? `${poll.alternativeDates.length} datumförslag`
    : 'Inget datum valt';

  const yesCount = poll.responses?.yes?.length || 0;
  const minPlayers = poll.minPlayers || 4;
  const isMinReached = yesCount >= minPlayers;

  let stateColor: string = Colors.brandAccent; // Cyan default (waiting)
  if (isPast) stateColor = Colors.borderSubtle; // Grey (history)
  else if (poll.myResponse === 'YES') {
    stateColor = isMinReached ? '#22c55e' : '#06b6d4'; // Green or Cyan
  } else if (poll.myResponse === 'MAYBE' || poll.myResponse === 'NO') {
    stateColor = '#f59e0b'; // Amber (paused)
  } else {
    stateColor = '#f59e0b'; // Amber (invitation)
  }

  const CardComponent = onPress ? TouchableOpacity : View;

  return (
    <CardComponent 
      style={[s.card, { borderLeftColor: stateColor, borderLeftWidth: 4 }]} 
      onPress={onPress} 
      activeOpacity={onPress ? 0.7 : 1}
    >
      {/* Header */}
      <View style={s.header}>
        <View style={s.avatarContainer}>
          {poll.creator?.image ? (
            <Image source={{ uri: getAbsoluteUrl(poll.creator.image) }} style={s.avatar} />
          ) : (
            <View style={[s.avatar, s.avatarFallback]}>
              <Text style={s.avatarFallbackText}>{poll.creator?.name?.charAt(0) || '?'}</Text>
            </View>
          )}
        </View>
        <View style={s.headerText}>
          <Text style={s.title}>{poll.title || 'Speltid'}</Text>
          <Text style={s.subtitle}>Av {poll.creator?.name?.split(' ')[0]}</Text>
        </View>
        {poll.hasUnread && (
          <View style={s.unreadDot} />
        )}
      </View>

      {/* Info Row */}
      <View style={s.infoRow}>
        <View style={s.infoItem}>
          <Ionicons name="calendar-outline" size={16} color={Colors.textTertiary} />
          <Text style={s.infoText}>{dateStr}</Text>
        </View>
        {poll.locationName && (
          <View style={s.infoItem}>
            <Ionicons name="location-outline" size={16} color={Colors.textTertiary} />
            <Text style={s.infoText}>{poll.locationName}</Text>
          </View>
        )}
      </View>

      {/* Status Bar */}
      <View style={s.statusBar}>
        <View style={s.statusHeader}>
          <Text style={s.statusTitle}>{yesCount} anmälda</Text>
          <Text style={s.statusTarget}>Mål: {minPlayers}</Text>
        </View>
        <View style={s.progressBarBg}>
          <View 
            style={[
              s.progressBarFill, 
              { width: `${Math.min(100, (yesCount / minPlayers) * 100)}%` },
              isMinReached && s.progressBarFillSuccess
            ]} 
          />
        </View>
      </View>

      {/* Action Buttons (if not past) */}
      {!isPast && (
        <View style={s.actions}>
          <TouchableOpacity 
            style={[s.actionBtn, poll.myResponse === 'YES' && s.actionBtnYes]}
            onPress={() => onRespond('YES')}
          >
            <Text style={[s.actionText, poll.myResponse === 'YES' && s.actionTextActive]}>Spela</Text>
          </TouchableOpacity>
          <TouchableOpacity 
            style={[s.actionBtn, poll.myResponse === 'NO' && s.actionBtnNo]}
            onPress={() => onRespond('NO')}
          >
            <Text style={[s.actionText, poll.myResponse === 'NO' && s.actionTextActive]}>Avböj</Text>
          </TouchableOpacity>
        </View>
      )}
    </CardComponent>
  );
}

const s = StyleSheet.create({
  card: {
    backgroundColor: Colors.bgPrimary,
    borderRadius: 16,
    padding: 16,
    borderWidth: 1,
    borderColor: Colors.borderSubtle,
    shadowColor: Colors.brandPrimary,
    shadowOffset: { width: 0, height: 4 },
    shadowOpacity: 0.1,
    shadowRadius: 12,
    elevation: 4,
  },
  header: {
    flexDirection: 'row',
    alignItems: 'center',
    marginBottom: 16,
  },
  avatarContainer: {
    marginRight: 12,
  },
  avatar: {
    width: 40,
    height: 40,
    borderRadius: 20,
  },
  avatarFallback: {
    backgroundColor: Colors.bgTertiary,
    alignItems: 'center',
    justifyContent: 'center',
  },
  avatarFallbackText: {
    fontSize: 16,
    fontWeight: '600',
    color: Colors.textSecondary,
  },
  headerText: {
    flex: 1,
  },
  title: {
    fontSize: 16,
    fontWeight: '600',
    color: Colors.textPrimary,
    marginBottom: 2,
  },
  subtitle: {
    fontSize: 13,
    color: Colors.textTertiary,
  },
  unreadDot: {
    width: 10,
    height: 10,
    borderRadius: 5,
    backgroundColor: Colors.brandPrimary,
  },
  infoRow: {
    gap: 8,
    marginBottom: 16,
  },
  infoItem: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 6,
  },
  infoText: {
    fontSize: 14,
    color: Colors.textSecondary,
    textTransform: 'capitalize',
  },
  statusBar: {
    backgroundColor: Colors.bgSecondary,
    borderRadius: 12,
    padding: 12,
    marginBottom: 16,
  },
  statusHeader: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    marginBottom: 8,
  },
  statusTitle: {
    fontSize: 14,
    fontWeight: '600',
    color: Colors.textPrimary,
  },
  statusTarget: {
    fontSize: 12,
    color: Colors.textTertiary,
  },
  progressBarBg: {
    height: 6,
    backgroundColor: Colors.bgTertiary,
    borderRadius: 3,
    overflow: 'hidden',
  },
  progressBarFill: {
    height: '100%',
    backgroundColor: Colors.textSecondary,
    borderRadius: 3,
  },
  progressBarFillSuccess: {
    backgroundColor: '#22c55e', // green-500
  },
  actions: {
    flexDirection: 'row',
    gap: 12,
  },
  actionBtn: {
    flex: 1,
    paddingVertical: 12,
    borderRadius: 12,
    backgroundColor: Colors.bgSecondary,
    alignItems: 'center',
  },
  actionBtnYes: {
    backgroundColor: Colors.brandPrimary,
  },
  actionBtnNo: {
    backgroundColor: '#ef4444', // red-500
  },
  actionText: {
    fontSize: 15,
    fontWeight: '600',
    color: Colors.textPrimary,
  },
  actionTextActive: {
    color: '#fff',
  },
});
