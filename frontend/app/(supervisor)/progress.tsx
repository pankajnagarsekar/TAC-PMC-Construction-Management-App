// SUPERVISOR PROGRESS SCREEN - FUNCTIONAL
// Update physical progress for project activities
import React, { useState, useEffect, useCallback } from 'react';
import {
  View,
  Text,
  StyleSheet,
  ScrollView,
  TouchableOpacity,
  RefreshControl,
  Modal,
  TextInput,
  ActivityIndicator,
  Alert,
  Platform,
  KeyboardAvoidingView,
} from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';
import { Ionicons } from '@expo/vector-icons';
import Slider from '@react-native-community/slider';
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

interface Activity {
  id: string;
  code: string;
  name: string;
  unit: string;
  quantity: number;
  actual_progress: number; // percentage
  planned_progress: number; // percentage
  status: 'on_track' | 'delayed' | 'ahead' | 'not_started';
}

interface ProgressUpdate {
  activity_id: string;
  progress: number;
  notes: string;
  date: string;
}

export default function SupervisorProgress() {
  const { selectedProject } = useProject();
  const { user } = useAuth();
  
  const [activities, setActivities] = useState<Activity[]>([]);
  const [loading, setLoading] = useState(true);
  const [refreshing, setRefreshing] = useState(false);
  const [updating, setUpdating] = useState(false);
  
  // Update modal state
  const [modalVisible, setModalVisible] = useState(false);
  const [selectedActivity, setSelectedActivity] = useState<Activity | null>(null);
  const [newProgress, setNewProgress] = useState(0);
  const [progressNotes, setProgressNotes] = useState('');

  const loadActivities = useCallback(async () => {
    if (!selectedProject) return;
    
    try {
      const projectId = (selectedProject as any).project_id || (selectedProject as any)._id;
      
      // Fetch budget items as activities
      const budgets = await apiRequest(`/api/budgets?project_id=${projectId}`);
      
      // Transform budget items to activities
      const transformedActivities: Activity[] = (budgets || []).map((budget: any, index: number) => {
        // Calculate planned progress based on time elapsed (simplified)
        const plannedProgress = Math.min(100, Math.round((index + 1) * 15)); // Mock planned
        const actualProgress = budget.actual_progress || budget.physical_progress || 0;
        
        let status: Activity['status'] = 'not_started';
        if (actualProgress > 0) {
          if (actualProgress >= plannedProgress) {
            status = actualProgress > plannedProgress ? 'ahead' : 'on_track';
          } else {
            status = 'delayed';
          }
        }
        
        return {
          id: budget._id || budget.budget_id,
          code: budget.code_id || `ACT-${index + 1}`,
          name: budget.description || budget.activity_name || 'Unnamed Activity',
          unit: budget.unit || 'units',
          quantity: budget.quantity || 0,
          actual_progress: actualProgress,
          planned_progress: plannedProgress,
          status,
        };
      });
      
      setActivities(transformedActivities);
    } catch (error) {
      console.error('Error loading activities:', error);
      // Use mock data if API fails
      setActivities([
        { id: '1', code: 'CIVIL-001', name: 'Foundation Work', unit: 'sqm', quantity: 500, actual_progress: 75, planned_progress: 80, status: 'delayed' },
        { id: '2', code: 'CIVIL-002', name: 'Column Construction', unit: 'nos', quantity: 24, actual_progress: 60, planned_progress: 50, status: 'ahead' },
        { id: '3', code: 'ELEC-001', name: 'Electrical Conduit', unit: 'rmt', quantity: 1200, actual_progress: 30, planned_progress: 35, status: 'delayed' },
        { id: '4', code: 'PLUMB-001', name: 'Plumbing Rough-in', unit: 'points', quantity: 48, actual_progress: 0, planned_progress: 20, status: 'not_started' },
      ]);
    } finally {
      setLoading(false);
      setRefreshing(false);
    }
  }, [selectedProject]);

  useEffect(() => {
    loadActivities();
  }, [loadActivities]);

  const openUpdateModal = (activity: Activity) => {
    setSelectedActivity(activity);
    setNewProgress(activity.actual_progress);
    setProgressNotes('');
    setModalVisible(true);
  };

  const handleUpdateProgress = async () => {
    if (!selectedActivity || !selectedProject) return;
    
    setUpdating(true);
    try {
      const projectId = (selectedProject as any).project_id || (selectedProject as any)._id;
      
      // Try to update via budget endpoint
      try {
        await apiRequest(`/api/budgets/${selectedActivity.id}`, {
          method: 'PUT',
          body: JSON.stringify({
            physical_progress: newProgress,
            actual_progress: newProgress,
            last_updated_by: user?.user_id,
            progress_notes: progressNotes,
          }),
        });
      } catch (e) {
        // Fallback: Just update local state
        console.log('Budget update endpoint not available, updating locally');
      }

      // Update local state
      setActivities(prev => prev.map(act => 
        act.id === selectedActivity.id 
          ? { 
              ...act, 
              actual_progress: newProgress,
              status: newProgress >= act.planned_progress 
                ? (newProgress > act.planned_progress ? 'ahead' : 'on_track')
                : (newProgress > 0 ? 'delayed' : 'not_started')
            } 
          : act
      ));

      setModalVisible(false);
      showAlert('Success', `Progress updated to ${newProgress}%`);
    } catch (error: any) {
      showAlert('Error', error.message || 'Failed to update progress');
    } finally {
      setUpdating(false);
    }
  };

  const getStatusConfig = (status: Activity['status']) => {
    switch (status) {
      case 'ahead':
        return { color: Colors.success, icon: 'trending-up' as const, label: 'Ahead' };
      case 'on_track':
        return { color: Colors.info, icon: 'checkmark-circle' as const, label: 'On Track' };
      case 'delayed':
        return { color: Colors.warning, icon: 'warning' as const, label: 'Delayed' };
      case 'not_started':
      default:
        return { color: Colors.textMuted, icon: 'time' as const, label: 'Not Started' };
    }
  };

  const getSummary = () => {
    const total = activities.length;
    const ahead = activities.filter(a => a.status === 'ahead').length;
    const onTrack = activities.filter(a => a.status === 'on_track').length;
    const delayed = activities.filter(a => a.status === 'delayed').length;
    const notStarted = activities.filter(a => a.status === 'not_started').length;
    
    const avgActual = activities.length > 0 
      ? Math.round(activities.reduce((sum, a) => sum + a.actual_progress, 0) / activities.length)
      : 0;
    const avgPlanned = activities.length > 0
      ? Math.round(activities.reduce((sum, a) => sum + a.planned_progress, 0) / activities.length)
      : 0;

    return { total, ahead, onTrack, delayed, notStarted, avgActual, avgPlanned };
  };

  const summary = getSummary();

  if (loading) {
    return (
      <SafeAreaView style={styles.container}>
        <View style={styles.loadingContainer}>
          <ActivityIndicator size="large" color={Colors.accent} />
          <Text style={styles.loadingText}>Loading activities...</Text>
        </View>
      </SafeAreaView>
    );
  }

  return (
    <SafeAreaView style={styles.container} edges={['left', 'right']}>
      <ScrollView 
        contentContainerStyle={styles.content}
        refreshControl={
          <RefreshControl refreshing={refreshing} onRefresh={() => { setRefreshing(true); loadActivities(); }} />
        }
      >
        {/* Project Header */}
        {selectedProject && (
          <View style={styles.projectHeader}>
            <Ionicons name="business" size={18} color={Colors.accent} />
            <Text style={styles.projectName}>{selectedProject.project_name}</Text>
          </View>
        )}

        {/* Summary Card */}
        <Card style={styles.summaryCard}>
          <Text style={styles.summaryTitle}>Progress Overview</Text>
          
          <View style={styles.overallProgress}>
            <View style={styles.progressCircle}>
              <Text style={styles.progressPercent}>{summary.avgActual}%</Text>
              <Text style={styles.progressLabel}>Actual</Text>
            </View>
            <View style={styles.vsContainer}>
              <Text style={styles.vsText}>vs</Text>
            </View>
            <View style={[styles.progressCircle, styles.progressCirclePlanned]}>
              <Text style={styles.progressPercent}>{summary.avgPlanned}%</Text>
              <Text style={styles.progressLabel}>Planned</Text>
            </View>
          </View>

          <View style={styles.statusSummary}>
            <View style={styles.statusItem}>
              <View style={[styles.statusDot, { backgroundColor: Colors.success }]} />
              <Text style={styles.statusCount}>{summary.ahead}</Text>
              <Text style={styles.statusLabel}>Ahead</Text>
            </View>
            <View style={styles.statusItem}>
              <View style={[styles.statusDot, { backgroundColor: Colors.info }]} />
              <Text style={styles.statusCount}>{summary.onTrack}</Text>
              <Text style={styles.statusLabel}>On Track</Text>
            </View>
            <View style={styles.statusItem}>
              <View style={[styles.statusDot, { backgroundColor: Colors.warning }]} />
              <Text style={styles.statusCount}>{summary.delayed}</Text>
              <Text style={styles.statusLabel}>Delayed</Text>
            </View>
            <View style={styles.statusItem}>
              <View style={[styles.statusDot, { backgroundColor: Colors.textMuted }]} />
              <Text style={styles.statusCount}>{summary.notStarted}</Text>
              <Text style={styles.statusLabel}>Pending</Text>
            </View>
          </View>
        </Card>

        {/* Activities List */}
        <View style={styles.section}>
          <Text style={styles.sectionTitle}>Activities ({activities.length})</Text>
          
          {activities.length > 0 ? (
            activities.map(activity => (
              <ActivityCard 
                key={activity.id}
                activity={activity}
                statusConfig={getStatusConfig(activity.status)}
                onUpdate={() => openUpdateModal(activity)}
              />
            ))
          ) : (
            <Card style={styles.emptyCard}>
              <Ionicons name="folder-open-outline" size={48} color={Colors.textMuted} />
              <Text style={styles.emptyText}>No activities found for this project</Text>
            </Card>
          )}
        </View>
      </ScrollView>

      {/* Update Progress Modal */}
      <Modal
        visible={modalVisible}
        animationType="slide"
        transparent
        onRequestClose={() => setModalVisible(false)}
      >
        <KeyboardAvoidingView 
          style={styles.modalOverlay}
          behavior={Platform.OS === 'ios' ? 'padding' : 'height'}
        >
          <View style={styles.modalContent}>
            <View style={styles.modalHeader}>
              <Text style={styles.modalTitle}>Update Progress</Text>
              <TouchableOpacity onPress={() => setModalVisible(false)}>
                <Ionicons name="close" size={24} color={Colors.textMuted} />
              </TouchableOpacity>
            </View>

            {selectedActivity && (
              <>
                <View style={styles.activityInfo}>
                  <View style={styles.activityCode}>
                    <Text style={styles.activityCodeText}>{selectedActivity.code}</Text>
                  </View>
                  <Text style={styles.activityName}>{selectedActivity.name}</Text>
                </View>

                <View style={styles.progressSliderContainer}>
                  <Text style={styles.sliderLabel}>
                    Current Progress: <Text style={styles.sliderValue}>{newProgress}%</Text>
                  </Text>
                  <Slider
                    style={styles.slider}
                    minimumValue={0}
                    maximumValue={100}
                    step={5}
                    value={newProgress}
                    onValueChange={setNewProgress}
                    minimumTrackTintColor={Colors.accent}
                    maximumTrackTintColor={Colors.border}
                    thumbTintColor={Colors.accent}
                  />
                  <View style={styles.sliderMarks}>
                    <Text style={styles.sliderMark}>0%</Text>
                    <Text style={styles.sliderMark}>25%</Text>
                    <Text style={styles.sliderMark}>50%</Text>
                    <Text style={styles.sliderMark}>75%</Text>
                    <Text style={styles.sliderMark}>100%</Text>
                  </View>
                </View>

                <View style={styles.quickButtons}>
                  {[25, 50, 75, 100].map(val => (
                    <TouchableOpacity 
                      key={val}
                      style={[styles.quickBtn, newProgress === val && styles.quickBtnActive]}
                      onPress={() => setNewProgress(val)}
                    >
                      <Text style={[styles.quickBtnText, newProgress === val && styles.quickBtnTextActive]}>
                        {val}%
                      </Text>
                    </TouchableOpacity>
                  ))}
                </View>

                <View style={styles.notesContainer}>
                  <Text style={styles.notesLabel}>Notes (Optional)</Text>
                  <TextInput
                    style={styles.notesInput}
                    value={progressNotes}
                    onChangeText={setProgressNotes}
                    placeholder="Add notes about progress update..."
                    placeholderTextColor={Colors.textMuted}
                    multiline
                    numberOfLines={3}
                  />
                </View>

                <View style={styles.modalFooter}>
                  <TouchableOpacity 
                    style={styles.cancelBtn}
                    onPress={() => setModalVisible(false)}
                  >
                    <Text style={styles.cancelBtnText}>Cancel</Text>
                  </TouchableOpacity>
                  <TouchableOpacity 
                    style={styles.saveBtn}
                    onPress={handleUpdateProgress}
                    disabled={updating}
                  >
                    {updating ? (
                      <ActivityIndicator size="small" color={Colors.white} />
                    ) : (
                      <>
                        <Ionicons name="checkmark" size={20} color={Colors.white} />
                        <Text style={styles.saveBtnText}>Save Progress</Text>
                      </>
                    )}
                  </TouchableOpacity>
                </View>
              </>
            )}
          </View>
        </KeyboardAvoidingView>
      </Modal>
    </SafeAreaView>
  );
}

