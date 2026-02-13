import { View, Text, StyleSheet, ScrollView, TouchableOpacity } from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';
import { Ionicons } from '@expo/vector-icons';

export default function Dashboard() {
  return (
    <SafeAreaView style={styles.container}>
      <ScrollView style={styles.scrollView}>
        <View style={styles.header}>
          <Text style={styles.title}>Construction Management</Text>
          <Text style={styles.subtitle}>Dashboard Overview</Text>
        </View>

        <View style={styles.content}>
          <ProjectCard />
          <ProjectCard />
        </View>
      </ScrollView>
    </SafeAreaView>
  );
}

function ProjectCard() {
  return (
    <View style={styles.card}>
      <View style={styles.cardHeader}>
        <Text style={styles.projectName}>City Tower Construction</Text>
        <Text style={styles.clientName}>ABC Developers</Text>
      </View>

      <View style={styles.section}>
        <Text style={styles.sectionLabel}>Financial Progress</Text>
        <View style={styles.progressBar}>
          <View style={[styles.progressFill, { width: '65%', backgroundColor: '#10B981' }]} />
        </View>
        <View style={styles.stats}>
          <View style={styles.stat}>
            <Text style={styles.statLabel}>Outstanding</Text>
            <Text style={styles.statValue}>₹2,50,000</Text>
          </View>
          <View style={styles.stat}>
            <Text style={styles.statLabel}>Retention</Text>
            <Text style={styles.statValue}>₹50,000</Text>
          </View>
        </View>
      </View>

      <View style={styles.section}>
        <Text style={styles.sectionLabel}>Physical Progress</Text>
        <View style={styles.progressBar}>
          <View style={[styles.progressFill, { width: '55%', backgroundColor: '#2563EB' }]} />
        </View>
        <View style={styles.delayIndicator}>
          <Ionicons name="alert-circle" size={16} color="#EF4444" />
          <Text style={styles.delayText}>Behind by 10%</Text>
        </View>
      </View>

      <View style={styles.badges}>
        <View style={styles.badge}>
          <Ionicons name="checkmark-circle" size={16} color="#10B981" />
          <Text style={styles.badgeText}>DPR Generated</Text>
        </View>
        <View style={styles.badge}>
          <Text style={styles.badgeText}>Petty Cash: ₹15,000</Text>
        </View>
      </View>

      <View style={styles.actions}>
        <TouchableOpacity style={styles.actionButton}>
          <Ionicons name="add-circle-outline" size={20} color="#2563EB" />
          <Text style={styles.actionText}>Quick Actions</Text>
        </TouchableOpacity>
      </View>
    </View>
  );
}

const styles = StyleSheet.create({
  container: {
    flex: 1,
    backgroundColor: '#F9FAFB',
  },
  scrollView: {
    flex: 1,
  },
  header: {
    padding: 24,
    backgroundColor: '#2563EB',
  },
  title: {
    fontSize: 24,
    fontWeight: 'bold',
    color: '#FFFFFF',
    marginBottom: 4,
  },
  subtitle: {
    fontSize: 16,
    color: '#E0E7FF',
  },
  content: {
    padding: 16,
  },
  card: {
    backgroundColor: '#FFFFFF',
    borderRadius: 12,
    padding: 16,
    marginBottom: 16,
    shadowColor: '#000',
    shadowOffset: { width: 0, height: 2 },
    shadowOpacity: 0.1,
    shadowRadius: 4,
    elevation: 3,
  },
  cardHeader: {
    marginBottom: 16,
  },
  projectName: {
    fontSize: 18,
    fontWeight: 'bold',
    color: '#111827',
    marginBottom: 4,
  },
  clientName: {
    fontSize: 14,
    color: '#6B7280',
  },
  section: {
    marginBottom: 16,
  },
  sectionLabel: {
    fontSize: 14,
    fontWeight: '600',
    color: '#374151',
    marginBottom: 8,
  },
  progressBar: {
    height: 8,
    backgroundColor: '#E5E7EB',
    borderRadius: 4,
    overflow: 'hidden',
    marginBottom: 12,
  },
  progressFill: {
    height: '100%',
    borderRadius: 4,
  },
  stats: {
    flexDirection: 'row',
    justifyContent: 'space-between',
  },
  stat: {
    flex: 1,
  },
  statLabel: {
    fontSize: 12,
    color: '#6B7280',
    marginBottom: 4,
  },
  statValue: {
    fontSize: 16,
    fontWeight: '600',
    color: '#111827',
  },
  delayIndicator: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 4,
  },
  delayText: {
    fontSize: 14,
    color: '#EF4444',
    fontWeight: '500',
  },
  badges: {
    flexDirection: 'row',
    gap: 8,
    marginBottom: 12,
  },
  badge: {
    flexDirection: 'row',
    alignItems: 'center',
    backgroundColor: '#F3F4F6',
    paddingHorizontal: 12,
    paddingVertical: 6,
    borderRadius: 16,
    gap: 4,
  },
  badgeText: {
    fontSize: 12,
    color: '#374151',
  },
  actions: {
    borderTopWidth: 1,
    borderTopColor: '#E5E7EB',
    paddingTop: 12,
  },
  actionButton: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'center',
    gap: 8,
    padding: 8,
  },
  actionText: {
    fontSize: 14,
    color: '#2563EB',
    fontWeight: '600',
  },
});
