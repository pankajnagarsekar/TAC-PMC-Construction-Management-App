// BUDGET MANAGEMENT SCREEN
// View and manage budget allocations with real data

import React, { useState, useEffect, useCallback } from 'react';
import {
  View,
  Text,
  StyleSheet,
  FlatList,
  RefreshControl,
  Pressable,
  ActivityIndicator,
} from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';
import { Ionicons } from '@expo/vector-icons';
import { useRouter } from 'expo-router';
import { budgetsApi } from '../../services/apiClient';
import { Colors, Spacing, FontSizes, BorderRadius } from '../../constants/theme';

interface Budget {
  budget_id?: string;
  _id?: string;
  project_id: string;
  code_id: string;
  approved_budget_amount: number | { $numberDecimal: string };
  committed_value: number | { $numberDecimal: string };
  certified_value: number | { $numberDecimal: string };
  balance_remaining: number | { $numberDecimal: string };
  over_commit_flag: boolean;
}

const parseDecimal = (val: any): number => {
  if (!val) return 0;
  if (typeof val === 'number') return val;
  if (val.$numberDecimal) return parseFloat(val.$numberDecimal);
  return parseFloat(val) || 0;
};

export default function BudgetScreen() {
  const router = useRouter();
  const [budgets, setBudgets] = useState<Budget[]>([]);
  const [loading, setLoading] = useState(true);
  const [refreshing, setRefreshing] = useState(false);

  const loadBudgets = useCallback(async () => {
    try {
      const data = await budgetsApi.getAll();
      setBudgets(data || []);
    } catch (error) {
      console.error('Error loading budgets:', error);
    } finally {
      setLoading(false);
      setRefreshing(false);
    }
  }, []);

  useEffect(() => {
    loadBudgets();
  }, [loadBudgets]);

  const onRefresh = () => {
    setRefreshing(true);
    loadBudgets();
  };

  const formatCurrency = (amount: number) => {
    return new Intl.NumberFormat('en-IN', {
      style: 'currency',
      currency: 'INR',
      minimumFractionDigits: 0,
    }).format(amount);
  };

  const totalApproved = budgets.reduce((sum, b) => sum + parseDecimal(b.approved_budget_amount), 0);
  const totalCommitted = budgets.reduce((sum, b) => sum + parseDecimal(b.committed_value), 0);
  const totalCertified = budgets.reduce((sum, b) => sum + parseDecimal(b.certified_value), 0);
  const utilizationPct = totalApproved > 0 ? (totalCommitted / totalApproved * 100).toFixed(1) : '0';

  const renderBudget = ({ item, index }: { item: Budget; index: number }) => {
    const approved = parseDecimal(item.approved_budget_amount);
    const committed = parseDecimal(item.committed_value);
    const certified = parseDecimal(item.certified_value);
    const balance = parseDecimal(item.balance_remaining);
    const utilizationPct = approved > 0 ? (committed / approved * 100) : 0;

    return (
      <Pressable
        style={({ pressed }) => [styles.budgetCard, pressed && styles.budgetCardPressed]}
        onPress={() => console.log('View Budget:', item._id)}
      >
        <View style={styles.budgetHeader}>
          <Text style={styles.budgetTitle}>Budget #{index + 1}</Text>
          {item.over_commit_flag && (
            <View style={styles.overCommitBadge}>
              <Ionicons name="warning" size={12} color={Colors.error} />
              <Text style={styles.overCommitText}>Over-Committed</Text>
            </View>
          )}
        </View>
        
        {/* Progress Bar */}
        <View style={styles.progressContainer}>
          <View style={styles.progressBar}>
            <View style={[styles.progressFill, { width: `${Math.min(utilizationPct, 100)}%` }]} />
          </View>
          <Text style={styles.progressText}>{utilizationPct.toFixed(0)}% utilized</Text>
        </View>

        <View style={styles.budgetGrid}>
          <View style={styles.budgetItem}>
            <Text style={styles.budgetLabel}>Approved</Text>
            <Text style={styles.budgetValue}>{formatCurrency(approved)}</Text>
          </View>
          <View style={styles.budgetItem}>
            <Text style={styles.budgetLabel}>Committed</Text>
            <Text style={[styles.budgetValue, { color: Colors.warning }]}>{formatCurrency(committed)}</Text>
          </View>
          <View style={styles.budgetItem}>
            <Text style={styles.budgetLabel}>Certified</Text>
            <Text style={[styles.budgetValue, { color: Colors.success }]}>{formatCurrency(certified)}</Text>
          </View>
          <View style={styles.budgetItem}>
            <Text style={styles.budgetLabel}>Balance</Text>
            <Text style={[styles.budgetValue, { color: balance < 0 ? Colors.error : Colors.primary }]}>
              {formatCurrency(balance)}
            </Text>
          </View>
        </View>
      </Pressable>
    );
  };

  if (loading) {
    return (
      <SafeAreaView style={styles.container}>
        <View style={styles.loadingContainer}>
          <ActivityIndicator size="large" color={Colors.primary} />
          <Text style={styles.loadingText}>Loading budgets...</Text>
        </View>
      </SafeAreaView>
    );
  }

  return (
    <SafeAreaView style={styles.container} edges={['left', 'right']}>
      {/* Summary Card */}
      <View style={styles.summaryCard}>
        <Text style={styles.summaryTitle}>Budget Overview</Text>
        <View style={styles.summaryGrid}>
          <View style={styles.summaryItem}>
            <Text style={styles.summaryValue}>{formatCurrency(totalApproved)}</Text>
            <Text style={styles.summaryLabel}>Total Approved</Text>
          </View>
          <View style={styles.summaryItem}>
            <Text style={[styles.summaryValue, { color: Colors.warning }]}>{formatCurrency(totalCommitted)}</Text>
            <Text style={styles.summaryLabel}>Committed</Text>
          </View>
          <View style={styles.summaryItem}>
            <Text style={[styles.summaryValue, { color: Colors.success }]}>{formatCurrency(totalCertified)}</Text>
            <Text style={styles.summaryLabel}>Certified</Text>
          </View>
          <View style={styles.summaryItem}>
            <Text style={styles.summaryValue}>{utilizationPct}%</Text>
            <Text style={styles.summaryLabel}>Utilization</Text>
          </View>
        </View>
      </View>

      {/* Budgets List */}
      <FlatList
        data={budgets}
        renderItem={renderBudget}
        keyExtractor={(item) => item.budget_id || item._id || String(Math.random())}
        contentContainerStyle={styles.listContent}
        refreshControl={<RefreshControl refreshing={refreshing} onRefresh={onRefresh} />}
        ListEmptyComponent={
          <View style={styles.emptyContainer}>
            <Ionicons name="wallet-outline" size={48} color={Colors.textMuted} />
            <Text style={styles.emptyText}>No budget allocations found</Text>
          </View>
        }
      />

      {/* FAB */}
      <Pressable
        style={({ pressed }) => [styles.fab, pressed && styles.fabPressed]}
        onPress={() => router.push('/(admin)/budget/create')}
      >
        <Ionicons name="add" size={28} color={Colors.white} />
      </Pressable>
    </SafeAreaView>
  );
}

