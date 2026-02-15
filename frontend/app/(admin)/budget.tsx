// BUDGET SCREEN
// Budget management per code

import React from 'react';
import { View, Text, StyleSheet, ScrollView, TouchableOpacity } from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';
import { Ionicons } from '@expo/vector-icons';
import { useRouter } from 'expo-router';
import { Card } from '../../components/ui';
import { Colors, Spacing, FontSizes } from '../../constants/theme';

export default function BudgetScreen() {
  const router = useRouter();

  return (
    <SafeAreaView style={styles.container} edges={['left', 'right']}>
      <ScrollView contentContainerStyle={styles.content}>
        <Card style={styles.headerCard}>
          <Ionicons name="wallet" size={48} color={Colors.primary} />
          <Text style={styles.title}>Budget Management</Text>
          <Text style={styles.subtitle}>Allocate and track budgets per activity code</Text>
        </Card>

        <View style={styles.placeholderList}>
          <Text style={styles.placeholderText}>Budget allocations will be listed here</Text>
          <Text style={styles.placeholderSubtext}>View approved budget, committed, and remaining</Text>
        </View>
      </ScrollView>

      <TouchableOpacity style={styles.fab}>
        <Ionicons name="add" size={28} color={Colors.white} />
      </TouchableOpacity>
    </SafeAreaView>
  );
}

const styles = StyleSheet.create({
  container: { flex: 1, backgroundColor: Colors.background },
  content: { padding: Spacing.md },
  headerCard: { alignItems: 'center', padding: Spacing.xl, marginBottom: Spacing.lg },
  title: { fontSize: FontSizes.xl, fontWeight: '600', color: Colors.text, marginTop: Spacing.md },
  subtitle: { fontSize: FontSizes.md, color: Colors.textSecondary, textAlign: 'center', marginTop: Spacing.xs },
  placeholderList: { alignItems: 'center', padding: Spacing.xl },
  placeholderText: { fontSize: FontSizes.md, color: Colors.textSecondary },
  placeholderSubtext: { fontSize: FontSizes.sm, color: Colors.textMuted, marginTop: Spacing.xs },
  fab: {
    position: 'absolute', right: Spacing.lg, bottom: Spacing.lg,
    width: 56, height: 56, borderRadius: 28,
    backgroundColor: Colors.accent, justifyContent: 'center', alignItems: 'center',
    shadowColor: Colors.accent, shadowOffset: { width: 0, height: 4 },
    shadowOpacity: 0.3, shadowRadius: 8, elevation: 5,
  },
});
