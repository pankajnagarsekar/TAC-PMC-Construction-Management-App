// WORKERS DAILY LOG SCREEN - SUPERVISOR
// Track daily worker attendance and hours
import React, { useState, useEffect, useCallback } from 'react';
import {
  View,
  Text,
  StyleSheet,
  ScrollView,
  TouchableOpacity,
  TextInput,
  Modal,
  ActivityIndicator,
  Alert,
  Platform,
  KeyboardAvoidingView,
  RefreshControl,
} from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';
import { Ionicons } from '@expo/vector-icons';
import { Picker } from '@react-native-picker/picker';
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

const showAlert = (title: string, message: string, onOk?: () => void) => {
  if (Platform.OS === 'web') {
    window.alert(`${title}: ${message}`);
    onOk?.();
  } else {
    Alert.alert(title, message, [{ text: 'OK', onPress: onOk }]);
  }
};

interface WorkerEntry {
  id: string;
  worker_name: string;
  skill_type: string;
  hours_worked: number;
  daily_wage?: number;
  contractor_name?: string;
  notes?: string;
}

interface WorkerLog {
  log_id: string;
  date: string;
  workers: WorkerEntry[];
  total_workers: number;
  total_hours: number;
  weather?: string;
  site_conditions?: string;
  remarks?: string;
  status: string;
}

const SKILL_TYPES = [
  'Mason',
  'Carpenter',
  'Laborer',
  'Electrician',
  'Plumber',
  'Welder',
  'Painter',
  'Helper',
  'Fitter',
  'Foreman',
  'Other',
];

const WEATHER_OPTIONS = [
  { value: 'sunny', label: '☀️ Sunny' },
  { value: 'cloudy', label: '⛅ Cloudy' },
  { value: 'rainy', label: '🌧️ Rainy' },
  { value: 'hot', label: '🌡️ Hot' },
  { value: 'cold', label: '❄️ Cold' },
];

const SITE_CONDITIONS = [
  { value: 'good', label: 'Good' },
  { value: 'fair', label: 'Fair' },
  { value: 'poor', label: 'Poor' },
  { value: 'unsafe', label: 'Unsafe' },
];

