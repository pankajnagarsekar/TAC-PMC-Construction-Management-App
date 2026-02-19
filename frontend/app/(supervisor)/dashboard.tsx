// SUPERVISOR DASHBOARD - SIMPLIFIED WORKFLOW
// Clear step-by-step flow: Check-in → Select Project → Workers Log → Create DPR

import React, { useState, useEffect, useCallback } from 'react';
import {
  View,
  Text,
  StyleSheet,
  ScrollView,
  RefreshControl,
  TouchableOpacity,
  Alert,
  Platform,
  Modal,
  Image,
} from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';
import { Ionicons } from '@expo/vector-icons';
import { useRouter } from 'expo-router';
import * as ImagePicker from 'expo-image-picker';
import * as Location from 'expo-location';
import { useAuth } from '../../contexts/AuthContext';
import { useProject } from '../../contexts/ProjectContext';
import { projectsApi } from '../../services/apiClient';
import { Card, LoadingScreen } from '../../components/ui';
import { Colors, Spacing, FontSizes, BorderRadius } from '../../constants/theme';

interface CheckInData {
  isCheckedIn: boolean;
  checkInTime: string | null;
  selfieUri: string | null;
  location: { latitude: number; longitude: number } | null;
}

interface WorkerLogStatus {
  isCompleted: boolean;
  totalWorkers: number;
}

interface DPRStatus {
  hasDraftDPR: boolean;
  submittedToday: boolean;
}