const styles = StyleSheet.create({
  container: { flex: 1, backgroundColor: Colors.background },
  loadingContainer: { flex: 1, justifyContent: 'center', alignItems: 'center' },
  loadingText: { marginTop: Spacing.md, fontSize: FontSizes.md, color: Colors.textSecondary },
  summaryCard: {
    backgroundColor: Colors.white,
    margin: Spacing.md,
    borderRadius: BorderRadius.lg,
    padding: Spacing.md,
  },
  summaryTitle: { fontSize: FontSizes.lg, fontWeight: '600', color: Colors.text, marginBottom: Spacing.md },
  summaryGrid: { flexDirection: 'row', flexWrap: 'wrap' },
  summaryItem: { width: '50%', paddingVertical: Spacing.sm },
  summaryValue: { fontSize: FontSizes.lg, fontWeight: 'bold', color: Colors.primary },
  summaryLabel: { fontSize: FontSizes.sm, color: Colors.textSecondary },
  listContent: { padding: Spacing.md, paddingTop: 0 },
  budgetCard: {
    backgroundColor: Colors.white,
    borderRadius: BorderRadius.lg,
    padding: Spacing.md,
    marginBottom: Spacing.sm,
  },
  budgetCardPressed: { opacity: 0.7 },
  budgetHeader: { flexDirection: 'row', justifyContent: 'space-between', alignItems: 'center', marginBottom: Spacing.sm },
  budgetTitle: { fontSize: FontSizes.md, fontWeight: '600', color: Colors.text },
  overCommitBadge: {
    flexDirection: 'row',
    alignItems: 'center',
    backgroundColor: Colors.error + '20',
    paddingHorizontal: Spacing.sm,
    paddingVertical: 2,
    borderRadius: BorderRadius.sm,
    gap: 4,
  },
  overCommitText: { fontSize: FontSizes.xs, color: Colors.error, fontWeight: '600' },
  progressContainer: { marginBottom: Spacing.md },
  progressBar: {
    height: 8,
    backgroundColor: Colors.border,
    borderRadius: 4,
    overflow: 'hidden',
  },
  progressFill: { height: '100%', backgroundColor: Colors.primary, borderRadius: 4 },
  progressText: { fontSize: FontSizes.xs, color: Colors.textMuted, marginTop: 4, textAlign: 'right' },
  budgetGrid: { flexDirection: 'row', flexWrap: 'wrap' },
  budgetItem: { width: '50%', paddingVertical: Spacing.xs },
  budgetLabel: { fontSize: FontSizes.xs, color: Colors.textMuted },
  budgetValue: { fontSize: FontSizes.sm, fontWeight: '600', color: Colors.text },
  emptyContainer: { alignItems: 'center', padding: Spacing.xl },
  emptyText: { fontSize: FontSizes.md, color: Colors.textMuted, marginTop: Spacing.md },
  fab: {
    position: 'absolute',
    right: Spacing.lg,
    bottom: Spacing.lg,
    width: 56,
    height: 56,
    borderRadius: 28,
    backgroundColor: Colors.accent,
    justifyContent: 'center',
    alignItems: 'center',
    elevation: 5,
  },
  fabPressed: { opacity: 0.8 },
});
