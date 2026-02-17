// WORKERS REPORT ENGINE - ADMIN
// View and analyze worker logs across projects with filters
import React, { useState, useEffect, useCallback } from 'react';
import {
  View,
  Text,
  StyleSheet,
  ScrollView,
  TouchableOpacity,
  RefreshControl,
  ActivityIndicator,
  Platform,
  TextInput,
  Modal,
} from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';
import { Ionicons } from '@expo/vector-icons';
import { Picker } from '@react-native-picker/picker';
import { Card } from '../../components/ui';
import { Colors, Spacing, FontSizes, BorderRadius } from '../../constants/theme';
import ScreenHeader from '../../components/ScreenHeader';

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

interface WorkerLog {
  log_id: string;
  project_id: string;
  project_name?: string;
  date: string;
  supervisor_id: string;
  supervisor_name: string;
  total_workers: number;
  total_hours: number;
  weather?: string;
  site_conditions?: string;
  status: string;
  workers: {
    worker_name: string;
    skill_type: string;
    hours_worked: number;
    daily_wage?: number;
    contractor_name?: string;
  }[];
}

interface Project {
  project_id?: string;
  _id?: string;
  project_name: string;
}

interface ReportSummary {
  total_logs: number;
  total_workers: number;
  total_hours: number;
  skill_breakdown: { [key: string]: { count: number; hours: number } };
}

