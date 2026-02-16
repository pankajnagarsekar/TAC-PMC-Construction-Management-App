// ADMIN DASHBOARD
// Financial overview for admin users with all required indicators
// UI-4: Uses project_financial_summary and project_physical_summary from read models
// NO client-side financial calculations - all values from backend

import React, { useState, useEffect, useCallback } from 'react';
import {
  View,
  Text,
  StyleSheet,
  ScrollView,
  RefreshControl,
  TouchableOpacity,
  ActivityIndicator,
} from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';
import { Ionicons } from '@expo/vector-icons';
import { useRouter } from 'expo-router';
import { useAuth } from '../../contexts/AuthContext';
import apiClient, { projectsApi } from '../../services/apiClient';
import { Card, LoadingScreen } from '../../components/ui';
import { Colors, Spacing, FontSizes, BorderRadius } from '../../constants/theme';
import { Project } from '../../types/api';

// UI-4: Dashboard data structure from read models
interface FinancialSummary {
  project_id: string;
  totals: {
    approved_budget: number;
    committed_value: number;
    certified_value: number;
    paid_value: number;
    retention_held: number;
    remaining_budget: number;
    outstanding_payable: number;
  };
  percentages: {
    budget_utilization: number;
    certification_progress: number;
    payment_progress: number;
  };
  work_orders: {
    by_status: Record<string, { count: number; total_value: number }>;
  };
  payment_certificates: {
    by_status: Record<string, { count: number; total_value: number }>;
  };
}

interface PhysicalSummary {
  project_id: string;
  totals: {
    ordered_quantity: number;
    certified_quantity: number;
    remaining_quantity: number;
    overall_physical_progress_pct: number;
  };
  dpr_summary: {
    by_status: Record<string, number>;
    total_dprs: number;
  };
}

interface DashboardData {
  financial: FinancialSummary | null;
  physical: PhysicalSummary | null;
  loading: boolean;
  error: string | null;
}

