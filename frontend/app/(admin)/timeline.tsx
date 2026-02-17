// TIMELINE SCREEN
// Project activity timeline using audit logs
import React, { useState, useEffect, useCallback } from 'react';
import {
  View,
  Text,
  StyleSheet,
  FlatList,
  RefreshControl,
  Pressable,
  ActivityIndicator,
  Platform,
} from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';
import { Ionicons } from '@expo/vector-icons';
import { Picker } from '@react-native-picker/picker';
import { projectsApi } from '../../services/apiClient';
import { Colors, Spacing, FontSizes, BorderRadius } from '../../constants/theme';
import ScreenHeader from '../../components/ScreenHeader';

const BASE_URL = process.env.EXPO_PUBLIC_BACKEND_URL || '';

const getToken = async () => {
  if (Platform.OS === 'web') {
    return localStorage.getItem('access_token');
  }
  const SecureStore = require('expo-secure-store');
  return await SecureStore.getItemAsync('access_token');
};

const apiRequest = async (endpoint: string) => {
  const token = await getToken();
  const response = await fetch(`${BASE_URL}${endpoint}`, {
    headers: {
      'Content-Type': 'application/json',
      ...(token ? { 'Authorization': `Bearer ${token}` } : {}),
    },
  });
  if (!response.ok) throw new Error('Request failed');
  return response.json();
};

interface AuditLog {
  log_id: string;
  module: string;
  entity_type: string;
  action: string;
  created_at: string;
  old_value?: any;
  new_value?: any;
  project_id?: string;
}

const ACTION_ICONS: Record<string, { icon: string; color: string }> = {
  CREATE: { icon: 'add-circle', color: Colors.success },
  UPDATE: { icon: 'create', color: Colors.primary },
  DELETE: { icon: 'trash', color: Colors.error },
  ISSUE: { icon: 'checkmark-circle', color: Colors.success },
  CERTIFY: { icon: 'ribbon', color: Colors.accent },
  APPROVE: { icon: 'thumbs-up', color: Colors.success },
  CANCEL: { icon: 'close-circle', color: Colors.error },
  LOGIN: { icon: 'log-in', color: Colors.primary },
};

export default function TimelineScreen() {
  const [logs, setLogs] = useState<AuditLog[]>([]);
  const [projects, setProjects] = useState<any[]>([]);
  const [loading, setLoading] = useState(true);
  const [refreshing, setRefreshing] = useState(false);
  const [selectedProject, setSelectedProject] = useState('');
  const [selectedModule, setSelectedModule] = useState('');

  const loadData = useCallback(async () => {
    try {
      let endpoint = '/api/audit-logs?limit=50';
      if (selectedProject) endpoint += `&project_id=${selectedProject}`;
      if (selectedModule) endpoint += `&module=${selectedModule}`;
      
      const [logsData, projectsData] = await Promise.all([
        apiRequest(endpoint),
        projectsApi.getAll()
      ]);
      setLogs(logsData || []);
      setProjects(projectsData || []);
    } catch (error) {
      console.error('Error loading timeline:', error);
    } finally {
      setLoading(false);
      setRefreshing(false);
    }
  }, [selectedProject, selectedModule]);

  useEffect(() => {
    loadData();
  }, [loadData]);

  const getActionMeta = (action: string) => {
    return ACTION_ICONS[action] || { icon: 'ellipse', color: Colors.textMuted };
  };

  const formatTime = (dateStr: string) => {
    const date = new Date(dateStr);
    const now = new Date();
    const diff = now.getTime() - date.getTime();
    
    if (diff < 60000) return 'Just now';
    if (diff < 3600000) return `${Math.floor(diff / 60000)}m ago`;
    if (diff < 86400000) return `${Math.floor(diff / 3600000)}h ago`;
    if (diff < 604800000) return `${Math.floor(diff / 86400000)}d ago`;
    return date.toLocaleDateString();
  };

  const getProjectName = (projectId?: string) => {
    if (!projectId) return '';
    const project = projects.find(p => p.project_id === projectId);
    return project?.project_name || '';
  };

  const renderLog = ({ item, index }: { item: AuditLog; index: number }) => {
    const meta = getActionMeta(item.action);
    const isLast = index === logs.length - 1;

    return (
      <View style={styles.timelineItem}>
        <View style={styles.timelineLeft}>
          <View style={[styles.iconContainer, { backgroundColor: meta.color + '20' }]}>
            <Ionicons name={meta.icon as any} size={20} color={meta.color} />
          </View>
          {!isLast && <View style={styles.timelineLine} />}
        </View>
        
        <View style={styles.timelineContent}>
          <View style={styles.logHeader}>
            <Text style={styles.logAction}>
              {item.action} {item.entity_type}
            </Text>
            <Text style={styles.logTime}>{formatTime(item.created_at)}</Text>
          </View>
          
          <Text style={styles.logModule}>{item.module}</Text>
          
          {item.project_id && (
            <Text style={styles.logProject}>{getProjectName(item.project_id)}</Text>
          )}
          
          {item.new_value && typeof item.new_value === 'object' && (
            <View style={styles.detailsContainer}>
              {Object.entries(item.new_value).slice(0, 3).map(([key, value]) => (
                <Text key={key} style={styles.detailText}>
                  {key.replace(/_/g, ' ')}: {String(value).substring(0, 30)}
                </Text>
              ))}
            </View>
          )}
        </View>
      </View>
    );
  };

  if (loading) {
    return (
      <SafeAreaView style={styles.container}>
        <ScreenHeader title="Activity Timeline" />
        <View style={styles.loadingContainer}>
          <ActivityIndicator size="large" color={Colors.primary} />
        </View>
      </SafeAreaView>
    );
  }

  return (
    <SafeAreaView style={styles.container} edges={['left', 'right']}>
      <ScreenHeader title="Activity Timeline" />
      
      {/* Filters */}
      <View style={styles.filterRow}>
        <View style={styles.filterItem}>
          <Picker
            selectedValue={selectedProject}
            onValueChange={setSelectedProject}
            style={styles.picker}
          >
            <Picker.Item label="All Projects" value="" />
            {projects.map(p => (
              <Picker.Item key={p.project_id} label={p.project_name} value={p.project_id} />
            ))}
          </Picker>
        </View>
        <View style={styles.filterItem}>
          <Picker
            selectedValue={selectedModule}
            onValueChange={setSelectedModule}
            style={styles.picker}
          >
            <Picker.Item label="All Modules" value="" />
            <Picker.Item label="Work Orders" value="WORK_ORDER" />
            <Picker.Item label="Payment Certs" value="PAYMENT_CERTIFICATE" />
            <Picker.Item label="Budget" value="BUDGET" />
            <Picker.Item label="DPR" value="DPR" />
            <Picker.Item label="Projects" value="PROJECT" />
          </Picker>
        </View>
      </View>

      <FlatList
        data={logs}
        renderItem={renderLog}
        keyExtractor={(item) => item.log_id}
        contentContainerStyle={styles.listContent}
        refreshControl={
          <RefreshControl refreshing={refreshing} onRefresh={() => { setRefreshing(true); loadData(); }} />
        }
        ListEmptyComponent={
          <View style={styles.emptyContainer}>
            <Ionicons name="time-outline" size={48} color={Colors.textMuted} />
            <Text style={styles.emptyText}>No activity found</Text>
            <Text style={styles.emptySubtext}>Actions will appear here as they happen</Text>
          </View>
        }
      />
    </SafeAreaView>
  );
}

