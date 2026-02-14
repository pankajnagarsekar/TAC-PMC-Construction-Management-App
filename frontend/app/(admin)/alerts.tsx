// ALERTS SCREEN
// System alerts and warnings

import React from 'react';
import { View, Text, StyleSheet, ScrollView, TouchableOpacity } from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';
import { Ionicons } from '@expo/vector-icons';
import { Card } from '../../components/ui';
import { Colors, Spacing, FontSizes, BorderRadius } from '../../constants/theme';

export default function AlertsScreen() {
  return (
    <SafeAreaView style={styles.container} edges={['left', 'right']}>
      <ScrollView contentContainerStyle={styles.content}>
        <Card style={styles.headerCard}>
          <Ionicons name="alert-circle" size={48} color={Colors.warning} />
          <Text style={styles.title}>System Alerts</Text>
          <Text style={styles.subtitle}>Over-commits, budget warnings, delays</Text>
        </Card>

        {/* Alert Type Filters */}
        <View style={styles.filterRow}>
          <TouchableOpacity style={[styles.filterChip, styles.filterChipActive]}>
            <Text style={[styles.filterText, styles.filterTextActive]}>All</Text>
          </TouchableOpacity>
          <TouchableOpacity style={styles.filterChip}>
            <Text style={styles.filterText}>Critical</Text>
          </TouchableOpacity>
          <TouchableOpacity style={styles.filterChip}>
            <Text style={styles.filterText}>High</Text>
          </TouchableOpacity>
          <TouchableOpacity style={styles.filterChip}>
            <Text style={styles.filterText}>Resolved</Text>
          </TouchableOpacity>
        </View>

        <View style={styles.placeholderList}>
          <Text style={styles.placeholderText}>Alerts will be listed here</Text>
          <Text style={styles.placeholderSubtext}>OVER_COMMIT, BUDGET_EXCEEDED, DELAY_WARNING...</Text>
        </View>
      </ScrollView>
    </SafeAreaView>
  );
}

const styles = StyleSheet.create({
  container: { flex: 1, backgroundColor: Colors.background },
  content: { padding: Spacing.md },
  headerCard: { alignItems: 'center', padding: Spacing.xl, marginBottom: Spacing.lg },
  title: { fontSize: FontSizes.xl, fontWeight: '600', color: Colors.text, marginTop: Spacing.md },
  subtitle: { fontSize: FontSizes.md, color: Colors.textSecondary, textAlign: 'center', marginTop: Spacing.xs },
  filterRow: { flexDirection: 'row', gap: Spacing.sm, marginBottom: Spacing.md },
  filterChip: {
    paddingHorizontal: Spacing.md, paddingVertical: Spacing.sm,
    borderRadius: BorderRadius.full, backgroundColor: Colors.white,
    borderWidth: 1, borderColor: Colors.border,
  },
  filterChipActive: { backgroundColor: Colors.warning, borderColor: Colors.warning },
  filterText: { fontSize: FontSizes.sm, color: Colors.textSecondary },
  filterTextActive: { color: Colors.white, fontWeight: '500' },
  placeholderList: { alignItems: 'center', padding: Spacing.xl },
  placeholderText: { fontSize: FontSizes.md, color: Colors.textSecondary },
  placeholderSubtext: { fontSize: FontSizes.sm, color: Colors.textMuted, marginTop: Spacing.xs },
});
