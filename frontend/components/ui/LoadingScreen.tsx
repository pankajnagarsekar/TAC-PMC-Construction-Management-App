// LOADING SCREEN COMPONENT
// Full screen loading indicator

import React from 'react';
import { View, ActivityIndicator, Text, StyleSheet } from 'react-native';
import { Colors, FontSizes, Spacing } from '../../constants/theme';

interface LoadingScreenProps {
  message?: string;
}

export function LoadingScreen({ message = 'Loading...' }: LoadingScreenProps) {
  return (
    <View style={styles.container}>
      <ActivityIndicator size="large" color={Colors.primary} />
      <Text style={styles.message}>{message}</Text>
    </View>
  );
}

const styles = StyleSheet.create({
  container: {
    flex: 1,
    justifyContent: 'center',
    alignItems: 'center',
    backgroundColor: Colors.background,
  },
  message: {
    marginTop: Spacing.md,
    fontSize: FontSizes.md,
    color: Colors.textSecondary,
  },
});

export default LoadingScreen;
