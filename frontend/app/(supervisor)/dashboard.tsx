// SUPERVISOR DASHBOARD
// Operational overview for field supervisors with all required indicators

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
import { useProject } from '../../contexts/ProjectContext';
import { projectsApi } from '../../services/apiClient';
import { Card, LoadingScreen } from '../../components/ui';
import { Colors, Spacing, FontSizes, BorderRadius } from '../../constants/theme';
import { Project, SupervisorDashboardData } from '../../types/api';

// Mock supervisor dashboard data - will be replaced with real API
const mockSupervisorData: SupervisorDashboardData = {
  attendance_status: 'NOT_CHECKED_IN',
  check_in_time: undefined,
  image_count_today: 0,
  physical_progress_percentage: 65,
  assigned_project: null,
  open_issues_count: 2,
  pending_voice_logs: 1,
};

export default function SupervisorDashboard() {
  const router = useRouter();
  const { user, logout } = useAuth();
  const { selectedProject, clearProject, isProjectSelected } = useProject();
  const [projects, setProjects] = useState<Project[]>([]);
  const [dashboardData, setDashboardData] = useState<SupervisorDashboardData>(mockSupervisorData);
  const [isLoading, setIsLoading] = useState(true);
  const [refreshing, setRefreshing] = useState(false);
  const [checkedIn, setCheckedIn] = useState(false);

  // Redirect to project selection if no project selected
  useEffect(() => {
    if (!isProjectSelected) {
      router.replace('/(supervisor)/select-project');
    }
  }, [isProjectSelected]);

  const loadData = async () => {
    try {
      const projectsData = await projectsApi.getAll();
      setProjects(projectsData);
      // TODO: Replace with dashboardApi.getSupervisorDashboard() when backend provides it
      // UI does NOT compute any values - all values come from backend
      // Currently using mock data until dashboard API is available
    } catch (err) {
      console.error('Failed to load data:', err);
    } finally {
      setIsLoading(false);
      setRefreshing(false);
    }
  };

  useEffect(() => {
    if (isProjectSelected) {
      loadData();
    }
  }, [isProjectSelected]);

  const onRefresh = useCallback(() => {
    setRefreshing(true);
    loadData();
  }, []);

  const handleCheckIn = () => {
    // TODO: Call attendanceApi.checkIn() when backend is connected
    // UI only updates state based on backend response
    // For now, simulate the check-in locally (will be replaced with API call)
    setCheckedIn(true);
    setDashboardData(prev => ({
      ...prev,
      attendance_status: 'CHECKED_IN',
      check_in_time: new Date().toISOString(),
    }));
  };

  if (isLoading) {
    return <LoadingScreen message="Loading dashboard..." />;
  }

  const currentDate = new Date().toLocaleDateString('en-US', {
    weekday: 'long',
    year: 'numeric',
    month: 'long',
    day: 'numeric',
  });

  const isCheckedIn = dashboardData.attendance_status === 'CHECKED_IN';

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
            <Text style={styles.greeting}>Good Morning,</Text>
            <Text style={styles.userName}>{user?.name || 'Supervisor'}</Text>
            <Text style={styles.dateText}>{currentDate}</Text>
          </View>
          <TouchableOpacity onPress={logout} style={styles.logoutButton}>
            <Ionicons name="log-out-outline" size={24} color={Colors.textSecondary} />
          </TouchableOpacity>
        </View>

        {/* Selected Project Card */}
        {selectedProject && (
          <TouchableOpacity 
            style={styles.selectedProjectCard}
            onPress={() => router.push('/(supervisor)/select-project')}
            activeOpacity={0.8}
          >
            <View style={styles.selectedProjectIcon}>
              <Ionicons name="business" size={20} color={Colors.accent} />
            </View>
            <View style={styles.selectedProjectInfo}>
              <Text style={styles.selectedProjectLabel}>Working on</Text>
              <Text style={styles.selectedProjectName}>{selectedProject.project_name}</Text>
            </View>
            <View style={styles.switchProjectBtn}>
              <Text style={styles.switchProjectText}>Switch</Text>
              <Ionicons name="swap-horizontal" size={16} color={Colors.accent} />
            </View>
          </TouchableOpacity>
        )}

        {/* Attendance Status Card */}
        <Card style={[styles.attendanceCard, isCheckedIn && styles.attendanceCardCheckedIn]}>
          <View style={styles.attendanceHeader}>
            <View style={[styles.attendanceIcon, isCheckedIn && styles.attendanceIconCheckedIn]}>
              <Ionicons 
                name={isCheckedIn ? "checkmark-circle" : "finger-print"} 
                size={32} 
                color={isCheckedIn ? Colors.success : Colors.accent} 
              />
            </View>
            <View style={styles.attendanceInfo}>
              <Text style={styles.attendanceTitle}>
                {isCheckedIn ? "Attendance Marked" : "Attendance Status"}
              </Text>
              <Text style={styles.attendanceSubtitle}>
                {isCheckedIn 
                  ? `Checked in at ${new Date(dashboardData.check_in_time!).toLocaleTimeString()}`
                  : "Not checked in yet"}
              </Text>
            </View>
            <View style={[styles.statusIndicator, isCheckedIn ? styles.statusCheckedIn : styles.statusNotCheckedIn]}>
              <Text style={[styles.statusIndicatorText, isCheckedIn && styles.statusIndicatorTextCheckedIn]}>
                {isCheckedIn ? 'IN' : 'OUT'}
              </Text>
            </View>
          </View>
          {!isCheckedIn && (
            <TouchableOpacity style={styles.checkInButton} onPress={handleCheckIn}>
              <Ionicons name="camera" size={20} color={Colors.white} />
              <Text style={styles.checkInButtonText}>Check In with Selfie</Text>
            </TouchableOpacity>
          )}
        </Card>

        {/* Key Metrics */}
        <View style={styles.metricsGrid}>
          <Card style={styles.metricCard}>
            <View style={[styles.metricIcon, { backgroundColor: Colors.infoLight }]}>
              <Ionicons name="images" size={20} color={Colors.info} />
            </View>
            <Text style={styles.metricValue}>{dashboardData.image_count_today}</Text>
            <Text style={styles.metricLabel}>Images Today</Text>
          </Card>

          <Card style={styles.metricCard}>
            <View style={[styles.metricIcon, { backgroundColor: Colors.successLight }]}>
              <Ionicons name="trending-up" size={20} color={Colors.success} />
            </View>
            <Text style={styles.metricValue}>{dashboardData.physical_progress_percentage}%</Text>
            <Text style={styles.metricLabel}>Physical Progress</Text>
          </Card>

          <Card style={styles.metricCard}>
            <View style={[styles.metricIcon, { backgroundColor: Colors.errorLight }]}>
              <Ionicons name="alert-circle" size={20} color={Colors.error} />
            </View>
            <Text style={[styles.metricValue, { color: dashboardData.open_issues_count > 0 ? Colors.error : Colors.text }]}>
              {dashboardData.open_issues_count}
            </Text>
            <Text style={styles.metricLabel}>Open Issues</Text>
          </Card>

          <Card style={styles.metricCard}>
            <View style={[styles.metricIcon, { backgroundColor: Colors.accentLight + '40' }]}>
              <Ionicons name="mic" size={20} color={Colors.accent} />
            </View>
            <Text style={styles.metricValue}>{dashboardData.pending_voice_logs}</Text>
            <Text style={styles.metricLabel}>Voice Logs</Text>
          </Card>
        </View>

        {/* Assigned Project */}
        {dashboardData.assigned_project && (
          <View style={styles.section}>
            <Text style={styles.sectionTitle}>Assigned Project</Text>
            <Card style={styles.projectCard}>
              <View style={styles.projectHeader}>
                <View style={styles.projectIconContainer}>
                  <Ionicons name="business" size={24} color={Colors.accent} />
                </View>
                <View style={styles.projectInfo}>
                  <Text style={styles.projectName}>{dashboardData.assigned_project.project_name}</Text>
                  <Text style={styles.projectClient}>{dashboardData.assigned_project.client_name}</Text>
                </View>
              </View>

              <View style={styles.projectProgress}>
                <View style={styles.progressInfo}>
                  <Text style={styles.progressLabel}>Overall Progress</Text>
                  <Text style={styles.progressValue}>{dashboardData.physical_progress_percentage}%</Text>
                </View>
                <View style={styles.progressBar}>
                  <View style={[styles.progressFill, { width: `${dashboardData.physical_progress_percentage}%` }]} />
                </View>
              </View>
            </Card>
          </View>
        )}

        {/* Quick Actions */}
        <View style={styles.section}>
          <Text style={styles.sectionTitle}>Quick Actions</Text>
          <View style={styles.actionsGrid}>
            {/* DPR - Show only if user has permission */}
            {user?.dpr_generation_permission && (
              <TouchableOpacity style={styles.actionCard} onPress={() => router.push('/(supervisor)/dpr')}>
                <View style={[styles.actionIcon, { backgroundColor: Colors.primaryLight || '#E3F2FD' }]}>
                  <Ionicons name="document-text" size={24} color={Colors.primary} />
                </View>
                <Text style={styles.actionText}>Create DPR</Text>
              </TouchableOpacity>
            )}

            <TouchableOpacity style={styles.actionCard} onPress={() => router.push('/(supervisor)/progress')}>
              <View style={[styles.actionIcon, { backgroundColor: Colors.successLight }]}>
                <Ionicons name="trending-up" size={24} color={Colors.success} />
              </View>
              <Text style={styles.actionText}>Update Progress</Text>
            </TouchableOpacity>

            <TouchableOpacity style={styles.actionCard}>
              <View style={[styles.actionIcon, { backgroundColor: Colors.infoLight }]}>
                <Ionicons name="camera" size={24} color={Colors.info} />
              </View>
              <Text style={styles.actionText}>Upload Photos</Text>
            </TouchableOpacity>

            <TouchableOpacity style={styles.actionCard} onPress={() => router.push('/(supervisor)/issues')}>
              <View style={[styles.actionIcon, { backgroundColor: Colors.warningLight }]}>
                <Ionicons name="warning" size={24} color={Colors.warning} />
              </View>
              <Text style={styles.actionText}>Report Issue</Text>
            </TouchableOpacity>

            <TouchableOpacity style={styles.actionCard} onPress={() => router.push('/(supervisor)/voice-log')}>
              <View style={[styles.actionIcon, { backgroundColor: Colors.accentLight + '40' }]}>
                <Ionicons name="mic" size={24} color={Colors.accent} />
              </View>
              <Text style={styles.actionText}>Voice Log</Text>
            </TouchableOpacity>
          </View>
        </View>

        {/* Today's Tasks */}
        <View style={styles.section}>
          <Text style={styles.sectionTitle}>Today's Tasks</Text>
          <Card style={styles.taskCard}>
            <TaskItem 
              title="Update progress for Foundation Work"
              meta="Project: City Tower"
              completed={false}
            />
            <View style={styles.taskDivider} />
            <TaskItem 
              title="Upload site photos"
              meta="Pending: 3 photos"
              completed={false}
            />
            <View style={styles.taskDivider} />
            <TaskItem 
              title="Mark attendance"
              meta="Daily check-in"
              completed={isCheckedIn}
            />
          </Card>
        </View>
      </ScrollView>
    </SafeAreaView>
  );
}