export default function WorkersReportScreen() {
  const [loading, setLoading] = useState(true);
  const [refreshing, setRefreshing] = useState(false);
  const [logs, setLogs] = useState<WorkerLog[]>([]);
  const [projects, setProjects] = useState<Project[]>([]);
  const [summary, setSummary] = useState<ReportSummary | null>(null);
  
  // Filters
  const [selectedProject, setSelectedProject] = useState<string>('all');
  const [startDate, setStartDate] = useState<string>('');
  const [endDate, setEndDate] = useState<string>('');
  const [filterModalVisible, setFilterModalVisible] = useState(false);
  
  // Detail modal
  const [selectedLog, setSelectedLog] = useState<WorkerLog | null>(null);
  const [detailModalVisible, setDetailModalVisible] = useState(false);

  // Set default date range (last 7 days)
  useEffect(() => {
    const today = new Date();
    const weekAgo = new Date(today);
    weekAgo.setDate(weekAgo.getDate() - 7);
    
    setEndDate(today.toISOString().split('T')[0]);
    setStartDate(weekAgo.toISOString().split('T')[0]);
  }, []);

  const loadData = useCallback(async () => {
    try {
      // Load projects
      const projectsData = await apiRequest('/api/projects');
      setProjects(projectsData || []);

      // Build query params
      let queryParams = '';
      if (selectedProject !== 'all') {
        queryParams += `project_id=${selectedProject}&`;
      }
      if (startDate) {
        queryParams += `start_date=${startDate}&`;
      }
      if (endDate) {
        queryParams += `end_date=${endDate}&`;
      }

      // Load worker logs
      const logsData = await apiRequest(`/api/worker-logs?${queryParams}`);
      
      // Enrich logs with project names
      const enrichedLogs = (logsData || []).map((log: WorkerLog) => {
        const project = projectsData.find((p: Project) => 
          (p.project_id || p._id) === log.project_id
        );
        return {
          ...log,
          project_name: project?.project_name || 'Unknown Project'
        };
      });
      
      setLogs(enrichedLogs);

      // Load summary
      const summaryData = await apiRequest(`/api/worker-logs/report/summary?${queryParams}`);
      setSummary(summaryData);

    } catch (error) {
      console.error('Error loading report data:', error);
    } finally {
      setLoading(false);
      setRefreshing(false);
    }
  }, [selectedProject, startDate, endDate]);

  useEffect(() => {
    if (startDate && endDate) {
      loadData();
    }
  }, [loadData, startDate, endDate]);

  const applyFilters = () => {
    setFilterModalVisible(false);
    setLoading(true);
    loadData();
  };

  const clearFilters = () => {
    setSelectedProject('all');
    const today = new Date();
    const weekAgo = new Date(today);
    weekAgo.setDate(weekAgo.getDate() - 7);
    setEndDate(today.toISOString().split('T')[0]);
    setStartDate(weekAgo.toISOString().split('T')[0]);
  };

  const openLogDetail = (log: WorkerLog) => {
    setSelectedLog(log);
    setDetailModalVisible(true);
  };

  const getWeatherEmoji = (weather?: string) => {
    switch (weather) {
      case 'sunny': return '☀️';
      case 'cloudy': return '⛅';
      case 'rainy': return '🌧️';
      case 'hot': return '🌡️';
      case 'cold': return '❄️';
      default: return '🌤️';
    }
  };

  const formatDate = (dateStr: string) => {
    const date = new Date(dateStr);
    return date.toLocaleDateString('en-US', { month: 'short', day: 'numeric', year: 'numeric' });
  };

  if (loading) {
    return (
      <SafeAreaView style={styles.container}>
        <ScreenHeader title="Workers Report" />
        <View style={styles.loadingContainer}>
          <ActivityIndicator size="large" color={Colors.accent} />
          <Text style={styles.loadingText}>Loading report data...</Text>
        </View>
      </SafeAreaView>
    );
  }

  return (
    <SafeAreaView style={styles.container} edges={['left', 'right']}>
      <ScreenHeader title="Workers Report" />
      
      <ScrollView
        contentContainerStyle={styles.content}
        refreshControl={
          <RefreshControl refreshing={refreshing} onRefresh={() => { setRefreshing(true); loadData(); }} />
        }
      >
        {/* Filter Bar */}
        <View style={styles.filterBar}>
          <View style={styles.filterInfo}>
            <Ionicons name="calendar-outline" size={16} color={Colors.textMuted} />
            <Text style={styles.filterText}>
              {formatDate(startDate)} - {formatDate(endDate)}
            </Text>
            {selectedProject !== 'all' && (
              <>
                <Text style={styles.filterDot}>•</Text>
                <Text style={styles.filterText}>1 project</Text>
              </>
            )}
          </View>
          <TouchableOpacity style={styles.filterButton} onPress={() => setFilterModalVisible(true)}>
            <Ionicons name="filter" size={18} color={Colors.accent} />
            <Text style={styles.filterButtonText}>Filter</Text>
          </TouchableOpacity>
        </View>

        {/* Summary Cards */}
        {summary && (
          <View style={styles.summaryRow}>
            <Card style={styles.summaryCard}>
              <Text style={styles.summaryNumber}>{summary.total_logs}</Text>
              <Text style={styles.summaryLabel}>Logs</Text>
            </Card>
            <Card style={styles.summaryCard}>
              <Text style={[styles.summaryNumber, { color: Colors.accent }]}>{summary.total_workers}</Text>
              <Text style={styles.summaryLabel}>Workers</Text>
            </Card>
            <Card style={styles.summaryCard}>
              <Text style={[styles.summaryNumber, { color: Colors.success }]}>{summary.total_hours}</Text>
              <Text style={styles.summaryLabel}>Hours</Text>
            </Card>
          </View>
        )}

        {/* Skill Breakdown */}
        {summary && Object.keys(summary.skill_breakdown).length > 0 && (
          <Card style={styles.breakdownCard}>
            <Text style={styles.cardTitle}>Workforce by Skill</Text>
            <View style={styles.breakdownGrid}>
              {Object.entries(summary.skill_breakdown).map(([skill, data]) => (
                <View key={skill} style={styles.breakdownItem}>
                  <View style={styles.breakdownHeader}>
                    <Text style={styles.breakdownSkill}>{skill}</Text>
                    <Text style={styles.breakdownCount}>{data.count}</Text>
                  </View>
                  <Text style={styles.breakdownHours}>{data.hours}h total</Text>
                </View>
              ))}
            </View>
          </Card>
        )}

        {/* Logs List */}
        <View style={styles.section}>
          <Text style={styles.sectionTitle}>Daily Logs ({logs.length})</Text>
          
          {logs.length > 0 ? (
            logs.map(log => (
              <TouchableOpacity key={log.log_id} onPress={() => openLogDetail(log)}>
                <Card style={styles.logCard}>
                  <View style={styles.logHeader}>
                    <View style={styles.logDateContainer}>
                      <Text style={styles.logDate}>{formatDate(log.date)}</Text>
                      <Text style={styles.logWeather}>{getWeatherEmoji(log.weather)}</Text>
                    </View>
                    <View style={[
                      styles.statusBadge,
                      { backgroundColor: log.status === 'submitted' ? Colors.successLight : Colors.warningLight }
                    ]}>
                      <Text style={[
                        styles.statusText,
                        { color: log.status === 'submitted' ? Colors.success : Colors.warning }
                      ]}>
                        {log.status}
                      </Text>
                    </View>
                  </View>
                  
                  <Text style={styles.logProject}>{log.project_name}</Text>
                  <Text style={styles.logSupervisor}>by {log.supervisor_name}</Text>
                  
                  <View style={styles.logStats}>
                    <View style={styles.logStat}>
                      <Ionicons name="people" size={16} color={Colors.accent} />
                      <Text style={styles.logStatText}>{log.total_workers} workers</Text>
                    </View>
                    <View style={styles.logStat}>
                      <Ionicons name="time" size={16} color={Colors.success} />
                      <Text style={styles.logStatText}>{log.total_hours}h</Text>
                    </View>
                    <View style={styles.logStat}>
                      <Ionicons name="construct" size={16} color={Colors.primary} />
                      <Text style={styles.logStatText}>{log.site_conditions || 'N/A'}</Text>
                    </View>
                  </View>
                </Card>
              </TouchableOpacity>
            ))
          ) : (
            <Card style={styles.emptyCard}>
              <Ionicons name="document-text-outline" size={48} color={Colors.textMuted} />
              <Text style={styles.emptyTitle}>No Worker Logs</Text>
              <Text style={styles.emptyText}>No logs found for the selected filters</Text>
            </Card>
          )}
        </View>
      </ScrollView>

      {/* Filter Modal */}
      <Modal
        visible={filterModalVisible}
        animationType="slide"
        transparent
        onRequestClose={() => setFilterModalVisible(false)}
      >
        <View style={styles.modalOverlay}>
          <View style={styles.modalContent}>
            <View style={styles.modalHeader}>
              <Text style={styles.modalTitle}>Filter Reports</Text>
              <TouchableOpacity onPress={() => setFilterModalVisible(false)}>
                <Ionicons name="close" size={24} color={Colors.textMuted} />
              </TouchableOpacity>
            </View>

            <ScrollView style={styles.modalBody}>
              <View style={styles.inputGroup}>
                <Text style={styles.inputLabel}>Project</Text>
                <View style={styles.pickerContainer}>
                  <Picker
                    selectedValue={selectedProject}
                    onValueChange={setSelectedProject}
                    style={styles.picker}
                  >
                    <Picker.Item label="All Projects" value="all" />
                    {projects.map(project => (
                      <Picker.Item 
                        key={project.project_id || project._id} 
                        label={project.project_name} 
                        value={project.project_id || project._id} 
                      />
                    ))}
                  </Picker>
                </View>
              </View>

              <View style={styles.dateRow}>
                <View style={[styles.inputGroup, { flex: 1 }]}>
                  <Text style={styles.inputLabel}>Start Date</Text>
                  <TextInput
                    style={styles.textInput}
                    value={startDate}
                    onChangeText={setStartDate}
                    placeholder="YYYY-MM-DD"
                    placeholderTextColor={Colors.textMuted}
                  />
                </View>
                <View style={{ width: Spacing.md }} />
                <View style={[styles.inputGroup, { flex: 1 }]}>
                  <Text style={styles.inputLabel}>End Date</Text>
                  <TextInput
                    style={styles.textInput}
                    value={endDate}
                    onChangeText={setEndDate}
                    placeholder="YYYY-MM-DD"
                    placeholderTextColor={Colors.textMuted}
                  />
                </View>
              </View>

              {/* Quick date presets */}
              <View style={styles.presetRow}>
                <TouchableOpacity 
                  style={styles.presetBtn}
                  onPress={() => {
                    const today = new Date();
                    setStartDate(today.toISOString().split('T')[0]);
                    setEndDate(today.toISOString().split('T')[0]);
                  }}
                >
                  <Text style={styles.presetText}>Today</Text>
                </TouchableOpacity>
                <TouchableOpacity 
                  style={styles.presetBtn}
                  onPress={() => {
                    const today = new Date();
                    const weekAgo = new Date(today);
                    weekAgo.setDate(weekAgo.getDate() - 7);
                    setStartDate(weekAgo.toISOString().split('T')[0]);
                    setEndDate(today.toISOString().split('T')[0]);
                  }}
                >
                  <Text style={styles.presetText}>Last 7 Days</Text>
                </TouchableOpacity>
                <TouchableOpacity 
                  style={styles.presetBtn}
                  onPress={() => {
                    const today = new Date();
                    const monthAgo = new Date(today);
                    monthAgo.setMonth(monthAgo.getMonth() - 1);
                    setStartDate(monthAgo.toISOString().split('T')[0]);
                    setEndDate(today.toISOString().split('T')[0]);
                  }}
                >
                  <Text style={styles.presetText}>Last 30 Days</Text>
                </TouchableOpacity>
              </View>
            </ScrollView>

            <View style={styles.modalFooter}>
              <TouchableOpacity style={styles.clearBtn} onPress={clearFilters}>
                <Text style={styles.clearBtnText}>Clear</Text>
              </TouchableOpacity>
              <TouchableOpacity style={styles.applyBtn} onPress={applyFilters}>
                <Ionicons name="checkmark" size={20} color={Colors.white} />
                <Text style={styles.applyBtnText}>Apply Filters</Text>
              </TouchableOpacity>
            </View>
          </View>
        </View>
      </Modal>

      {/* Log Detail Modal */}
      <Modal
        visible={detailModalVisible}
        animationType="slide"
        transparent
        onRequestClose={() => setDetailModalVisible(false)}
      >
        <View style={styles.modalOverlay}>
          <View style={[styles.modalContent, { maxHeight: '85%' }]}>
            <View style={styles.modalHeader}>
              <Text style={styles.modalTitle}>Log Details</Text>
              <TouchableOpacity onPress={() => setDetailModalVisible(false)}>
                <Ionicons name="close" size={24} color={Colors.textMuted} />
              </TouchableOpacity>
            </View>

            {selectedLog && (
              <ScrollView style={styles.modalBody}>
                <View style={styles.detailHeader}>
                  <Text style={styles.detailDate}>{formatDate(selectedLog.date)}</Text>
                  <Text style={styles.detailProject}>{selectedLog.project_name}</Text>
                  <Text style={styles.detailSupervisor}>Submitted by {selectedLog.supervisor_name}</Text>
                </View>

                <View style={styles.detailInfo}>
                  <View style={styles.detailInfoItem}>
                    <Text style={styles.detailInfoLabel}>Weather</Text>
                    <Text style={styles.detailInfoValue}>
                      {getWeatherEmoji(selectedLog.weather)} {selectedLog.weather || 'N/A'}
                    </Text>
                  </View>
                  <View style={styles.detailInfoItem}>
                    <Text style={styles.detailInfoLabel}>Site Conditions</Text>
                    <Text style={styles.detailInfoValue}>{selectedLog.site_conditions || 'N/A'}</Text>
                  </View>
                </View>

                <Text style={styles.detailSectionTitle}>
                  Workers ({selectedLog.workers?.length || 0})
                </Text>
                
                {selectedLog.workers?.map((worker, index) => (
                  <View key={index} style={styles.workerItem}>
                    <View style={styles.workerIndex}>
                      <Text style={styles.workerIndexText}>{index + 1}</Text>
                    </View>
                    <View style={styles.workerDetails}>
                      <Text style={styles.workerName}>{worker.worker_name}</Text>
                      <View style={styles.workerMeta}>
                        <View style={styles.skillBadge}>
                          <Text style={styles.skillText}>{worker.skill_type}</Text>
                        </View>
                        <Text style={styles.workerHours}>{worker.hours_worked}h</Text>
                        {worker.daily_wage && (
                          <Text style={styles.workerWage}>₹{worker.daily_wage}</Text>
                        )}
                      </View>
                      {worker.contractor_name && (
                        <Text style={styles.workerContractor}>Contractor: {worker.contractor_name}</Text>
                      )}
                    </View>
                  </View>
                ))}

                <View style={styles.detailSummary}>
                  <View style={styles.detailSummaryItem}>
                    <Text style={styles.detailSummaryLabel}>Total Workers</Text>
                    <Text style={styles.detailSummaryValue}>{selectedLog.total_workers}</Text>
                  </View>
                  <View style={styles.detailSummaryItem}>
                    <Text style={styles.detailSummaryLabel}>Total Hours</Text>
                    <Text style={styles.detailSummaryValue}>{selectedLog.total_hours}h</Text>
                  </View>
                </View>
              </ScrollView>
            )}
          </View>
        </View>
      </Modal>
    </SafeAreaView>
  );
}