export default function WorkerLogScreen() {
  const { selectedProject } = useProject();
  const { user } = useAuth();
  
  const [loading, setLoading] = useState(true);
  const [refreshing, setRefreshing] = useState(false);
  const [saving, setSaving] = useState(false);
  const [submitting, setSubmitting] = useState(false);
  
  // Log state
  const [existingLog, setExistingLog] = useState<WorkerLog | null>(null);
  const [workers, setWorkers] = useState<WorkerEntry[]>([]);
  const [weather, setWeather] = useState('sunny');
  const [siteConditions, setSiteConditions] = useState('good');
  const [remarks, setRemarks] = useState('');
  
  // Add worker modal
  const [modalVisible, setModalVisible] = useState(false);
  const [editingWorker, setEditingWorker] = useState<WorkerEntry | null>(null);
  const [workerName, setWorkerName] = useState('');
  const [skillType, setSkillType] = useState('Laborer');
  const [hoursWorked, setHoursWorked] = useState('8');
  const [dailyWage, setDailyWage] = useState('');
  const [contractorName, setContractorName] = useState('');
  const [workerNotes, setWorkerNotes] = useState('');

  const today = new Date().toISOString().split('T')[0];
  const todayFormatted = new Date().toLocaleDateString('en-US', {
    weekday: 'long',
    year: 'numeric',
    month: 'long',
    day: 'numeric',
  });

  const loadExistingLog = useCallback(async () => {
    if (!selectedProject) return;
    
    try {
      const projectId = (selectedProject as any).project_id || (selectedProject as any)._id;
      
      // Check if log exists for today
      const checkResponse = await apiRequest(`/api/worker-logs/check/${projectId}/${today}`);
      
      if (checkResponse.exists && checkResponse.log_id) {
        // Load existing log
        const log = await apiRequest(`/api/worker-logs/${checkResponse.log_id}`);
        setExistingLog(log);
        setWorkers(log.workers.map((w: any, i: number) => ({ ...w, id: `w-${i}` })));
        setWeather(log.weather || 'sunny');
        setSiteConditions(log.site_conditions || 'good');
        setRemarks(log.remarks || '');
      } else {
        setExistingLog(null);
        setWorkers([]);
      }
    } catch (error) {
      console.error('Error loading log:', error);
    } finally {
      setLoading(false);
      setRefreshing(false);
    }
  }, [selectedProject, today]);

  useEffect(() => {
    loadExistingLog();
  }, [loadExistingLog]);

  const resetWorkerForm = () => {
    setWorkerName('');
    setSkillType('Laborer');
    setHoursWorked('8');
    setDailyWage('');
    setContractorName('');
    setWorkerNotes('');
    setEditingWorker(null);
  };

  const openAddWorkerModal = () => {
    resetWorkerForm();
    setModalVisible(true);
  };

  const openEditWorkerModal = (worker: WorkerEntry) => {
    setEditingWorker(worker);
    setWorkerName(worker.worker_name);
    setSkillType(worker.skill_type);
    setHoursWorked(worker.hours_worked.toString());
    setDailyWage(worker.daily_wage?.toString() || '');
    setContractorName(worker.contractor_name || '');
    setWorkerNotes(worker.notes || '');
    setModalVisible(true);
  };

  const handleSaveWorker = () => {
    if (!workerName.trim()) {
      showAlert('Validation Error', 'Please enter worker name');
      return;
    }

    const workerData: WorkerEntry = {
      id: editingWorker?.id || `w-${Date.now()}`,
      worker_name: workerName.trim(),
      skill_type: skillType,
      hours_worked: parseFloat(hoursWorked) || 8,
      daily_wage: dailyWage ? parseFloat(dailyWage) : undefined,
      contractor_name: contractorName.trim() || undefined,
      notes: workerNotes.trim() || undefined,
    };

    if (editingWorker) {
      setWorkers(prev => prev.map(w => w.id === editingWorker.id ? workerData : w));
    } else {
      setWorkers(prev => [...prev, workerData]);
    }

    setModalVisible(false);
    resetWorkerForm();
  };

  const handleRemoveWorker = (workerId: string) => {
    if (Platform.OS === 'web') {
      if (window.confirm('Remove this worker from today\'s log?')) {
        setWorkers(prev => prev.filter(w => w.id !== workerId));
      }
    } else {
      Alert.alert(
        'Remove Worker',
        'Remove this worker from today\'s log?',
        [
          { text: 'Cancel', style: 'cancel' },
          { text: 'Remove', style: 'destructive', onPress: () => {
            setWorkers(prev => prev.filter(w => w.id !== workerId));
          }},
        ]
      );
    }
  };

  const handleSaveLog = async (submit = false) => {
    if (!selectedProject) {
      showAlert('Error', 'No project selected');
      return;
    }

    if (workers.length === 0) {
      showAlert('Validation Error', 'Please add at least one worker');
      return;
    }

    submit ? setSubmitting(true) : setSaving(true);

    try {
      const projectId = (selectedProject as any).project_id || (selectedProject as any)._id;
      
      const payload = {
        project_id: projectId,
        date: today,
        workers: workers.map(w => ({
          worker_name: w.worker_name,
          skill_type: w.skill_type,
          hours_worked: w.hours_worked,
          daily_wage: w.daily_wage,
          contractor_name: w.contractor_name,
          notes: w.notes,
        })),
        weather,
        site_conditions: siteConditions,
        remarks,
        status: submit ? 'submitted' : 'draft',
      };

      if (existingLog) {
        // Update existing log
        await apiRequest(`/api/worker-logs/${existingLog.log_id}`, {
          method: 'PUT',
          body: JSON.stringify({
            workers: payload.workers,
            weather: payload.weather,
            site_conditions: payload.site_conditions,
            remarks: payload.remarks,
            status: payload.status,
          }),
        });
      } else {
        // Create new log
        const newLog = await apiRequest('/api/worker-logs', {
          method: 'POST',
          body: JSON.stringify(payload),
        });
        setExistingLog(newLog);
      }

      showAlert(
        'Success', 
        submit ? 'Worker log submitted successfully!' : 'Worker log saved as draft'
      );
      
      loadExistingLog();
    } catch (error: any) {
      showAlert('Error', error.message || 'Failed to save log');
    } finally {
      setSaving(false);
      setSubmitting(false);
    }
  };

  const getTotalHours = () => {
    return workers.reduce((sum, w) => sum + w.hours_worked, 0);
  };

  const getSkillBreakdown = () => {
    const breakdown: { [key: string]: number } = {};
    workers.forEach(w => {
      breakdown[w.skill_type] = (breakdown[w.skill_type] || 0) + 1;
    });
    return breakdown;
  };

  const isSubmitted = existingLog?.status === 'submitted';

  if (loading) {
    return (
      <SafeAreaView style={styles.container}>
        <View style={styles.loadingContainer}>
          <ActivityIndicator size="large" color={Colors.accent} />
          <Text style={styles.loadingText}>Loading worker log...</Text>
        </View>
      </SafeAreaView>
    );
  }

  return (
    <SafeAreaView style={styles.container} edges={['left', 'right']}>
      <KeyboardAvoidingView 
        style={{ flex: 1 }} 
        behavior={Platform.OS === 'ios' ? 'padding' : 'height'}
      >
        <ScrollView 
          contentContainerStyle={styles.content}
          refreshControl={
            <RefreshControl refreshing={refreshing} onRefresh={() => { setRefreshing(true); loadExistingLog(); }} />
          }
        >
          {/* Header Card */}
          <Card style={styles.headerCard}>
            <View style={styles.headerRow}>
              <View>
                <Text style={styles.dateLabel}>Worker Log for</Text>
                <Text style={styles.dateText}>{todayFormatted}</Text>
              </View>
              {existingLog && (
                <View style={[
                  styles.statusBadge,
                  { backgroundColor: isSubmitted ? Colors.successLight : Colors.warningLight }
                ]}>
                  <Text style={[
                    styles.statusText,
                    { color: isSubmitted ? Colors.success : Colors.warning }
                  ]}>
                    {isSubmitted ? 'Submitted' : 'Draft'}
                  </Text>
                </View>
              )}
            </View>
            {selectedProject && (
              <View style={styles.projectInfo}>
                <Ionicons name="business" size={14} color={Colors.accent} />
                <Text style={styles.projectName}>{selectedProject.project_name}</Text>
              </View>
            )}
          </Card>

          {/* Summary Card */}
          <Card style={styles.summaryCard}>
            <View style={styles.summaryRow}>
              <View style={styles.summaryItem}>
                <Text style={styles.summaryNumber}>{workers.length}</Text>
                <Text style={styles.summaryLabel}>Workers</Text>
              </View>
              <View style={styles.summaryDivider} />
              <View style={styles.summaryItem}>
                <Text style={styles.summaryNumber}>{getTotalHours()}</Text>
                <Text style={styles.summaryLabel}>Total Hours</Text>
              </View>
              <View style={styles.summaryDivider} />
              <View style={styles.summaryItem}>
                <Text style={styles.summaryNumber}>{Object.keys(getSkillBreakdown()).length}</Text>
                <Text style={styles.summaryLabel}>Skill Types</Text>
              </View>
            </View>
          </Card>

          {/* Workers List */}
          <View style={styles.section}>
            <View style={styles.sectionHeader}>
              <Text style={styles.sectionTitle}>Workers ({workers.length})</Text>
              {!isSubmitted && (
                <TouchableOpacity style={styles.addButton} onPress={openAddWorkerModal}>
                  <Ionicons name="add" size={20} color={Colors.white} />
                  <Text style={styles.addButtonText}>Add Worker</Text>
                </TouchableOpacity>
              )}
            </View>

            {workers.length > 0 ? (
              workers.map((worker, index) => (
                <Card key={worker.id} style={styles.workerCard}>
                  <View style={styles.workerHeader}>
                    <View style={styles.workerIndex}>
                      <Text style={styles.workerIndexText}>{index + 1}</Text>
                    </View>
                    <View style={styles.workerInfo}>
                      <Text style={styles.workerName}>{worker.worker_name}</Text>
                      <View style={styles.workerMeta}>
                        <View style={styles.skillBadge}>
                          <Text style={styles.skillText}>{worker.skill_type}</Text>
                        </View>
                        <Text style={styles.hoursText}>{worker.hours_worked}h</Text>
                      </View>
                    </View>
                    {!isSubmitted && (
                      <View style={styles.workerActions}>
                        <TouchableOpacity 
                          style={styles.workerActionBtn}
                          onPress={() => openEditWorkerModal(worker)}
                        >
                          <Ionicons name="create-outline" size={18} color={Colors.primary} />
                        </TouchableOpacity>
                        <TouchableOpacity 
                          style={styles.workerActionBtn}
                          onPress={() => handleRemoveWorker(worker.id)}
                        >
                          <Ionicons name="trash-outline" size={18} color={Colors.error} />
                        </TouchableOpacity>
                      </View>
                    )}
                  </View>
                  {(worker.contractor_name || worker.daily_wage) && (
                    <View style={styles.workerDetails}>
                      {worker.contractor_name && (
                        <Text style={styles.detailText}>Contractor: {worker.contractor_name}</Text>
                      )}
                      {worker.daily_wage && (
                        <Text style={styles.detailText}>Wage: ₹{worker.daily_wage}</Text>
                      )}
                    </View>
                  )}
                </Card>
              ))
            ) : (
              <Card style={styles.emptyCard}>
                <Ionicons name="people-outline" size={48} color={Colors.textMuted} />
                <Text style={styles.emptyTitle}>No Workers Added</Text>
                <Text style={styles.emptyText}>Tap "Add Worker" to start logging today's workforce</Text>
              </Card>
            )}
          </View>

          {/* Site Conditions */}
          <View style={styles.section}>
            <Text style={styles.sectionTitle}>Site Conditions</Text>
            
            <Card style={styles.conditionsCard}>
              <View style={styles.inputGroup}>
                <Text style={styles.inputLabel}>Weather</Text>
                <View style={styles.optionsRow}>
                  {WEATHER_OPTIONS.map(option => (
                    <TouchableOpacity
                      key={option.value}
                      style={[styles.optionBtn, weather === option.value && styles.optionBtnActive]}
                      onPress={() => !isSubmitted && setWeather(option.value)}
                      disabled={isSubmitted}
                    >
                      <Text style={[styles.optionText, weather === option.value && styles.optionTextActive]}>
                        {option.label}
                      </Text>
                    </TouchableOpacity>
                  ))}
                </View>
              </View>

              <View style={styles.inputGroup}>
                <Text style={styles.inputLabel}>Site Conditions</Text>
                <View style={styles.optionsRow}>
                  {SITE_CONDITIONS.map(option => (
                    <TouchableOpacity
                      key={option.value}
                      style={[styles.optionBtn, siteConditions === option.value && styles.optionBtnActive]}
                      onPress={() => !isSubmitted && setSiteConditions(option.value)}
                      disabled={isSubmitted}
                    >
                      <Text style={[styles.optionText, siteConditions === option.value && styles.optionTextActive]}>
                        {option.label}
                      </Text>
                    </TouchableOpacity>
                  ))}
                </View>
              </View>

              <View style={styles.inputGroup}>
                <Text style={styles.inputLabel}>Remarks</Text>
                <TextInput
                  style={styles.textArea}
                  value={remarks}
                  onChangeText={setRemarks}
                  placeholder="Any notes about today's work..."
                  placeholderTextColor={Colors.textMuted}
                  multiline
                  editable={!isSubmitted}
                />
              </View>
            </Card>
          </View>

          {/* Action Buttons */}
          {!isSubmitted && (
            <View style={styles.actionButtons}>
              <TouchableOpacity 
                style={styles.saveDraftBtn}
                onPress={() => handleSaveLog(false)}
                disabled={saving || submitting || workers.length === 0}
              >
                {saving ? (
                  <ActivityIndicator size="small" color={Colors.primary} />
                ) : (
                  <>
                    <Ionicons name="save-outline" size={20} color={Colors.primary} />
                    <Text style={styles.saveDraftText}>Save Draft</Text>
                  </>
                )}
              </TouchableOpacity>
              
              <TouchableOpacity 
                style={[styles.submitBtn, workers.length === 0 && styles.submitBtnDisabled]}
                onPress={() => handleSaveLog(true)}
                disabled={saving || submitting || workers.length === 0}
              >
                {submitting ? (
                  <ActivityIndicator size="small" color={Colors.white} />
                ) : (
                  <>
                    <Ionicons name="checkmark-circle" size={20} color={Colors.white} />
                    <Text style={styles.submitText}>Submit Log</Text>
                  </>
                )}
              </TouchableOpacity>
            </View>
          )}

          {isSubmitted && (
            <View style={styles.submittedMessage}>
              <Ionicons name="checkmark-circle" size={24} color={Colors.success} />
              <Text style={styles.submittedText}>Worker log submitted for today</Text>
            </View>
          )}
        </ScrollView>
      </KeyboardAvoidingView>

      {/* Add/Edit Worker Modal */}
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
              <Text style={styles.modalTitle}>
                {editingWorker ? 'Edit Worker' : 'Add Worker'}
              </Text>
              <TouchableOpacity onPress={() => { setModalVisible(false); resetWorkerForm(); }}>
                <Ionicons name="close" size={24} color={Colors.textMuted} />
              </TouchableOpacity>
            </View>

            <ScrollView style={styles.modalBody}>
              <View style={styles.inputGroup}>
                <Text style={styles.inputLabel}>Worker Name <Text style={styles.required}>*</Text></Text>
                <TextInput
                  style={styles.textInput}
                  value={workerName}
                  onChangeText={setWorkerName}
                  placeholder="Enter worker name"
                  placeholderTextColor={Colors.textMuted}
                />
              </View>

              <View style={styles.inputGroup}>
                <Text style={styles.inputLabel}>Skill Type</Text>
                <View style={styles.pickerContainer}>
                  <Picker
                    selectedValue={skillType}
                    onValueChange={setSkillType}
                    style={styles.picker}
                  >
                    {SKILL_TYPES.map(skill => (
                      <Picker.Item key={skill} label={skill} value={skill} />
                    ))}
                  </Picker>
                </View>
              </View>

              <View style={styles.inputRow}>
                <View style={[styles.inputGroup, { flex: 1 }]}>
                  <Text style={styles.inputLabel}>Hours Worked</Text>
                  <TextInput
                    style={styles.textInput}
                    value={hoursWorked}
                    onChangeText={setHoursWorked}
                    placeholder="8"
                    placeholderTextColor={Colors.textMuted}
                    keyboardType="numeric"
                  />
                </View>
                <View style={{ width: Spacing.md }} />
                <View style={[styles.inputGroup, { flex: 1 }]}>
                  <Text style={styles.inputLabel}>Daily Wage (₹)</Text>
                  <TextInput
                    style={styles.textInput}
                    value={dailyWage}
                    onChangeText={setDailyWage}
                    placeholder="Optional"
                    placeholderTextColor={Colors.textMuted}
                    keyboardType="numeric"
                  />
                </View>
              </View>

              <View style={styles.inputGroup}>
                <Text style={styles.inputLabel}>Contractor Name</Text>
                <TextInput
                  style={styles.textInput}
                  value={contractorName}
                  onChangeText={setContractorName}
                  placeholder="Optional"
                  placeholderTextColor={Colors.textMuted}
                />
              </View>

              <View style={styles.inputGroup}>
                <Text style={styles.inputLabel}>Notes</Text>
                <TextInput
                  style={[styles.textInput, styles.textAreaSmall]}
                  value={workerNotes}
                  onChangeText={setWorkerNotes}
                  placeholder="Any notes about this worker..."
                  placeholderTextColor={Colors.textMuted}
                  multiline
                />
              </View>
            </ScrollView>

            <View style={styles.modalFooter}>
              <TouchableOpacity 
                style={styles.cancelBtn}
                onPress={() => { setModalVisible(false); resetWorkerForm(); }}
              >
                <Text style={styles.cancelBtnText}>Cancel</Text>
              </TouchableOpacity>
              <TouchableOpacity 
                style={[styles.saveWorkerBtn, !workerName.trim() && styles.saveWorkerBtnDisabled]}
                onPress={handleSaveWorker}
                disabled={!workerName.trim()}
              >
                <Ionicons name="checkmark" size={20} color={Colors.white} />
                <Text style={styles.saveWorkerBtnText}>
                  {editingWorker ? 'Update' : 'Add Worker'}
                </Text>
              </TouchableOpacity>
            </View>
          </View>
        </KeyboardAvoidingView>
      </Modal>
    </SafeAreaView>
  );
}

