// ADMIN REPORTS SCREEN
// Reports hub placeholder

import React from 'react';
import { View, Text, StyleSheet, ScrollView, TouchableOpacity } from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';
import { Ionicons } from '@expo/vector-icons';
import { useRouter } from 'expo-router';
import { Card } from '../../components/ui';
import { Colors, Spacing, FontSizes } from '../../constants/theme';

export default function AdminReports() {
  const router = useRouter();

  return (
    <SafeAreaView style={styles.container} edges={['left', 'right']}>
      <ScrollView contentContainerStyle={styles.content}>
        <Card style={styles.placeholderCard}>
          <Ionicons name="bar-chart-outline" size={64} color={Colors.primary} />
          <Text style={styles.title}>Report Center</Text>
          <Text style={styles.subtitle}>Generate and view project reports</Text>
        </Card>

        <View style={styles.reportList}>
          <ReportItem 
            icon="pie-chart" 
            title="Financial Summary" 
            description="Budget vs Actual spending"
            onPress={() => router.push('/(admin)/reports/financial')}
          />
          <ReportItem 
            icon="trending-up" 
            title="Progress Report" 
            description="Physical vs planned progress"
            onPress={() => router.push('/(admin)/reports/progress')}
          />
          <ReportItem 
            icon="calendar" 
            title="DPR Summary" 
            description="Daily progress report overview"
            onPress={() => router.push('/(admin)/reports/dpr-summary')}
          />
          <ReportItem 
            icon="people" 
            title="Attendance Report" 
            description="Supervisor attendance tracking"
            onPress={() => router.push('/(admin)/reports/attendance')}
          />
        </View>
      </ScrollView>
    </SafeAreaView>
  );
}

function ReportItem({ icon, title, description, onPress }: { icon: keyof typeof Ionicons.glyphMap; title: string; description: string; onPress: () => void }) {
  return (
    <TouchableOpacity onPress={onPress}>
      <Card style={styles.reportCard}>
        <View style={styles.reportIcon}>
          <Ionicons name={icon} size={24} color={Colors.accent} />
        </View>
        <View style={styles.reportContent}>
          <Text style={styles.reportTitle}>{title}</Text>
          <Text style={styles.reportDescription}>{description}</Text>
        </View>
        <Ionicons name="chevron-forward" size={20} color={Colors.primary} />
      </Card>
    </TouchableOpacity>
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
  placeholderCard: {
    alignItems: 'center',
    padding: Spacing.xl,
    marginBottom: Spacing.lg,
  },
  title: {
    fontSize: FontSizes.xl,
    fontWeight: '600',
    color: Colors.text,
    marginTop: Spacing.md,
  },
  subtitle: {
    fontSize: FontSizes.md,
    color: Colors.textSecondary,
    textAlign: 'center',
    marginTop: Spacing.xs,
  },
  reportList: {
    gap: Spacing.sm,
  },
  reportCard: {
    flexDirection: 'row',
    alignItems: 'center',
  },
  reportIcon: {
    width: 44,
    height: 44,
    borderRadius: 22,
    backgroundColor: Colors.warningLight,
    justifyContent: 'center',
    alignItems: 'center',
    marginRight: Spacing.md,
  },
  reportContent: {
    flex: 1,
  },
  reportTitle: {
    fontSize: FontSizes.md,
    fontWeight: '600',
    color: Colors.text,
  },
  reportDescription: {
    fontSize: FontSizes.sm,
    color: Colors.textSecondary,
  },
});
