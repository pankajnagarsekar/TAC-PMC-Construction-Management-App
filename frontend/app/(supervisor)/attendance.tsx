// SUPERVISOR ATTENDANCE SCREEN - ENHANCED
// Check-in with selfie + GPS, Check-out after DPR submission
import React, { useState, useEffect, useCallback } from 'react';
import {
  View,
  Text,
  StyleSheet,
  ScrollView,
  TouchableOpacity,
  Image,
  ActivityIndicator,
  Alert,
  Platform,
  RefreshControl,
} from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';
import { Ionicons } from '@expo/vector-icons';
import * as ImagePicker from 'expo-image-picker';
import * as Location from 'expo-location';
import { useProject } from '../../contexts/ProjectContext';
import { useAuth } from '../../contexts/AuthContext';
import { Card } from '../../components/ui';
import { Colors, Spacing, FontSizes, BorderRadius } from '../../constants/theme';

const BASE_URL = process.env.EXPO_PUBLIC_BACKEND_URL || '';

const getToken = async () => {
  if (Platform.OS === 'web') return localStorage.getItem('access_token');
  const SecureStore = require('expo-secure-store');
  return await SecureStore.getItemAsync('access_token');
};

const apiRequest = async (endpoint: string, options: RequestInit = {}) => {
  const token = await getToken();
  const response = await fetch(`${BASE_URL}${endpoint}`, {
    ...options,
    headers: {
      'Content-Type': 'application/json',
      ...(token ? { 'Authorization': `Bearer ${token}` } : {}),
    },
  });
  if (!response.ok) {
    const error = await response.json().catch(() => ({ detail: 'Request failed' }));
    throw new Error(error.detail || 'Request failed');
  }
  return response.json();
};

const showAlert = (title: string, message: string) => {
  if (Platform.OS === 'web') window.alert(`${title}: ${message}`);
  else Alert.alert(title, message);
};

interface AttendanceRecord {
  id: string;
  date: string;
  checkInTime: string;
  checkOutTime?: string;
  location?: { latitude: number; longitude: number; address?: string };
  selfieUri?: string;
  status: 'checked_in' | 'checked_out' | 'absent';
  hasDPR: boolean;
}