const styles = StyleSheet.create({
  container: { flex: 1, backgroundColor: Colors.background },
  loadingContainer: { flex: 1, justifyContent: 'center', alignItems: 'center' },
  loadingText: { marginTop: Spacing.md, color: Colors.textSecondary },
  content: { padding: Spacing.md },

  // Filter Bar
  filterBar: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    backgroundColor: Colors.white,
    borderRadius: BorderRadius.md,
    padding: Spacing.sm,
    marginBottom: Spacing.md,
  },
  filterInfo: { flexDirection: 'row', alignItems: 'center', gap: Spacing.xs },
  filterText: { fontSize: FontSizes.sm, color: Colors.textMuted },
  filterDot: { color: Colors.textMuted },
  filterButton: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 4,
    paddingHorizontal: Spacing.md,
    paddingVertical: Spacing.sm,
    backgroundColor: Colors.accent + '15',
    borderRadius: BorderRadius.md,
  },
  filterButtonText: { fontSize: FontSizes.sm, fontWeight: '500', color: Colors.accent },

  // Summary Cards
  summaryRow: { flexDirection: 'row', gap: Spacing.sm, marginBottom: Spacing.md },
  summaryCard: { flex: 1, alignItems: 'center', paddingVertical: Spacing.md },
  summaryNumber: { fontSize: FontSizes.xxl, fontWeight: 'bold', color: Colors.text },
  summaryLabel: { fontSize: FontSizes.xs, color: Colors.textMuted, marginTop: 2 },

  // Breakdown Card
  breakdownCard: { marginBottom: Spacing.md },
  cardTitle: { fontSize: FontSizes.md, fontWeight: '600', color: Colors.text, marginBottom: Spacing.md },
  breakdownGrid: { flexDirection: 'row', flexWrap: 'wrap', gap: Spacing.sm },
  breakdownItem: {
    width: '48%',
    backgroundColor: Colors.background,
    borderRadius: BorderRadius.md,
    padding: Spacing.sm,
  },
  breakdownHeader: { flexDirection: 'row', justifyContent: 'space-between', alignItems: 'center' },
  breakdownSkill: { fontSize: FontSizes.sm, fontWeight: '500', color: Colors.text },
  breakdownCount: { fontSize: FontSizes.md, fontWeight: 'bold', color: Colors.accent },
  breakdownHours: { fontSize: FontSizes.xs, color: Colors.textMuted, marginTop: 2 },

  // Section
  section: { marginBottom: Spacing.lg },
  sectionTitle: { fontSize: FontSizes.md, fontWeight: '600', color: Colors.textSecondary, marginBottom: Spacing.md },

  // Log Card
  logCard: { marginBottom: Spacing.sm },
  logHeader: { flexDirection: 'row', justifyContent: 'space-between', alignItems: 'center', marginBottom: Spacing.xs },
  logDateContainer: { flexDirection: 'row', alignItems: 'center', gap: Spacing.xs },
  logDate: { fontSize: FontSizes.md, fontWeight: '600', color: Colors.text },
  logWeather: { fontSize: FontSizes.md },
  statusBadge: { paddingHorizontal: Spacing.sm, paddingVertical: 2, borderRadius: BorderRadius.sm },
  statusText: { fontSize: FontSizes.xs, fontWeight: '600', textTransform: 'capitalize' },
  logProject: { fontSize: FontSizes.sm, fontWeight: '500', color: Colors.primary },
  logSupervisor: { fontSize: FontSizes.xs, color: Colors.textMuted, marginBottom: Spacing.sm },
  logStats: { flexDirection: 'row', gap: Spacing.md, paddingTop: Spacing.sm, borderTopWidth: 1, borderTopColor: Colors.border },
  logStat: { flexDirection: 'row', alignItems: 'center', gap: 4 },
  logStatText: { fontSize: FontSizes.xs, color: Colors.textSecondary },

  // Empty State
  emptyCard: { alignItems: 'center', padding: Spacing.xl },
  emptyTitle: { fontSize: FontSizes.md, fontWeight: '600', color: Colors.text, marginTop: Spacing.md },
  emptyText: { fontSize: FontSizes.sm, color: Colors.textMuted, marginTop: Spacing.xs },

  // Modal
  modalOverlay: { flex: 1, backgroundColor: 'rgba(0,0,0,0.5)', justifyContent: 'flex-end' },
  modalContent: { backgroundColor: Colors.white, borderTopLeftRadius: BorderRadius.xl, borderTopRightRadius: BorderRadius.xl, maxHeight: '70%' },
  modalHeader: { flexDirection: 'row', justifyContent: 'space-between', alignItems: 'center', padding: Spacing.lg, borderBottomWidth: 1, borderBottomColor: Colors.border },
  modalTitle: { fontSize: FontSizes.xl, fontWeight: '600', color: Colors.text },
  modalBody: { padding: Spacing.lg },
  inputGroup: { marginBottom: Spacing.md },
  inputLabel: { fontSize: FontSizes.sm, fontWeight: '500', color: Colors.text, marginBottom: Spacing.sm },
  pickerContainer: { backgroundColor: Colors.background, borderRadius: BorderRadius.md, overflow: 'hidden' },
  picker: { height: 50 },
  textInput: { backgroundColor: Colors.background, borderRadius: BorderRadius.md, padding: Spacing.md, fontSize: FontSizes.md, color: Colors.text },
  dateRow: { flexDirection: 'row' },
  presetRow: { flexDirection: 'row', gap: Spacing.sm, marginTop: Spacing.sm },
  presetBtn: { flex: 1, paddingVertical: Spacing.sm, backgroundColor: Colors.background, borderRadius: BorderRadius.md, alignItems: 'center' },
  presetText: { fontSize: FontSizes.sm, color: Colors.primary, fontWeight: '500' },
  modalFooter: { flexDirection: 'row', gap: Spacing.md, padding: Spacing.lg, borderTopWidth: 1, borderTopColor: Colors.border },
  clearBtn: { flex: 1, paddingVertical: Spacing.md, borderRadius: BorderRadius.md, borderWidth: 1, borderColor: Colors.border, alignItems: 'center' },
  clearBtnText: { fontSize: FontSizes.md, fontWeight: '500', color: Colors.textSecondary },
  applyBtn: { flex: 2, flexDirection: 'row', alignItems: 'center', justifyContent: 'center', gap: Spacing.xs, backgroundColor: Colors.accent, paddingVertical: Spacing.md, borderRadius: BorderRadius.md },
  applyBtnText: { fontSize: FontSizes.md, fontWeight: '600', color: Colors.white },

  // Detail Modal
  detailHeader: { marginBottom: Spacing.lg },
  detailDate: { fontSize: FontSizes.xl, fontWeight: '600', color: Colors.text },
  detailProject: { fontSize: FontSizes.md, color: Colors.primary, marginTop: Spacing.xs },
  detailSupervisor: { fontSize: FontSizes.sm, color: Colors.textMuted, marginTop: 2 },
  detailInfo: { flexDirection: 'row', gap: Spacing.md, marginBottom: Spacing.lg },
  detailInfoItem: { flex: 1, backgroundColor: Colors.background, padding: Spacing.md, borderRadius: BorderRadius.md },
  detailInfoLabel: { fontSize: FontSizes.xs, color: Colors.textMuted },
  detailInfoValue: { fontSize: FontSizes.md, fontWeight: '500', color: Colors.text, marginTop: 2 },
  detailSectionTitle: { fontSize: FontSizes.md, fontWeight: '600', color: Colors.text, marginBottom: Spacing.md },
  workerItem: { flexDirection: 'row', paddingVertical: Spacing.sm, borderBottomWidth: 1, borderBottomColor: Colors.border },
  workerIndex: { width: 28, height: 28, borderRadius: 14, backgroundColor: Colors.primary + '20', justifyContent: 'center', alignItems: 'center', marginRight: Spacing.sm },
  workerIndexText: { fontSize: FontSizes.sm, fontWeight: '600', color: Colors.primary },
  workerDetails: { flex: 1 },
  workerName: { fontSize: FontSizes.md, fontWeight: '500', color: Colors.text },
  workerMeta: { flexDirection: 'row', alignItems: 'center', gap: Spacing.sm, marginTop: 4 },
  skillBadge: { backgroundColor: Colors.accent + '15', paddingHorizontal: Spacing.sm, paddingVertical: 2, borderRadius: BorderRadius.sm },
  skillText: { fontSize: FontSizes.xs, color: Colors.accent, fontWeight: '500' },
  workerHours: { fontSize: FontSizes.sm, color: Colors.textMuted },
  workerWage: { fontSize: FontSizes.sm, color: Colors.success },
  workerContractor: { fontSize: FontSizes.xs, color: Colors.textMuted, marginTop: 2 },
  detailSummary: { flexDirection: 'row', gap: Spacing.md, marginTop: Spacing.lg, paddingTop: Spacing.lg, borderTopWidth: 1, borderTopColor: Colors.border },
  detailSummaryItem: { flex: 1, alignItems: 'center' },
  detailSummaryLabel: { fontSize: FontSizes.xs, color: Colors.textMuted },
  detailSummaryValue: { fontSize: FontSizes.xl, fontWeight: 'bold', color: Colors.text, marginTop: 2 },
});
