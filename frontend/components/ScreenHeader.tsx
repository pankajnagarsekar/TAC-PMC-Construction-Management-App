// Reusable Screen Header with Back Button
import React from 'react';
import { View, Text, StyleSheet, Pressable } from 'react-native';
import { useRouter } from 'expo-router';
import { Ionicons } from '@expo/vector-icons';
import { Colors, Spacing, FontSizes } from '../constants/theme';

interface ScreenHeaderProps {
  title: string;
  showBack?: boolean;
  rightAction?: {
    icon: keyof typeof Ionicons.glyphMap;
    onPress: () => void;
  };
}

export default function ScreenHeader({ title, showBack = true, rightAction }: ScreenHeaderProps) {
  const router = useRouter();

  return (
    <View style={styles.header}>
      {showBack ? (
        <Pressable onPress={() => router.back()} style={styles.backButton}>
          <Ionicons name="arrow-back" size={24} color={Colors.primary} />
        </Pressable>
      ) : (
        <View style={styles.placeholder} />
      )}
      
      <Text style={styles.title} numberOfLines={1}>{title}</Text>
      
      {rightAction ? (
        <Pressable onPress={rightAction.onPress} style={styles.rightButton}>
          <Ionicons name={rightAction.icon} size={24} color={Colors.primary} />
        </Pressable>
      ) : (
        <View style={styles.placeholder} />
      )}
    </View>
  );
}

const styles = StyleSheet.create({
  header: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    paddingHorizontal: Spacing.md,
    paddingVertical: Spacing.sm,
    backgroundColor: Colors.white,
    borderBottomWidth: 1,
    borderBottomColor: Colors.border,
  },
  backButton: {
    padding: Spacing.xs,
    minWidth: 40,
    alignItems: 'flex-start',
  },
  rightButton: {
    padding: Spacing.xs,
    minWidth: 40,
    alignItems: 'flex-end',
  },
  placeholder: {
    minWidth: 40,
  },
  title: {
    flex: 1,
    fontSize: FontSizes.lg,
    fontWeight: '600',
    color: Colors.text,
    textAlign: 'center',
  },
});