export default function AdminDashboard() {
  const router = useRouter();
  const { user, logout } = useAuth();
  const [projects, setProjects] = useState<Project[]>([]);
  const [dashboardData, setDashboardData] = useState<DashboardData>({
    financial: null,
    physical: null,
    loading: true,
    error: null,
  });
  const [isLoading, setIsLoading] = useState(true);
  const [refreshing, setRefreshing] = useState(false);
  const [error, setError] = useState('');
  const [selectedProjectId, setSelectedProjectId] = useState<string | null>(null);

  // UI-4: Load data from read model endpoints - NO local calculations
  const loadData = async () => {
    try {
      setError('');
      const projectsData = await projectsApi.getAll();
      setProjects(projectsData);
      
      // Use first project for dashboard if available
      if (projectsData.length > 0) {
        const projectId = projectsData[0].project_id;
        setSelectedProjectId(projectId);
        await loadProjectSummaries(projectId);
      } else {
        setDashboardData({ financial: null, physical: null, loading: false, error: null });
      }
    } catch (err: any) {
      setError(err.message || 'Failed to load data');
      setDashboardData({ financial: null, physical: null, loading: false, error: err.message });
    } finally {
      setIsLoading(false);
      setRefreshing(false);
    }
  };

  // UI-4: Fetch from read model API endpoints
  const loadProjectSummaries = async (projectId: string) => {
    setDashboardData(prev => ({ ...prev, loading: true, error: null }));
    
    try {
      // Fetch both summaries from read model endpoints
      const [financialRes, physicalRes] = await Promise.allSettled([
        apiClient.get(`/api/v2/read-models/projects/${projectId}/financial-summary`),
        apiClient.get(`/api/v2/read-models/projects/${projectId}/physical-summary`),
      ]);

      const financial = financialRes.status === 'fulfilled' ? financialRes.value : null;
      const physical = physicalRes.status === 'fulfilled' ? physicalRes.value : null;

      setDashboardData({
        financial,
        physical,
        loading: false,
        error: null,
      });
    } catch (err: any) {
      console.error('Failed to load summaries:', err);
      setDashboardData({
        financial: null,
        physical: null,
        loading: false,
        error: err.message || 'Failed to load project summaries',
      });
    }
  };

  useEffect(() => {
    loadData();
  }, []);

  const onRefresh = useCallback(() => {
    setRefreshing(true);
    loadData();
  }, []);

  // UI-4: No local calculations - format only
  const formatCurrency = (value: number | undefined) => {
    if (value === undefined || value === null) return '₹0';
    return new Intl.NumberFormat('en-IN', {
      style: 'currency',
      currency: 'INR',
      maximumFractionDigits: 0,
    }).format(value);
  };

  // UI-4: Get values from read models - NO local math
  const fin = dashboardData.financial?.totals;
  const pct = dashboardData.financial?.percentages;
  const phys = dashboardData.physical?.totals;

  // Derive indicators from read model data
  const overCommitIndicator = fin && fin.committed_value > fin.approved_budget;
  const delayIndicator = phys && phys.overall_physical_progress_pct < (pct?.payment_progress || 0);

  // Count pending items from status breakdowns
  const pendingWOs = Object.entries(dashboardData.financial?.work_orders?.by_status || {})
    .filter(([status]) => status.toLowerCase() === 'draft')
    .reduce((sum, [, data]) => sum + (data?.count || 0), 0);

  const pendingPCs = Object.entries(dashboardData.financial?.payment_certificates?.by_status || {})
    .filter(([status]) => status.toLowerCase() === 'draft')
    .reduce((sum, [, data]) => sum + (data?.count || 0), 0);

  if (isLoading) {
    return <LoadingScreen message="Loading dashboard..." />;
  }

  return (
    <SafeAreaView style={styles.container} edges={['left', 'right']}>
      <ScrollView
        style={styles.scrollView}
        contentContainerStyle={styles.scrollContent}
        refreshControl={
          <RefreshControl refreshing={refreshing} onRefresh={onRefresh} />
        }
      >
        {/* Welcome Header */}
        <View style={styles.welcomeSection}>
          <View style={styles.welcomeText}>
            <Text style={styles.greeting}>Welcome back,</Text>
            <Text style={styles.userName}>{user?.name || 'Admin'}</Text>
          </View>
          <TouchableOpacity onPress={logout} style={styles.logoutButton}>
            <Ionicons name="log-out-outline" size={24} color={Colors.textSecondary} />
          </TouchableOpacity>
        </View>

        {/* Alert Banner */}
        {(overCommitIndicator || delayIndicator) && (
          <Card style={styles.alertBanner}>
            <View style={styles.alertContent}>
              <Ionicons name="warning" size={24} color={Colors.warning} />
              <View style={styles.alertTextContainer}>
                <Text style={styles.alertTitle}>Attention Required</Text>
                <Text style={styles.alertMessage}>
                  {overCommitIndicator && 'Over-commit detected. '}
                  {delayIndicator && 'Project delays detected.'}
                </Text>
              </View>
            </View>
            <TouchableOpacity onPress={() => router.push('/(admin)/alerts')}>
              <Text style={styles.alertAction}>View Alerts</Text>
            </TouchableOpacity>
          </Card>
        )}

        {/* Error Banner */}
        {error ? (
          <View style={styles.errorBanner}>
            <Ionicons name="alert-circle" size={20} color={Colors.error} />
            <Text style={styles.errorText}>{error}</Text>
            <TouchableOpacity onPress={loadData}>
              <Text style={styles.retryText}>Retry</Text>
            </TouchableOpacity>
          </View>
        ) : null}

        {/* Loading State for Summaries */}
        {dashboardData.loading && (
          <View style={styles.loadingOverlay}>
            <ActivityIndicator size="small" color={Colors.primary} />
            <Text style={styles.loadingText}>Loading financial data...</Text>
          </View>
        )}

        {/* UI-4: Financial Summary Cards - All values from read models */}
        <View style={styles.section}>
          <Text style={styles.sectionTitle}>Financial Overview</Text>
          <View style={styles.financialGrid}>
            <FinancialCard
              title="Approved Budget"
              value={formatCurrency(fin?.approved_budget)}
              icon="wallet"
              color={Colors.primary}
            />
            <FinancialCard
              title="Committed Value"
              value={formatCurrency(fin?.committed_value)}
              icon="document-text"
              color={Colors.info}
            />
            <FinancialCard
              title="Certified Value"
              value={formatCurrency(fin?.certified_value)}
              icon="checkmark-circle"
              color={Colors.success}
            />
            <FinancialCard
              title="Paid Value"
              value={formatCurrency(fin?.paid_value)}
              icon="cash"
              color={Colors.accent}
            />
            <FinancialCard
              title="Retention Held"
              value={formatCurrency(fin?.retention_held)}
              icon="lock-closed"
              color={Colors.warning}
            />
            <FinancialCard
              title="Outstanding Payable"
              value={formatCurrency(fin?.outstanding_payable)}
              icon="alert-circle"
              color={Colors.error}
            />
          </View>
        </View>

        {/* UI-4: Progress & Status Indicators - From read models */}
        <View style={styles.section}>
          <Text style={styles.sectionTitle}>Progress Indicators</Text>
          <Card style={styles.progressCard}>
            <View style={styles.progressRow}>
              <View style={styles.progressItem}>
                <Text style={styles.progressLabel}>Physical Progress</Text>
                <View style={styles.progressBarContainer}>
                  <View style={[styles.progressBar, { width: `${phys?.overall_physical_progress_pct || 0}%`, backgroundColor: Colors.success }]} />
                </View>
                <Text style={styles.progressValue}>{phys?.overall_physical_progress_pct?.toFixed(1) || 0}%</Text>
              </View>
            </View>
            <View style={styles.progressRow}>
              <View style={styles.progressItem}>
                <Text style={styles.progressLabel}>Budget Utilization</Text>
                <View style={styles.progressBarContainer}>
                  <View style={[styles.progressBar, { width: `${Math.min(pct?.budget_utilization || 0, 100)}%`, backgroundColor: Colors.info }]} />
                </View>
                <Text style={styles.progressValue}>{pct?.budget_utilization?.toFixed(1) || 0}%</Text>
              </View>
            </View>

            {/* Status Indicators */}
            <View style={styles.indicatorRow}>
              <View style={[styles.indicator, overCommitIndicator && styles.indicatorActive]}>
                <Ionicons name={overCommitIndicator ? "alert" : "checkmark"} size={16} color={overCommitIndicator ? Colors.error : Colors.success} />
                <Text style={[styles.indicatorText, overCommitIndicator && styles.indicatorTextActive]}>
                  Over-Commit
                </Text>
              </View>
              <View style={[styles.indicator, delayIndicator && styles.indicatorActive]}>
                <Ionicons name={delayIndicator ? "alert" : "checkmark"} size={16} color={delayIndicator ? Colors.warning : Colors.success} />
                <Text style={[styles.indicatorText, delayIndicator && styles.indicatorTextActive]}>
                  Delay
                </Text>
              </View>
            </View>
          </Card>
        </View>

        {/* UI-4: Project Stats - From read models and projects list */}
        <View style={styles.section}>
          <Text style={styles.sectionTitle}>Project Stats</Text>
          <View style={styles.statsGrid}>
            <Card style={styles.statCard}>
              <Text style={styles.statValue}>{projects.length}</Text>
              <Text style={styles.statLabel}>Total Projects</Text>
            </Card>
            <Card style={styles.statCard}>
              <Text style={styles.statValue}>{projects.filter(p => !p.end_date || new Date(p.end_date) > new Date()).length}</Text>
              <Text style={styles.statLabel}>Active</Text>
            </Card>
            <Card style={styles.statCard}>
              <Text style={[styles.statValue, { color: Colors.warning }]}>{pendingWOs}</Text>
              <Text style={styles.statLabel}>Pending WOs</Text>
            </Card>
            <Card style={styles.statCard}>
              <Text style={[styles.statValue, { color: Colors.accent }]}>{pendingPCs}</Text>
              <Text style={styles.statLabel}>Pending PCs</Text>
            </Card>
          </View>
        </View>

        {/* Quick Actions */}
        <View style={styles.section}>
          <Text style={styles.sectionTitle}>Quick Actions</Text>
          <View style={styles.actionsGrid}>
            <TouchableOpacity style={styles.actionButton} onPress={() => router.push('/(admin)/work-orders')}>
              <View style={[styles.actionIcon, { backgroundColor: Colors.primary }]}>
                <Ionicons name="add" size={24} color={Colors.white} />
              </View>
              <Text style={styles.actionText}>New Work Order</Text>
            </TouchableOpacity>

            <TouchableOpacity style={styles.actionButton} onPress={() => router.push('/(admin)/payment-certificates')}>
              <View style={[styles.actionIcon, { backgroundColor: Colors.success }]}>
                <Ionicons name="document-attach" size={24} color={Colors.white} />
              </View>
              <Text style={styles.actionText}>New Certificate</Text>
            </TouchableOpacity>

            <TouchableOpacity style={styles.actionButton} onPress={() => router.push('/(admin)/reports')}>
              <View style={[styles.actionIcon, { backgroundColor: Colors.accent }]}>
                <Ionicons name="analytics" size={24} color={Colors.white} />
              </View>
              <Text style={styles.actionText}>View Reports</Text>
            </TouchableOpacity>

            <TouchableOpacity style={styles.actionButton} onPress={() => router.push('/(admin)/alerts')}>
              <View style={[styles.actionIcon, { backgroundColor: Colors.warning }]}>
                <Ionicons name="notifications" size={24} color={Colors.white} />
              </View>
              <Text style={styles.actionText}>View Alerts</Text>
            </TouchableOpacity>
          </View>
        </View>

        {/* Recent Projects */}
        <View style={styles.section}>
          <View style={styles.sectionHeader}>
            <Text style={styles.sectionTitle}>Recent Projects</Text>
            <TouchableOpacity onPress={() => router.push('/(admin)/projects')}>
              <Text style={styles.viewAllText}>View All</Text>
            </TouchableOpacity>
          </View>

          {projects.length === 0 ? (
            <Card style={styles.emptyCard}>
              <Ionicons name="folder-open-outline" size={48} color={Colors.textMuted} />
              <Text style={styles.emptyText}>No projects yet</Text>
            </Card>
          ) : (
            projects.slice(0, 3).map((project) => (
              <ProjectCard key={project.project_id} project={project} />
            ))
          )}
        </View>
      </ScrollView>
    </SafeAreaView>
  );
}