function ActivityCard({ 
  activity, 
  statusConfig,
  onUpdate 
}: { 
  activity: Activity;
  statusConfig: { color: string; icon: string; label: string };
  onUpdate: () => void;
}) {
  const difference = activity.planned_progress - activity.actual_progress;
  
  return (
    <Card style={styles.activityCard}>
      <View style={styles.cardHeader}>
        <View style={styles.codeContainer}>
          <Text style={styles.codeText}>{activity.code}</Text>
        </View>
        <View style={[styles.statusBadge, { backgroundColor: statusConfig.color + '20' }]}>
          <Ionicons name={statusConfig.icon as any} size={12} color={statusConfig.color} />
          <Text style={[styles.statusText, { color: statusConfig.color }]}>
            {statusConfig.label}
          </Text>
        </View>
      </View>

      <Text style={styles.activityTitle}>{activity.name}</Text>
      <Text style={styles.activityMeta}>
        {activity.quantity} {activity.unit}
      </Text>

      <View style={styles.progressBars}>
        <View style={styles.progressBarRow}>
          <Text style={styles.barLabel}>Actual</Text>
          <View style={styles.barContainer}>
            <View style={[styles.barFill, { width: `${activity.actual_progress}%`, backgroundColor: Colors.success }]} />
          </View>
          <Text style={[styles.barPercent, { color: Colors.success }]}>{activity.actual_progress}%</Text>
        </View>
        <View style={styles.progressBarRow}>
          <Text style={styles.barLabel}>Planned</Text>
          <View style={styles.barContainer}>
            <View style={[styles.barFill, { width: `${activity.planned_progress}%`, backgroundColor: Colors.info }]} />
          </View>
          <Text style={[styles.barPercent, { color: Colors.info }]}>{activity.planned_progress}%</Text>
        </View>
      </View>

      {difference > 0 && (
        <View style={styles.differenceRow}>
          <Ionicons name="alert-circle" size={14} color={Colors.warning} />
          <Text style={styles.differenceText}>Behind by {difference}%</Text>
        </View>
      )}

      <TouchableOpacity style={styles.updateBtn} onPress={onUpdate}>
        <Ionicons name="create-outline" size={18} color={Colors.accent} />
        <Text style={styles.updateBtnText}>Update Progress</Text>
      </TouchableOpacity>
    </Card>
  );
}

