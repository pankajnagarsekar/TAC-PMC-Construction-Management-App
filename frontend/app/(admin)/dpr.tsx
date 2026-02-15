// DPR (DAILY PROGRESS REPORT) SCREEN
// View and create DPRs

import React, { useState, useEffect, useCallback } from 'react';
import {
  View,
  Text,
  StyleSheet,
  FlatList,
  RefreshControl,
  Pressable,
  ActivityIndicator,
} from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';
import { Ionicons } from '@expo/vector-icons';
import { useRouter } from 'expo-router';
import { apiClient } from '../../services/apiClient';
import { Colors, Spacing, FontSizes, BorderRadius } from '../../constants/theme';

interface DPR {
  dpr_id: string;
  project_id: string;
  dpr_date: string;
  status: string;
  image_count: number;
  progress_notes?: string;
  weather_conditions?: string;
  images?: Array<{ image_id: string; caption?: string }>;
}

export default function DPRScreen() {
  const router = useRouter();
  const [dprs, setDprs] = useState<DPR[]>([]);
  const [loading, setLoading] = useState(true);
  const [refreshing, setRefreshing] = useState(false);
  const [filter, setFilter] = useState<string>('all');

  const loadDPRs = useCallback(async () => {
    try {
      const response = await apiClient.get('/api/v2/dpr');
      setDprs(response.dprs || []);
    } catch (error) {
      console.error('Error loading DPRs:', error);
    } finally {
      setLoading(false);
      setRefreshing(false);
    }
  }, []);

  useEffect(() => {
    loadDPRs();
  }, [loadDPRs]);

  const onRefresh = () => {
    setRefreshing(true);
    loadDPRs();
  };

  const filteredDPRs = dprs.filter(dpr => {
    if (filter === 'all') return true;
    return dpr.status?.toLowerCase() === filter;
  });

  const getStatusColor = (status: string) => {
    switch (status?.toLowerCase()) {
      case 'submitted': return Colors.success;
      case 'draft': return Colors.warning;
      default: return Colors.textMuted;
    }
  };

  const renderDPR = ({ item }: { item: DPR }) => (
    <Pressable
      style={({ pressed }) => [styles.dprCard, pressed && styles.dprCardPressed]}
      onPress={() => router.push(`/(admin)/dpr/${item.dpr_id}`)}
    >
      <View style={styles.dprHeader}>
        <View style={styles.dprDateContainer}>
          <Ionicons name="calendar" size={20} color={Colors.primary} />
          <Text style={styles.dprDate}>{new Date(item.dpr_date).toLocaleDateString()}</Text>
        </View>
        <View style={[styles.statusBadge, { backgroundColor: getStatusColor(item.status) + '20' }]}>
          <Text style={[styles.statusText, { color: getStatusColor(item.status) }]}>
            {item.status}
          </Text>
        </View>
      </View>

      <View style={styles.dprStats}>
        <View style={styles.statItem}>
          <Ionicons name="camera" size={16} color={Colors.textMuted} />
          <Text style={styles.statText}>{item.image_count || 0} photos</Text>
        </View>
        {item.weather_conditions && (
          <View style={styles.statItem}>
            <Ionicons name="cloudy" size={16} color={Colors.textMuted} />
            <Text style={styles.statText}>{item.weather_conditions}</Text>
          </View>
        )}
      </View>

      {item.progress_notes && (
        <Text style={styles.progressNotes} numberOfLines={2}>
          {item.progress_notes}
        </Text>
      )}

      <View style={styles.dprFooter}>
        <Text style={styles.viewDetails}>View Details</Text>
        <Ionicons name="chevron-forward" size={16} color={Colors.primary} />
      </View>
    </Pressable>
  );

  if (loading) {
    return (
      <SafeAreaView style={styles.container}>
        <View style={styles.loadingContainer}>
          <ActivityIndicator size="large" color={Colors.primary} />
          <Text style={styles.loadingText}>Loading DPRs...</Text>
        </View>
      </SafeAreaView>
    );
  }

  return (
    <SafeAreaView style={styles.container} edges={['left', 'right']}>
      {/* Filter Chips */}
      <View style={styles.filterRow}>
        {['all', 'draft', 'submitted'].map((f) => (
          <Pressable
            key={f}
            style={[styles.filterChip, filter === f && styles.filterChipActive]}
            onPress={() => setFilter(f)}
          >
            <Text style={[styles.filterText, filter === f && styles.filterTextActive]}>
              {f.charAt(0).toUpperCase() + f.slice(1)}
            </Text>
          </Pressable>
        ))}
      </View>

      {/* Summary */}
      <View style={styles.summaryCard}>
        <View style={styles.summaryItem}>
          <Text style={styles.summaryValue}>{dprs.length}</Text>
          <Text style={styles.summaryLabel}>Total DPRs</Text>
        </View>
        <View style={styles.summaryItem}>
          <Text style={[styles.summaryValue, { color: Colors.success }]}>
            {dprs.filter(d => d.status === 'Submitted').length}
          </Text>
          <Text style={styles.summaryLabel}>Submitted</Text>
        </View>
        <View style={styles.summaryItem}>
          <Text style={[styles.summaryValue, { color: Colors.warning }]}>
            {dprs.filter(d => d.status === 'Draft').length}
          </Text>
          <Text style={styles.summaryLabel}>Drafts</Text>
        </View>
      </View>

      {/* DPR List */}
      <FlatList
        data={filteredDPRs}
        renderItem={renderDPR}
        keyExtractor={(item) => item.dpr_id}
        contentContainerStyle={styles.listContent}
        refreshControl={<RefreshControl refreshing={refreshing} onRefresh={onRefresh} />}
        ListEmptyComponent={
          <View style={styles.emptyContainer}>
            <Ionicons name="document-text-outline" size={48} color={Colors.textMuted} />
            <Text style={styles.emptyTitle}>No DPRs Found</Text>
            <Text style={styles.emptyText}>Create your first Daily Progress Report</Text>
          </View>
        }
      />

      {/* FAB */}
      <Pressable
        style={({ pressed }) => [styles.fab, pressed && styles.fabPressed]}
        onPress={() => router.push('/(admin)/dpr/create')}
      >
        <Ionicons name="add" size={28} color={Colors.white} />
      </Pressable>
    </SafeAreaView>
  );
}

