// USER MANAGEMENT SCREEN
// View and manage users with real data

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
import { usersApi } from '../../../services/apiClient';
import { Colors, Spacing, FontSizes, BorderRadius } from '../../../constants/theme';

interface User {
  user_id?: string;
  _id?: string;
  name: string;
  email: string;
  role: string;
  active_status: boolean;
  dpr_generation_permission?: boolean;
}

export default function UserManagementScreen() {
  const [users, setUsers] = useState<User[]>([]);
  const [loading, setLoading] = useState(true);
  const [refreshing, setRefreshing] = useState(false);

  const loadUsers = useCallback(async () => {
    try {
      const data = await usersApi.getAll();
      setUsers(data || []);
    } catch (error) {
      console.error('Error loading users:', error);
    } finally {
      setLoading(false);
      setRefreshing(false);
    }
  }, []);

  useEffect(() => {
    loadUsers();
  }, [loadUsers]);

  const onRefresh = () => {
    setRefreshing(true);
    loadUsers();
  };

  const getRoleColor = (role: string) => {
    switch (role?.toLowerCase()) {
      case 'admin': return Colors.primary;
      case 'supervisor': return Colors.success;
      default: return Colors.textMuted;
    }
  };

  const renderUser = ({ item }: { item: User }) => (
    <Pressable
      style={({ pressed }) => [styles.userCard, pressed && styles.userCardPressed]}
      onPress={() => console.log('Edit user:', item.email)}
    >
      <View style={styles.avatarContainer}>
        <View style={[styles.avatar, { backgroundColor: getRoleColor(item.role) }]}>
          <Text style={styles.avatarText}>{item.name?.charAt(0).toUpperCase()}</Text>
        </View>
        <View style={[styles.statusDot, { backgroundColor: item.active_status ? Colors.success : Colors.error }]} />
      </View>
      <View style={styles.userInfo}>
        <Text style={styles.userName}>{item.name}</Text>
        <Text style={styles.userEmail}>{item.email}</Text>
        <View style={styles.userMeta}>
          <View style={[styles.roleBadge, { backgroundColor: getRoleColor(item.role) + '20' }]}>
            <Text style={[styles.roleText, { color: getRoleColor(item.role) }]}>{item.role}</Text>
          </View>
          {item.dpr_generation_permission && (
            <View style={styles.permissionBadge}>
              <Ionicons name="document-text" size={12} color={Colors.accent} />
              <Text style={styles.permissionText}>DPR</Text>
            </View>
          )}
        </View>
      </View>
      <Ionicons name="chevron-forward" size={20} color={Colors.textMuted} />
    </Pressable>
  );

  if (loading) {
    return (
      <SafeAreaView style={styles.container}>
        <View style={styles.loadingContainer}>
          <ActivityIndicator size="large" color={Colors.primary} />
          <Text style={styles.loadingText}>Loading users...</Text>
        </View>
      </SafeAreaView>
    );
  }

  return (
    <SafeAreaView style={styles.container} edges={['left', 'right']}>
      {/* Summary */}
      <View style={styles.summaryRow}>
        <View style={styles.summaryItem}>
          <Text style={styles.summaryValue}>{users.length}</Text>
          <Text style={styles.summaryLabel}>Total Users</Text>
        </View>
        <View style={styles.summaryItem}>
          <Text style={styles.summaryValue}>{users.filter(u => u.role === 'Admin').length}</Text>
          <Text style={styles.summaryLabel}>Admins</Text>
        </View>
        <View style={styles.summaryItem}>
          <Text style={styles.summaryValue}>{users.filter(u => u.role === 'Supervisor').length}</Text>
          <Text style={styles.summaryLabel}>Supervisors</Text>
        </View>
      </View>

      <FlatList
        data={users}
        renderItem={renderUser}
        keyExtractor={(item) => item.user_id || item._id || item.email}
        contentContainerStyle={styles.listContent}
        refreshControl={<RefreshControl refreshing={refreshing} onRefresh={onRefresh} />}
        ListEmptyComponent={
          <View style={styles.emptyContainer}>
            <Ionicons name="people-outline" size={48} color={Colors.textMuted} />
            <Text style={styles.emptyText}>No users found</Text>
          </View>
        }
      />
    </SafeAreaView>
  );
}

const styles = StyleSheet.create({
  container: { flex: 1, backgroundColor: Colors.background },
  loadingContainer: { flex: 1, justifyContent: 'center', alignItems: 'center' },
  loadingText: { marginTop: Spacing.md, fontSize: FontSizes.md, color: Colors.textSecondary },
  summaryRow: {
    flexDirection: 'row',
    backgroundColor: Colors.white,
    margin: Spacing.md,
    borderRadius: BorderRadius.lg,
    padding: Spacing.md,
  },
  summaryItem: { flex: 1, alignItems: 'center' },
  summaryValue: { fontSize: FontSizes.xl, fontWeight: 'bold', color: Colors.primary },
  summaryLabel: { fontSize: FontSizes.sm, color: Colors.textSecondary },
  listContent: { padding: Spacing.md, paddingTop: 0 },
  userCard: {
    flexDirection: 'row',
    alignItems: 'center',
    backgroundColor: Colors.white,
    borderRadius: BorderRadius.lg,
    padding: Spacing.md,
    marginBottom: Spacing.sm,
  },
  userCardPressed: { opacity: 0.7 },
  avatarContainer: { position: 'relative', marginRight: Spacing.md },
  avatar: {
    width: 48,
    height: 48,
    borderRadius: 24,
    justifyContent: 'center',
    alignItems: 'center',
  },
  avatarText: { fontSize: FontSizes.lg, fontWeight: 'bold', color: Colors.white },
  statusDot: {
    position: 'absolute',
    bottom: 0,
    right: 0,
    width: 14,
    height: 14,
    borderRadius: 7,
    borderWidth: 2,
    borderColor: Colors.white,
  },
  userInfo: { flex: 1 },
  userName: { fontSize: FontSizes.md, fontWeight: '600', color: Colors.text },
  userEmail: { fontSize: FontSizes.sm, color: Colors.textSecondary },
  userMeta: { flexDirection: 'row', marginTop: Spacing.xs, gap: Spacing.xs },
  roleBadge: { paddingHorizontal: Spacing.sm, paddingVertical: 2, borderRadius: BorderRadius.sm },
  roleText: { fontSize: FontSizes.xs, fontWeight: '600' },
  permissionBadge: {
    flexDirection: 'row',
    alignItems: 'center',
    backgroundColor: Colors.accent + '20',
    paddingHorizontal: Spacing.sm,
    paddingVertical: 2,
    borderRadius: BorderRadius.sm,
    gap: 2,
  },
  permissionText: { fontSize: FontSizes.xs, color: Colors.accent, fontWeight: '600' },
  emptyContainer: { alignItems: 'center', padding: Spacing.xl },
  emptyText: { fontSize: FontSizes.md, color: Colors.textMuted, marginTop: Spacing.md },
});
