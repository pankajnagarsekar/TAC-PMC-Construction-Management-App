// CARD COMPONENT
// Reusable card container

import React, { ReactNode } from 'react';
import { View, StyleSheet, ViewStyle, TouchableOpacity } from 'react-native';
import { Colors, Spacing, BorderRadius, Shadows } from '../../constants/theme';

interface CardProps {
  children: ReactNode;
  style?: ViewStyle;
  onPress?: () => void;
  variant?: 'default' | 'outlined' | 'elevated';
  padding?: 'none' | 'sm' | 'md' | 'lg';
}

export function Card({
  children,
  style,
  onPress,
  variant = 'default',
  padding = 'md',
}: CardProps) {
  const cardStyles = [
    styles.base,
    styles[variant],
    styles[`padding_${padding}`],
    style,
  ];

  if (onPress) {
    return (
      <TouchableOpacity
        style={cardStyles}
        onPress={onPress}
        activeOpacity={0.7}
      >
        {children}
      </TouchableOpacity>
    );
  }

  return <View style={cardStyles}>{children}</View>;
}

const styles = StyleSheet.create({
  base: {
    backgroundColor: Colors.cardBg,
    borderRadius: BorderRadius.lg,
  },
  
  // Variants
  default: {
    ...Shadows.md,
  },
  outlined: {
    borderWidth: 1,
    borderColor: Colors.border,
  },
  elevated: {
    ...Shadows.lg,
  },
  
  // Padding
  padding_none: {
    padding: 0,
  },
  padding_sm: {
    padding: Spacing.sm,
  },
  padding_md: {
    padding: Spacing.md,
  },
  padding_lg: {
    padding: Spacing.lg,
  },
});

export default Card;
