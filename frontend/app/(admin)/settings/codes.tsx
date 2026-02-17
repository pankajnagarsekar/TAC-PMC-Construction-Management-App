// ACTIVITY CODES SCREEN
// View and manage activity codes with CRUD
import React, { useState, useEffect, useCallback } from 'react';
import {
  View,
  Text,
  StyleSheet,
  FlatList,
  RefreshControl,
  Pressable,
  ActivityIndicator,
  Modal,
  TextInput,
  Switch,
  Alert,
  Platform,
  ScrollView,
} from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';
import { Ionicons } from '@expo/vector-icons';
import { codesApi } from '../../../services/apiClient';
import { Colors, Spacing, FontSizes, BorderRadius } from '../../../constants/theme';
import ScreenHeader from '../../../components/ScreenHeader';

const BASE_URL = process.env.EXPO_PUBLIC_BACKEND_URL || '';

const getToken = async () => {
  if (Platform.OS === 'web') return localStorage.getItem('access_token');
  const SecureStore = require('expo-secure-store');
  return await SecureStore.getItemAsync('access_token');
};

const apiRequest = async (endpoint: string, options: RequestInit = {}) => {
  const token = await getToken();
  const response = await fetch(`${BASE_URL}${endpoint}`, {
    ...options,
    headers: {
      'Content-Type': 'application/json',
      ...(token ? { 'Authorization': `Bearer ${token}` } : {}),
    },
  });
  if (!response.ok) {
    const error = await response.json().catch(() => ({ detail: 'Request failed' }));
    throw new Error(error.detail || 'Request failed');
  }
  if (response.status === 204) return null;
  return response.json();
};

