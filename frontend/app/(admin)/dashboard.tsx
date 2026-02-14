// ADMIN DASHBOARD
// Financial overview for admin users

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
import { useAuth } from '../../contexts/AuthContext';
import { projectsApi, financialApi } from '../../services/api';
import { Card, Button, LoadingScreen } from '../../components/ui';
import { Colors, Spacing, FontSizes, BorderRadius } from '../../constants/theme';
import { Project, FinancialState } from '../../types/api';

export default function AdminDashboard() {
  const { user, logout } = useAuth();
  const [projects, setProjects] = useState<Project[]>([]);
  const [isLoading, setIsLoading] = useState(true);
  const [refreshing, setRefreshing] = useState(false);
  const [error, setError] = useState('');

  const loadData = async () => {
    try {
      setError('');
      const projectsData = await projectsApi.getAll();
      setProjects(projectsData);
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

  const handleLogout = async () => {
    await logout();
  };

  if (isLoading) {
    return <LoadingScreen message="Loading dashboard..." />;
  }

  // Calculate summary stats
  const totalProjects = projects.length;
  const activeProjects = projects.filter(p => !p.end_date || new Date(p.end_date) > new Date()).length;

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
          <TouchableOpacity onPress={handleLogout} style={styles.logoutButton}>
            <Ionicons name="log-out-outline" size={24} color={Colors.textSecondary} />
          </TouchableOpacity>
        </View>

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

        {/* Summary Cards */}
        <View style={styles.summaryGrid}>
          <Card style={styles.summaryCard}>
            <View style={[styles.iconContainer, { backgroundColor: Colors.infoLight }]}>
              <Ionicons name="briefcase" size={24} color={Colors.info} />
            </View>
            <Text style={styles.summaryValue}>{totalProjects}</Text>
            <Text style={styles.summaryLabel}>Total Projects</Text>
          </Card>

          <Card style={styles.summaryCard}>
            <View style={[styles.iconContainer, { backgroundColor: Colors.successLight }]}>
              <Ionicons name="checkmark-circle" size={24} color={Colors.success} />
            </View>
            <Text style={styles.summaryValue}>{activeProjects}</Text>
            <Text style={styles.summaryLabel}>Active Projects</Text>
          </Card>

          <Card style={styles.summaryCard}>
            <View style={[styles.iconContainer, { backgroundColor: Colors.warningLight }]}>
              <Ionicons name="document-text" size={24} color={Colors.warning} />
            </View>
            <Text style={styles.summaryValue}>—</Text>
            <Text style={styles.summaryLabel}>Pending WOs</Text>
          </Card>

          <Card style={styles.summaryCard}>
            <View style={[styles.iconContainer, { backgroundColor: Colors.accentLight + '40' }]}>
              <Ionicons name="cash" size={24} color={Colors.accent} />
            </View>
            <Text style={styles.summaryValue}>—</Text>
            <Text style={styles.summaryLabel}>Pending PCs</Text>
          </Card>
        </View>

        {/* Quick Actions */}
        <View style={styles.section}>
          <Text style={styles.sectionTitle}>Quick Actions</Text>
          <View style={styles.actionsGrid}>
            <TouchableOpacity style={styles.actionButton}>
              <View style={[styles.actionIcon, { backgroundColor: Colors.primary }]}>
                <Ionicons name="add" size={24} color={Colors.white} />
              </View>
              <Text style={styles.actionText}>New Work Order</Text>
            </TouchableOpacity>

            <TouchableOpacity style={styles.actionButton}>
              <View style={[styles.actionIcon, { backgroundColor: Colors.success }]}>
                <Ionicons name="document-attach" size={24} color={Colors.white} />
              </View>
              <Text style={styles.actionText}>New Certificate</Text>
            </TouchableOpacity>

            <TouchableOpacity style={styles.actionButton}>
              <View style={[styles.actionIcon, { backgroundColor: Colors.accent }]}>
                <Ionicons name="analytics" size={24} color={Colors.white} />
              </View>
              <Text style={styles.actionText}>View Reports</Text>
            </TouchableOpacity>

            <TouchableOpacity style={styles.actionButton}>
              <View style={[styles.actionIcon, { backgroundColor: Colors.secondary }]}>
                <Ionicons name="people" size={24} color={Colors.white} />
              </View>
              <Text style={styles.actionText}>Manage Users</Text>
            </TouchableOpacity>
          </View>
        </View>

        {/* Recent Projects */}
        <View style={styles.section}>
          <View style={styles.sectionHeader}>
            <Text style={styles.sectionTitle}>Recent Projects</Text>
            <TouchableOpacity>
              <Text style={styles.viewAllText}>View All</Text>
            </TouchableOpacity>
          </View>

          {projects.length === 0 ? (
            <Card style={styles.emptyCard}>
              <Ionicons name="folder-open-outline" size={48} color={Colors.textMuted} />
              <Text style={styles.emptyText}>No projects yet</Text>
              <Text style={styles.emptySubtext}>Create your first project to get started</Text>
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

// Project Card Component
function ProjectCard({ project }: { project: Project }) {
  const isActive = !project.end_date || new Date(project.end_date) > new Date();

  return (
    <Card style={styles.projectCard} onPress={() => {}}>
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

      <View style={styles.projectMeta}>
        <View style={styles.metaItem}>
          <Ionicons name="calendar-outline" size={14} color={Colors.textMuted} />
          <Text style={styles.metaText}>
            {new Date(project.start_date).toLocaleDateString()}
          </Text>
        </View>
        <View style={styles.metaItem}>
          <Ionicons name="cash-outline" size={14} color={Colors.textMuted} />
          <Text style={styles.metaText}>{project.currency_code}</Text>
        </View>
      </View>

      <View style={styles.projectActions}>
        <TouchableOpacity style={styles.projectAction}>
          <Ionicons name="eye-outline" size={18} color={Colors.primary} />
          <Text style={styles.projectActionText}>View Details</Text>
        </TouchableOpacity>
      </View>
    </Card>
  );
}

const styles = StyleSheet.create({
  container: {
    flex: 1,
    backgroundColor: Colors.background,
  },
  scrollView: {
    flex: 1,
  },
  scrollContent: {
    padding: Spacing.md,
  },
  welcomeSection: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
    marginBottom: Spacing.lg,
  },
  welcomeText: {
    flex: 1,
  },
  greeting: {
    fontSize: FontSizes.md,
    color: Colors.textSecondary,
  },
  userName: {
    fontSize: FontSizes.xxl,
    fontWeight: 'bold',
    color: Colors.text,
  },
  logoutButton: {
    padding: Spacing.sm,
  },
  errorBanner: {
    flexDirection: 'row',
    alignItems: 'center',
    backgroundColor: Colors.errorLight,
    padding: Spacing.md,
    borderRadius: BorderRadius.md,
    marginBottom: Spacing.md,
    gap: Spacing.sm,
  },
  errorText: {
    flex: 1,
    fontSize: FontSizes.sm,
    color: Colors.error,
  },
  retryText: {
    fontSize: FontSizes.sm,
    color: Colors.error,
    fontWeight: '600',
  },
  summaryGrid: {
    flexDirection: 'row',
    flexWrap: 'wrap',
    marginHorizontal: -Spacing.xs,
    marginBottom: Spacing.lg,
  },
  summaryCard: {
    width: '50%',
    paddingHorizontal: Spacing.xs,
    marginBottom: Spacing.sm,
    alignItems: 'center',
    padding: Spacing.md,
  },
  iconContainer: {
    width: 48,
    height: 48,
    borderRadius: BorderRadius.lg,
    justifyContent: 'center',
    alignItems: 'center',
    marginBottom: Spacing.sm,
  },
  summaryValue: {
    fontSize: FontSizes.xxl,
    fontWeight: 'bold',
    color: Colors.text,
  },
  summaryLabel: {
    fontSize: FontSizes.xs,
    color: Colors.textSecondary,
    textAlign: 'center',
  },
  section: {
    marginBottom: Spacing.lg,
  },
  sectionHeader: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
    marginBottom: Spacing.md,
  },
  sectionTitle: {
    fontSize: FontSizes.lg,
    fontWeight: '600',
    color: Colors.text,
  },
  viewAllText: {
    fontSize: FontSizes.sm,
    color: Colors.primary,
    fontWeight: '500',
  },
  actionsGrid: {
    flexDirection: 'row',
    flexWrap: 'wrap',
    marginHorizontal: -Spacing.xs,
  },
  actionButton: {
    width: '25%',
    alignItems: 'center',
    paddingHorizontal: Spacing.xs,
    marginBottom: Spacing.md,
  },
  actionIcon: {
    width: 48,
    height: 48,
    borderRadius: BorderRadius.lg,
    justifyContent: 'center',
    alignItems: 'center',
    marginBottom: Spacing.xs,
  },
  actionText: {
    fontSize: FontSizes.xs,
    color: Colors.textSecondary,
    textAlign: 'center',
  },
  emptyCard: {
    alignItems: 'center',
    padding: Spacing.xl,
  },
  emptyText: {
    fontSize: FontSizes.lg,
    fontWeight: '600',
    color: Colors.text,
    marginTop: Spacing.md,
  },
  emptySubtext: {
    fontSize: FontSizes.sm,
    color: Colors.textSecondary,
    marginTop: Spacing.xs,
  },
  projectCard: {
    marginBottom: Spacing.sm,
  },
  projectHeader: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'flex-start',
    marginBottom: Spacing.sm,
  },
  projectInfo: {
    flex: 1,
  },
  projectName: {
    fontSize: FontSizes.md,
    fontWeight: '600',
    color: Colors.text,
  },
  clientName: {
    fontSize: FontSizes.sm,
    color: Colors.textSecondary,
    marginTop: 2,
  },
  statusBadge: {
    paddingHorizontal: Spacing.sm,
    paddingVertical: Spacing.xs,
    borderRadius: BorderRadius.full,
  },
  activeBadge: {
    backgroundColor: Colors.successLight,
  },
  inactiveBadge: {
    backgroundColor: Colors.border,
  },
  statusText: {
    fontSize: FontSizes.xs,
    fontWeight: '500',
  },
  activeText: {
    color: Colors.success,
  },
  inactiveText: {
    color: Colors.textSecondary,
  },
  projectMeta: {
    flexDirection: 'row',
    gap: Spacing.md,
    marginBottom: Spacing.md,
  },
  metaItem: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: Spacing.xs,
  },
  metaText: {
    fontSize: FontSizes.xs,
    color: Colors.textMuted,
  },
  projectActions: {
    borderTopWidth: 1,
    borderTopColor: Colors.border,
    paddingTop: Spacing.sm,
  },
  projectAction: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'center',
    gap: Spacing.xs,
  },
  projectActionText: {
    fontSize: FontSizes.sm,
    color: Colors.primary,
    fontWeight: '500',
  },
});
