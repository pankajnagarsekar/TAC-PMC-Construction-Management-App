// SUPERVISOR ISSUES SCREEN
// Issue logging and tracking

import React from 'react';
import { View, Text, StyleSheet, FlatList, TouchableOpacity } from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';
import { Ionicons } from '@expo/vector-icons';
import { Card } from '../../components/ui';
import { Colors, Spacing, FontSizes, BorderRadius } from '../../constants/theme';

const mockIssues = [
  {
    id: '1',
    title: 'Material shortage at site',
    description: 'Steel reinforcement bars not delivered as scheduled',
    status: 'Open',
    priority: 'high',
    createdAt: '2 hours ago',
  },
  {
    id: '2',
    title: 'Equipment malfunction',
    description: 'Concrete mixer showing irregular behavior',
    status: 'In Progress',
    priority: 'medium',
    createdAt: '1 day ago',
  },
  {
    id: '3',
    title: 'Safety concern - Area B',
    description: 'Temporary fencing needs repair',
    status: 'Resolved',
    priority: 'low',
    createdAt: '3 days ago',
  },
];

export default function SupervisorIssues() {
  const renderIssue = ({ item }: { item: typeof mockIssues[0] }) => (
    <IssueCard issue={item} />
  );

  return (
    <SafeAreaView style={styles.container} edges={['left', 'right']}>
      <FlatList
        data={mockIssues}
        renderItem={renderIssue}
        keyExtractor={(item) => item.id}
        contentContainerStyle={styles.listContent}
        ListHeaderComponent={
          <View style={styles.header}>
            <View style={styles.filterRow}>
              <TouchableOpacity style={[styles.filterChip, styles.filterChipActive]}>
                <Text style={[styles.filterText, styles.filterTextActive]}>All</Text>
              </TouchableOpacity>
              <TouchableOpacity style={styles.filterChip}>
                <Text style={styles.filterText}>Open</Text>
              </TouchableOpacity>
              <TouchableOpacity style={styles.filterChip}>
                <Text style={styles.filterText}>In Progress</Text>
              </TouchableOpacity>
              <TouchableOpacity style={styles.filterChip}>
                <Text style={styles.filterText}>Resolved</Text>
              </TouchableOpacity>
            </View>
          </View>
        }
        ListEmptyComponent={
          <View style={styles.emptyState}>
            <Ionicons name="checkmark-circle" size={64} color={Colors.success} />
            <Text style={styles.emptyTitle}>No Issues</Text>
            <Text style={styles.emptySubtitle}>All clear! No issues reported.</Text>
          </View>
        }
      />

      <TouchableOpacity style={styles.fab}>
        <Ionicons name="add" size={28} color={Colors.white} />
      </TouchableOpacity>
    </SafeAreaView>
  );
}

function IssueCard({ issue }: { issue: typeof mockIssues[0] }) {
  const statusColors = {
    'Open': Colors.error,
    'In Progress': Colors.warning,
    'Resolved': Colors.success,
  };
  
  const priorityColors = {
    high: Colors.error,
    medium: Colors.warning,
    low: Colors.info,
  };

  return (
    <Card style={styles.issueCard} onPress={() => {}}>
      <View style={styles.issueHeader}>
        <View style={[styles.priorityIndicator, { backgroundColor: priorityColors[issue.priority as keyof typeof priorityColors] }]} />
        <View style={styles.issueContent}>
          <Text style={styles.issueTitle}>{issue.title}</Text>
          <Text style={styles.issueDescription} numberOfLines={2}>
            {issue.description}
          </Text>
        </View>
      </View>

      <View style={styles.issueFooter}>
        <View style={[styles.statusBadge, { backgroundColor: statusColors[issue.status as keyof typeof statusColors] + '20' }]}>
          <Text style={[styles.statusText, { color: statusColors[issue.status as keyof typeof statusColors] }]}>
            {issue.status}
          </Text>
        </View>
        <Text style={styles.timeText}>{issue.createdAt}</Text>
      </View>
    </Card>
  );
}

const styles = StyleSheet.create({
  container: {
    flex: 1,
    backgroundColor: Colors.background,
  },
  listContent: {
    padding: Spacing.md,
  },
  header: {
    marginBottom: Spacing.md,
  },
  filterRow: {
    flexDirection: 'row',
    gap: Spacing.sm,
  },
  filterChip: {
    paddingHorizontal: Spacing.md,
    paddingVertical: Spacing.sm,
    borderRadius: BorderRadius.full,
    backgroundColor: Colors.white,
    borderWidth: 1,
    borderColor: Colors.border,
  },
  filterChipActive: {
    backgroundColor: Colors.primary,
    borderColor: Colors.primary,
  },
  filterText: {
    fontSize: FontSizes.sm,
    color: Colors.textSecondary,
  },
  filterTextActive: {
    color: Colors.white,
    fontWeight: '500',
  },
  issueCard: {
    marginBottom: Spacing.sm,
  },
  issueHeader: {
    flexDirection: 'row',
  },
  priorityIndicator: {
    width: 4,
    borderRadius: 2,
    marginRight: Spacing.md,
  },
  issueContent: {
    flex: 1,
  },
  issueTitle: {
    fontSize: FontSizes.md,
    fontWeight: '600',
    color: Colors.text,
    marginBottom: Spacing.xs,
  },
  issueDescription: {
    fontSize: FontSizes.sm,
    color: Colors.textSecondary,
    lineHeight: 20,
  },
  issueFooter: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    marginTop: Spacing.md,
    paddingTop: Spacing.md,
    borderTopWidth: 1,
    borderTopColor: Colors.border,
  },
  statusBadge: {
    paddingHorizontal: Spacing.sm,
    paddingVertical: Spacing.xs,
    borderRadius: BorderRadius.sm,
  },
  statusText: {
    fontSize: FontSizes.xs,
    fontWeight: '600',
  },
  timeText: {
    fontSize: FontSizes.xs,
    color: Colors.textMuted,
  },
  emptyState: {
    flex: 1,
    justifyContent: 'center',
    alignItems: 'center',
    paddingVertical: Spacing.xxl * 2,
  },
  emptyTitle: {
    fontSize: FontSizes.xl,
    fontWeight: '600',
    color: Colors.text,
    marginTop: Spacing.md,
  },
  emptySubtitle: {
    fontSize: FontSizes.md,
    color: Colors.textSecondary,
    marginTop: Spacing.xs,
  },
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
    shadowColor: Colors.accent,
    shadowOffset: { width: 0, height: 4 },
    shadowOpacity: 0.3,
    shadowRadius: 8,
    elevation: 5,
  },
});