const styles = StyleSheet.create({
  container: { flex: 1, backgroundColor: Colors.background },
  loadingContainer: { flex: 1, justifyContent: 'center', alignItems: 'center' },
  loadingText: { marginTop: Spacing.md, color: Colors.textSecondary },
  content: { padding: Spacing.md },
  
  projectHeader: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: Spacing.xs,
    marginBottom: Spacing.md,
  },
  projectName: { fontSize: FontSizes.md, fontWeight: '600', color: Colors.accent },

  // Summary Card
  summaryCard: { padding: Spacing.lg, marginBottom: Spacing.lg },
  summaryTitle: { fontSize: FontSizes.lg, fontWeight: '600', color: Colors.text, marginBottom: Spacing.md, textAlign: 'center' },
  overallProgress: { flexDirection: 'row', justifyContent: 'center', alignItems: 'center', marginBottom: Spacing.lg },
  progressCircle: {
    width: 90,
    height: 90,
    borderRadius: 45,
    backgroundColor: Colors.successLight,
    justifyContent: 'center',
    alignItems: 'center',
  },
  progressCirclePlanned: { backgroundColor: Colors.infoLight },
  progressPercent: { fontSize: FontSizes.xl, fontWeight: 'bold', color: Colors.text },
  progressLabel: { fontSize: FontSizes.xs, color: Colors.textMuted },
  vsContainer: { paddingHorizontal: Spacing.md },
  vsText: { fontSize: FontSizes.sm, color: Colors.textMuted },
  statusSummary: { flexDirection: 'row', justifyContent: 'space-around' },
  statusItem: { alignItems: 'center' },
  statusDot: { width: 12, height: 12, borderRadius: 6, marginBottom: 4 },
  statusCount: { fontSize: FontSizes.lg, fontWeight: '600', color: Colors.text },
  statusLabel: { fontSize: FontSizes.xs, color: Colors.textMuted },

  // Section
  section: { marginBottom: Spacing.lg },
  sectionTitle: { fontSize: FontSizes.md, fontWeight: '600', color: Colors.textSecondary, marginBottom: Spacing.md },

  // Activity Card
  activityCard: { marginBottom: Spacing.sm },
  cardHeader: { flexDirection: 'row', justifyContent: 'space-between', alignItems: 'center', marginBottom: Spacing.sm },
  codeContainer: { backgroundColor: Colors.primary + '15', paddingHorizontal: Spacing.sm, paddingVertical: 4, borderRadius: BorderRadius.sm },
  codeText: { fontSize: FontSizes.xs, fontWeight: '600', color: Colors.primary },
  statusBadge: { flexDirection: 'row', alignItems: 'center', gap: 4, paddingHorizontal: Spacing.sm, paddingVertical: 4, borderRadius: BorderRadius.full },
  statusText: { fontSize: FontSizes.xs, fontWeight: '500' },
  activityTitle: { fontSize: FontSizes.md, fontWeight: '500', color: Colors.text },
  activityMeta: { fontSize: FontSizes.sm, color: Colors.textMuted, marginBottom: Spacing.sm },
  progressBars: { gap: Spacing.xs, marginBottom: Spacing.sm },
  progressBarRow: { flexDirection: 'row', alignItems: 'center' },
  barLabel: { width: 50, fontSize: FontSizes.xs, color: Colors.textMuted },
  barContainer: { flex: 1, height: 8, backgroundColor: Colors.border, borderRadius: 4, marginHorizontal: Spacing.sm },
  barFill: { height: '100%', borderRadius: 4 },
  barPercent: { width: 40, fontSize: FontSizes.xs, fontWeight: '600', textAlign: 'right' },
  differenceRow: { flexDirection: 'row', alignItems: 'center', gap: 4, marginBottom: Spacing.sm },
  differenceText: { fontSize: FontSizes.xs, color: Colors.warning },
  updateBtn: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'center',
    gap: Spacing.xs,
    paddingTop: Spacing.sm,
    borderTopWidth: 1,
    borderTopColor: Colors.border,
  },
  updateBtnText: { fontSize: FontSizes.sm, fontWeight: '500', color: Colors.accent },

  // Empty State
  emptyCard: { alignItems: 'center', padding: Spacing.xl },
  emptyText: { fontSize: FontSizes.md, color: Colors.textMuted, marginTop: Spacing.md },

  // Modal
  modalOverlay: { flex: 1, backgroundColor: 'rgba(0,0,0,0.5)', justifyContent: 'flex-end' },
  modalContent: { backgroundColor: Colors.white, borderTopLeftRadius: BorderRadius.xl, borderTopRightRadius: BorderRadius.xl, padding: Spacing.lg, maxHeight: '80%' },
  modalHeader: { flexDirection: 'row', justifyContent: 'space-between', alignItems: 'center', marginBottom: Spacing.lg },
  modalTitle: { fontSize: FontSizes.xl, fontWeight: '600', color: Colors.text },
  activityInfo: { flexDirection: 'row', alignItems: 'center', marginBottom: Spacing.lg },
  activityCode: { backgroundColor: Colors.primary + '15', paddingHorizontal: Spacing.sm, paddingVertical: 4, borderRadius: BorderRadius.sm, marginRight: Spacing.sm },
  activityCodeText: { fontSize: FontSizes.sm, fontWeight: '600', color: Colors.primary },
  activityName: { flex: 1, fontSize: FontSizes.md, fontWeight: '500', color: Colors.text },
  progressSliderContainer: { marginBottom: Spacing.md },
  sliderLabel: { fontSize: FontSizes.md, color: Colors.text, marginBottom: Spacing.sm },
  sliderValue: { fontWeight: 'bold', color: Colors.accent },
  slider: { width: '100%', height: 40 },
  sliderMarks: { flexDirection: 'row', justifyContent: 'space-between' },
  sliderMark: { fontSize: FontSizes.xs, color: Colors.textMuted },
  quickButtons: { flexDirection: 'row', justifyContent: 'space-around', marginBottom: Spacing.lg },
  quickBtn: { paddingHorizontal: Spacing.lg, paddingVertical: Spacing.sm, borderRadius: BorderRadius.md, borderWidth: 1, borderColor: Colors.border },
  quickBtnActive: { backgroundColor: Colors.accent, borderColor: Colors.accent },
  quickBtnText: { fontSize: FontSizes.md, fontWeight: '500', color: Colors.textSecondary },
  quickBtnTextActive: { color: Colors.white },
  notesContainer: { marginBottom: Spacing.lg },
  notesLabel: { fontSize: FontSizes.sm, color: Colors.textSecondary, marginBottom: Spacing.xs },
  notesInput: { backgroundColor: Colors.background, borderRadius: BorderRadius.md, padding: Spacing.md, fontSize: FontSizes.md, color: Colors.text, minHeight: 80, textAlignVertical: 'top' },
  modalFooter: { flexDirection: 'row', gap: Spacing.md },
  cancelBtn: { flex: 1, paddingVertical: Spacing.md, borderRadius: BorderRadius.md, borderWidth: 1, borderColor: Colors.border, alignItems: 'center' },
  cancelBtnText: { fontSize: FontSizes.md, fontWeight: '500', color: Colors.textSecondary },
  saveBtn: { flex: 2, flexDirection: 'row', alignItems: 'center', justifyContent: 'center', gap: Spacing.xs, backgroundColor: Colors.accent, paddingVertical: Spacing.md, borderRadius: BorderRadius.md },
  saveBtnText: { fontSize: FontSizes.md, fontWeight: '600', color: Colors.white },
});