const styles = StyleSheet.create({
  container: { flex: 1, backgroundColor: Colors.background },
  loadingContainer: { flex: 1, justifyContent: 'center', alignItems: 'center' },
  loadingText: { marginTop: Spacing.md, fontSize: FontSizes.md, color: Colors.textSecondary },
  filterRow: { flexDirection: 'row', padding: Spacing.md, gap: Spacing.sm },
  filterChip: {
    paddingHorizontal: Spacing.md,
    paddingVertical: Spacing.sm,
    borderRadius: BorderRadius.full,
    backgroundColor: Colors.white,
    borderWidth: 1,
    borderColor: Colors.border,
  },
  filterChipActive: { backgroundColor: Colors.primary, borderColor: Colors.primary },
  filterText: { fontSize: FontSizes.sm, color: Colors.textSecondary },
  filterTextActive: { color: Colors.white, fontWeight: '600' },
  summaryCard: {
    flexDirection: 'row',
    backgroundColor: Colors.white,
    marginHorizontal: Spacing.md,
    marginBottom: Spacing.md,
    borderRadius: BorderRadius.lg,
    padding: Spacing.md,
  },
  summaryItem: { flex: 1, alignItems: 'center' },
  summaryValue: { fontSize: FontSizes.xl, fontWeight: 'bold', color: Colors.primary },
  summaryLabel: { fontSize: FontSizes.sm, color: Colors.textSecondary },
  listContent: { padding: Spacing.md, paddingTop: 0 },
  dprCard: {
    backgroundColor: Colors.white,
    borderRadius: BorderRadius.lg,
    padding: Spacing.md,
    marginBottom: Spacing.sm,
  },
  dprCardPressed: { opacity: 0.7 },
  dprHeader: { flexDirection: 'row', justifyContent: 'space-between', alignItems: 'center', marginBottom: Spacing.sm },
  dprDateContainer: { flexDirection: 'row', alignItems: 'center', gap: Spacing.xs },
  dprDate: { fontSize: FontSizes.md, fontWeight: '600', color: Colors.text },
  statusBadge: { paddingHorizontal: Spacing.sm, paddingVertical: 2, borderRadius: BorderRadius.sm },
  statusText: { fontSize: FontSizes.xs, fontWeight: '600' },
  dprStats: { flexDirection: 'row', gap: Spacing.md, marginBottom: Spacing.sm },
  statItem: { flexDirection: 'row', alignItems: 'center', gap: 4 },
  statText: { fontSize: FontSizes.sm, color: Colors.textSecondary },
  progressNotes: { fontSize: FontSizes.sm, color: Colors.textSecondary, marginBottom: Spacing.sm },
  dprFooter: { flexDirection: 'row', alignItems: 'center', justifyContent: 'flex-end', gap: 4 },
  viewDetails: { fontSize: FontSizes.sm, color: Colors.primary, fontWeight: '500' },
  emptyContainer: { alignItems: 'center', padding: Spacing.xl },
  emptyTitle: { fontSize: FontSizes.lg, fontWeight: '600', color: Colors.text, marginTop: Spacing.md },
  emptyText: { fontSize: FontSizes.sm, color: Colors.textMuted, marginTop: Spacing.xs },
  fab: {
    position: 'absolute',
    right: Spacing.lg,
    bottom: Spacing.lg,
    width: 56,
    height: 56,
    borderRadius: 28,
    backgroundColor: Colors.accent,
    justifyContent: 'center',
    alignItems: 'center',
    elevation: 5,
  },
  fabPressed: { opacity: 0.8 },
});
