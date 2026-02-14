// ADMIN FINANCE SCREEN
// Financial modules navigation hub

import React from 'react';
import { View, Text, StyleSheet, ScrollView, TouchableOpacity } from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';
import { useRouter } from 'expo-router';
import { Ionicons } from '@expo/vector-icons';
import { Card } from '../../components/ui';
import { Colors, Spacing, FontSizes, BorderRadius } from '../../constants/theme';

const financialModules = [
  { 
    id: 'work-orders', 
    title: 'Work Orders', 
    description: 'Create and manage work orders',
    icon: 'document-text' as const,
    route: '/(admin)/work-orders',
    color: Colors.primary,
  },
  { 
    id: 'payment-certificates', 
    title: 'Payment Certificates', 
    description: 'Certify and track payments',
    icon: 'card' as const,
    route: '/(admin)/payment-certificates',
    color: Colors.success,
  },
  { 
    id: 'budget', 
    title: 'Budget Management', 
    description: 'Allocate and track budgets',
    icon: 'wallet' as const,
    route: '/(admin)/budget',
    color: Colors.info,
  },
  { 
    id: 'petty-cash', 
    title: 'Petty Cash', 
    description: 'Review petty cash claims',
    icon: 'cash' as const,
    route: '/(admin)/petty-cash',
    color: Colors.accent,
  },
  { 
    id: 'csa', 
    title: 'Contract Schedule', 
    description: 'Manage contract schedule of amounts',
    icon: 'list' as const,
    route: '/(admin)/csa',
    color: Colors.secondary,
  },
  { 
    id: 'timeline', 
    title: 'Activity Timeline', 
    description: 'Track all financial activities',
    icon: 'time' as const,
    route: '/(admin)/timeline',
    color: Colors.warning,
  },
  { 
    id: 'alerts', 
    title: 'System Alerts', 
    description: 'Over-commits and budget warnings',
    icon: 'alert-circle' as const,
    route: '/(admin)/alerts',
    color: Colors.error,
  },
  { 
    id: 'dpr', 
    title: 'Daily Progress Reports', 
    description: 'Generate and review DPRs',
    icon: 'document' as const,
    route: '/(admin)/dpr',
    color: Colors.primaryLight,
  },
  { 
    id: 'ocr', 
    title: 'Invoice Scanner', 
    description: 'Scan and extract invoice data',
    icon: 'scan' as const,
    route: '/(admin)/ocr',
    color: Colors.accent,
  },
];

export default function AdminFinance() {
  const router = useRouter();

  return (
    <SafeAreaView style={styles.container} edges={['left', 'right']}>
      <ScrollView contentContainerStyle={styles.content}>
        <Card style={styles.headerCard}>
          <Ionicons name="wallet-outline" size={48} color={Colors.primary} />
          <Text style={styles.title}>Financial Modules</Text>
          <Text style={styles.subtitle}>Manage all financial operations</Text>
        </Card>

        <View style={styles.modulesList}>
          {financialModules.map((module) => (
            <TouchableOpacity 
              key={module.id}
              onPress={() => router.push(module.route as any)}
            >
              <Card style={styles.moduleCard}>
                <View style={[styles.moduleIcon, { backgroundColor: module.color + '20' }]}>
                  <Ionicons name={module.icon} size={24} color={module.color} />
                </View>
                <View style={styles.moduleContent}>
                  <Text style={styles.moduleTitle}>{module.title}</Text>
                  <Text style={styles.moduleDescription}>{module.description}</Text>
                </View>
                <Ionicons name="chevron-forward" size={20} color={Colors.textMuted} />
              </Card>
            </TouchableOpacity>
          ))}
        </View>
      </ScrollView>
    </SafeAreaView>
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
  modulesList: {
    gap: Spacing.sm,
  },
  moduleCard: {
    flexDirection: 'row',
    alignItems: 'center',
  },
  moduleIcon: {
    width: 48,
    height: 48,
    borderRadius: BorderRadius.md,
    justifyContent: 'center',
    alignItems: 'center',
    marginRight: Spacing.md,
  },
  moduleContent: {
    flex: 1,
  },
  moduleTitle: {
    fontSize: FontSizes.md,
    fontWeight: '600',
    color: Colors.text,
  },
  moduleDescription: {
    fontSize: FontSizes.sm,
    color: Colors.textSecondary,
    marginTop: 2,
  },
});
