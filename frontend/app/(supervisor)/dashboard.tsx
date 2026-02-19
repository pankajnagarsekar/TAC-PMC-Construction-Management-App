// SUPERVISOR DASHBOARD - STEP-BY-STEP WORKFLOW
// Flow: Check-in → Select Project → Workers Log / Create DPR

import React, { useState, useEffect, useCallback } from 'react';
import {
  View,
  Text,
  StyleSheet,
  ScrollView,
  RefreshControl,
  TouchableOpacity,
  Pressable,
  Alert,
  Platform,
  Modal,
  Image,
  ActivityIndicator,
} from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';
import { Ionicons } from '@expo/vector-icons';
import { useRouter } from 'expo-router';
import * as ImagePicker from 'expo-image-picker';
import * as Location from 'expo-location';
import { useAuth } from '../../contexts/AuthContext';
import { useProject } from '../../contexts/ProjectContext';
import { Card } from '../../components/ui';
import { Colors, Spacing, FontSizes, BorderRadius } from '../../constants/theme';

interface CheckInData {
  isCheckedIn: boolean;
  checkInTime: string | null;
  selfieUri: string | null;
  location: { latitude: number; longitude: number } | null;
}

export default function SupervisorDashboard() {
  const router = useRouter();
  const { user, logout, checkCanLogout } = useAuth();
  const { selectedProject, isProjectSelected } = useProject();
  
  const [isProcessing, setIsProcessing] = useState(false);
  const [refreshing, setRefreshing] = useState(false);
  const [logoutBlockedModal, setLogoutBlockedModal] = useState(false);
  
  // Check-in state
  const [checkInData, setCheckInData] = useState<CheckInData>({
    isCheckedIn: false,
    checkInTime: null,
    selfieUri: null,
    location: null,
  });

  const currentDate = new Date().toLocaleDateString('en-US', {
    weekday: 'long',
    month: 'long',
    day: 'numeric',
    year: 'numeric',
  });

  const onRefresh = useCallback(() => {
    setRefreshing(true);
    setTimeout(() => setRefreshing(false), 1000);
  }, []);

  // Handle logout
  const handleLogout = async () => {
    const result = await checkCanLogout();
    if (result.can_logout) {
      await logout();
    } else {
      setLogoutBlockedModal(true);
    }
  };

  // STEP 1: Check-in with Selfie + GPS
  const handleCheckIn = async () => {
    console.log('handleCheckIn called, Platform:', Platform.OS);
    setIsProcessing(true);
    
    try {
      // For web - simulate check-in directly
      if (Platform.OS === 'web') {
        console.log('Web platform - simulating check-in');
        const checkInTime = new Date().toISOString();
        setCheckInData({
          isCheckedIn: true,
          checkInTime,
          selfieUri: null,
          location: { latitude: 0, longitude: 0 },
        });
        setIsProcessing(false);
        window.alert('Check-in Successful!\nTime: ' + new Date(checkInTime).toLocaleTimeString());
        return;
      }
      
      // Mobile - try to use camera, with fallback
      let selfieUri: string | null = null;
      
      try {
        const { status: cameraStatus } = await ImagePicker.requestCameraPermissionsAsync();
        console.log('Camera permission status:', cameraStatus);
        
        if (cameraStatus === 'granted') {
          const result = await ImagePicker.launchCameraAsync({
            allowsEditing: false,
            quality: 0.7,
            cameraType: ImagePicker.CameraType.front,
          });

          if (result.canceled) {
            // User cancelled camera - still allow check-in without photo
            console.log('User cancelled camera, proceeding without photo');
          } else if (result.assets && result.assets[0]) {
            selfieUri = result.assets[0].uri;
          }
        } else {
          // Camera permission denied - show alert but still allow check-in
          console.log('Camera permission denied, proceeding without photo');
          Alert.alert(
            'Camera Access', 
            'Camera permission not granted. Checking in without selfie.',
            [{ text: 'OK' }]
          );
        }
      } catch (cameraError) {
        console.log('Camera error (non-blocking):', cameraError);
        // Continue without selfie
      }

      // Get location (non-blocking)
      let locationData = { latitude: 0, longitude: 0 };
      try {
        const { status } = await Location.requestForegroundPermissionsAsync();
        if (status === 'granted') {
          const loc = await Promise.race([
            Location.getCurrentPositionAsync({ accuracy: Location.Accuracy.Balanced }),
            new Promise((_, reject) => setTimeout(() => reject('timeout'), 5000))
          ]) as any;
          locationData = { latitude: loc.coords.latitude, longitude: loc.coords.longitude };
        }
      } catch (e) {
        console.log('Location skipped:', e);
      }

      // Complete check-in regardless of photo/location success
      const checkInTime = new Date().toISOString();
      setCheckInData({
        isCheckedIn: true,
        checkInTime,
        selfieUri,
        location: locationData,
      });
      setIsProcessing(false);
      
      Alert.alert(
        'Check-in Successful!', 
        `Time: ${new Date(checkInTime).toLocaleTimeString()}${selfieUri ? '\nSelfie captured.' : ''}${locationData.latitude !== 0 ? '\nLocation captured.' : ''}`,
        [{ text: 'OK' }]
      );
      
    } catch (error) {
      console.error('Check-in error:', error);
      setIsProcessing(false);
      if (Platform.OS === 'web') {
        window.alert('Check-in failed. Please try again.');
      } else {
        Alert.alert('Error', 'Check-in failed. Please try again.');
      }
    }
  };

  // STEP 2: Select Project
  const handleSelectProject = () => {
    router.push('/(supervisor)/select-project');
  };

  // STEP 3: Worker Log
  const handleWorkerLog = () => {
    router.push('/(supervisor)/worker-log');
  };

  // STEP 4: Create DPR
  const handleCreateDPR = () => {
    router.push('/(supervisor)/dpr');
  };

  // Determine enabled states
  const isStep1Complete = checkInData.isCheckedIn;
  const isStep2Complete = isProjectSelected;
  const canAccessStep2 = isStep1Complete;
  const canAccessOthers = isStep1Complete && isStep2Complete;

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

        {/* STEP 1: Check-in Card - Always enabled */}
        <View style={[
          styles.checkInCard,
          isStep1Complete && styles.checkInCardComplete
        ]}>
          <View style={styles.checkInHeader}>
            <View style={[
              styles.checkInIcon,
              isStep1Complete && styles.checkInIconComplete
            ]}>
              <Ionicons 
                name={isStep1Complete ? "checkmark-circle" : "camera"} 
                size={32} 
                color={isStep1Complete ? Colors.success : Colors.white} 
              />
            </View>
            <View style={styles.checkInInfo}>
              <Text style={[
                styles.checkInTitle,
                isStep1Complete && styles.checkInTitleComplete
              ]}>
                {isStep1Complete ? 'Checked In' : 'Check-in Required'}
              </Text>
              <Text style={[styles.checkInSubtitle, isStep1Complete && {color: Colors.textSecondary}]}>
                {isStep1Complete 
                  ? `${new Date(checkInData.checkInTime!).toLocaleTimeString()}`
                  : 'Take a selfie to start your day'}
              </Text>
            </View>
            {isStep1Complete && checkInData.selfieUri && (
              <Image source={{ uri: checkInData.selfieUri }} style={styles.selfieThumb} />
            )}
          </View>
          
          {!isStep1Complete && (
            <Pressable 
              style={({ pressed }) => [
                styles.checkInButton, 
                isProcessing && {opacity: 0.7},
                pressed && {opacity: 0.8}
              ]} 
              onPress={() => {
                console.log('Check-in button pressed');
                handleCheckIn();
              }}
              disabled={isProcessing}
              data-testid="check-in-selfie-btn"
              accessibilityRole="button"
              accessibilityLabel="Check in with selfie"
            >
              {isProcessing ? (
                <ActivityIndicator color={Colors.white} />
              ) : (
                <>
                  <Ionicons name="camera" size={20} color={Colors.white} />
                  <Text style={styles.checkInButtonText}>Check In with Selfie</Text>
                </>
              )}
            </Pressable>
          )}
        </View>

        {/* STEP 2: Select Project - Enabled after check-in */}
        <TouchableOpacity
          style={[
            styles.actionCard,
            !canAccessStep2 && styles.actionCardDisabled,
            isStep2Complete && styles.actionCardComplete,
          ]}
          onPress={canAccessStep2 ? handleSelectProject : undefined}
          disabled={!canAccessStep2}
          activeOpacity={canAccessStep2 ? 0.7 : 1}
        >
          <View style={[
            styles.actionIcon,
            !canAccessStep2 && styles.actionIconDisabled,
            isStep2Complete && styles.actionIconComplete,
          ]}>
            <Ionicons 
              name={isStep2Complete ? "checkmark" : "business"} 
              size={24} 
              color={!canAccessStep2 ? Colors.textMuted : isStep2Complete ? Colors.white : Colors.accent} 
            />
          </View>
          <View style={styles.actionInfo}>
            <Text style={[
              styles.actionTitle,
              !canAccessStep2 && styles.actionTitleDisabled,
            ]}>
              {isStep2Complete ? selectedProject?.project_name : 'Select Project'}
            </Text>
            <Text style={[
              styles.actionSubtitle,
              !canAccessStep2 && styles.actionSubtitleDisabled,
            ]}>
              {isStep2Complete ? 'Tap to change' : 'Choose your work site'}
            </Text>
          </View>
          <Ionicons 
            name="chevron-forward" 
            size={24} 
            color={!canAccessStep2 ? Colors.textMuted : Colors.accent} 
          />
        </TouchableOpacity>

        {/* Divider */}
        {canAccessOthers && (
          <View style={styles.divider}>
            <View style={styles.dividerLine} />
            <Text style={styles.dividerText}>Daily Tasks</Text>
            <View style={styles.dividerLine} />
          </View>
        )}

        {/* STEP 3: Workers Log - Enabled after project selection */}
        <TouchableOpacity
          style={[
            styles.actionCard,
            !canAccessOthers && styles.actionCardDisabled,
          ]}
          onPress={canAccessOthers ? handleWorkerLog : undefined}
          disabled={!canAccessOthers}
          activeOpacity={canAccessOthers ? 0.7 : 1}
        >
          <View style={[
            styles.actionIcon,
            { backgroundColor: canAccessOthers ? Colors.info + '20' : Colors.border },
          ]}>
            <Ionicons 
              name="people" 
              size={24} 
              color={canAccessOthers ? Colors.info : Colors.textMuted} 
            />
          </View>
          <View style={styles.actionInfo}>
            <Text style={[
              styles.actionTitle,
              !canAccessOthers && styles.actionTitleDisabled,
            ]}>
              Workers Daily Log
            </Text>
            <Text style={[
              styles.actionSubtitle,
              !canAccessOthers && styles.actionSubtitleDisabled,
            ]}>
              Log vendor workers for today
            </Text>
          </View>
          <Ionicons 
            name="chevron-forward" 
            size={24} 
            color={canAccessOthers ? Colors.info : Colors.textMuted} 
          />
        </TouchableOpacity>

        {/* STEP 4: Create DPR - Enabled after project selection */}
        <TouchableOpacity
          style={[
            styles.actionCard,
            !canAccessOthers && styles.actionCardDisabled,
          ]}
          onPress={canAccessOthers ? handleCreateDPR : undefined}
          disabled={!canAccessOthers}
          activeOpacity={canAccessOthers ? 0.7 : 1}
        >
          <View style={[
            styles.actionIcon,
            { backgroundColor: canAccessOthers ? Colors.success + '20' : Colors.border },
          ]}>
            <Ionicons 
              name="document-text" 
              size={24} 
              color={canAccessOthers ? Colors.success : Colors.textMuted} 
            />
          </View>
          <View style={styles.actionInfo}>
            <Text style={[
              styles.actionTitle,
              !canAccessOthers && styles.actionTitleDisabled,
            ]}>
              Create DPR
            </Text>
            <Text style={[
              styles.actionSubtitle,
              !canAccessOthers && styles.actionSubtitleDisabled,
            ]}>
              Daily Progress Report with photos
            </Text>
          </View>
          <Ionicons 
            name="chevron-forward" 
            size={24} 
            color={canAccessOthers ? Colors.success : Colors.textMuted} 
          />
        </TouchableOpacity>

        {/* Info Banner when not checked in */}
        {!isStep1Complete && (
          <Card style={styles.infoCard}>
            <Ionicons name="information-circle" size={24} color={Colors.info} />
            <Text style={styles.infoText}>
              Please check in with a selfie to start your workday. All other features will be unlocked after check-in.
            </Text>
          </Card>
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
  
  // Check-in Card
  checkInCard: {
    padding: Spacing.lg,
    marginBottom: Spacing.md,
    backgroundColor: Colors.accent,
    borderRadius: BorderRadius.lg,
  },
  checkInCardComplete: {
    backgroundColor: Colors.white,
    borderWidth: 2,
    borderColor: Colors.success,
  },
  checkInHeader: {
    flexDirection: 'row',
    alignItems: 'center',
  },
  checkInIcon: {
    width: 56,
    height: 56,
    borderRadius: 28,
    backgroundColor: 'rgba(255,255,255,0.2)',
    justifyContent: 'center',
    alignItems: 'center',
    marginRight: Spacing.md,
  },
  checkInIconComplete: {
    backgroundColor: Colors.success + '20',
  },
  checkInInfo: {
    flex: 1,
  },
  checkInTitle: {
    fontSize: FontSizes.lg,
    fontWeight: 'bold',
    color: Colors.white,
  },
  checkInTitleComplete: {
    color: Colors.success,
  },
  checkInSubtitle: {
    fontSize: FontSizes.sm,
    color: 'rgba(255,255,255,0.8)',
    marginTop: 2,
  },
  selfieThumb: {
    width: 50,
    height: 50,
    borderRadius: 25,
    borderWidth: 2,
    borderColor: Colors.success,
  },
  checkInButton: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'center',
    backgroundColor: 'rgba(255,255,255,0.2)',
    paddingVertical: Spacing.md,
    borderRadius: BorderRadius.md,
    marginTop: Spacing.md,
    gap: Spacing.sm,
    // @ts-ignore - Web-specific cursor style
    cursor: 'pointer',
  },
  checkInButtonText: {
    fontSize: FontSizes.md,
    fontWeight: '600',
    color: Colors.white,
  },

  // Action Cards
  actionCard: {
    flexDirection: 'row',
    alignItems: 'center',
    backgroundColor: Colors.white,
    padding: Spacing.md,
    borderRadius: BorderRadius.lg,
    marginBottom: Spacing.sm,
    borderWidth: 1,
    borderColor: Colors.border,
  },
  actionCardDisabled: {
    backgroundColor: Colors.background,
    opacity: 0.6,
  },
  actionCardComplete: {
    borderColor: Colors.success,
    backgroundColor: Colors.success + '08',
  },
  actionIcon: {
    width: 48,
    height: 48,
    borderRadius: 24,
    backgroundColor: Colors.accent + '20',
    justifyContent: 'center',
    alignItems: 'center',
    marginRight: Spacing.md,
  },
  actionIconDisabled: {
    backgroundColor: Colors.border,
  },
  actionIconComplete: {
    backgroundColor: Colors.success,
  },
  actionInfo: {
    flex: 1,
  },
  actionTitle: {
    fontSize: FontSizes.md,
    fontWeight: '600',
    color: Colors.text,
  },
  actionTitleDisabled: {
    color: Colors.textMuted,
  },
  actionSubtitle: {
    fontSize: FontSizes.sm,
    color: Colors.textSecondary,
    marginTop: 2,
  },
  actionSubtitleDisabled: {
    color: Colors.textMuted,
  },

  // Divider
  divider: {
    flexDirection: 'row',
    alignItems: 'center',
    marginVertical: Spacing.md,
  },
  dividerLine: {
    flex: 1,
    height: 1,
    backgroundColor: Colors.border,
  },
  dividerText: {
    fontSize: FontSizes.sm,
    color: Colors.textMuted,
    marginHorizontal: Spacing.md,
    fontWeight: '500',
  },

  // Info Card
  infoCard: {
    flexDirection: 'row',
    alignItems: 'center',
    padding: Spacing.md,
    marginTop: Spacing.md,
    backgroundColor: Colors.info + '10',
    borderWidth: 1,
    borderColor: Colors.info + '30',
    gap: Spacing.sm,
  },
  infoText: {
    flex: 1,
    fontSize: FontSizes.sm,
    color: Colors.info,
    lineHeight: 20,
  },

  // Modal
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