export default function SupervisorDashboard() {
  const router = useRouter();
  const { user, logout, checkCanLogout } = useAuth();
  const { selectedProject, isProjectSelected } = useProject();
  
  const [isLoading, setIsLoading] = useState(false);
  const [refreshing, setRefreshing] = useState(false);
  const [logoutBlockedModal, setLogoutBlockedModal] = useState(false);
  
  // Step states
  const [checkInData, setCheckInData] = useState<CheckInData>({
    isCheckedIn: false,
    checkInTime: null,
    selfieUri: null,
    location: null,
  });
  
  const [workerLogStatus, setWorkerLogStatus] = useState<WorkerLogStatus>({
    isCompleted: false,
    totalWorkers: 0,
  });
  
  const [dprStatus, setDPRStatus] = useState<DPRStatus>({
    hasDraftDPR: false,
    submittedToday: false,
  });

  // Current date
  const currentDate = new Date().toLocaleDateString('en-US', {
    weekday: 'long',
    month: 'long',
    day: 'numeric',
    year: 'numeric',
  });

  const loadData = useCallback(async () => {
    // TODO: Load actual status from backend
    // For now using local state
    setRefreshing(false);
  }, []);

  useEffect(() => {
    loadData();
  }, [loadData]);

  const onRefresh = useCallback(() => {
    setRefreshing(true);
    loadData();
  }, [loadData]);

  // Handle logout with worker log check
  const handleLogout = async () => {
    const result = await checkCanLogout();
    if (result.can_logout) {
      await logout();
    } else {
      setLogoutBlockedModal(true);
    }
  };

  // Step 1: Check-in with Selfie
  const handleCheckIn = async () => {
    try {
      // Request camera permission
      const { status: cameraStatus } = await ImagePicker.requestCameraPermissionsAsync();
      if (cameraStatus !== 'granted') {
        Alert.alert('Permission Required', 'Camera permission is needed to check in.');
        return;
      }

      // Request location permission
      const { status: locationStatus } = await Location.requestForegroundPermissionsAsync();
      if (locationStatus !== 'granted') {
        Alert.alert('Permission Required', 'Location permission is needed to check in.');
        return;
      }

      // Take selfie
      const result = await ImagePicker.launchCameraAsync({
        allowsEditing: false,
        quality: 0.7,
        cameraType: ImagePicker.CameraType.front,
      });

      if (result.canceled) return;

      // Get location
      setIsLoading(true);
      const location = await Location.getCurrentPositionAsync({});
      
      // Save check-in data
      setCheckInData({
        isCheckedIn: true,
        checkInTime: new Date().toISOString(),
        selfieUri: result.assets[0].uri,
        location: {
          latitude: location.coords.latitude,
          longitude: location.coords.longitude,
        },
      });

      // TODO: Send to backend
      Alert.alert('Success', 'You have checked in successfully!');
    } catch (error) {
      console.error('Check-in error:', error);
      Alert.alert('Error', 'Failed to check in. Please try again.');
    } finally {
      setIsLoading(false);
    }
  };

  // Step 2: Navigate to project selection
  const handleSelectProject = () => {
    router.push('/(supervisor)/select-project');
  };

  // Step 3: Navigate to worker log
  const handleWorkerLog = () => {
    router.push('/(supervisor)/worker-log');
  };

  // Step 4: Navigate to DPR creation
  const handleCreateDPR = () => {
    router.push('/(supervisor)/dpr');
  };

  // Determine which steps are complete
  const step1Complete = checkInData.isCheckedIn;
  const step2Complete = isProjectSelected;
  const step3Complete = workerLogStatus.isCompleted;
  const step4Complete = dprStatus.submittedToday;

  // Determine which step is active (first incomplete step)
  const getActiveStep = () => {
    if (!step1Complete) return 1;
    if (!step2Complete) return 2;
    if (!step3Complete) return 3;
    if (!step4Complete) return 4;
    return 5; // All complete
  };

  const activeStep = getActiveStep();

  if (isLoading) {
    return <LoadingScreen message="Processing..." />;
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
        {/* Header */}
        <View style={styles.header}>
          <View style={styles.headerInfo}>
            <Text style={styles.greeting}>Hello, {user?.name || 'Supervisor'}!</Text>
            <Text style={styles.dateText}>{currentDate}</Text>
          </View>
          <TouchableOpacity onPress={handleLogout} style={styles.logoutButton}>
            <Ionicons name="log-out-outline" size={24} color={Colors.textSecondary} />
          </TouchableOpacity>
        </View>

        {/* Daily Workflow Progress */}
        <Card style={styles.progressCard}>
          <Text style={styles.progressTitle}>Today's Workflow</Text>
          <View style={styles.progressBar}>
            <View style={[styles.progressFill, { width: `${(activeStep - 1) * 25}%` }]} />
          </View>
          <Text style={styles.progressText}>
            {activeStep <= 4 ? `Step ${activeStep} of 4` : 'All tasks completed!'}
          </Text>
        </Card>

        {/* Step 1: Check-in */}
        <TouchableOpacity
          style={[
            styles.stepCard,
            step1Complete && styles.stepCardComplete,
            activeStep === 1 && styles.stepCardActive,
          ]}
          onPress={!step1Complete ? handleCheckIn : undefined}
          disabled={step1Complete}
        >
          <View style={styles.stepLeft}>
            <View style={[
              styles.stepNumber,
              step1Complete && styles.stepNumberComplete,
              activeStep === 1 && styles.stepNumberActive,
            ]}>
              {step1Complete ? (
                <Ionicons name="checkmark" size={20} color={Colors.white} />
              ) : (
                <Text style={[styles.stepNumberText, activeStep === 1 && styles.stepNumberTextActive]}>1</Text>
              )}
            </View>
            <View style={styles.stepInfo}>
              <Text style={[styles.stepTitle, step1Complete && styles.stepTitleComplete]}>
                Check-in with Selfie
              </Text>
              <Text style={styles.stepSubtitle}>
                {step1Complete 
                  ? `Checked in at ${new Date(checkInData.checkInTime!).toLocaleTimeString()}`
                  : 'Take a selfie to mark attendance'}
              </Text>
            </View>
          </View>
          {!step1Complete && activeStep === 1 && (
            <View style={styles.stepAction}>
              <Ionicons name="camera" size={24} color={Colors.accent} />
            </View>
          )}
          {step1Complete && checkInData.selfieUri && (
            <Image source={{ uri: checkInData.selfieUri }} style={styles.selfieThumb} />
          )}
        </TouchableOpacity>

        {/* Step 2: Select Project */}
        <TouchableOpacity
          style={[
            styles.stepCard,
            step2Complete && styles.stepCardComplete,
            activeStep === 2 && styles.stepCardActive,
            !step1Complete && styles.stepCardDisabled,
          ]}
          onPress={step1Complete ? handleSelectProject : undefined}
          disabled={!step1Complete}
        >
          <View style={styles.stepLeft}>
            <View style={[
              styles.stepNumber,
              step2Complete && styles.stepNumberComplete,
              activeStep === 2 && styles.stepNumberActive,
              !step1Complete && styles.stepNumberDisabled,
            ]}>
              {step2Complete ? (
                <Ionicons name="checkmark" size={20} color={Colors.white} />
              ) : (
                <Text style={[
                  styles.stepNumberText,
                  activeStep === 2 && styles.stepNumberTextActive,
                  !step1Complete && styles.stepNumberTextDisabled,
                ]}>2</Text>
              )}
            </View>
            <View style={styles.stepInfo}>
              <Text style={[
                styles.stepTitle,
                step2Complete && styles.stepTitleComplete,
                !step1Complete && styles.stepTitleDisabled,
              ]}>
                Select Project
              </Text>
              <Text style={[styles.stepSubtitle, !step1Complete && styles.stepSubtitleDisabled]}>
                {step2Complete 
                  ? selectedProject?.project_name
                  : 'Choose the project you\'re working on'}
              </Text>
            </View>
          </View>
          {step2Complete ? (
            <TouchableOpacity onPress={handleSelectProject} style={styles.changeBtn}>
              <Text style={styles.changeBtnText}>Change</Text>
            </TouchableOpacity>
          ) : activeStep === 2 && (
            <View style={styles.stepAction}>
              <Ionicons name="chevron-forward" size={24} color={Colors.accent} />
            </View>
          )}
        </TouchableOpacity>

        {/* Step 3: Workers Log */}
        <TouchableOpacity
          style={[
            styles.stepCard,
            step3Complete && styles.stepCardComplete,
            activeStep === 3 && styles.stepCardActive,
            !step2Complete && styles.stepCardDisabled,
          ]}
          onPress={step2Complete ? handleWorkerLog : undefined}
          disabled={!step2Complete}
        >
          <View style={styles.stepLeft}>
            <View style={[
              styles.stepNumber,
              step3Complete && styles.stepNumberComplete,
              activeStep === 3 && styles.stepNumberActive,
              !step2Complete && styles.stepNumberDisabled,
            ]}>
              {step3Complete ? (
                <Ionicons name="checkmark" size={20} color={Colors.white} />
              ) : (
                <Text style={[
                  styles.stepNumberText,
                  activeStep === 3 && styles.stepNumberTextActive,
                  !step2Complete && styles.stepNumberTextDisabled,
                ]}>3</Text>
              )}
            </View>
            <View style={styles.stepInfo}>
              <Text style={[
                styles.stepTitle,
                step3Complete && styles.stepTitleComplete,
                !step2Complete && styles.stepTitleDisabled,
              ]}>
                Workers Daily Log
              </Text>
              <Text style={[styles.stepSubtitle, !step2Complete && styles.stepSubtitleDisabled]}>
                {step3Complete 
                  ? `${workerLogStatus.totalWorkers} workers logged`
                  : 'Log worker attendance for today'}
              </Text>
            </View>
          </View>
          {step2Complete && !step3Complete && activeStep === 3 && (
            <View style={styles.stepAction}>
              <Ionicons name="chevron-forward" size={24} color={Colors.accent} />
            </View>
          )}
        </TouchableOpacity>

        {/* Step 4: Create DPR */}
        <TouchableOpacity
          style={[
            styles.stepCard,
            step4Complete && styles.stepCardComplete,
            activeStep === 4 && styles.stepCardActive,
            !step3Complete && styles.stepCardDisabled,
          ]}
          onPress={step3Complete ? handleCreateDPR : undefined}
          disabled={!step3Complete}
        >
          <View style={styles.stepLeft}>
            <View style={[
              styles.stepNumber,
              step4Complete && styles.stepNumberComplete,
              activeStep === 4 && styles.stepNumberActive,
              !step3Complete && styles.stepNumberDisabled,
            ]}>
              {step4Complete ? (
                <Ionicons name="checkmark" size={20} color={Colors.white} />
              ) : (
                <Text style={[
                  styles.stepNumberText,
                  activeStep === 4 && styles.stepNumberTextActive,
                  !step3Complete && styles.stepNumberTextDisabled,
                ]}>4</Text>
              )}
            </View>
            <View style={styles.stepInfo}>
              <Text style={[
                styles.stepTitle,
                step4Complete && styles.stepTitleComplete,
                !step3Complete && styles.stepTitleDisabled,
              ]}>
                Create DPR
              </Text>
              <Text style={[styles.stepSubtitle, !step3Complete && styles.stepSubtitleDisabled]}>
                {step4Complete 
                  ? 'DPR submitted for today'
                  : 'Daily Progress Report with photos & voice notes'}
              </Text>
            </View>
          </View>
          {step3Complete && !step4Complete && activeStep === 4 && (
            <View style={styles.stepAction}>
              <Ionicons name="chevron-forward" size={24} color={Colors.accent} />
            </View>
          )}
        </TouchableOpacity>

        {/* All Complete Message */}
        {activeStep === 5 && (
          <Card style={styles.completeCard}>
            <View style={styles.completeIcon}>
              <Ionicons name="checkmark-circle" size={48} color={Colors.success} />
            </View>
            <Text style={styles.completeTitle}>Great Job!</Text>
            <Text style={styles.completeText}>
              You've completed all tasks for today. Your DPR has been submitted.
            </Text>
          </Card>
        )}

        {/* Quick Stats */}
        {selectedProject && (
          <View style={styles.statsSection}>
            <Text style={styles.sectionTitle}>Today's Summary</Text>
            <View style={styles.statsRow}>
              <Card style={styles.statCard}>
                <Ionicons name="people" size={24} color={Colors.info} />
                <Text style={styles.statValue}>{workerLogStatus.totalWorkers}</Text>
                <Text style={styles.statLabel}>Workers</Text>
              </Card>
              <Card style={styles.statCard}>
                <Ionicons name="document-text" size={24} color={Colors.success} />
                <Text style={styles.statValue}>{step4Complete ? '1' : '0'}</Text>
                <Text style={styles.statLabel}>DPR</Text>
              </Card>
            </View>
          </View>
        )}
      </ScrollView>

      {/* Logout Blocked Modal */}
      <Modal
        visible={logoutBlockedModal}
        transparent
        animationType="fade"
        onRequestClose={() => setLogoutBlockedModal(false)}
      >
        <View style={styles.modalOverlay}>
          <View style={styles.modalContent}>
            <View style={styles.modalIcon}>
              <Ionicons name="warning" size={48} color={Colors.warning} />
            </View>
            <Text style={styles.modalTitle}>Cannot Logout</Text>
            <Text style={styles.modalText}>
              Please complete the Workers Daily Log before logging out.
            </Text>
            <View style={styles.modalButtons}>
              <TouchableOpacity
                style={styles.modalButtonSecondary}
                onPress={() => setLogoutBlockedModal(false)}
              >
                <Text style={styles.modalButtonSecondaryText}>Cancel</Text>
              </TouchableOpacity>
              <TouchableOpacity
                style={styles.modalButtonPrimary}
                onPress={() => {
                  setLogoutBlockedModal(false);
                  router.push('/(supervisor)/worker-log');
                }}
              >
                <Text style={styles.modalButtonPrimaryText}>Go to Worker Log</Text>
              </TouchableOpacity>
            </View>
          </View>
        </View>
      </Modal>
    </SafeAreaView>
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
    paddingBottom: Spacing.xxl,
  },
  header: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
    marginBottom: Spacing.lg,
  },
  headerInfo: {
    flex: 1,
  },
  greeting: {
    fontSize: FontSizes.xl,
    fontWeight: 'bold',
    color: Colors.text,
  },
  dateText: {
    fontSize: FontSizes.sm,
    color: Colors.textSecondary,
    marginTop: 2,
  },
  logoutButton: {
    padding: Spacing.sm,
  },
  progressCard: {
    padding: Spacing.md,
    marginBottom: Spacing.lg,
    backgroundColor: Colors.primary,
  },
  progressTitle: {
    fontSize: FontSizes.md,
    fontWeight: '600',
    color: Colors.white,
    marginBottom: Spacing.sm,
  },
  progressBar: {
    height: 8,
    backgroundColor: 'rgba(255,255,255,0.3)',
    borderRadius: 4,
    overflow: 'hidden',
  },
  progressFill: {
    height: '100%',
    backgroundColor: Colors.white,
    borderRadius: 4,
  },
  progressText: {
    fontSize: FontSizes.sm,
    color: Colors.white,
    marginTop: Spacing.sm,
    opacity: 0.9,
  },
  stepCard: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    backgroundColor: Colors.white,
    padding: Spacing.md,
    borderRadius: BorderRadius.lg,
    marginBottom: Spacing.sm,
    borderWidth: 2,
    borderColor: Colors.border,
  },
  stepCardActive: {
    borderColor: Colors.accent,
    backgroundColor: Colors.accent + '08',
  },
  stepCardComplete: {
    borderColor: Colors.success,
    backgroundColor: Colors.success + '08',
  },
  stepCardDisabled: {
    opacity: 0.5,
  },
  stepLeft: {
    flexDirection: 'row',
    alignItems: 'center',
    flex: 1,
  },
  stepNumber: {
    width: 36,
    height: 36,
    borderRadius: 18,
    backgroundColor: Colors.border,
    justifyContent: 'center',
    alignItems: 'center',
    marginRight: Spacing.md,
  },
  stepNumberActive: {
    backgroundColor: Colors.accent,
  },
  stepNumberComplete: {
    backgroundColor: Colors.success,
  },
  stepNumberDisabled: {
    backgroundColor: Colors.border,
  },
  stepNumberText: {
    fontSize: FontSizes.md,
    fontWeight: 'bold',
    color: Colors.textMuted,
  },
  stepNumberTextActive: {
    color: Colors.white,
  },
  stepNumberTextDisabled: {
    color: Colors.textMuted,
  },
  stepInfo: {
    flex: 1,
  },
  stepTitle: {
    fontSize: FontSizes.md,
    fontWeight: '600',
    color: Colors.text,
  },
  stepTitleComplete: {
    color: Colors.success,
  },
  stepTitleDisabled: {
    color: Colors.textMuted,
  },
  stepSubtitle: {
    fontSize: FontSizes.sm,
    color: Colors.textSecondary,
    marginTop: 2,
  },
  stepSubtitleDisabled: {
    color: Colors.textMuted,
  },
  stepAction: {
    padding: Spacing.xs,
  },
  changeBtn: {
    paddingHorizontal: Spacing.sm,
    paddingVertical: Spacing.xs,
    backgroundColor: Colors.accent + '20',
    borderRadius: BorderRadius.sm,
  },
  changeBtnText: {
    fontSize: FontSizes.sm,
    color: Colors.accent,
    fontWeight: '500',
  },
  selfieThumb: {
    width: 44,
    height: 44,
    borderRadius: 22,
    borderWidth: 2,
    borderColor: Colors.success,
  },
  completeCard: {
    padding: Spacing.xl,
    alignItems: 'center',
    marginTop: Spacing.md,
    backgroundColor: Colors.success + '10',
    borderWidth: 1,
    borderColor: Colors.success,
  },
  completeIcon: {
    marginBottom: Spacing.md,
  },
  completeTitle: {
    fontSize: FontSizes.xl,
    fontWeight: 'bold',
    color: Colors.success,
  },
  completeText: {
    fontSize: FontSizes.md,
    color: Colors.textSecondary,
    textAlign: 'center',
    marginTop: Spacing.sm,
  },
  statsSection: {
    marginTop: Spacing.lg,
  },
  sectionTitle: {
    fontSize: FontSizes.lg,
    fontWeight: '600',
    color: Colors.text,
    marginBottom: Spacing.sm,
  },
  statsRow: {
    flexDirection: 'row',
    gap: Spacing.sm,
  },
  statCard: {
    flex: 1,
    padding: Spacing.md,
    alignItems: 'center',
  },
  statValue: {
    fontSize: FontSizes.xxl,
    fontWeight: 'bold',
    color: Colors.text,
    marginTop: Spacing.xs,
  },
  statLabel: {
    fontSize: FontSizes.sm,
    color: Colors.textSecondary,
  },
  modalOverlay: {
    flex: 1,
    backgroundColor: 'rgba(0,0,0,0.5)',
    justifyContent: 'center',
    alignItems: 'center',
    padding: Spacing.lg,
  },
  modalContent: {
    backgroundColor: Colors.white,
    borderRadius: BorderRadius.lg,
    padding: Spacing.xl,
    width: '100%',
    maxWidth: 360,
    alignItems: 'center',
  },
  modalIcon: {
    marginBottom: Spacing.md,
  },
  modalTitle: {
    fontSize: FontSizes.xl,
    fontWeight: 'bold',
    color: Colors.text,
    marginBottom: Spacing.sm,
  },
  modalText: {
    fontSize: FontSizes.md,
    color: Colors.textSecondary,
    textAlign: 'center',
    marginBottom: Spacing.lg,
  },
  modalButtons: {
    flexDirection: 'row',
    gap: Spacing.sm,
  },
  modalButtonSecondary: {
    flex: 1,
    padding: Spacing.md,
    borderRadius: BorderRadius.md,
    backgroundColor: Colors.border,
    alignItems: 'center',
  },
  modalButtonSecondaryText: {
    fontSize: FontSizes.md,
    fontWeight: '600',
    color: Colors.textSecondary,
  },
  modalButtonPrimary: {
    flex: 1,
    padding: Spacing.md,
    borderRadius: BorderRadius.md,
    backgroundColor: Colors.accent,
    alignItems: 'center',
  },
  modalButtonPrimaryText: {
    fontSize: FontSizes.md,
    fontWeight: '600',
    color: Colors.white,
  },
});
