// SUPERVISOR REPORTS SCREEN
// View submitted DPRs and other reports

import React, { useState, useEffect, useCallback } from 'react';
import {
  View,
  Text,
  StyleSheet,
  FlatList,
  TouchableOpacity,
  RefreshControl,
  ActivityIndicator,
} from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';
import { Ionicons } from '@expo/vector-icons';
import { useRouter } from 'expo-router';
import { useAuth } from '../../contexts/AuthContext';
import { useProject } from '../../contexts/ProjectContext';
import { Card } from '../../components/ui';
import { Colors, Spacing, FontSizes, BorderRadius } from '../../constants/theme';

const BASE_URL = process.env.EXPO_PUBLIC_BACKEND_URL || '';

interface DPRReport {
  _id: string;
  dpr_id: string;
  project_id: string;
  project_name?: string;
  dpr_date: string;
  status: string;
  weather_conditions?: string;
  manpower_count?: number;
  image_count?: number;
  submitted_at?: string;
  created_at: string;
}

export default function SupervisorReportsScreen() {
  const router = useRouter();
  const { user } = useAuth();
  const { selectedProject } = useProject();
  const [reports, setReports] = useState<DPRReport[]>([]);
  const [loading, setLoading] = useState(true);
  const [refreshing, setRefreshing] = useState(false);

  const loadReports = useCallback(async () => {
    try {
      // Get token
      let token = '';
      if (typeof window !== 'undefined' && window.localStorage) {
        token = localStorage.getItem('access_token') || '';
      } else {
        const SecureStore = require('expo-secure-store');
        token = await SecureStore.getItemAsync('access_token') || '';
      }

      // Fetch DPRs for the selected project
      const projectFilter = selectedProject ? `?project_id=${selectedProject.project_id}` : '';
      const response = await fetch(`${BASE_URL}/api/v2/dpr${projectFilter}`, {
        headers: {
          'Authorization': `Bearer ${token}`,
        },
      });

      if (response.ok) {
        const data = await response.json();
        setReports(data.dprs || data || []);
      }
    } catch (error) {
      console.error('Failed to load reports:', error);
    } finally {
      setLoading(false);
      setRefreshing(false);
    }
  }, [selectedProject]);

  useEffect(() => {
    loadReports();
  }, [loadReports]);

  const getStatusColor = (status: string) => {
    switch (status?.toLowerCase()) {
      case 'submitted':
        return Colors.success;
      case 'draft':
        return Colors.warning;
      case 'rejected':
        return Colors.error;
      default:
        return Colors.textMuted;
    }
  };

  const formatDate = (dateString: string) => {
    const date = new Date(dateString);
    return date.toLocaleDateString('en-US', {
      month: 'short',
      day: 'numeric',
      year: 'numeric',
    });
  };

  const renderReport = ({ item }: { item: DPRReport }) => (
    <TouchableOpacity
      onPress={() => router.push(`/(supervisor)/dpr?id=${item._id || item.dpr_id}`)}
    >
      <Card style={styles.reportCard}>
        <View style={styles.reportHeader}>
          <View style={styles.dateContainer}>
            <Ionicons name="calendar-outline" size={20} color={Colors.accent} />
            <Text style={styles.dateText}>{formatDate(item.dpr_date)}</Text>
          </View>
          <View style={[styles.statusBadge, { backgroundColor: getStatusColor(item.status) + '20' }]}>
            <Text style={[styles.statusText, { color: getStatusColor(item.status) }]}>
              {item.status}
            </Text>
          </View>
        </View>

        <View style={styles.reportDetails}>
          {item.weather_conditions && (
            <View style={styles.detailRow}>
              <Ionicons name="partly-sunny-outline" size={16} color={Colors.textMuted} />
              <Text style={styles.detailText}>{item.weather_conditions}</Text>
            </View>
          )}
          {item.manpower_count !== undefined && (
            <View style={styles.detailRow}>
              <Ionicons name="people-outline" size={16} color={Colors.textMuted} />
              <Text style={styles.detailText}>{item.manpower_count} workers</Text>
            </View>
          )}
          {item.image_count !== undefined && (
            <View style={styles.detailRow}>
              <Ionicons name="images-outline" size={16} color={Colors.textMuted} />
              <Text style={styles.detailText}>{item.image_count} photos</Text>
            </View>
          )}
        </View>

        <View style={styles.reportFooter}>
          <Text style={styles.viewText}>View Details</Text>
          <Ionicons name="chevron-forward" size={20} color={Colors.accent} />
        </View>
      </Card>
    </TouchableOpacity>
  );

  // No project selected state
  if (!selectedProject) {
    return (
      <SafeAreaView style={styles.container}>
        <View style={styles.centerContainer}>
          <Ionicons name="folder-open-outline" size={64} color={Colors.textMuted} />
          <Text style={styles.emptyTitle}>No project selected</Text>
          <Text style={styles.emptyText}>Please select a project from the dashboard</Text>
        </View>
      </SafeAreaView>
    );
  }

  if (loading) {
    return (
      <SafeAreaView style={styles.container}>
        <View style={styles.centerContainer}>
          <ActivityIndicator size="large" color={Colors.accent} />
          <Text style={styles.loadingText}>Loading reports...</Text>
        </View>
      </SafeAreaView>
    );
  }

  return (
    <SafeAreaView style={styles.container} edges={['left', 'right']}>
      {/* Project Info */}
      <View style={styles.projectHeader}>
        <Ionicons name="business" size={20} color={Colors.accent} />
        <Text style={styles.projectName}>{selectedProject.project_name}</Text>
      </View>

      <FlatList
        data={reports}
        renderItem={renderReport}
        keyExtractor={(item) => item._id || item.dpr_id}
        contentContainerStyle={styles.listContent}
        refreshControl={
          <RefreshControl
            refreshing={refreshing}
            onRefresh={() => {
              setRefreshing(true);
              loadReports();
            }}
          />
        }
        ListEmptyComponent={
          <View style={styles.emptyContainer}>
            <Ionicons name="document-text-outline" size={64} color={Colors.textMuted} />
            <Text style={styles.emptyTitle}>No Reports Yet</Text>
            <Text style={styles.emptyText}>
              Your submitted DPRs will appear here
            </Text>
          </View>
        }
      />
    </SafeAreaView>
  );
}

