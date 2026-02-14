// SUPERVISOR PROGRESS SCREEN
// Progress tracking for supervisors

import React from 'react';
import { View, Text, StyleSheet, ScrollView, TouchableOpacity } from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';
import { Ionicons } from '@expo/vector-icons';
import { Card } from '../../components/ui';
import { Colors, Spacing, FontSizes, BorderRadius } from '../../constants/theme';

export default function SupervisorProgress() {
  return (
    <SafeAreaView style={styles.container} edges={['left', 'right']}>
      <ScrollView contentContainerStyle={styles.content}>
        <Card style={styles.headerCard}>
          <View style={styles.headerIcon}>
            <Ionicons name="trending-up" size={32} color={Colors.success} />
          </View>
          <Text style={styles.headerTitle}>Progress Tracking</Text>
          <Text style={styles.headerSubtitle}>Update physical progress for your assigned activities</Text>
        </Card>

        {/* Progress Items */}
        <View style={styles.section}>
          <Text style={styles.sectionTitle}>Activities</Text>
          
          <ProgressItem
            code="CIVIL-001"
            name="Foundation Work"
            current={75}
            planned={80}
          />
          
          <ProgressItem
            code="CIVIL-002"
            name="Column Construction"
            current={45}
            planned={50}
          />
          
          <ProgressItem
            code="ELEC-001"
            name="Electrical Wiring"
            current={20}
            planned={35}
            delayed
          />
        </View>

        {/* Add Progress Button */}
        <TouchableOpacity style={styles.addButton}>
          <Ionicons name="add-circle" size={24} color={Colors.white} />
          <Text style={styles.addButtonText}>Update Progress</Text>
        </TouchableOpacity>
      </ScrollView>
    </SafeAreaView>
  );
}

function ProgressItem({ 
  code, 
  name, 
  current, 
  planned, 
  delayed = false 
}: { 
  code: string; 
  name: string; 
  current: number; 
  planned: number; 
  delayed?: boolean;
}) {
  const difference = planned - current;
  
  return (
    <Card style={styles.progressCard}>
      <View style={styles.progressHeader}>
        <View style={styles.codeContainer}>
          <Text style={styles.codeText}>{code}</Text>
        </View>
        <Text style={styles.progressName}>{name}</Text>
        {delayed && (
          <View style={styles.delayBadge}>
            <Text style={styles.delayText}>Delayed</Text>
          </View>
        )}
      </View>

      <View style={styles.progressBars}>
        <View style={styles.progressBarContainer}>
          <View style={styles.progressBarLabel}>
            <Text style={styles.barLabelText}>Actual</Text>
            <Text style={[styles.barValue, { color: Colors.success }]}>{current}%</Text>
          </View>
          <View style={styles.progressBar}>
            <View style={[styles.progressFill, { width: `${current}%`, backgroundColor: Colors.success }]} />
          </View>
        </View>

        <View style={styles.progressBarContainer}>
          <View style={styles.progressBarLabel}>
            <Text style={styles.barLabelText}>Planned</Text>
            <Text style={[styles.barValue, { color: Colors.info }]}>{planned}%</Text>
          </View>
          <View style={styles.progressBar}>
            <View style={[styles.progressFill, { width: `${planned}%`, backgroundColor: Colors.info }]} />
          </View>
        </View>
      </View>

      {difference > 0 && (
        <View style={styles.differenceContainer}>
          <Ionicons name="alert-circle" size={14} color={Colors.warning} />
          <Text style={styles.differenceText}>Behind by {difference}%</Text>
        </View>
      )}

      <TouchableOpacity style={styles.updateButton}>
        <Ionicons name="create-outline" size={18} color={Colors.primary} />
        <Text style={styles.updateButtonText}>Update</Text>
      </TouchableOpacity>
    </Card>
  );
}

const styles = StyleSheet.create({
  container: {
    flex: 1,
    backgroundColor: Colors.background,
  },
  content: {
    padding: Spacing.md,
  },
  headerCard: {
    alignItems: 'center',
    padding: Spacing.lg,
    marginBottom: Spacing.lg,
  },
  headerIcon: {
    width: 64,
    height: 64,
    borderRadius: 32,
    backgroundColor: Colors.successLight,
    justifyContent: 'center',
    alignItems: 'center',
    marginBottom: Spacing.md,
  },
  headerTitle: {
    fontSize: FontSizes.xl,
    fontWeight: '600',
    color: Colors.text,
  },
  headerSubtitle: {
    fontSize: FontSizes.sm,
    color: Colors.textSecondary,
    textAlign: 'center',
    marginTop: Spacing.xs,
  },
  section: {
    marginBottom: Spacing.lg,
  },
  sectionTitle: {
    fontSize: FontSizes.md,
    fontWeight: '600',
    color: Colors.textSecondary,
    marginBottom: Spacing.md,
  },
  progressCard: {
    marginBottom: Spacing.sm,
  },
  progressHeader: {
    flexDirection: 'row',
    alignItems: 'center',
    marginBottom: Spacing.md,
  },
  codeContainer: {
    backgroundColor: Colors.primaryLight + '20',
    paddingHorizontal: Spacing.sm,
    paddingVertical: Spacing.xs,
    borderRadius: BorderRadius.sm,
    marginRight: Spacing.sm,
  },
  codeText: {
    fontSize: FontSizes.xs,
    fontWeight: '600',
    color: Colors.primary,
  },
  progressName: {
    flex: 1,
    fontSize: FontSizes.md,
    fontWeight: '500',
    color: Colors.text,
  },
  delayBadge: {
    backgroundColor: Colors.errorLight,
    paddingHorizontal: Spacing.sm,
    paddingVertical: Spacing.xs,
    borderRadius: BorderRadius.sm,
  },
  delayText: {
    fontSize: FontSizes.xs,
    fontWeight: '500',
    color: Colors.error,
  },
  progressBars: {
    gap: Spacing.sm,
    marginBottom: Spacing.sm,
  },
  progressBarContainer: {
    gap: Spacing.xs,
  },
  progressBarLabel: {
    flexDirection: 'row',
    justifyContent: 'space-between',
  },
  barLabelText: {
    fontSize: FontSizes.xs,
    color: Colors.textMuted,
  },
  barValue: {
    fontSize: FontSizes.xs,
    fontWeight: '600',
  },
  progressBar: {
    height: 8,
    backgroundColor: Colors.border,
    borderRadius: 4,
    overflow: 'hidden',
  },
  progressFill: {
    height: '100%',
    borderRadius: 4,
  },
  differenceContainer: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: Spacing.xs,
    marginBottom: Spacing.sm,
  },
  differenceText: {
    fontSize: FontSizes.xs,
    color: Colors.warning,
  },
  updateButton: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'center',
    borderTopWidth: 1,
    borderTopColor: Colors.border,
    paddingTop: Spacing.sm,
    gap: Spacing.xs,
  },
  updateButtonText: {
    fontSize: FontSizes.sm,
    fontWeight: '500',
    color: Colors.primary,
  },
  addButton: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'center',
    backgroundColor: Colors.success,
    paddingVertical: Spacing.md,
    borderRadius: BorderRadius.md,
    gap: Spacing.sm,
  },
  addButtonText: {
    fontSize: FontSizes.md,
    fontWeight: '600',
    color: Colors.white,
  },
});
