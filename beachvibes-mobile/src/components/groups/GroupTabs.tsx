import React from 'react';
import { View, Text, TouchableOpacity, ScrollView, StyleSheet } from 'react-native';
import { Colors } from '../../theme/colors';

interface TabOption {
  key: string;
  label: string;
  count?: number;
}

interface GroupTabsProps {
  tabs: TabOption[];
  activeTab: string;
  onChange: (key: string) => void;
}

export function GroupTabs({ tabs, activeTab, onChange }: GroupTabsProps) {
  return (
    <View style={s.container}>
      <ScrollView horizontal showsHorizontalScrollIndicator={false} contentContainerStyle={s.scroll}>
        {tabs.map((tab) => {
          const isActive = activeTab === tab.key;
          const hasCount = tab.count !== undefined && tab.count > 0;
          
          return (
            <TouchableOpacity
              key={tab.key}
              style={[s.tab, isActive && s.tabActive]}
              onPress={() => onChange(tab.key)}
            >
              <Text style={[s.label, isActive && s.labelActive]}>{tab.label}</Text>
              {hasCount && (
                <View style={[s.badge, isActive && s.badgeActive]}>
                  <Text style={[s.badgeText, isActive && s.badgeTextActive]}>
                    {tab.count}
                  </Text>
                </View>
              )}
            </TouchableOpacity>
          );
        })}
      </ScrollView>
    </View>
  );
}

const s = StyleSheet.create({
  container: {
    paddingVertical: 12,
    borderBottomWidth: 1,
    borderBottomColor: Colors.borderSubtle,
    backgroundColor: Colors.bgPrimary,
  },
  scroll: {
    paddingHorizontal: 16,
    gap: 8,
  },
  tab: {
    flexDirection: 'row',
    alignItems: 'center',
    paddingHorizontal: 14,
    paddingVertical: 8,
    borderRadius: 20,
    backgroundColor: Colors.bgSecondary,
    borderWidth: 1,
    borderColor: 'transparent',
  },
  tabActive: {
    backgroundColor: Colors.brandPrimary + '15', // very light orange
    borderColor: Colors.brandPrimary,
  },
  label: {
    fontSize: 14,
    fontWeight: '500',
    color: Colors.textSecondary,
  },
  labelActive: {
    color: Colors.brandPrimary,
    fontWeight: '600',
  },
  badge: {
    marginLeft: 6,
    paddingHorizontal: 6,
    paddingVertical: 2,
    borderRadius: 10,
    backgroundColor: Colors.bgTertiary,
  },
  badgeActive: {
    backgroundColor: Colors.brandPrimary,
  },
  badgeText: {
    fontSize: 11,
    fontWeight: '600',
    color: Colors.textSecondary,
  },
  badgeTextActive: {
    color: '#fff',
  },
});
