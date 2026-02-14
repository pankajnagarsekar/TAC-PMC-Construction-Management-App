// ADMIN FINANCE SCREEN
// Financial overview placeholder

import React from 'react';
import { View, Text, StyleSheet, ScrollView } from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';
import { Ionicons } from '@expo/vector-icons';
import { Card } from '../../components/ui';
import { Colors, Spacing, FontSizes } from '../../constants/theme';

export default function AdminFinance() {
  return (
    <SafeAreaView style={styles.container} edges={['left', 'right']}>
      <ScrollView contentContainerStyle={styles.content}>
        <Card style={styles.placeholderCard}>
          <Ionicons name="wallet-outline" size={64} color={Colors.primary} />
          <Text style={styles.title}>Financial Dashboard</Text>
          <Text style={styles.subtitle}>Work Orders, Payment Certificates, and Budget tracking will appear here</Text>
        </Card>

        <View style={styles.featureList}>
          <FeatureItem icon="document-text" title="Work Orders" description="Create and manage work orders" />
          <FeatureItem icon="card" title="Payment Certificates" description="Track certifications and payments" />
          <FeatureItem icon="cash" title="Budget Management" description="Monitor project budgets" />
          <FeatureItem icon="shield-checkmark" title="Retention" description="Manage retention releases" />
        </View>
      </ScrollView>
    </SafeAreaView>
  );
}

function FeatureItem({ icon, title, description }: { icon: keyof typeof Ionicons.glyphMap; title: string; description: string }) {
  return (
    <Card style={styles.featureCard}>
      <View style={styles.featureIcon}>
        <Ionicons name={icon} size={24} color={Colors.primary} />
      </View>
      <View style={styles.featureContent}>
        <Text style={styles.featureTitle}>{title}</Text>
        <Text style={styles.featureDescription}>{description}</Text>
      </View>
      <Ionicons name="chevron-forward" size={20} color={Colors.textMuted} />
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
  featureList: {
    gap: Spacing.sm,
  },
  featureCard: {
    flexDirection: 'row',
    alignItems: 'center',
  },
  featureIcon: {
    width: 44,
    height: 44,
    borderRadius: 22,
    backgroundColor: Colors.infoLight,
    justifyContent: 'center',
    alignItems: 'center',
    marginRight: Spacing.md,
  },
  featureContent: {
    flex: 1,
  },
  featureTitle: {
    fontSize: FontSizes.md,
    fontWeight: '600',
    color: Colors.text,
  },
  featureDescription: {
    fontSize: FontSizes.sm,
    color: Colors.textSecondary,
  },
});
