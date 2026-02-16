// TRANSITION ACTIONS COMPONENT
// Dynamic action buttons based on allowed transitions from state machine
// UI-1: Replaces hardcoded status checks
// UI-2: Handles locked_flag state

import React, { useState } from 'react';
import { View, Text, StyleSheet, Pressable, ActivityIndicator, Alert } from 'react-native';
import { Ionicons } from '@expo/vector-icons';
import { Colors, Spacing, FontSizes, BorderRadius } from '../constants/theme';
import apiClient from '../services/apiClient';

// Transition metadata for UI display
const TRANSITION_META: Record<string, { label: string; icon: string; color: string; confirmMessage?: string }> = {
  // Work Order transitions
  'Issued': { label: 'Issue', icon: 'checkmark-circle', color: Colors.success, confirmMessage: 'Issue this work order?' },
  'Revised': { label: 'Revise', icon: 'create', color: Colors.warning, confirmMessage: 'Revise this work order?' },
  'Cancelled': { label: 'Cancel', icon: 'close-circle', color: Colors.error, confirmMessage: 'Cancel this work order?' },
  
  // Payment Certificate transitions
  'Certified': { label: 'Certify', icon: 'shield-checkmark', color: Colors.success, confirmMessage: 'Certify this payment certificate?' },
  'Partially Paid': { label: 'Record Payment', icon: 'cash', color: Colors.info },
  'Fully Paid': { label: 'Mark Fully Paid', icon: 'checkmark-done', color: Colors.success },
  
  // Issue transitions
  'In Progress': { label: 'Start Work', icon: 'play', color: Colors.warning },
  'Resolved': { label: 'Resolve', icon: 'checkmark', color: Colors.success, confirmMessage: 'Mark this issue as resolved?' },
  'Closed': { label: 'Close', icon: 'lock-closed', color: Colors.textMuted, confirmMessage: 'Close this issue?' },
  'Reopened': { label: 'Reopen', icon: 'refresh', color: Colors.warning, confirmMessage: 'Reopen this issue?' },
  
  // Petty Cash transitions
  'Submitted': { label: 'Submit', icon: 'send', color: Colors.primary, confirmMessage: 'Submit this claim for approval?' },
  'Approved': { label: 'Approve', icon: 'checkmark-circle', color: Colors.success, confirmMessage: 'Approve this petty cash claim?' },
  'Rejected': { label: 'Reject', icon: 'close-circle', color: Colors.error, confirmMessage: 'Reject this petty cash claim?' },
  'Paid': { label: 'Mark Paid', icon: 'cash', color: Colors.success, confirmMessage: 'Mark this claim as paid?' },
};

interface TransitionActionsProps {
  entityType: 'work_order' | 'payment_certificate' | 'issue' | 'petty_cash';
  entityId: string;
  currentStatus: string;
  allowedTransitions?: string[];
  onTransitionComplete?: (newStatus: string) => void;
  onError?: (error: Error) => void;
  compact?: boolean;
}