const styles = StyleSheet.create({
  container: { flex: 1, backgroundColor: Colors.background },
  loadingContainer: { flex: 1, justifyContent: 'center', alignItems: 'center' },
  filterRow: { 
    flexDirection: 'row', 
    paddingHorizontal: Spacing.md, 
    paddingVertical: Spacing.sm,
    gap: Spacing.sm,
    backgroundColor: Colors.white,
    borderBottomWidth: 1,
    borderBottomColor: Colors.border,
  },
  filterItem: { 
    flex: 1, 
    backgroundColor: Colors.background, 
    borderRadius: BorderRadius.md,
    overflow: 'hidden',
  },
  picker: { height: 44 },
  listContent: { padding: Spacing.md },
  timelineItem: { flexDirection: 'row', marginBottom: 0 },
  timelineLeft: { alignItems: 'center', marginRight: Spacing.md },
  iconContainer: {
    width: 40,
    height: 40,
    borderRadius: 20,
    justifyContent: 'center',
    alignItems: 'center',
  },
  timelineLine: {
    width: 2,
    flex: 1,
    backgroundColor: Colors.border,
    marginVertical: 4,
  },
  timelineContent: {
    flex: 1,
    backgroundColor: Colors.white,
    borderRadius: BorderRadius.md,
    padding: Spacing.md,
    marginBottom: Spacing.md,
  },
  logHeader: { flexDirection: 'row', justifyContent: 'space-between', alignItems: 'center' },
  logAction: { fontSize: FontSizes.md, fontWeight: '600', color: Colors.text, textTransform: 'capitalize' },
  logTime: { fontSize: FontSizes.xs, color: Colors.textMuted },
  logModule: { fontSize: FontSizes.sm, color: Colors.primary, marginTop: 2 },
  logProject: { fontSize: FontSizes.sm, color: Colors.textSecondary, marginTop: 2 },
  detailsContainer: { 
    marginTop: Spacing.sm, 
    paddingTop: Spacing.sm, 
    borderTopWidth: 1, 
    borderTopColor: Colors.border 
  },
  detailText: { fontSize: FontSizes.xs, color: Colors.textMuted, textTransform: 'capitalize' },
  emptyContainer: { alignItems: 'center', padding: Spacing.xl },
  emptyText: { fontSize: FontSizes.md, color: Colors.textSecondary, marginTop: Spacing.md },
  emptySubtext: { fontSize: FontSizes.sm, color: Colors.textMuted },
});
