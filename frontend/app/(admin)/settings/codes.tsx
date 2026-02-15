// ACTIVITY CODES SCREEN
// View and manage activity codes with real data

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
import { codesApi } from '../../../services/apiClient';
import { Colors, Spacing, FontSizes, BorderRadius } from '../../../constants/theme';

interface Code {
  code_id?: string;
  _id?: string;
  code_short: string;
  code_name: string;
  active_status: boolean;
}

export default function ActivityCodesScreen() {
  const [codes, setCodes] = useState<Code[]>([]);
  const [loading, setLoading] = useState(true);
  const [refreshing, setRefreshing] = useState(false);

  const loadCodes = useCallback(async () => {
    try {
      const data = await codesApi.getAll();
      setCodes(data || []);
    } catch (error) {
      console.error('Error loading codes:', error);
    } finally {
      setLoading(false);
      setRefreshing(false);
    }
  }, []);

  useEffect(() => {
    loadCodes();
  }, [loadCodes]);

  const onRefresh = () => {
    setRefreshing(true);
    loadCodes();
  };

  const codeColors = ['#FF6B6B', '#4ECDC4', '#45B7D1', '#96CEB4', '#FFEAA7', '#DDA0DD', '#98D8C8'];

  const renderCode = ({ item, index }: { item: Code; index: number }) => (
    <Pressable
      style={({ pressed }) => [styles.codeCard, pressed && styles.codeCardPressed]}
      onPress={() => console.log('Edit code:', item.code_short)}
    >
      <View style={[styles.codeIcon, { backgroundColor: codeColors[index % codeColors.length] }]}>
        <Text style={styles.codeIconText}>{item.code_short}</Text>
      </View>
      <View style={styles.codeInfo}>
        <Text style={styles.codeName}>{item.code_name}</Text>
        <Text style={styles.codeShort}>Code: {item.code_short}</Text>
      </View>
      <View style={[styles.statusBadge, { backgroundColor: item.active_status ? Colors.success + '20' : Colors.error + '20' }]}>
        <View style={[styles.statusDot, { backgroundColor: item.active_status ? Colors.success : Colors.error }]} />
        <Text style={[styles.statusText, { color: item.active_status ? Colors.success : Colors.error }]}>
          {item.active_status ? 'Active' : 'Inactive'}
        </Text>
      </View>
    </Pressable>
  );

  if (loading) {
    return (
      <SafeAreaView style={styles.container}>
        <View style={styles.loadingContainer}>
          <ActivityIndicator size="large" color={Colors.primary} />
          <Text style={styles.loadingText}>Loading activity codes...</Text>
        </View>
      </SafeAreaView>
    );
  }

  return (
    <SafeAreaView style={styles.container} edges={['left', 'right']}>
      {/* Header */}
      <View style={styles.header}>
        <Ionicons name="pricetags" size={24} color={Colors.primary} />
        <Text style={styles.headerTitle}>Activity Codes</Text>
        <Text style={styles.headerSubtitle}>{codes.length} codes configured</Text>
      </View>

      <FlatList
        data={codes}
        renderItem={renderCode}
        keyExtractor={(item) => item.code_id || item._id || item.code_short}
        contentContainerStyle={styles.listContent}
        refreshControl={<RefreshControl refreshing={refreshing} onRefresh={onRefresh} />}
        ListEmptyComponent={
          <View style={styles.emptyContainer}>
            <Ionicons name="pricetags-outline" size={48} color={Colors.textMuted} />
            <Text style={styles.emptyText}>No activity codes found</Text>
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
  header: {
    backgroundColor: Colors.white,
    padding: Spacing.lg,
    margin: Spacing.md,
    borderRadius: BorderRadius.lg,
    alignItems: 'center',
  },
  headerTitle: { fontSize: FontSizes.xl, fontWeight: '600', color: Colors.text, marginTop: Spacing.sm },
  headerSubtitle: { fontSize: FontSizes.sm, color: Colors.textSecondary },
  listContent: { padding: Spacing.md, paddingTop: 0 },
  codeCard: {
    flexDirection: 'row',
    alignItems: 'center',
    backgroundColor: Colors.white,
    borderRadius: BorderRadius.lg,
    padding: Spacing.md,
    marginBottom: Spacing.sm,
  },
  codeCardPressed: { opacity: 0.7 },
  codeIcon: {
    width: 48,
    height: 48,
    borderRadius: BorderRadius.md,
    justifyContent: 'center',
    alignItems: 'center',
    marginRight: Spacing.md,
  },
  codeIconText: { fontSize: FontSizes.md, fontWeight: 'bold', color: Colors.white },
  codeInfo: { flex: 1 },
  codeName: { fontSize: FontSizes.md, fontWeight: '600', color: Colors.text },
  codeShort: { fontSize: FontSizes.sm, color: Colors.textSecondary },
  statusBadge: {
    flexDirection: 'row',
    alignItems: 'center',
    paddingHorizontal: Spacing.sm,
    paddingVertical: Spacing.xs,
    borderRadius: BorderRadius.full,
    gap: 4,
  },
  statusDot: { width: 6, height: 6, borderRadius: 3 },
  statusText: { fontSize: FontSizes.xs, fontWeight: '600' },
  emptyContainer: { alignItems: 'center', padding: Spacing.xl },
  emptyText: { fontSize: FontSizes.md, color: Colors.textMuted, marginTop: Spacing.md },
});