export function TransitionActions({
  entityType,
  entityId,
  currentStatus,
  allowedTransitions,
  onTransitionComplete,
  onError,
  compact = false,
}: TransitionActionsProps) {
  const [loading, setLoading] = useState<string | null>(null);
  const [transitions, setTransitions] = useState<string[]>(allowedTransitions || []);
  const [fetched, setFetched] = useState(!!allowedTransitions);

  // Fetch allowed transitions if not provided
  React.useEffect(() => {
    if (!allowedTransitions && !fetched) {
      fetchTransitions();
    }
  }, [entityType, entityId, currentStatus]);

  const fetchTransitions = async () => {
    try {
      const endpoint = getTransitionsEndpoint(entityType, entityId);
      const response = await apiClient.get(endpoint);
      setTransitions(response.allowed_transitions || []);
      setFetched(true);
    } catch (error) {
      console.error('Failed to fetch transitions:', error);
      // Fallback to common transitions based on current status
      setTransitions(getFallbackTransitions(entityType, currentStatus));
      setFetched(true);
    }
  };

  const handleTransition = async (targetStatus: string) => {
    const meta = TRANSITION_META[targetStatus];
    
    if (meta?.confirmMessage) {
      Alert.alert(
        'Confirm Action',
        meta.confirmMessage,
        [
          { text: 'Cancel', style: 'cancel' },
          { text: 'Confirm', onPress: () => executeTransition(targetStatus) },
        ]
      );
    } else {
      executeTransition(targetStatus);
    }
  };

  const executeTransition = async (targetStatus: string) => {
    setLoading(targetStatus);
    try {
      const endpoint = getTransitionEndpoint(entityType, entityId, targetStatus);
      await apiClient.post(endpoint, { target_status: targetStatus });
      onTransitionComplete?.(targetStatus);
    } catch (error: any) {
      console.error('Transition failed:', error);
      onError?.(error);
      Alert.alert('Error', error.message || 'Failed to update status');
    } finally {
      setLoading(null);
    }
  };

  if (!fetched) {
    return (
      <View style={styles.loadingContainer}>
        <ActivityIndicator size="small" color={Colors.primary} />
      </View>
    );
  }

  if (transitions.length === 0) {
    return null; // No actions available
  }

  return (
    <View style={[styles.container, compact && styles.containerCompact]}>
      {transitions.map((targetStatus) => {
        const meta = TRANSITION_META[targetStatus] || {
          label: targetStatus,
          icon: 'arrow-forward',
          color: Colors.primary,
        };
        const isLoading = loading === targetStatus;

        return (
          <Pressable
            key={targetStatus}
            style={({ pressed }) => [
              styles.actionButton,
              compact && styles.actionButtonCompact,
              { backgroundColor: meta.color + '15', borderColor: meta.color },
              pressed && styles.actionButtonPressed,
            ]}
            onPress={() => handleTransition(targetStatus)}
            disabled={!!loading}
          >
            {isLoading ? (
              <ActivityIndicator size="small" color={meta.color} />
            ) : (
              <>
                <Ionicons name={meta.icon as any} size={compact ? 16 : 18} color={meta.color} />
                <Text style={[styles.actionText, compact && styles.actionTextCompact, { color: meta.color }]}>
                  {meta.label}
                </Text>
              </>
            )}
          </Pressable>
        );
      })}
    </View>
  );
}

// Helper functions
function getTransitionsEndpoint(entityType: string, entityId: string): string {
  switch (entityType) {
    case 'work_order':
      return `/api/v2/work-orders/${entityId}/transitions`;
    case 'payment_certificate':
      return `/api/v2/payment-certificates/${entityId}/transitions`;
    case 'issue':
      return `/api/v2/issues/${entityId}/transitions`;
    case 'petty_cash':
      return `/api/v2/petty-cash/${entityId}/transitions`;
    default:
      return `/api/v2/${entityType}/${entityId}/transitions`;
  }
}

function getTransitionEndpoint(entityType: string, entityId: string, targetStatus: string): string {
  const actionMap: Record<string, string> = {
    'Issued': 'issue',
    'Revised': 'revise',
    'Cancelled': 'cancel',
    'Certified': 'certify',
    'Partially Paid': 'pay',
    'Fully Paid': 'pay',
    'In Progress': 'start',
    'Resolved': 'resolve',
    'Closed': 'close',
    'Reopened': 'reopen',
    'Submitted': 'submit',
    'Approved': 'approve',
    'Rejected': 'reject',
    'Paid': 'mark-paid',
  };
  
  const action = actionMap[targetStatus] || targetStatus.toLowerCase().replace(' ', '-');
  
  switch (entityType) {
    case 'work_order':
      return `/api/v2/work-orders/${entityId}/${action}`;
    case 'payment_certificate':
      return `/api/v2/payment-certificates/${entityId}/${action}`;
    case 'issue':
      return `/api/v2/issues/${entityId}/${action}`;
    case 'petty_cash':
      return `/api/v2/petty-cash/${entityId}/${action}`;
    default:
      return `/api/v2/${entityType}/${entityId}/${action}`;
  }
}