function TaskItem({ title, meta, completed }: { title: string; meta: string; completed: boolean }) {
  return (
    <View style={styles.taskItem}>
      <View style={styles.taskCheckbox}>
        <Ionicons 
          name={completed ? "checkmark-circle" : "ellipse-outline"} 
          size={22} 
          color={completed ? Colors.success : Colors.textMuted} 
        />
      </View>
      <View style={styles.taskContent}>
        <Text style={[styles.taskTitle, completed && styles.taskTitleCompleted]}>{title}</Text>
        <Text style={styles.taskMeta}>{meta}</Text>
      </View>
    </View>
  );
}

const styles = StyleSheet.create({
  container: { flex: 1, backgroundColor: Colors.background },
  scrollView: { flex: 1 },
  scrollContent: { padding: Spacing.md },
  welcomeSection: { flexDirection: 'row', justifyContent: 'space-between', alignItems: 'flex-start', marginBottom: Spacing.lg },
  welcomeText: { flex: 1 },
  greeting: { fontSize: FontSizes.md, color: Colors.textSecondary },
  userName: { fontSize: FontSizes.xxl, fontWeight: 'bold', color: Colors.text },
  dateText: { fontSize: FontSizes.sm, color: Colors.textMuted, marginTop: Spacing.xs },
  logoutButton: { padding: Spacing.sm },
  attendanceCard: { backgroundColor: Colors.white, marginBottom: Spacing.md },
  attendanceCardCheckedIn: { borderLeftWidth: 4, borderLeftColor: Colors.success },
  attendanceHeader: { flexDirection: 'row', alignItems: 'center' },
  attendanceIcon: { width: 56, height: 56, borderRadius: 28, backgroundColor: Colors.accentLight + '30', justifyContent: 'center', alignItems: 'center', marginRight: Spacing.md },
  attendanceIconCheckedIn: { backgroundColor: Colors.successLight },
  attendanceInfo: { flex: 1 },
  attendanceTitle: { fontSize: FontSizes.lg, fontWeight: '600', color: Colors.text },
  attendanceSubtitle: { fontSize: FontSizes.sm, color: Colors.textSecondary, marginTop: 2 },
  statusIndicator: { paddingHorizontal: Spacing.sm, paddingVertical: Spacing.xs, borderRadius: BorderRadius.sm },
  statusNotCheckedIn: { backgroundColor: Colors.errorLight },
  statusCheckedIn: { backgroundColor: Colors.successLight },
  statusIndicatorText: { fontSize: FontSizes.xs, fontWeight: 'bold', color: Colors.error },
  statusIndicatorTextCheckedIn: { color: Colors.success },
  checkInButton: { flexDirection: 'row', alignItems: 'center', justifyContent: 'center', backgroundColor: Colors.accent, paddingVertical: Spacing.sm + 4, borderRadius: BorderRadius.md, marginTop: Spacing.md, gap: Spacing.sm },
  checkInButtonText: { fontSize: FontSizes.md, fontWeight: '600', color: Colors.white },
  metricsGrid: { flexDirection: 'row', flexWrap: 'wrap', marginHorizontal: -Spacing.xs, marginBottom: Spacing.md },
  metricCard: { width: '50%', paddingHorizontal: Spacing.xs, marginBottom: Spacing.sm, alignItems: 'center', padding: Spacing.md },
  metricIcon: { width: 40, height: 40, borderRadius: BorderRadius.md, justifyContent: 'center', alignItems: 'center', marginBottom: Spacing.xs },
  metricValue: { fontSize: FontSizes.xxl, fontWeight: 'bold', color: Colors.text },
  metricLabel: { fontSize: FontSizes.xs, color: Colors.textSecondary, textAlign: 'center' },
  section: { marginBottom: Spacing.lg },
  sectionTitle: { fontSize: FontSizes.lg, fontWeight: '600', color: Colors.text, marginBottom: Spacing.md },
  projectCard: { },
  projectHeader: { flexDirection: 'row', alignItems: 'center', marginBottom: Spacing.md },
  projectIconContainer: { width: 48, height: 48, borderRadius: BorderRadius.md, backgroundColor: Colors.accentLight + '30', justifyContent: 'center', alignItems: 'center', marginRight: Spacing.md },
  projectInfo: { flex: 1 },
  projectName: { fontSize: FontSizes.md, fontWeight: '600', color: Colors.text },
  projectClient: { fontSize: FontSizes.sm, color: Colors.textSecondary },
  projectProgress: { },
  progressInfo: { flexDirection: 'row', justifyContent: 'space-between', marginBottom: Spacing.xs },
  progressLabel: { fontSize: FontSizes.xs, color: Colors.textMuted },
  progressValue: { fontSize: FontSizes.xs, fontWeight: '600', color: Colors.accent },
  progressBar: { height: 8, backgroundColor: Colors.border, borderRadius: 4, overflow: 'hidden' },
  progressFill: { height: '100%', backgroundColor: Colors.accent, borderRadius: 4 },
  actionsGrid: { flexDirection: 'row', flexWrap: 'wrap', marginHorizontal: -Spacing.xs },
  actionCard: { width: '50%', paddingHorizontal: Spacing.xs, marginBottom: Spacing.sm },
  actionIcon: { width: '100%', height: 80, borderRadius: BorderRadius.lg, justifyContent: 'center', alignItems: 'center', marginBottom: Spacing.xs },
  actionText: { fontSize: FontSizes.sm, fontWeight: '500', color: Colors.text, textAlign: 'center' },
  taskCard: { padding: 0 },
  taskItem: { flexDirection: 'row', alignItems: 'center', padding: Spacing.md },
  taskCheckbox: { marginRight: Spacing.sm },
  taskContent: { flex: 1 },
  taskTitle: { fontSize: FontSizes.md, color: Colors.text },
  taskTitleCompleted: { textDecorationLine: 'line-through', color: Colors.textMuted },
  taskMeta: { fontSize: FontSizes.xs, color: Colors.textMuted, marginTop: 2 },
  taskDivider: { height: 1, backgroundColor: Colors.border, marginLeft: Spacing.xl + Spacing.md },
});