export default function SupervisorAttendance() {
  const { selectedProject, isProjectSelected } = useProject();
  const { user } = useAuth();
  
  const [loading, setLoading] = useState(true);
  const [refreshing, setRefreshing] = useState(false);
  const [checkingIn, setCheckingIn] = useState(false);
  const [checkingOut, setCheckingOut] = useState(false);
  
  // Today's attendance state
  const [todayAttendance, setTodayAttendance] = useState<AttendanceRecord | null>(null);
  const [selfieUri, setSelfieUri] = useState<string | null>(null);
  const [location, setLocation] = useState<{ latitude: number; longitude: number; address?: string } | null>(null);
  const [hasDPRToday, setHasDPRToday] = useState(false);
  
  // History
  const [attendanceHistory, setAttendanceHistory] = useState<AttendanceRecord[]>([]);

  const currentTime = new Date().toLocaleTimeString('en-US', {
    hour: '2-digit',
    minute: '2-digit',
  });
  
  const currentDate = new Date().toLocaleDateString('en-US', {
    weekday: 'long',
    year: 'numeric',
    month: 'long',
    day: 'numeric',
  });

  const loadAttendanceStatus = useCallback(async () => {
    if (!selectedProject) return;
    
    try {
      const projectId = (selectedProject as any).project_id || (selectedProject as any)._id;
      
      // Check today's attendance
      const checkResponse = await apiRequest(`/api/v2/attendance/check?project_id=${projectId}`);
      
      if (checkResponse.attendance_marked) {
        setTodayAttendance({
          id: 'today',
          date: new Date().toISOString().split('T')[0],
          checkInTime: new Date().toLocaleTimeString('en-US', { hour: '2-digit', minute: '2-digit' }),
          status: 'checked_in',
          hasDPR: false,
        });
      }
      
      // Check if DPR submitted today
      try {
        const dprResponse = await apiRequest(`/api/v2/dpr?project_id=${projectId}&date=${new Date().toISOString().split('T')[0]}`);
        if (dprResponse && dprResponse.length > 0) {
          setHasDPRToday(true);
        }
      } catch (e) {
        // No DPR for today
      }
      
    } catch (error) {
      console.error('Error loading attendance:', error);
    } finally {
      setLoading(false);
      setRefreshing(false);
    }
  }, [selectedProject]);

  useEffect(() => {
    loadAttendanceStatus();
  }, [loadAttendanceStatus]);

  const requestLocationPermission = async () => {
    const { status } = await Location.requestForegroundPermissionsAsync();
    if (status !== 'granted') {
      showAlert('Permission Required', 'Location access is needed to verify your presence at the site');
      return false;
    }
    return true;
  };

  const getCurrentLocation = async () => {
    try {
      const hasPermission = await requestLocationPermission();
      if (!hasPermission) return null;

      const location = await Location.getCurrentPositionAsync({
        accuracy: Location.Accuracy.High,
      });
      
      // Try to get address
      let address = '';
      try {
        const [geocode] = await Location.reverseGeocodeAsync({
          latitude: location.coords.latitude,
          longitude: location.coords.longitude,
        });
        if (geocode) {
          address = [geocode.street, geocode.city, geocode.region].filter(Boolean).join(', ');
        }
      } catch (e) {
        console.log('Geocoding failed:', e);
      }

      return {
        latitude: location.coords.latitude,
        longitude: location.coords.longitude,
        address: address || undefined,
      };
    } catch (error) {
      console.error('Error getting location:', error);
      return null;
    }
  };

  const takeSelfie = async () => {
    try {
      const { status } = await ImagePicker.requestCameraPermissionsAsync();
      if (status !== 'granted') {
        showAlert('Permission Required', 'Camera access is needed for selfie verification');
        return null;
      }

      const result = await ImagePicker.launchCameraAsync({
        allowsEditing: true,
        aspect: [1, 1],
        quality: 0.7,
        cameraType: ImagePicker.CameraType.front,
      });

      if (!result.canceled && result.assets[0]) {
        return result.assets[0].uri;
      }
      return null;
    } catch (error) {
      console.error('Error taking selfie:', error);
      return null;
    }
  };

  const handleCheckIn = async () => {
    if (!selectedProject) {
      showAlert('Error', 'Please select a project first');
      return;
    }

    setCheckingIn(true);
    
    try {
      // Step 1: Take selfie
      const selfie = await takeSelfie();
      if (!selfie) {
        setCheckingIn(false);
        return;
      }
      setSelfieUri(selfie);

      // Step 2: Get location
      const loc = await getCurrentLocation();
      if (loc) {
        setLocation(loc);
      }

      // Step 3: Submit attendance
      const projectId = (selectedProject as any).project_id || (selectedProject as any)._id;
      
      await apiRequest('/api/v2/attendance', {
        method: 'POST',
        body: JSON.stringify({
          project_id: projectId,
          location: loc ? {
            latitude: loc.latitude,
            longitude: loc.longitude,
            address: loc.address,
          } : undefined,
        }),
      });

      setTodayAttendance({
        id: 'today',
        date: new Date().toISOString().split('T')[0],
        checkInTime: new Date().toLocaleTimeString('en-US', { hour: '2-digit', minute: '2-digit' }),
        status: 'checked_in',
        location: loc || undefined,
        selfieUri: selfie,
        hasDPR: false,
      });

      showAlert('Success', 'Check-in successful! You can now submit your DPR.');
    } catch (error: any) {
      if (error.message?.includes('already marked')) {
        showAlert('Already Checked In', 'You have already marked attendance for today');
        setTodayAttendance({
          id: 'today',
          date: new Date().toISOString().split('T')[0],
          checkInTime: 'Earlier today',
          status: 'checked_in',
          hasDPR: false,
        });
      } else {
        showAlert('Error', error.message || 'Failed to check in');
      }
    } finally {
      setCheckingIn(false);
    }
  };

  const handleCheckOut = async () => {
    if (!hasDPRToday) {
      showAlert('DPR Required', 'Please submit your Daily Progress Report before checking out');
      return;
    }

    setCheckingOut(true);
    try {
      // In a real app, this would call a checkout API
      setTodayAttendance(prev => prev ? {
        ...prev,
        checkOutTime: new Date().toLocaleTimeString('en-US', { hour: '2-digit', minute: '2-digit' }),
        status: 'checked_out',
      } : null);

      showAlert('Success', 'Check-out successful! Have a great day.');
    } catch (error: any) {
      showAlert('Error', error.message || 'Failed to check out');
    } finally {
      setCheckingOut(false);
    }
  };

  const isCheckedIn = todayAttendance?.status === 'checked_in';
  const isCheckedOut = todayAttendance?.status === 'checked_out';

  // No project selected state
  if (!isProjectSelected) {
    return (
      <SafeAreaView style={styles.container}>
        <View style={styles.loadingContainer}>
          <Ionicons name="folder-open-outline" size={64} color={Colors.textMuted} />
          <Text style={styles.loadingText}>No project selected</Text>
          <Text style={[styles.loadingText, { fontSize: FontSizes.sm }]}>
            Please select a project from the dashboard
          </Text>
        </View>
      </SafeAreaView>
    );
  }

  if (loading) {
    return (
      <SafeAreaView style={styles.container}>
        <View style={styles.loadingContainer}>
          <ActivityIndicator size="large" color={Colors.accent} />
          <Text style={styles.loadingText}>Loading attendance...</Text>
        </View>
      </SafeAreaView>
    );
  }

  return (
    <SafeAreaView style={styles.container} edges={['left', 'right']}>
      <ScrollView 
        contentContainerStyle={styles.content}
        refreshControl={
          <RefreshControl refreshing={refreshing} onRefresh={() => { setRefreshing(true); loadAttendanceStatus(); }} />
        }
      >
        {/* Current Time Card */}
        <Card style={styles.timeCard}>
          <Text style={styles.timeText}>{currentTime}</Text>
          <Text style={styles.dateText}>{currentDate}</Text>
          {selectedProject && (
            <View style={styles.projectBadge}>
              <Ionicons name="business" size={14} color={Colors.white} />
              <Text style={styles.projectBadgeText}>{selectedProject.project_name}</Text>
            </View>
          )}
        </Card>

        {/* Main Attendance Card */}
        <Card style={styles.attendanceCard}>
          {isCheckedOut ? (
            // Checked Out State
            <>
              <View style={styles.checkedOutIcon}>
                <Ionicons name="checkmark-done-circle" size={80} color={Colors.success} />
              </View>
              <Text style={styles.statusTitle}>Day Complete!</Text>
              <View style={styles.timesContainer}>
                <View style={styles.timeBox}>
                  <Ionicons name="log-in" size={20} color={Colors.success} />
                  <Text style={styles.timeLabel}>Check In</Text>
                  <Text style={styles.timeValue}>{todayAttendance?.checkInTime}</Text>
                </View>
                <View style={styles.timeDivider} />
                <View style={styles.timeBox}>
                  <Ionicons name="log-out" size={20} color={Colors.primary} />
                  <Text style={styles.timeLabel}>Check Out</Text>
                  <Text style={styles.timeValue}>{todayAttendance?.checkOutTime}</Text>
                </View>
              </View>
            </>
          ) : isCheckedIn ? (
            // Checked In State
            <>
              <View style={styles.checkedInContainer}>
                {selfieUri ? (
                  <Image source={{ uri: selfieUri }} style={styles.selfieImage} />
                ) : (
                  <View style={styles.checkedInIcon}>
                    <Ionicons name="checkmark-circle" size={60} color={Colors.success} />
                  </View>
                )}
                <View style={styles.statusBadge}>
                  <Text style={styles.statusBadgeText}>CHECKED IN</Text>
                </View>
              </View>
              
              <Text style={styles.checkedInTitle}>You're on site!</Text>
              <Text style={styles.checkedInTime}>Check-in: {todayAttendance?.checkInTime}</Text>
              
              {location && (
                <View style={styles.locationInfo}>
                  <Ionicons name="location" size={16} color={Colors.accent} />
                  <Text style={styles.locationText}>
                    {location.address || `${location.latitude.toFixed(4)}, ${location.longitude.toFixed(4)}`}
                  </Text>
                </View>
              )}

              {/* DPR Status */}
              <View style={[styles.dprStatus, hasDPRToday ? styles.dprStatusComplete : styles.dprStatusPending]}>
                <Ionicons 
                  name={hasDPRToday ? "document-text" : "document-text-outline"} 
                  size={24} 
                  color={hasDPRToday ? Colors.success : Colors.warning} 
                />
                <View style={styles.dprStatusText}>
                  <Text style={styles.dprStatusTitle}>
                    {hasDPRToday ? 'DPR Submitted' : 'DPR Pending'}
                  </Text>
                  <Text style={styles.dprStatusHint}>
                    {hasDPRToday ? 'You can now check out' : 'Submit DPR before checking out'}
                  </Text>
                </View>
              </View>

              {/* Check Out Button */}
              <TouchableOpacity
                style={[
                  styles.checkOutButton,
                  !hasDPRToday && styles.checkOutButtonDisabled
                ]}
                onPress={handleCheckOut}
                disabled={checkingOut || !hasDPRToday}
              >
                {checkingOut ? (
                  <ActivityIndicator size="small" color={Colors.white} />
                ) : (
                  <>
                    <Ionicons name="log-out" size={24} color={Colors.white} />
                    <Text style={styles.checkOutButtonText}>
                      {hasDPRToday ? 'Check Out' : 'Submit DPR First'}
                    </Text>
                  </>
                )}
              </TouchableOpacity>
            </>
          ) : (
            // Not Checked In State
            <>
              <View style={styles.checkInIcon}>
                <Ionicons name="finger-print" size={64} color={Colors.accent} />
              </View>
              <Text style={styles.checkInTitle}>Mark Your Attendance</Text>
              <Text style={styles.checkInSubtitle}>
                Take a selfie to verify your presence at the site
              </Text>
              
              <View style={styles.checkInSteps}>
                <View style={styles.stepItem}>
                  <View style={styles.stepNumber}><Text style={styles.stepNumberText}>1</Text></View>
                  <Text style={styles.stepText}>Take selfie</Text>
                </View>
                <View style={styles.stepArrow}>
                  <Ionicons name="arrow-forward" size={16} color={Colors.textMuted} />
                </View>
                <View style={styles.stepItem}>
                  <View style={styles.stepNumber}><Text style={styles.stepNumberText}>2</Text></View>
                  <Text style={styles.stepText}>Capture location</Text>
                </View>
                <View style={styles.stepArrow}>
                  <Ionicons name="arrow-forward" size={16} color={Colors.textMuted} />
                </View>
                <View style={styles.stepItem}>
                  <View style={styles.stepNumber}><Text style={styles.stepNumberText}>3</Text></View>
                  <Text style={styles.stepText}>Confirm</Text>
                </View>
              </View>
              
              <TouchableOpacity
                style={styles.checkInButton}
                onPress={handleCheckIn}
                disabled={checkingIn}
              >
                {checkingIn ? (
                  <>
                    <ActivityIndicator size="small" color={Colors.white} />
                    <Text style={styles.checkInButtonText}>Verifying...</Text>
                  </>
                ) : (
                  <>
                    <Ionicons name="camera" size={24} color={Colors.white} />
                    <Text style={styles.checkInButtonText}>Check In with Selfie</Text>
                  </>
                )}
              </TouchableOpacity>
            </>
          )}
        </Card>

        {/* Attendance History */}
        <View style={styles.section}>
          <Text style={styles.sectionTitle}>Recent Attendance</Text>
          
          {/* Show today if checked in */}
          {todayAttendance && (
            <AttendanceHistoryItem
              date="Today"
              checkIn={todayAttendance.checkInTime}
              checkOut={todayAttendance.checkOutTime}
              status={todayAttendance.status === 'checked_out' ? 'present' : 'in_progress'}
            />
          )}
          
          {/* Mock history - in real app, fetch from API */}
          <AttendanceHistoryItem
            date="Yesterday"
            checkIn="8:45 AM"
            checkOut="5:30 PM"
            status="present"
          />
          <AttendanceHistoryItem
            date="2 days ago"
            checkIn="9:15 AM"
            checkOut="6:00 PM"
            status="late"
          />
        </View>
      </ScrollView>
    </SafeAreaView>
  );
}

