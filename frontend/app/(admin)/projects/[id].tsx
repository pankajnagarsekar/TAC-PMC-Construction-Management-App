// PROJECT DETAIL SCREEN
// View project details, work orders, payment certificates, budget

import React, { useState, useEffect, useCallback } from 'react';
import {
  View,
  Text,
  StyleSheet,
  ScrollView,
  Pressable,
  ActivityIndicator,
  RefreshControl,
} from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';
import { useLocalSearchParams, useRouter } from 'expo-router';
import { Ionicons } from '@expo/vector-icons';
import { projectsApi, workOrdersApi, paymentCertificatesApi, budgetsApi } from '../../../services/apiClient';
import { Colors, Spacing, FontSizes, BorderRadius } from '../../../constants/theme';

const parseDecimal = (val: any): number => {
  if (!val) return 0;
  if (typeof val === 'number') return val;
  if (val.$numberDecimal) return parseFloat(val.$numberDecimal);
  return parseFloat(val) || 0;
};

export default function ProjectDetailScreen() {
  const { id } = useLocalSearchParams();
  const router = useRouter();
  const [loading, setLoading] = useState(true);
  const [refreshing, setRefreshing] = useState(false);
  const [project, setProject] = useState<any>(null);
  const [workOrders, setWorkOrders] = useState<any[]>([]);
  const [paymentCerts, setPaymentCerts] = useState<any[]>([]);
  const [budgets, setBudgets] = useState<any[]>([]);
  const [activeTab, setActiveTab] = useState<'overview' | 'wo' | 'pc' | 'budget'>('overview');

  const loadData = useCallback(async () => {
    try {
      const [projectData, woData, pcData, budgetData] = await Promise.all([
        projectsApi.getAll(),
        workOrdersApi.getAll(),
        paymentCertificatesApi.getAll(),
        budgetsApi.getAll(),
      ]);

      const currentProject = projectData?.find((p: any) => (p.project_id || p._id) === id);
      setProject(currentProject);

      // Filter by project
      setWorkOrders(woData?.filter((wo: any) => wo.project_id === id) || []);
      setPaymentCerts(pcData?.filter((pc: any) => pc.project_id === id) || []);
      setBudgets(budgetData?.filter((b: any) => b.project_id === id) || []);
    } catch (error) {
      console.error('Error loading project data:', error);
    } finally {
      setLoading(false);
      setRefreshing(false);
    }
  }, [id]);

  useEffect(() => {
    loadData();
  }, [loadData]);

  const onRefresh = () => {
    setRefreshing(true);
    loadData();
  };

  const formatCurrency = (amount: number) => {
    return new Intl.NumberFormat('en-IN', {
      style: 'currency',
      currency: project?.currency_code || 'INR',
      minimumFractionDigits: 0,
    }).format(amount);
  };

  const totalWOValue = workOrders.reduce((sum, wo) => sum + parseDecimal(wo.net_wo_value), 0);
  const totalPCValue = paymentCerts.reduce((sum, pc) => sum + parseDecimal(pc.net_payable), 0);
  const totalBudget = budgets.reduce((sum, b) => sum + parseDecimal(b.approved_budget_amount), 0);

  if (loading) {
    return (
      <SafeAreaView style={styles.container}>
        <View style={styles.loadingContainer}>
          <ActivityIndicator size="large" color={Colors.primary} />
          <Text style={styles.loadingText}>Loading project...</Text>
        </View>
      </SafeAreaView>
    );
  }

  if (!project) {
    return (
      <SafeAreaView style={styles.container}>
        <View style={styles.loadingContainer}>
          <Ionicons name="alert-circle" size={48} color={Colors.error} />
          <Text style={styles.loadingText}>Project not found</Text>
        </View>
      </SafeAreaView>
    );
  }

  return (
    <SafeAreaView style={styles.container} edges={['left', 'right']}>
      {/* Project Header */}
      <View style={styles.header}>
        <Text style={styles.projectName}>{project.project_name}</Text>
        <Text style={styles.clientName}>{project.client_name || 'No client'}</Text>
      </View>

      {/* Tabs */}
      <View style={styles.tabs}>
        {(['overview', 'wo', 'pc', 'budget'] as const).map((tab) => (
          <Pressable
            key={tab}
            style={[styles.tab, activeTab === tab && styles.tabActive]}
            onPress={() => setActiveTab(tab)}
          >
            <Text style={[styles.tabText, activeTab === tab && styles.tabTextActive]}>
              {tab === 'overview' ? 'Overview' : tab === 'wo' ? `WO (${workOrders.length})` : tab === 'pc' ? `PC (${paymentCerts.length})` : `Budget (${budgets.length})`}
            </Text>
          </Pressable>
        ))}
      </View>

      <ScrollView
        contentContainerStyle={styles.content}
        refreshControl={<RefreshControl refreshing={refreshing} onRefresh={onRefresh} />}
      >
        {activeTab === 'overview' && (
          <>
            {/* Summary Cards */}
            <View style={styles.summaryGrid}>
              <View style={styles.summaryCard}>
                <Ionicons name="document-text" size={24} color={Colors.primary} />
                <Text style={styles.summaryValue}>{workOrders.length}</Text>
                <Text style={styles.summaryLabel}>Work Orders</Text>
                <Text style={styles.summaryAmount}>{formatCurrency(totalWOValue)}</Text>
              </View>
              <View style={styles.summaryCard}>
                <Ionicons name="receipt" size={24} color={Colors.success} />
                <Text style={styles.summaryValue}>{paymentCerts.length}</Text>
                <Text style={styles.summaryLabel}>Payment Certs</Text>
                <Text style={styles.summaryAmount}>{formatCurrency(totalPCValue)}</Text>
              </View>
            </View>

            <View style={styles.summaryGrid}>
              <View style={styles.summaryCard}>
                <Ionicons name="wallet" size={24} color={Colors.accent} />
                <Text style={styles.summaryValue}>{budgets.length}</Text>
                <Text style={styles.summaryLabel}>Budget Items</Text>
                <Text style={styles.summaryAmount}>{formatCurrency(totalBudget)}</Text>
              </View>
              <View style={styles.summaryCard}>
                <Ionicons name="trending-up" size={24} color={Colors.warning} />
                <Text style={styles.summaryValue}>{totalBudget > 0 ? ((totalWOValue / totalBudget) * 100).toFixed(0) : 0}%</Text>
                <Text style={styles.summaryLabel}>Utilization</Text>
                <Text style={styles.summaryAmount}>of budget</Text>
              </View>
            </View>

            {/* Project Info */}
            <View style={styles.infoCard}>
              <Text style={styles.infoTitle}>Project Details</Text>
              <InfoRow label="Start Date" value={project.start_date ? new Date(project.start_date).toLocaleDateString() : 'Not set'} />
              <InfoRow label="End Date" value={project.end_date ? new Date(project.end_date).toLocaleDateString() : 'Not set'} />
              <InfoRow label="Currency" value={project.currency_code || 'INR'} />
              <InfoRow label="Retention" value={`${project.project_retention_percentage || 5}%`} />
            </View>
          </>
        )}

        {activeTab === 'wo' && (
          <>
            {workOrders.length === 0 ? (
              <View style={styles.emptyState}>
                <Ionicons name="document-text-outline" size={48} color={Colors.textMuted} />
                <Text style={styles.emptyText}>No work orders for this project</Text>
              </View>
            ) : (
              workOrders.map((wo, idx) => (
                <View key={wo._id || idx} style={styles.itemCard}>
                  <Text style={styles.itemTitle}>{wo.document_number}</Text>
                  <Text style={styles.itemSubtitle}>Issue: {new Date(wo.issue_date).toLocaleDateString()}</Text>
                  <Text style={styles.itemAmount}>{formatCurrency(parseDecimal(wo.net_wo_value))}</Text>
                </View>
              ))
            )}
          </>
        )}

        {activeTab === 'pc' && (
          <>
            {paymentCerts.length === 0 ? (
              <View style={styles.emptyState}>
                <Ionicons name="receipt-outline" size={48} color={Colors.textMuted} />
                <Text style={styles.emptyText}>No payment certificates for this project</Text>
              </View>
            ) : (
              paymentCerts.map((pc, idx) => (
                <View key={pc._id || idx} style={styles.itemCard}>
                  <View style={styles.itemHeader}>
                    <Text style={styles.itemTitle}>{pc.document_number}</Text>
                    <View style={[styles.statusBadge, { backgroundColor: pc.status === 'Approved' ? Colors.success + '20' : Colors.warning + '20' }]}>
                      <Text style={[styles.statusText, { color: pc.status === 'Approved' ? Colors.success : Colors.warning }]}>{pc.status}</Text>
                    </View>
                  </View>
                  <Text style={styles.itemSubtitle}>Bill Date: {new Date(pc.bill_date).toLocaleDateString()}</Text>
                  <Text style={styles.itemAmount}>{formatCurrency(parseDecimal(pc.net_payable))}</Text>
                </View>
              ))
            )}
          </>
        )}

        {activeTab === 'budget' && (
          <>
            {budgets.length === 0 ? (
              <View style={styles.emptyState}>
                <Ionicons name="wallet-outline" size={48} color={Colors.textMuted} />
                <Text style={styles.emptyText}>No budget allocations for this project</Text>
              </View>
            ) : (
              budgets.map((b, idx) => {
                const approved = parseDecimal(b.approved_budget_amount);
                const committed = parseDecimal(b.committed_value);
                const pct = approved > 0 ? (committed / approved * 100) : 0;
                return (
                  <View key={b._id || idx} style={styles.itemCard}>
                    <Text style={styles.itemTitle}>Budget #{idx + 1}</Text>
                    <View style={styles.progressBar}>
                      <View style={[styles.progressFill, { width: `${Math.min(pct, 100)}%` }]} />
                    </View>
                    <View style={styles.budgetRow}>
                      <Text style={styles.budgetLabel}>Approved: {formatCurrency(approved)}</Text>
                      <Text style={styles.budgetLabel}>Committed: {formatCurrency(committed)}</Text>
                    </View>
                    {b.over_commit_flag && (
                      <View style={styles.overCommitWarning}>
                        <Ionicons name="warning" size={14} color={Colors.error} />
                        <Text style={styles.overCommitText}>Over-committed</Text>
                      </View>
                    )}
                  </View>
                );
              })
            )}
          </>
        )}
      </ScrollView>
    </SafeAreaView>
  );
}

