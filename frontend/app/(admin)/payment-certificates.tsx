// PAYMENT CERTIFICATES SCREEN
// List and manage payment certificates with real data
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
import { paymentCertificatesApi } from '../../services/apiClient';
import { TransitionActions, StatusBadge, LockedBadge } from '../../components/TransitionActions';
import { Colors, Spacing, FontSizes, BorderRadius } from '../../constants/theme';

interface PaymentCertificate {
  payment_certificate_id?: string;
  _id?: string;
  document_number: string;
  project_id: string;
  bill_date: string;
  current_bill_amount: number | { $numberDecimal: string };
  net_payable: number | { $numberDecimal: string };
  status: string;
  allowed_transitions?: string[];
}

const parseDecimal = (val: any): number => {
  if (!val) return 0;
  if (typeof val === 'number') return val;
  if (val.$numberDecimal) return parseFloat(val.$numberDecimal);
  return parseFloat(val) || 0;
};

export default function PaymentCertificatesScreen() {
  const router = useRouter();
  const [certificates, setCertificates] = useState<PaymentCertificate[]>([]);
  const [loading, setLoading] = useState(true);
  const [refreshing, setRefreshing] = useState(false);
  const [expandedId, setExpandedId] = useState<string | null>(null);

  const loadCertificates = useCallback(async () => {
    try {
      const data = await paymentCertificatesApi.getAll();
      setCertificates(data || []);
    } catch (error) {
      console.error('Error loading payment certificates:', error);
    } finally {
      setLoading(false);
      setRefreshing(false);
    }
  }, []);

  useEffect(() => {
    loadCertificates();
  }, [loadCertificates]);

  const onRefresh = () => {
    setRefreshing(true);
    loadCertificates();
  };

  const handleTransitionComplete = (pcId: string, newStatus: string) => {
    setCertificates(prev => prev.map(pc => 
      (pc.payment_certificate_id || pc._id) === pcId 
        ? { ...pc, status: newStatus }
        : pc
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

  const renderCertificate = ({ item }: { item: PaymentCertificate }) => {
    const pcId = item.payment_certificate_id || item._id || '';
    const isExpanded = expandedId === pcId;

    return (
      <Pressable
        style={({ pressed }) => [styles.pcCard, pressed && !isExpanded && styles.pcCardPressed]}
        onPress={() => setExpandedId(isExpanded ? null : pcId)}
      >
        <View style={styles.pcHeader}>
          <Text style={styles.pcNumber}>{item.document_number}</Text>
          <StatusBadge status={item.status} />
        </View>
        <View style={styles.pcDetails}>
          <View style={styles.pcRow}>
            <Ionicons name="calendar-outline" size={16} color={Colors.textMuted} />
            <Text style={styles.pcLabel}>Bill Date:</Text>
            <Text style={styles.pcValue}>{new Date(item.bill_date).toLocaleDateString()}</Text>
          </View>
          <View style={styles.pcRow}>
            <Ionicons name="receipt-outline" size={16} color={Colors.textMuted} />
            <Text style={styles.pcLabel}>Bill Amount:</Text>
            <Text style={styles.pcValue}>{formatCurrency(parseDecimal(item.current_bill_amount))}</Text>
          </View>
          <View style={styles.pcRow}>
            <Ionicons name="cash-outline" size={16} color={Colors.textMuted} />
            <Text style={styles.pcLabel}>Net Payable:</Text>
            <Text style={styles.pcValueBold}>{formatCurrency(parseDecimal(item.net_payable))}</Text>
          </View>
        </View>

        {/* UI-1: Dynamic transition actions */}
        {isExpanded && (
          <TransitionActions
            entityType="payment_certificate"
            entityId={pcId}
            currentStatus={item.status}
            allowedTransitions={item.allowed_transitions}
            onTransitionComplete={(newStatus) => handleTransitionComplete(pcId, newStatus)}
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
          <Text style={styles.loadingText}>Loading payment certificates...</Text>
        </View>
      </SafeAreaView>
    );
  }

  return (
    <SafeAreaView style={styles.container} edges={['left', 'right']}>
      {/* Summary Card */}
      <View style={styles.summaryCard}>
        <View style={styles.summaryItem}>
          <Text style={styles.summaryValue}>{certificates.length}</Text>
          <Text style={styles.summaryLabel}>Total PCs</Text>
        </View>
        <View style={styles.summaryItem}>
          <Text style={styles.summaryValue}>
            {formatCurrency(certificates.reduce((sum, pc) => sum + parseDecimal(pc.net_payable), 0))}
          </Text>
          <Text style={styles.summaryLabel}>Total Payable</Text>
        </View>
      </View>

      {/* Certificates List */}
      <FlatList
        data={certificates}
        renderItem={renderCertificate}
        keyExtractor={(item) => item.payment_certificate_id || item._id || item.document_number}
        contentContainerStyle={styles.listContent}
        refreshControl={<RefreshControl refreshing={refreshing} onRefresh={onRefresh} />}
        ListEmptyComponent={
          <View style={styles.emptyContainer}>
            <Ionicons name="document-outline" size={48} color={Colors.textMuted} />
            <Text style={styles.emptyText}>No payment certificates found</Text>
          </View>
        }
      />

      {/* FAB */}
      <Pressable
        style={({ pressed }) => [styles.fab, pressed && styles.fabPressed]}
        onPress={() => router.push('/(admin)/payment-certificates/create')}
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
  pcCard: {
    backgroundColor: Colors.white,
    borderRadius: BorderRadius.lg,
    padding: Spacing.md,
    marginBottom: Spacing.sm,
  },
  pcCardPressed: { opacity: 0.7 },
  pcHeader: { flexDirection: 'row', justifyContent: 'space-between', alignItems: 'center', marginBottom: Spacing.sm },
  pcNumber: { fontSize: FontSizes.md, fontWeight: '600', color: Colors.text },
  pcDetails: { gap: Spacing.xs },
  pcRow: { flexDirection: 'row', alignItems: 'center', gap: Spacing.xs },
  pcLabel: { fontSize: FontSizes.sm, color: Colors.textSecondary, width: 80 },
  pcValue: { fontSize: FontSizes.sm, color: Colors.text },
  pcValueBold: { fontSize: FontSizes.sm, fontWeight: '600', color: Colors.success },
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