function AttendanceHistoryItem({ 
  date, 
  checkIn, 
  checkOut,
  status 
}: { 
  date: string; 
  checkIn: string;
  checkOut?: string;
  status: 'present' | 'absent' | 'late' | 'in_progress';
}) {
  const statusConfig = {
    present: { color: Colors.success, label: 'Complete', icon: 'checkmark-circle' as const },
    absent: { color: Colors.error, label: 'Absent', icon: 'close-circle' as const },
    late: { color: Colors.warning, label: 'Late', icon: 'time' as const },
    in_progress: { color: Colors.accent, label: 'In Progress', icon: 'timer' as const },
  };
  
  const config = statusConfig[status];

  return (
    <Card style={styles.historyCard}>
      <View style={styles.historyLeft}>
        <View style={[styles.historyIcon, { backgroundColor: config.color + '20' }]}>
          <Ionicons name={config.icon} size={20} color={config.color} />
        </View>
        <View style={styles.historyContent}>
          <Text style={styles.historyDateText}>{date}</Text>
          <View style={styles.historyTimes}>
            <Text style={styles.historyTimeText}>In: {checkIn}</Text>
            {checkOut && <Text style={styles.historyTimeText}> • Out: {checkOut}</Text>}
          </View>
        </View>
      </View>
      <View style={[styles.statusBadgeSmall, { backgroundColor: config.color + '20' }]}>
        <Text style={[styles.statusTextSmall, { color: config.color }]}>
          {config.label}
        </Text>
      </View>
    </Card>
  );
}