const styles = StyleSheet.create({
  container: {
    flex: 1,
    backgroundColor: Colors.background,
  },
  centerContainer: {
    flex: 1,
    justifyContent: 'center',
    alignItems: 'center',
    padding: Spacing.xl,
  },
  loadingText: {
    marginTop: Spacing.md,
    fontSize: FontSizes.md,
    color: Colors.textSecondary,
  },
  projectHeader: {
    flexDirection: 'row',
    alignItems: 'center',
    padding: Spacing.md,
    backgroundColor: Colors.white,
    borderBottomWidth: 1,
    borderBottomColor: Colors.border,
    gap: Spacing.sm,
  },
  projectName: {
    fontSize: FontSizes.md,
    fontWeight: '600',
    color: Colors.text,
  },
  listContent: {
    padding: Spacing.md,
  },
  reportCard: {
    marginBottom: Spacing.md,
    padding: Spacing.md,
  },
  reportHeader: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
    marginBottom: Spacing.sm,
  },
  dateContainer: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: Spacing.xs,
  },
  dateText: {
    fontSize: FontSizes.md,
    fontWeight: '600',
    color: Colors.text,
  },
  statusBadge: {
    paddingHorizontal: Spacing.sm,
    paddingVertical: 4,
    borderRadius: BorderRadius.full,
  },
  statusText: {
    fontSize: FontSizes.xs,
    fontWeight: '600',
    textTransform: 'uppercase',
  },
  reportDetails: {
    marginVertical: Spacing.sm,
    gap: Spacing.xs,
  },
  detailRow: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: Spacing.xs,
  },
  detailText: {
    fontSize: FontSizes.sm,
    color: Colors.textSecondary,
  },
  reportFooter: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'flex-end',
    marginTop: Spacing.sm,
    paddingTop: Spacing.sm,
    borderTopWidth: 1,
    borderTopColor: Colors.border,
  },
  viewText: {
    fontSize: FontSizes.sm,
    color: Colors.accent,
    fontWeight: '500',
  },
  emptyContainer: {
    alignItems: 'center',
    paddingVertical: Spacing.xxl * 2,
  },
  emptyTitle: {
    fontSize: FontSizes.lg,
    fontWeight: '600',
    color: Colors.text,
    marginTop: Spacing.md,
  },
  emptyText: {
    fontSize: FontSizes.md,
    color: Colors.textSecondary,
    marginTop: Spacing.xs,
    textAlign: 'center',
  },
});