const showAlert = (title: string, message: string) => {
  if (Platform.OS === 'web') window.alert(`${title}: ${message}`);
  else Alert.alert(title, message);
};

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
  const [modalVisible, setModalVisible] = useState(false);
  const [saving, setSaving] = useState(false);
  const [editingCode, setEditingCode] = useState<Code | null>(null);

  // Form state
  const [codeShort, setCodeShort] = useState('');
  const [codeName, setCodeName] = useState('');
  const [activeStatus, setActiveStatus] = useState(true);

  const loadCodes = useCallback(async () => {
    try {
      const data = await codesApi.getAll(false);
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

  const resetForm = () => {
    setCodeShort('');
    setCodeName('');
    setActiveStatus(true);
    setEditingCode(null);
  };

  const openCreateModal = () => {
    resetForm();
    setModalVisible(true);
  };

  const openEditModal = (code: Code) => {
    setEditingCode(code);
    setCodeShort(code.code_short);
    setCodeName(code.code_name);
    setActiveStatus(code.active_status);
    setModalVisible(true);
  };

  const handleSave = async () => {
    if (!codeShort.trim() || !codeName.trim()) {
      showAlert('Validation Error', 'Code and Name are required');
      return;
    }

    setSaving(true);
    try {
      const payload = {
        code_short: codeShort.trim().toUpperCase(),
        code_name: codeName.trim(),
        active_status: activeStatus,
      };

      if (editingCode) {
        await apiRequest(`/api/codes/${editingCode.code_id || editingCode._id}`, {
          method: 'PUT',
          body: JSON.stringify(payload),
        });
        showAlert('Success', 'Activity code updated');
      } else {
        await apiRequest('/api/codes', {
          method: 'POST',
          body: JSON.stringify(payload),
        });
        showAlert('Success', 'Activity code created');
      }

      setModalVisible(false);
      resetForm();
      loadCodes();
    } catch (error: any) {
      showAlert('Error', error.message || 'Failed to save code');
    } finally {
      setSaving(false);
    }
  };

  const handleDelete = (code: Code) => {
    const doDelete = async () => {
      try {
        await apiRequest(`/api/codes/${code.code_id || code._id}`, { method: 'DELETE' });
        showAlert('Success', 'Activity code deleted');
        loadCodes();
      } catch (error: any) {
        showAlert('Error', error.message);
      }
    };

    if (Platform.OS === 'web') {
      if (window.confirm(`Delete "${code.code_name}"?`)) doDelete();
    } else {
      Alert.alert('Delete Code', `Delete "${code.code_name}"?`, [
        { text: 'Cancel', style: 'cancel' },
        { text: 'Delete', onPress: doDelete, style: 'destructive' },
      ]);
    }
  };

  const codeColors = ['#FF6B6B', '#4ECDC4', '#45B7D1', '#96CEB4', '#FFEAA7', '#DDA0DD', '#98D8C8'];

  const renderCode = ({ item, index }: { item: Code; index: number }) => (
    <View style={styles.codeCard}>
      <View style={[styles.codeIcon, { backgroundColor: codeColors[index % codeColors.length] }]}>
        <Text style={styles.codeIconText}>{item.code_short}</Text>
      </View>
      <View style={styles.codeInfo}>
        <Text style={styles.codeName}>{item.code_name}</Text>
        <Text style={styles.codeShort}>Code: {item.code_short}</Text>
      </View>
      <View style={[styles.statusBadge, { backgroundColor: item.active_status ? Colors.success + '20' : Colors.error + '20' }]}>
        <Text style={[styles.statusText, { color: item.active_status ? Colors.success : Colors.error }]}>
          {item.active_status ? 'Active' : 'Inactive'}
        </Text>
      </View>
      <View style={styles.actionButtons}>
        <Pressable style={styles.actionBtn} onPress={() => openEditModal(item)}>
          <Ionicons name="create-outline" size={20} color={Colors.primary} />
        </Pressable>
        <Pressable style={styles.actionBtn} onPress={() => handleDelete(item)}>
          <Ionicons name="trash-outline" size={20} color={Colors.error} />
        </Pressable>
      </View>
    </View>
  );

  if (loading) {
    return (
      <SafeAreaView style={styles.container}>
        <ScreenHeader title="Activity Codes" />
        <View style={styles.loadingContainer}>
          <ActivityIndicator size="large" color={Colors.primary} />
        </View>
      </SafeAreaView>
    );
  }

  return (
    <SafeAreaView style={styles.container} edges={['left', 'right']}>
      <ScreenHeader title="Activity Codes" />

      <FlatList
        data={codes}
        renderItem={renderCode}
        keyExtractor={(item) => item.code_id || item._id || item.code_short}
        contentContainerStyle={styles.listContent}
        refreshControl={<RefreshControl refreshing={refreshing} onRefresh={() => { setRefreshing(true); loadCodes(); }} />}
        ListHeaderComponent={
          <View style={styles.statsCard}>
            <Text style={styles.statsText}>{codes.length} codes • {codes.filter(c => c.active_status).length} active</Text>
          </View>
        }
        ListEmptyComponent={
          <View style={styles.emptyContainer}>
            <Ionicons name="pricetags-outline" size={48} color={Colors.textMuted} />
            <Text style={styles.emptyText}>No activity codes</Text>
          </View>
        }
      />

      <Pressable style={styles.fab} onPress={openCreateModal}>
        <Ionicons name="add" size={28} color={Colors.white} />
      </Pressable>

      <Modal visible={modalVisible} animationType="slide" transparent>
        <View style={styles.modalOverlay}>
          <View style={styles.modalContent}>
            <View style={styles.modalHeader}>
              <Text style={styles.modalTitle}>{editingCode ? 'Edit Code' : 'Add Code'}</Text>
              <Pressable onPress={() => setModalVisible(false)}>
                <Ionicons name="close" size={24} color={Colors.text} />
              </Pressable>
            </View>

            <ScrollView style={styles.modalBody}>
              <View style={styles.inputGroup}>
                <Text style={styles.inputLabel}>Code (Short) *</Text>
                <TextInput
                  style={styles.input}
                  value={codeShort}
                  onChangeText={(t) => setCodeShort(t.toUpperCase())}
                  placeholder="e.g., CIVIL"
                  autoCapitalize="characters"
                  maxLength={10}
                  placeholderTextColor={Colors.textMuted}
                />
              </View>

              <View style={styles.inputGroup}>
                <Text style={styles.inputLabel}>Name *</Text>
                <TextInput
                  style={styles.input}
                  value={codeName}
                  onChangeText={setCodeName}
                  placeholder="e.g., Civil Works"
                  placeholderTextColor={Colors.textMuted}
                />
              </View>

              <View style={styles.toggleRow}>
                <Text style={styles.inputLabel}>Active Status</Text>
                <Switch
                  value={activeStatus}
                  onValueChange={setActiveStatus}
                  trackColor={{ false: Colors.border, true: Colors.primary }}
                />
              </View>
            </ScrollView>

            <View style={styles.modalFooter}>
              <Pressable style={styles.cancelButton} onPress={() => setModalVisible(false)}>
                <Text style={styles.cancelButtonText}>Cancel</Text>
              </Pressable>
              <Pressable style={[styles.saveButton, saving && styles.saveButtonDisabled]} onPress={handleSave} disabled={saving}>
                {saving ? <ActivityIndicator size="small" color={Colors.white} /> : <Text style={styles.saveButtonText}>Save</Text>}
              </Pressable>
            </View>
          </View>
        </View>
      </Modal>
    </SafeAreaView>
  );
}

const styles = StyleSheet.create({
  container: { flex: 1, backgroundColor: Colors.background },
  loadingContainer: { flex: 1, justifyContent: 'center', alignItems: 'center' },
  listContent: { padding: Spacing.md },
  statsCard: { backgroundColor: Colors.white, borderRadius: BorderRadius.md, padding: Spacing.md, marginBottom: Spacing.md, alignItems: 'center' },
  statsText: { fontSize: FontSizes.sm, color: Colors.textSecondary },
  codeCard: {
    flexDirection: 'row',
    alignItems: 'center',
    backgroundColor: Colors.white,
    borderRadius: BorderRadius.lg,
    padding: Spacing.md,
    marginBottom: Spacing.sm,
  },
  codeIcon: { width: 44, height: 44, borderRadius: BorderRadius.md, justifyContent: 'center', alignItems: 'center', marginRight: Spacing.md },
  codeIconText: { fontSize: FontSizes.sm, fontWeight: 'bold', color: Colors.white },
  codeInfo: { flex: 1 },
  codeName: { fontSize: FontSizes.md, fontWeight: '600', color: Colors.text },
  codeShort: { fontSize: FontSizes.sm, color: Colors.textSecondary },
  statusBadge: { paddingHorizontal: Spacing.sm, paddingVertical: 4, borderRadius: BorderRadius.sm, marginRight: Spacing.sm },
  statusText: { fontSize: FontSizes.xs, fontWeight: '600' },
  actionButtons: { flexDirection: 'row', gap: Spacing.xs },
  actionBtn: { padding: Spacing.xs },
  emptyContainer: { alignItems: 'center', padding: Spacing.xl },
  emptyText: { fontSize: FontSizes.md, color: Colors.textMuted, marginTop: Spacing.md },
  fab: { position: 'absolute', right: Spacing.lg, bottom: Spacing.lg, width: 56, height: 56, borderRadius: 28, backgroundColor: Colors.accent, justifyContent: 'center', alignItems: 'center', elevation: 5 },
  modalOverlay: { flex: 1, backgroundColor: 'rgba(0,0,0,0.5)', justifyContent: 'flex-end' },
  modalContent: { backgroundColor: Colors.white, borderTopLeftRadius: BorderRadius.xl, borderTopRightRadius: BorderRadius.xl },
  modalHeader: { flexDirection: 'row', justifyContent: 'space-between', alignItems: 'center', padding: Spacing.md, borderBottomWidth: 1, borderBottomColor: Colors.border },
  modalTitle: { fontSize: FontSizes.lg, fontWeight: '600', color: Colors.text },
  modalBody: { padding: Spacing.md },
  inputGroup: { marginBottom: Spacing.md },
  inputLabel: { fontSize: FontSizes.sm, fontWeight: '600', color: Colors.text, marginBottom: Spacing.xs },
  input: { backgroundColor: Colors.background, borderWidth: 1, borderColor: Colors.border, borderRadius: BorderRadius.md, paddingHorizontal: Spacing.md, paddingVertical: Spacing.sm, fontSize: FontSizes.md, color: Colors.text },
  toggleRow: { flexDirection: 'row', justifyContent: 'space-between', alignItems: 'center', paddingVertical: Spacing.sm },
  modalFooter: { flexDirection: 'row', justifyContent: 'flex-end', gap: Spacing.md, padding: Spacing.md, borderTopWidth: 1, borderTopColor: Colors.border },
  cancelButton: { paddingHorizontal: Spacing.lg, paddingVertical: Spacing.sm },
  cancelButtonText: { fontSize: FontSizes.md, color: Colors.textSecondary },
  saveButton: { backgroundColor: Colors.primary, paddingHorizontal: Spacing.xl, paddingVertical: Spacing.sm, borderRadius: BorderRadius.md },
  saveButtonDisabled: { opacity: 0.6 },
  saveButtonText: { fontSize: FontSizes.md, color: Colors.white, fontWeight: '600' },
});