const styles = StyleSheet.create({
  container: { flex: 1, backgroundColor: Colors.background },
  loadingContainer: { flex: 1, justifyContent: 'center', alignItems: 'center' },
  loadingText: { marginTop: Spacing.md, color: Colors.textSecondary },
  content: { padding: Spacing.md },
  
  // Time Card
  timeCard: {
    alignItems: 'center',
    padding: Spacing.lg,
    backgroundColor: Colors.secondary,
    marginBottom: Spacing.md,
  },
  timeText: { fontSize: 48, fontWeight: 'bold', color: Colors.white },
  dateText: { fontSize: FontSizes.md, color: Colors.white + 'CC', marginTop: Spacing.xs },
  projectBadge: {
    flexDirection: 'row',
    alignItems: 'center',
    backgroundColor: Colors.white + '20',
    paddingHorizontal: Spacing.sm,
    paddingVertical: 4,
    borderRadius: BorderRadius.full,
    marginTop: Spacing.sm,
    gap: 4,
  },
  projectBadgeText: { fontSize: FontSizes.xs, color: Colors.white },
  
  // Attendance Card
  attendanceCard: { alignItems: 'center', padding: Spacing.xl, marginBottom: Spacing.lg },
  
  // Check In State
  checkInIcon: {
    width: 120,
    height: 120,
    borderRadius: 60,
    backgroundColor: Colors.accentLight + '30',
    justifyContent: 'center',
    alignItems: 'center',
    marginBottom: Spacing.md,
  },
  checkInTitle: { fontSize: FontSizes.xl, fontWeight: '600', color: Colors.text },
  checkInSubtitle: {
    fontSize: FontSizes.md,
    color: Colors.textSecondary,
    marginTop: Spacing.xs,
    marginBottom: Spacing.lg,
    textAlign: 'center',
  },
  checkInSteps: {
    flexDirection: 'row',
    alignItems: 'center',
    marginBottom: Spacing.lg,
  },
  stepItem: { alignItems: 'center' },
  stepNumber: {
    width: 24,
    height: 24,
    borderRadius: 12,
    backgroundColor: Colors.accent,
    justifyContent: 'center',
    alignItems: 'center',
    marginBottom: 4,
  },
  stepNumberText: { fontSize: FontSizes.xs, color: Colors.white, fontWeight: 'bold' },
  stepText: { fontSize: FontSizes.xs, color: Colors.textMuted },
  stepArrow: { marginHorizontal: Spacing.sm },
  checkInButton: {
    flexDirection: 'row',
    alignItems: 'center',
    backgroundColor: Colors.accent,
    paddingVertical: Spacing.md,
    paddingHorizontal: Spacing.xl,
    borderRadius: BorderRadius.lg,
    gap: Spacing.sm,
    width: '100%',
    justifyContent: 'center',
  },
  checkInButtonText: { fontSize: FontSizes.lg, fontWeight: '600', color: Colors.white },
  
  // Checked In State
  checkedInContainer: { position: 'relative', marginBottom: Spacing.md },
  selfieImage: { width: 100, height: 100, borderRadius: 50, borderWidth: 3, borderColor: Colors.success },
  checkedInIcon: { marginBottom: 0 },
  statusBadge: {
    position: 'absolute',
    bottom: -8,
    left: '50%',
    transform: [{ translateX: -40 }],
    backgroundColor: Colors.success,
    paddingHorizontal: Spacing.sm,
    paddingVertical: 2,
    borderRadius: BorderRadius.sm,
  },
  statusBadgeText: { fontSize: FontSizes.xs, color: Colors.white, fontWeight: 'bold' },
  checkedInTitle: { fontSize: FontSizes.xl, fontWeight: '600', color: Colors.success },
  checkedInTime: { fontSize: FontSizes.md, color: Colors.textSecondary, marginTop: Spacing.xs },
  locationInfo: {
    flexDirection: 'row',
    alignItems: 'center',
    marginTop: Spacing.md,
    gap: Spacing.xs,
    backgroundColor: Colors.accent + '10',
    paddingHorizontal: Spacing.md,
    paddingVertical: Spacing.sm,
    borderRadius: BorderRadius.md,
  },
  locationText: { fontSize: FontSizes.sm, color: Colors.accent, flex: 1 },
  dprStatus: {
    flexDirection: 'row',
    alignItems: 'center',
    width: '100%',
    padding: Spacing.md,
    borderRadius: BorderRadius.md,
    marginTop: Spacing.lg,
    gap: Spacing.md,
  },
  dprStatusComplete: { backgroundColor: Colors.successLight },
  dprStatusPending: { backgroundColor: Colors.warningLight },
  dprStatusText: { flex: 1 },
  dprStatusTitle: { fontSize: FontSizes.md, fontWeight: '600', color: Colors.text },
  dprStatusHint: { fontSize: FontSizes.xs, color: Colors.textMuted },
  checkOutButton: {
    flexDirection: 'row',
    alignItems: 'center',
    backgroundColor: Colors.primary,
    paddingVertical: Spacing.md,
    paddingHorizontal: Spacing.xl,
    borderRadius: BorderRadius.lg,
    gap: Spacing.sm,
    width: '100%',
    justifyContent: 'center',
    marginTop: Spacing.md,
  },
  checkOutButtonDisabled: { backgroundColor: Colors.textMuted },
  checkOutButtonText: { fontSize: FontSizes.lg, fontWeight: '600', color: Colors.white },
  
  // Checked Out State
  checkedOutIcon: { marginBottom: Spacing.md },
  statusTitle: { fontSize: FontSizes.xl, fontWeight: '600', color: Colors.success, marginBottom: Spacing.lg },
  timesContainer: {
    flexDirection: 'row',
    alignItems: 'center',
    width: '100%',
  },
  timeBox: { flex: 1, alignItems: 'center' },
  timeLabel: { fontSize: FontSizes.xs, color: Colors.textMuted, marginTop: Spacing.xs },
  timeValue: { fontSize: FontSizes.lg, fontWeight: '600', color: Colors.text },
  timeDivider: { width: 1, height: 40, backgroundColor: Colors.border },
  
  // History Section
  section: { marginBottom: Spacing.lg },
  sectionTitle: { fontSize: FontSizes.lg, fontWeight: '600', color: Colors.text, marginBottom: Spacing.md },
  historyCard: { flexDirection: 'row', alignItems: 'center', marginBottom: Spacing.sm },
  historyLeft: { flex: 1, flexDirection: 'row', alignItems: 'center' },
  historyIcon: {
    width: 40,
    height: 40,
    borderRadius: 20,
    justifyContent: 'center',
    alignItems: 'center',
    marginRight: Spacing.sm,
  },
  historyContent: { flex: 1 },
  historyDateText: { fontSize: FontSizes.md, fontWeight: '500', color: Colors.text },
  historyTimes: { flexDirection: 'row' },
  historyTimeText: { fontSize: FontSizes.sm, color: Colors.textMuted },
  statusBadgeSmall: {
    paddingHorizontal: Spacing.sm,
    paddingVertical: Spacing.xs,
    borderRadius: BorderRadius.full,
  },
  statusTextSmall: { fontSize: FontSizes.xs, fontWeight: '600' },
});
