// WORK ORDERS SCREEN
// List and manage work orders with real data
// UI-1: Dynamic transition buttons based on state machine

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
import { useFocusEffect } from '@react-navigation/native';
import { workOrdersApi } from '../../services/apiClient';
import { Card } from '../../components/ui';
import { TransitionActions, StatusBadge, LockedBadge } from '../../components/TransitionActions';
import { Colors, Spacing, FontSizes, BorderRadius } from '../../constants/theme';

interface WorkOrder {
  work_order_id?: string;
  _id?: string;
  document_number: string;
  project_id: string;
  code_id: string;
  vendor_id: string;
  issue_date: string;
  rate: number | { $numberDecimal: string };
  quantity: number | { $numberDecimal: string };
  base_amount: number | { $numberDecimal: string };
  net_wo_value: number | { $numberDecimal: string };
  status: string;
  allowed_transitions?: string[];
  locked_flag?: boolean;
}

const parseDecimal = (val: any): number => {
  if (!val) return 0;
  if (typeof val === 'number') return val;
  if (val.$numberDecimal) return parseFloat(val.$numberDecimal);
  return parseFloat(val) || 0;
};

export default function WorkOrdersScreen() {
  const router = useRouter();
  const [workOrders, setWorkOrders] = useState<WorkOrder[]>([]);
  const [loading, setLoading] = useState(true);
  const [refreshing, setRefreshing] = useState(false);
  const [expandedId, setExpandedId] = useState<string | null>(null);

  const loadWorkOrders = useCallback(async () => {
    try {
      console.log('Loading work orders...');
      const data = await workOrdersApi.getAll();
      console.log('Work orders loaded:', data?.length, data);
      setWorkOrders(data || []);
    } catch (error) {
      console.error('Error loading work orders:', error);
    } finally {
      setLoading(false);
      setRefreshing(false);
    }
  }, []);

  useEffect(() => {
    loadWorkOrders();
  }, [loadWorkOrders]);

  // Reload when screen comes into focus (after creating/editing)
  useFocusEffect(
    useCallback(() => {
      loadWorkOrders();
    }, [loadWorkOrders])
  );

  const onRefresh = () => {
    setRefreshing(true);
    loadWorkOrders();
  };

  const handleTransitionComplete = (woId: string, newStatus: string) => {
    setWorkOrders(prev => prev.map(wo => 
      (wo.work_order_id || wo._id) === woId 
        ? { ...wo, status: newStatus }
        : wo
    ));
    setExpandedId(null);
  };

  const formatCurrency = (amount: number) => {
    return new Intl.NumberFormat('en-IN', {
      style: 'currency',
      currency: 'INR',
      minimumFractionDigits: 0,
    }).format(amount);
  };

  const renderWorkOrder = ({ item }: { item: WorkOrder }) => {
    const woId = item.work_order_id || item._id || '';
    const isExpanded = expandedId === woId;
    const isLocked = item.locked_flag === true;

    return (
      <Pressable
        style={({ pressed }) => [
          styles.woCard, 
          pressed && !isExpanded && styles.woCardPressed,
          isLocked && styles.woCardLocked
        ]}
        onPress={() => !isLocked && setExpandedId(isExpanded ? null : woId)}
        disabled={isLocked}
      >
        <View style={styles.woHeader}>
          <Text style={styles.woNumber}>{item.document_number}</Text>
          <View style={styles.badgeRow}>
            {isLocked && <LockedBadge />}
            <StatusBadge status={item.status} />
          </View>
        </View>
        <View style={styles.woDetails}>
          <View style={styles.woRow}>
            <Ionicons name="calendar-outline" size={16} color={Colors.textMuted} />
            <Text style={styles.woLabel}>Issue Date:</Text>
            <Text style={styles.woValue}>{new Date(item.issue_date).toLocaleDateString()}</Text>
          </View>
          <View style={styles.woRow}>
            <Ionicons name="cube-outline" size={16} color={Colors.textMuted} />
            <Text style={styles.woLabel}>Qty × Rate:</Text>
            <Text style={styles.woValue}>
              {parseDecimal(item.quantity).toFixed(0)} × {formatCurrency(parseDecimal(item.rate))}
            </Text>
          </View>
          <View style={styles.woRow}>
            <Ionicons name="cash-outline" size={16} color={Colors.textMuted} />
            <Text style={styles.woLabel}>Net Value:</Text>
            <Text style={styles.woValueBold}>{formatCurrency(parseDecimal(item.net_wo_value))}</Text>
          </View>
        </View>

        {/* UI-1: Dynamic transition actions - UI-2: Hidden when locked */}
        {isExpanded && !isLocked && (
          <TransitionActions
            entityType="work_order"
            entityId={woId}
            currentStatus={item.status}
            allowedTransitions={item.allowed_transitions}
            onTransitionComplete={(newStatus) => handleTransitionComplete(woId, newStatus)}
          />
        )}
      </Pressable>
    );
  };

  if (loading) {
    return (
      <SafeAreaView style={styles.container}>
        <View style={styles.loadingContainer}>
          <ActivityIndicator size="large" color={Colors.primary} />
          <Text style={styles.loadingText}>Loading work orders...</Text>
        </View>
      </SafeAreaView>
    );
  }

  return (
    <SafeAreaView style={styles.container} edges={['left', 'right']}>
      {/* Summary Card */}
      <View style={styles.summaryCard}>
        <View style={styles.summaryItem}>
          <Text style={styles.summaryValue}>{workOrders.length}</Text>
          <Text style={styles.summaryLabel}>Total WOs</Text>
        </View>
        <View style={styles.summaryItem}>
          <Text style={styles.summaryValue}>
            {formatCurrency(workOrders.reduce((sum, wo) => sum + parseDecimal(wo.net_wo_value), 0))}
          </Text>
          <Text style={styles.summaryLabel}>Total Value</Text>
        </View>
      </View>

      {/* Work Orders List */}
      <FlatList
        data={workOrders}
        renderItem={renderWorkOrder}
        keyExtractor={(item) => item.work_order_id || item._id || item.document_number}
        contentContainerStyle={styles.listContent}
        refreshControl={<RefreshControl refreshing={refreshing} onRefresh={onRefresh} />}
        ListEmptyComponent={
          <View style={styles.emptyContainer}>
            <Ionicons name="document-text-outline" size={48} color={Colors.textMuted} />
            <Text style={styles.emptyText}>No work orders found</Text>
          </View>
        }
      />

      {/* FAB */}
      <Pressable
        style={({ pressed }) => [styles.fab, pressed && styles.fabPressed]}
        onPress={() => router.push('/(admin)/work-orders/create')}
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
  summaryCard: {
    flexDirection: 'row',
    backgroundColor: Colors.white,
    marginHorizontal: Spacing.md,
    marginVertical: Spacing.md,
    borderRadius: BorderRadius.lg,
    padding: Spacing.md,
  },
  summaryItem: { flex: 1, alignItems: 'center' },
  summaryValue: { fontSize: FontSizes.xl, fontWeight: 'bold', color: Colors.primary },
  summaryLabel: { fontSize: FontSizes.sm, color: Colors.textSecondary },
  listContent: { padding: Spacing.md, paddingTop: 0 },
  woCard: {
    backgroundColor: Colors.white,
    borderRadius: BorderRadius.lg,
    padding: Spacing.md,
    marginBottom: Spacing.sm,
  },
  woCardPressed: { opacity: 0.7 },
  woCardLocked: { opacity: 0.7, backgroundColor: Colors.background },
  woHeader: { flexDirection: 'row', justifyContent: 'space-between', alignItems: 'center', marginBottom: Spacing.sm },
  woNumber: { fontSize: FontSizes.md, fontWeight: '600', color: Colors.text },
  badgeRow: { flexDirection: 'row', alignItems: 'center', gap: Spacing.xs },
  woDetails: { gap: Spacing.xs },
  woRow: { flexDirection: 'row', alignItems: 'center', gap: Spacing.xs },
  woLabel: { fontSize: FontSizes.sm, color: Colors.textSecondary, width: 80 },
  woValue: { fontSize: FontSizes.sm, color: Colors.text },
  woValueBold: { fontSize: FontSizes.sm, fontWeight: '600', color: Colors.primary },
  emptyContainer: { alignItems: 'center', padding: Spacing.xl },
  emptyText: { fontSize: FontSizes.md, color: Colors.textMuted, marginTop: Spacing.md },
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