const styles = StyleSheet.create({
  container: { flex: 1, backgroundColor: Colors.background },
  loadingContainer: { flex: 1, justifyContent: 'center', alignItems: 'center' },
  loadingText: { marginTop: Spacing.md, color: Colors.textSecondary },
  content: { padding: Spacing.md, paddingBottom: Spacing.xl * 2 },

  // Header Card
  headerCard: { marginBottom: Spacing.md },
  headerRow: { flexDirection: 'row', justifyContent: 'space-between', alignItems: 'flex-start' },
  dateLabel: { fontSize: FontSizes.sm, color: Colors.textMuted },
  dateText: { fontSize: FontSizes.lg, fontWeight: '600', color: Colors.text, marginTop: 2 },
  statusBadge: { paddingHorizontal: Spacing.md, paddingVertical: Spacing.xs, borderRadius: BorderRadius.full },
  statusText: { fontSize: FontSizes.xs, fontWeight: '600' },
  projectInfo: { flexDirection: 'row', alignItems: 'center', gap: Spacing.xs, marginTop: Spacing.sm },
  projectName: { fontSize: FontSizes.sm, color: Colors.accent },

  // Summary Card
  summaryCard: { marginBottom: Spacing.lg },
  summaryRow: { flexDirection: 'row', alignItems: 'center' },
  summaryItem: { flex: 1, alignItems: 'center' },
  summaryNumber: { fontSize: FontSizes.xxl, fontWeight: 'bold', color: Colors.text },
  summaryLabel: { fontSize: FontSizes.xs, color: Colors.textMuted, marginTop: 2 },
  summaryDivider: { width: 1, height: 40, backgroundColor: Colors.border },

  // Section
  section: { marginBottom: Spacing.lg },
  sectionHeader: { flexDirection: 'row', justifyContent: 'space-between', alignItems: 'center', marginBottom: Spacing.md },
  sectionTitle: { fontSize: FontSizes.md, fontWeight: '600', color: Colors.text },
  addButton: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 4,
    backgroundColor: Colors.accent,
    paddingHorizontal: Spacing.md,
    paddingVertical: Spacing.sm,
    borderRadius: BorderRadius.md,
  },
  addButtonText: { fontSize: FontSizes.sm, fontWeight: '500', color: Colors.white },

  // Worker Card
  workerCard: { marginBottom: Spacing.sm },
  workerHeader: { flexDirection: 'row', alignItems: 'center' },
  workerIndex: {
    width: 28,
    height: 28,
    borderRadius: 14,
    backgroundColor: Colors.primary + '20',
    justifyContent: 'center',
    alignItems: 'center',
    marginRight: Spacing.sm,
  },
  workerIndexText: { fontSize: FontSizes.sm, fontWeight: '600', color: Colors.primary },
  workerInfo: { flex: 1 },
  workerName: { fontSize: FontSizes.md, fontWeight: '500', color: Colors.text },
  workerMeta: { flexDirection: 'row', alignItems: 'center', gap: Spacing.sm, marginTop: 4 },
  skillBadge: { backgroundColor: Colors.accent + '15', paddingHorizontal: Spacing.sm, paddingVertical: 2, borderRadius: BorderRadius.sm },
  skillText: { fontSize: FontSizes.xs, color: Colors.accent, fontWeight: '500' },
  hoursText: { fontSize: FontSizes.sm, color: Colors.textMuted },
  workerActions: { flexDirection: 'row', gap: Spacing.sm },
  workerActionBtn: { padding: Spacing.xs },
  workerDetails: { flexDirection: 'row', gap: Spacing.md, marginTop: Spacing.sm, paddingTop: Spacing.sm, borderTopWidth: 1, borderTopColor: Colors.border },
  detailText: { fontSize: FontSizes.xs, color: Colors.textMuted },

  // Empty Card
  emptyCard: { alignItems: 'center', padding: Spacing.xl },
  emptyTitle: { fontSize: FontSizes.md, fontWeight: '600', color: Colors.text, marginTop: Spacing.md },
  emptyText: { fontSize: FontSizes.sm, color: Colors.textMuted, marginTop: Spacing.xs, textAlign: 'center' },

  // Conditions Card
  conditionsCard: { padding: Spacing.md },
  inputGroup: { marginBottom: Spacing.md },
  inputLabel: { fontSize: FontSizes.sm, fontWeight: '500', color: Colors.text, marginBottom: Spacing.sm },
  required: { color: Colors.error },
  optionsRow: { flexDirection: 'row', flexWrap: 'wrap', gap: Spacing.sm },
  optionBtn: {
    paddingHorizontal: Spacing.md,
    paddingVertical: Spacing.sm,
    borderRadius: BorderRadius.md,
    borderWidth: 1,
    borderColor: Colors.border,
    backgroundColor: Colors.white,
  },
  optionBtnActive: { backgroundColor: Colors.accent + '15', borderColor: Colors.accent },
  optionText: { fontSize: FontSizes.sm, color: Colors.textSecondary },
  optionTextActive: { color: Colors.accent, fontWeight: '500' },
  textArea: {
    backgroundColor: Colors.background,
    borderRadius: BorderRadius.md,
    padding: Spacing.md,
    fontSize: FontSizes.md,
    color: Colors.text,
    minHeight: 80,
    textAlignVertical: 'top',
  },

  // Action Buttons
  actionButtons: { flexDirection: 'row', gap: Spacing.md, marginTop: Spacing.md },
  saveDraftBtn: {
    flex: 1,
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'center',
    gap: Spacing.xs,
    paddingVertical: Spacing.md,
    borderRadius: BorderRadius.lg,
    borderWidth: 2,
    borderColor: Colors.primary,
    backgroundColor: Colors.white,
  },
  saveDraftText: { fontSize: FontSizes.md, fontWeight: '600', color: Colors.primary },
  submitBtn: {
    flex: 2,
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'center',
    gap: Spacing.xs,
    backgroundColor: Colors.success,
    paddingVertical: Spacing.md,
    borderRadius: BorderRadius.lg,
  },
  submitBtnDisabled: { backgroundColor: Colors.textMuted },
  submitText: { fontSize: FontSizes.md, fontWeight: '600', color: Colors.white },

  submittedMessage: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'center',
    gap: Spacing.sm,
    backgroundColor: Colors.successLight,
    padding: Spacing.md,
    borderRadius: BorderRadius.lg,
    marginTop: Spacing.md,
  },
  submittedText: { fontSize: FontSizes.md, fontWeight: '500', color: Colors.success },

  // Modal
  modalOverlay: { flex: 1, backgroundColor: 'rgba(0,0,0,0.5)', justifyContent: 'flex-end' },
  modalContent: { backgroundColor: Colors.white, borderTopLeftRadius: BorderRadius.xl, borderTopRightRadius: BorderRadius.xl, maxHeight: '85%' },
  modalHeader: { flexDirection: 'row', justifyContent: 'space-between', alignItems: 'center', padding: Spacing.lg, borderBottomWidth: 1, borderBottomColor: Colors.border },
  modalTitle: { fontSize: FontSizes.xl, fontWeight: '600', color: Colors.text },
  modalBody: { padding: Spacing.lg, maxHeight: 400 },
  textInput: {
    backgroundColor: Colors.background,
    borderRadius: BorderRadius.md,
    padding: Spacing.md,
    fontSize: FontSizes.md,
    color: Colors.text,
  },
  textAreaSmall: { minHeight: 60, textAlignVertical: 'top' },
  inputRow: { flexDirection: 'row' },
  pickerContainer: { backgroundColor: Colors.background, borderRadius: BorderRadius.md, overflow: 'hidden' },
  picker: { height: 50 },
  modalFooter: { flexDirection: 'row', gap: Spacing.md, padding: Spacing.lg, borderTopWidth: 1, borderTopColor: Colors.border },
  cancelBtn: { flex: 1, paddingVertical: Spacing.md, borderRadius: BorderRadius.md, borderWidth: 1, borderColor: Colors.border, alignItems: 'center' },
  cancelBtnText: { fontSize: FontSizes.md, fontWeight: '500', color: Colors.textSecondary },
  saveWorkerBtn: { flex: 2, flexDirection: 'row', alignItems: 'center', justifyContent: 'center', gap: Spacing.xs, backgroundColor: Colors.accent, paddingVertical: Spacing.md, borderRadius: BorderRadius.md },
  saveWorkerBtnDisabled: { backgroundColor: Colors.textMuted },
  saveWorkerBtnText: { fontSize: FontSizes.md, fontWeight: '600', color: Colors.white },
});