// Financial Card Component
function FinancialCard({ title, value, icon, color }: { title: string; value: string; icon: keyof typeof Ionicons.glyphMap; color: string }) {
  return (
    <Card style={styles.financialCard}>
      <View style={[styles.financialIcon, { backgroundColor: color + '20' }]}>
        <Ionicons name={icon} size={20} color={color} />
      </View>
      <Text style={styles.financialValue}>{value}</Text>
      <Text style={styles.financialTitle}>{title}</Text>
    </Card>
  );
}

// Project Card Component
function ProjectCard({ project }: { project: Project }) {
  const isActive = !project.end_date || new Date(project.end_date) > new Date();

  return (
    <Card style={styles.projectCard}>
      <View style={styles.projectHeader}>
        <View style={styles.projectInfo}>
          <Text style={styles.projectName}>{project.project_name}</Text>
          <Text style={styles.clientName}>{project.client_name}</Text>
        </View>
        <View style={[styles.statusBadge, isActive ? styles.activeBadge : styles.inactiveBadge]}>
          <Text style={[styles.statusText, isActive ? styles.activeText : styles.inactiveText]}>
            {isActive ? 'Active' : 'Completed'}
          </Text>
        </View>
      </View>
    </Card>
  );
}

const styles = StyleSheet.create({
  container: { flex: 1, backgroundColor: Colors.background },
  scrollView: { flex: 1 },
  scrollContent: { padding: Spacing.md },
  welcomeSection: { flexDirection: 'row', justifyContent: 'space-between', alignItems: 'center', marginBottom: Spacing.md },
  welcomeText: { flex: 1 },
  greeting: { fontSize: FontSizes.md, color: Colors.textSecondary },
  userName: { fontSize: FontSizes.xxl, fontWeight: 'bold', color: Colors.text },
  logoutButton: { padding: Spacing.sm },
  alertBanner: { backgroundColor: Colors.warningLight, marginBottom: Spacing.md },
  alertContent: { flexDirection: 'row', alignItems: 'center', marginBottom: Spacing.sm },
  alertTextContainer: { marginLeft: Spacing.sm, flex: 1 },
  alertTitle: { fontSize: FontSizes.md, fontWeight: '600', color: Colors.warning },
  alertMessage: { fontSize: FontSizes.sm, color: Colors.textSecondary },
  alertAction: { fontSize: FontSizes.sm, fontWeight: '600', color: Colors.primary },
  errorBanner: { flexDirection: 'row', alignItems: 'center', backgroundColor: Colors.errorLight, padding: Spacing.md, borderRadius: BorderRadius.md, marginBottom: Spacing.md, gap: Spacing.sm },
  errorText: { flex: 1, fontSize: FontSizes.sm, color: Colors.error },
  retryText: { fontSize: FontSizes.sm, color: Colors.error, fontWeight: '600' },
  section: { marginBottom: Spacing.lg },
  sectionHeader: { flexDirection: 'row', justifyContent: 'space-between', alignItems: 'center', marginBottom: Spacing.md },
  sectionTitle: { fontSize: FontSizes.lg, fontWeight: '600', color: Colors.text, marginBottom: Spacing.md },
  viewAllText: { fontSize: FontSizes.sm, color: Colors.primary, fontWeight: '500' },
  financialGrid: { flexDirection: 'row', flexWrap: 'wrap', marginHorizontal: -Spacing.xs },
  financialCard: { width: '50%', paddingHorizontal: Spacing.xs, marginBottom: Spacing.sm, alignItems: 'center', padding: Spacing.sm },
  financialIcon: { width: 40, height: 40, borderRadius: BorderRadius.md, justifyContent: 'center', alignItems: 'center', marginBottom: Spacing.xs },
  financialValue: { fontSize: FontSizes.md, fontWeight: 'bold', color: Colors.text },
  financialTitle: { fontSize: FontSizes.xs, color: Colors.textSecondary, textAlign: 'center' },
  progressCard: { },
  progressRow: { marginBottom: Spacing.md },
  progressItem: { },
  progressLabel: { fontSize: FontSizes.sm, color: Colors.textSecondary, marginBottom: Spacing.xs },
  progressBarContainer: { height: 8, backgroundColor: Colors.border, borderRadius: 4, overflow: 'hidden' },
  progressBar: { height: '100%', borderRadius: 4 },
  progressValue: { fontSize: FontSizes.sm, fontWeight: '600', color: Colors.text, marginTop: Spacing.xs, textAlign: 'right' },
  indicatorRow: { flexDirection: 'row', gap: Spacing.md, marginTop: Spacing.sm },
  indicator: { flexDirection: 'row', alignItems: 'center', gap: Spacing.xs, paddingHorizontal: Spacing.sm, paddingVertical: Spacing.xs, borderRadius: BorderRadius.sm, backgroundColor: Colors.successLight },
  indicatorActive: { backgroundColor: Colors.errorLight },
  indicatorText: { fontSize: FontSizes.xs, color: Colors.success, fontWeight: '500' },
  indicatorTextActive: { color: Colors.error },
  statsGrid: { flexDirection: 'row', gap: Spacing.sm },
  statCard: { flex: 1, alignItems: 'center', padding: Spacing.md },
  statValue: { fontSize: FontSizes.xxl, fontWeight: 'bold', color: Colors.text },
  statLabel: { fontSize: FontSizes.xs, color: Colors.textSecondary, marginTop: Spacing.xs },
  actionsGrid: { flexDirection: 'row', flexWrap: 'wrap', marginHorizontal: -Spacing.xs },
  actionButton: { width: '25%', alignItems: 'center', paddingHorizontal: Spacing.xs, marginBottom: Spacing.md },
  actionIcon: { width: 48, height: 48, borderRadius: BorderRadius.lg, justifyContent: 'center', alignItems: 'center', marginBottom: Spacing.xs },
  actionText: { fontSize: FontSizes.xs, color: Colors.textSecondary, textAlign: 'center' },
  emptyCard: { alignItems: 'center', padding: Spacing.xl },
  emptyText: { fontSize: FontSizes.md, color: Colors.textSecondary, marginTop: Spacing.md },
  projectCard: { marginBottom: Spacing.sm },
  projectHeader: { flexDirection: 'row', justifyContent: 'space-between', alignItems: 'flex-start' },
  projectInfo: { flex: 1 },
  projectName: { fontSize: FontSizes.md, fontWeight: '600', color: Colors.text },
  clientName: { fontSize: FontSizes.sm, color: Colors.textSecondary, marginTop: 2 },
  statusBadge: { paddingHorizontal: Spacing.sm, paddingVertical: Spacing.xs, borderRadius: BorderRadius.full },
  activeBadge: { backgroundColor: Colors.successLight },
  inactiveBadge: { backgroundColor: Colors.border },
  statusText: { fontSize: FontSizes.xs, fontWeight: '500' },
  activeText: { color: Colors.success },
  inactiveText: { color: Colors.textSecondary },
});
