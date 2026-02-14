// ADMIN DASHBOARD
// Financial overview for admin users with all required indicators

import React, { useState, useEffect, useCallback } from 'react';
import {
  View,
  Text,
  StyleSheet,
  ScrollView,
  RefreshControl,
  TouchableOpacity,
} from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';
import { Ionicons } from '@expo/vector-icons';
import { useRouter } from 'expo-router';
import { useAuth } from '../../contexts/AuthContext';
import { projectsApi } from '../../services/apiClient';
import { Card, LoadingScreen } from '../../components/ui';
import { Colors, Spacing, FontSizes, BorderRadius } from '../../constants/theme';
import { Project, AdminDashboardData, Alert } from '../../types/api';

// Mock dashboard data - will be replaced with real API
const mockDashboardData: AdminDashboardData = {
  approved_budget: 50000000,
  committed_value: 35000000,
  certified_value: 28000000,
  paid_value: 22000000,
  retention_held: 2800000,
  outstanding_liability: 13000000,
  over_commit_indicator: false,
  physical_progress_percentage: 65,
  financial_progress_percentage: 56,
  delay_indicator: true,
  active_alerts: [],
  total_projects: 6,
  active_projects: 6,
  pending_work_orders: 3,
  pending_payment_certificates: 2,
};

export default function AdminDashboard() {
  const router = useRouter();
  const { user, logout } = useAuth();
  const [projects, setProjects] = useState<Project[]>([]);
  const [dashboardData, setDashboardData] = useState<AdminDashboardData>(mockDashboardData);
  const [isLoading, setIsLoading] = useState(true);
  const [refreshing, setRefreshing] = useState(false);
  const [error, setError] = useState('');

  const loadData = async () => {
    try {
      setError('');
      const projectsData = await projectsApi.getAll();
      setProjects(projectsData);
      // TODO: Replace with dashboardApi.getAdminDashboard() when backend provides it
      // UI does NOT compute any financial values - all values come from backend
      // Currently using mock data until dashboard API is available
      setDashboardData(mockDashboardData);
    } catch (err: any) {
      setError(err.message || 'Failed to load data');
    } finally {
      setIsLoading(false);
      setRefreshing(false);
    }
  };

  useEffect(() => {
    loadData();
  }, []);

  const onRefresh = useCallback(() => {
    setRefreshing(true);
    loadData();
  }, []);

  const formatCurrency = (value: number) => {
    return new Intl.NumberFormat('en-IN', {
      style: 'currency',
      currency: 'INR',
      maximumFractionDigits: 0,
    }).format(value);
  };

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
        {(dashboardData.over_commit_indicator || dashboardData.delay_indicator) && (
          <Card style={styles.alertBanner}>
            <View style={styles.alertContent}>
              <Ionicons name="warning" size={24} color={Colors.warning} />
              <View style={styles.alertTextContainer}>
                <Text style={styles.alertTitle}>Attention Required</Text>
                <Text style={styles.alertMessage}>
                  {dashboardData.over_commit_indicator && 'Over-commit detected. '}
                  {dashboardData.delay_indicator && 'Project delays detected.'}
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

        {/* Financial Summary Cards */}
        <View style={styles.section}>
          <Text style={styles.sectionTitle}>Financial Overview</Text>
          <View style={styles.financialGrid}>
            <FinancialCard
              title="Approved Budget"
              value={formatCurrency(dashboardData.approved_budget)}
              icon="wallet"
              color={Colors.primary}
            />
            <FinancialCard
              title="Committed Value"
              value={formatCurrency(dashboardData.committed_value)}
              icon="document-text"
              color={Colors.info}
            />
            <FinancialCard
              title="Certified Value"
              value={formatCurrency(dashboardData.certified_value)}
              icon="checkmark-circle"
              color={Colors.success}
            />
            <FinancialCard
              title="Paid Value"
              value={formatCurrency(dashboardData.paid_value)}
              icon="cash"
              color={Colors.accent}
            />
            <FinancialCard
              title="Retention Held"
              value={formatCurrency(dashboardData.retention_held)}
              icon="lock-closed"
              color={Colors.warning}
            />
            <FinancialCard
              title="Outstanding Liability"
              value={formatCurrency(dashboardData.outstanding_liability)}
              icon="alert-circle"
              color={Colors.error}
            />
          </View>
        </View>

        {/* Progress & Status Indicators */}
        <View style={styles.section}>
          <Text style={styles.sectionTitle}>Progress Indicators</Text>
          <Card style={styles.progressCard}>
            <View style={styles.progressRow}>
              <View style={styles.progressItem}>
                <Text style={styles.progressLabel}>Physical Progress</Text>
                <View style={styles.progressBarContainer}>
                  <View style={[styles.progressBar, { width: `${dashboardData.physical_progress_percentage}%`, backgroundColor: Colors.success }]} />
                </View>
                <Text style={styles.progressValue}>{dashboardData.physical_progress_percentage}%</Text>
              </View>
            </View>
            <View style={styles.progressRow}>
              <View style={styles.progressItem}>
                <Text style={styles.progressLabel}>Financial Progress</Text>
                <View style={styles.progressBarContainer}>
                  <View style={[styles.progressBar, { width: `${dashboardData.financial_progress_percentage}%`, backgroundColor: Colors.info }]} />
                </View>
                <Text style={styles.progressValue}>{dashboardData.financial_progress_percentage}%</Text>
              </View>
            </View>

            {/* Status Indicators */}
            <View style={styles.indicatorRow}>
              <View style={[styles.indicator, dashboardData.over_commit_indicator && styles.indicatorActive]}>
                <Ionicons name={dashboardData.over_commit_indicator ? "alert" : "checkmark"} size={16} color={dashboardData.over_commit_indicator ? Colors.error : Colors.success} />
                <Text style={[styles.indicatorText, dashboardData.over_commit_indicator && styles.indicatorTextActive]}>
                  Over-Commit
                </Text>
              </View>
              <View style={[styles.indicator, dashboardData.delay_indicator && styles.indicatorActive]}>
                <Ionicons name={dashboardData.delay_indicator ? "alert" : "checkmark"} size={16} color={dashboardData.delay_indicator ? Colors.warning : Colors.success} />
                <Text style={[styles.indicatorText, dashboardData.delay_indicator && styles.indicatorTextActive]}>
                  Delay
                </Text>
              </View>
            </View>
          </Card>
        </View>

        {/* Project Stats */}
        <View style={styles.section}>
          <Text style={styles.sectionTitle}>Project Stats</Text>
          <View style={styles.statsGrid}>
            <Card style={styles.statCard}>
              <Text style={styles.statValue}>{dashboardData.total_projects}</Text>
              <Text style={styles.statLabel}>Total Projects</Text>
            </Card>
            <Card style={styles.statCard}>
              <Text style={styles.statValue}>{dashboardData.active_projects}</Text>
              <Text style={styles.statLabel}>Active</Text>
            </Card>
            <Card style={styles.statCard}>
              <Text style={[styles.statValue, { color: Colors.warning }]}>{dashboardData.pending_work_orders}</Text>
              <Text style={styles.statLabel}>Pending WOs</Text>
            </Card>
            <Card style={styles.statCard}>
              <Text style={[styles.statValue, { color: Colors.accent }]}>{dashboardData.pending_payment_certificates}</Text>
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