function getFallbackTransitions(entityType: string, currentStatus: string): string[] {
  // Fallback transitions when API is unavailable
  const fallbacks: Record<string, Record<string, string[]>> = {
    work_order: {
      'Draft': ['Issued', 'Cancelled'],
      'Issued': ['Revised', 'Cancelled'],
      'Revised': ['Cancelled'],
    },
    payment_certificate: {
      'Draft': ['Certified'],
      'Certified': ['Partially Paid', 'Fully Paid'],
      'Partially Paid': ['Fully Paid'],
    },
    issue: {
      'Open': ['In Progress', 'Closed'],
      'In Progress': ['Resolved', 'Closed'],
      'Resolved': ['Closed', 'Reopened'],
      'Closed': ['Reopened'],
    },
    petty_cash: {
      'Draft': ['Submitted'],
      'Submitted': ['Approved', 'Rejected'],
      'Approved': ['Paid'],
      'Rejected': [],
    },
  };

  return fallbacks[entityType]?.[currentStatus] || [];
}

// Status badge component with dynamic coloring
export function StatusBadge({ status }: { status: string }) {
  const getStatusStyle = (s: string) => {
    const statusLower = s?.toLowerCase() || '';
    if (['approved', 'issued', 'certified', 'resolved', 'paid', 'fully paid'].includes(statusLower)) {
      return { bg: Colors.success + '20', text: Colors.success };
    }
    if (['pending', 'in progress', 'draft', 'submitted', 'partially paid'].includes(statusLower)) {
      return { bg: Colors.warning + '20', text: Colors.warning };
    }
    if (['rejected', 'cancelled', 'closed'].includes(statusLower)) {
      return { bg: Colors.error + '20', text: Colors.error };
    }
    return { bg: Colors.textMuted + '20', text: Colors.textMuted };
  };

  const style = getStatusStyle(status);

  return (
    <View style={[styles.statusBadge, { backgroundColor: style.bg }]}>
      <Text style={[styles.statusText, { color: style.text }]}>{status}</Text>
    </View>
  );
}

// UI-2: Locked badge component
export function LockedBadge() {
  return (
    <View style={styles.lockedBadge}>
      <Ionicons name="lock-closed" size={12} color={Colors.error} />
      <Text style={styles.lockedText}>Locked</Text>
    </View>
  );
}

const styles = StyleSheet.create({
  container: {
    flexDirection: 'row',
    flexWrap: 'wrap',
    gap: Spacing.sm,
    marginTop: Spacing.md,
  },
  containerCompact: {
    marginTop: Spacing.xs,
  },
  loadingContainer: {
    padding: Spacing.sm,
    alignItems: 'center',
  },
  actionButton: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: Spacing.xs,
    paddingHorizontal: Spacing.md,
    paddingVertical: Spacing.sm,
    borderRadius: BorderRadius.md,
    borderWidth: 1,
  },
  actionButtonCompact: {
    paddingHorizontal: Spacing.sm,
    paddingVertical: Spacing.xs,
  },
  actionButtonPressed: {
    opacity: 0.7,
  },
  actionText: {
    fontSize: FontSizes.sm,
    fontWeight: '600',
  },
  actionTextCompact: {
    fontSize: FontSizes.xs,
  },
  statusBadge: {
    paddingHorizontal: Spacing.sm,
    paddingVertical: 2,
    borderRadius: BorderRadius.sm,
  },
  statusText: {
    fontSize: FontSizes.xs,
    fontWeight: '600',
  },
  lockedBadge: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 4,
    paddingHorizontal: Spacing.sm,
    paddingVertical: 2,
    borderRadius: BorderRadius.sm,
    backgroundColor: Colors.error + '15',
    borderWidth: 1,
    borderColor: Colors.error + '30',
  },
  lockedText: {
    fontSize: FontSizes.xs,
    fontWeight: '600',
    color: Colors.error,
  },
});

export default TransitionActions;
