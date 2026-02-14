// SUPERVISOR DASHBOARD
// Operational overview for field supervisors

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
import { projectsApi } from '../../services/api';
import { Card, LoadingScreen } from '../../components/ui';
import { Colors, Spacing, FontSizes, BorderRadius } from '../../constants/theme';
import { Project } from '../../types/api';

export default function SupervisorDashboard() {
  const { user, logout } = useAuth();
  const [projects, setProjects] = useState<Project[]>([]);
  const [isLoading, setIsLoading] = useState(true);
  const [refreshing, setRefreshing] = useState(false);
  const [todayAttendance, setTodayAttendance] = useState(false);

  const loadData = async () => {
    try {
      const projectsData = await projectsApi.getAll();
      setProjects(projectsData);
    } catch (err) {
      console.error('Failed to load data:', err);
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

  if (isLoading) {
    return <LoadingScreen message="Loading dashboard..." />;
  }

  const currentDate = new Date().toLocaleDateString('en-US', {
    weekday: 'long',
    year: 'numeric',
    month: 'long',
    day: 'numeric',
  });

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

        {/* Attendance Card */}
        <Card style={styles.attendanceCard}>
          <View style={styles.attendanceHeader}>
            <View style={styles.attendanceIcon}>
              <Ionicons 
                name={todayAttendance ? "checkmark-circle" : "finger-print"} 
                size={32} 
                color={todayAttendance ? Colors.success : Colors.accent} 
              />
            </View>
            <View style={styles.attendanceInfo}>
              <Text style={styles.attendanceTitle}>
                {todayAttendance ? "Attendance Marked" : "Mark Today's Attendance"}
              </Text>
              <Text style={styles.attendanceSubtitle}>
                {todayAttendance 
                  ? "You checked in at 9:00 AM" 
                  : "Tap to check in with selfie"}
              </Text>
            </View>
          </View>
          {!todayAttendance && (
            <TouchableOpacity style={styles.checkInButton}>
              <Ionicons name="camera" size={20} color={Colors.white} />
              <Text style={styles.checkInButtonText}>Check In Now</Text>
            </TouchableOpacity>
          )}
        </Card>

        {/* Quick Actions */}
        <View style={styles.section}>
          <Text style={styles.sectionTitle}>Quick Actions</Text>
          <View style={styles.actionsGrid}>
            <TouchableOpacity style={styles.actionCard}>
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

            <TouchableOpacity style={styles.actionCard}>
              <View style={[styles.actionIcon, { backgroundColor: Colors.warningLight }]}>
                <Ionicons name="warning" size={24} color={Colors.warning} />
              </View>
              <Text style={styles.actionText}>Report Issue</Text>
            </TouchableOpacity>

            <TouchableOpacity style={styles.actionCard}>
              <View style={[styles.actionIcon, { backgroundColor: Colors.accentLight + '40' }]}>
                <Ionicons name="mic" size={24} color={Colors.accent} />
              </View>
              <Text style={styles.actionText}>Voice Log</Text>
            </TouchableOpacity>
          </View>
        </View>

        {/* Assigned Projects */}
        <View style={styles.section}>
          <Text style={styles.sectionTitle}>My Projects</Text>
          {projects.length === 0 ? (
            <Card style={styles.emptyCard}>
              <Ionicons name="folder-open-outline" size={48} color={Colors.textMuted} />
              <Text style={styles.emptyText}>No assigned projects</Text>
            </Card>
          ) : (
            projects.slice(0, 2).map((project) => (
              <ProjectCard key={project.project_id} project={project} />
            ))
          )}
        </View>

        {/* Today's Tasks */}
        <View style={styles.section}>
          <Text style={styles.sectionTitle}>Today's Tasks</Text>
          <Card style={styles.taskCard}>
            <View style={styles.taskItem}>
              <View style={styles.taskCheckbox}>
                <Ionicons name="square-outline" size={22} color={Colors.textMuted} />
              </View>
              <View style={styles.taskContent}>
                <Text style={styles.taskTitle}>Update progress for Foundation Work</Text>
                <Text style={styles.taskMeta}>Project: City Tower</Text>
              </View>
            </View>
            <View style={styles.taskDivider} />
            <View style={styles.taskItem}>
              <View style={styles.taskCheckbox}>
                <Ionicons name="square-outline" size={22} color={Colors.textMuted} />
              </View>
              <View style={styles.taskContent}>
                <Text style={styles.taskTitle}>Upload site photos</Text>
                <Text style={styles.taskMeta}>Pending: 3 photos</Text>
              </View>
            </View>
          </Card>
        </View>
      </ScrollView>
    </SafeAreaView>
  );
}

function ProjectCard({ project }: { project: Project }) {
  return (
    <Card style={styles.projectCard} onPress={() => {}}>
      <View style={styles.projectHeader}>
        <View style={styles.projectIconContainer}>
          <Ionicons name="business" size={20} color={Colors.accent} />
        </View>
        <View style={styles.projectInfo}>
          <Text style={styles.projectName}>{project.project_name}</Text>
          <Text style={styles.projectClient}>{project.client_name}</Text>
        </View>
        <Ionicons name="chevron-forward" size={20} color={Colors.textMuted} />
      </View>

      <View style={styles.projectProgress}>
        <View style={styles.progressInfo}>
          <Text style={styles.progressLabel}>Physical Progress</Text>
          <Text style={styles.progressValue}>65%</Text>
        </View>
        <View style={styles.progressBar}>
          <View style={[styles.progressFill, { width: '65%' }]} />
        </View>
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
    alignItems: 'flex-start',
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
  dateText: {
    fontSize: FontSizes.sm,
    color: Colors.textMuted,
    marginTop: Spacing.xs,
  },
  logoutButton: {
    padding: Spacing.sm,
  },
  attendanceCard: {
    backgroundColor: Colors.white,
    marginBottom: Spacing.lg,
  },
  attendanceHeader: {
    flexDirection: 'row',
    alignItems: 'center',
  },
  attendanceIcon: {
    width: 56,
    height: 56,
    borderRadius: 28,
    backgroundColor: Colors.accentLight + '30',
    justifyContent: 'center',
    alignItems: 'center',
    marginRight: Spacing.md,
  },
  attendanceInfo: {
    flex: 1,
  },
  attendanceTitle: {
    fontSize: FontSizes.lg,
    fontWeight: '600',
    color: Colors.text,
  },
  attendanceSubtitle: {
    fontSize: FontSizes.sm,
    color: Colors.textSecondary,
    marginTop: 2,
  },
  checkInButton: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'center',
    backgroundColor: Colors.accent,
    paddingVertical: Spacing.sm + 4,
    borderRadius: BorderRadius.md,
    marginTop: Spacing.md,
    gap: Spacing.sm,
  },
  checkInButtonText: {
    fontSize: FontSizes.md,
    fontWeight: '600',
    color: Colors.white,
  },
  section: {
    marginBottom: Spacing.lg,
  },
  sectionTitle: {
    fontSize: FontSizes.lg,
    fontWeight: '600',
    color: Colors.text,
    marginBottom: Spacing.md,
  },
  actionsGrid: {
    flexDirection: 'row',
    flexWrap: 'wrap',
    marginHorizontal: -Spacing.xs,
  },
  actionCard: {
    width: '50%',
    paddingHorizontal: Spacing.xs,
    marginBottom: Spacing.sm,
  },
  actionIcon: {
    width: '100%',
    height: 80,
    borderRadius: BorderRadius.lg,
    justifyContent: 'center',
    alignItems: 'center',
    marginBottom: Spacing.xs,
  },
  actionText: {
    fontSize: FontSizes.sm,
    fontWeight: '500',
    color: Colors.text,
    textAlign: 'center',
  },
  emptyCard: {
    alignItems: 'center',
    padding: Spacing.xl,
  },
  emptyText: {
    fontSize: FontSizes.md,
    color: Colors.textSecondary,
    marginTop: Spacing.md,
  },
  projectCard: {
    marginBottom: Spacing.sm,
  },
  projectHeader: {
    flexDirection: 'row',
    alignItems: 'center',
    marginBottom: Spacing.md,
  },
  projectIconContainer: {
    width: 40,
    height: 40,
    borderRadius: BorderRadius.md,
    backgroundColor: Colors.accentLight + '30',
    justifyContent: 'center',
    alignItems: 'center',
    marginRight: Spacing.sm,
  },
  projectInfo: {
    flex: 1,
  },
  projectName: {
    fontSize: FontSizes.md,
    fontWeight: '600',
    color: Colors.text,
  },
  projectClient: {
    fontSize: FontSizes.sm,
    color: Colors.textSecondary,
  },
  projectProgress: {
    marginTop: Spacing.xs,
  },
  progressInfo: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    marginBottom: Spacing.xs,
  },
  progressLabel: {
    fontSize: FontSizes.xs,
    color: Colors.textMuted,
  },
  progressValue: {
    fontSize: FontSizes.xs,
    fontWeight: '600',
    color: Colors.accent,
  },
  progressBar: {
    height: 6,
    backgroundColor: Colors.border,
    borderRadius: 3,
    overflow: 'hidden',
  },
  progressFill: {
    height: '100%',
    backgroundColor: Colors.accent,
    borderRadius: 3,
  },
  taskCard: {
    padding: 0,
  },
  taskItem: {
    flexDirection: 'row',
    alignItems: 'center',
    padding: Spacing.md,
  },
  taskCheckbox: {
    marginRight: Spacing.sm,
  },
  taskContent: {
    flex: 1,
  },
  taskTitle: {
    fontSize: FontSizes.md,
    color: Colors.text,
  },
  taskMeta: {
    fontSize: FontSizes.xs,
    color: Colors.textMuted,
    marginTop: 2,
  },
  taskDivider: {
    height: 1,
    backgroundColor: Colors.border,
    marginLeft: Spacing.xl + Spacing.md,
  },
});