function InfoRow({ label, value }: { label: string; value: string }) {
  return (
    <View style={styles.infoRow}>
      <Text style={styles.infoLabel}>{label}</Text>
      <Text style={styles.infoValue}>{value}</Text>
    </View>
  );
}

const styles = StyleSheet.create({
  container: { flex: 1, backgroundColor: Colors.background },
  loadingContainer: { flex: 1, justifyContent: 'center', alignItems: 'center' },
  loadingText: { marginTop: Spacing.md, fontSize: FontSizes.md, color: Colors.textSecondary },
  header: {
    backgroundColor: Colors.primary,
    padding: Spacing.lg,
  },
  projectName: { fontSize: FontSizes.xl, fontWeight: 'bold', color: Colors.white },
  clientName: { fontSize: FontSizes.md, color: Colors.white + '90', marginTop: Spacing.xs },
  tabs: {
    flexDirection: 'row',
    backgroundColor: Colors.white,
    borderBottomWidth: 1,
    borderBottomColor: Colors.border,
  },
  tab: { flex: 1, paddingVertical: Spacing.md, alignItems: 'center' },
  tabActive: { borderBottomWidth: 2, borderBottomColor: Colors.primary },
  tabText: { fontSize: FontSizes.sm, color: Colors.textSecondary },
  tabTextActive: { color: Colors.primary, fontWeight: '600' },
  content: { padding: Spacing.md },
  summaryGrid: { flexDirection: 'row', gap: Spacing.sm, marginBottom: Spacing.sm },
  summaryCard: {
    flex: 1,
    backgroundColor: Colors.white,
    borderRadius: BorderRadius.lg,
    padding: Spacing.md,
    alignItems: 'center',
  },
  summaryValue: { fontSize: FontSizes.xxl, fontWeight: 'bold', color: Colors.text, marginTop: Spacing.xs },
  summaryLabel: { fontSize: FontSizes.sm, color: Colors.textSecondary },
  summaryAmount: { fontSize: FontSizes.xs, color: Colors.textMuted, marginTop: 2 },
  infoCard: {
    backgroundColor: Colors.white,
    borderRadius: BorderRadius.lg,
    padding: Spacing.md,
    marginTop: Spacing.sm,
  },
  infoTitle: { fontSize: FontSizes.md, fontWeight: '600', color: Colors.text, marginBottom: Spacing.md },
  infoRow: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    paddingVertical: Spacing.sm,
    borderBottomWidth: 1,
    borderBottomColor: Colors.border,
  },
  infoLabel: { fontSize: FontSizes.sm, color: Colors.textSecondary },
  infoValue: { fontSize: FontSizes.sm, fontWeight: '500', color: Colors.text },
  emptyState: { alignItems: 'center', padding: Spacing.xl },
  emptyText: { fontSize: FontSizes.md, color: Colors.textMuted, marginTop: Spacing.md },
  itemCard: {
    backgroundColor: Colors.white,
    borderRadius: BorderRadius.lg,
    padding: Spacing.md,
    marginBottom: Spacing.sm,
  },
  itemHeader: { flexDirection: 'row', justifyContent: 'space-between', alignItems: 'center' },
  itemTitle: { fontSize: FontSizes.md, fontWeight: '600', color: Colors.text },
  itemSubtitle: { fontSize: FontSizes.sm, color: Colors.textSecondary, marginTop: 2 },
  itemAmount: { fontSize: FontSizes.md, fontWeight: 'bold', color: Colors.primary, marginTop: Spacing.xs },
  statusBadge: { paddingHorizontal: Spacing.sm, paddingVertical: 2, borderRadius: BorderRadius.sm },
  statusText: { fontSize: FontSizes.xs, fontWeight: '600' },
  progressBar: { height: 8, backgroundColor: Colors.border, borderRadius: 4, marginTop: Spacing.sm, overflow: 'hidden' },
  progressFill: { height: '100%', backgroundColor: Colors.primary, borderRadius: 4 },
  budgetRow: { flexDirection: 'row', justifyContent: 'space-between', marginTop: Spacing.sm },
  budgetLabel: { fontSize: FontSizes.xs, color: Colors.textSecondary },
  overCommitWarning: { flexDirection: 'row', alignItems: 'center', marginTop: Spacing.xs, gap: 4 },
  overCommitText: { fontSize: FontSizes.xs, color: Colors.error, fontWeight: '600' },
});
