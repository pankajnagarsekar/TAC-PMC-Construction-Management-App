// PETTY CASH SCREEN
// Manage petty cash expenses and reimbursements
import React, { useState, useEffect, useCallback } from 'react';
import {
  View,
  Text,
  StyleSheet,
  FlatList,
  RefreshControl,
  Pressable,
  ActivityIndicator,
  TextInput,
  Modal,
  Alert,
  Platform,
  ScrollView,
} from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';
import { Ionicons } from '@expo/vector-icons';
import { Picker } from '@react-native-picker/picker';
import { projectsApi } from '../../services/apiClient';
import { Colors, Spacing, FontSizes, BorderRadius } from '../../constants/theme';
import ScreenHeader from '../../components/ScreenHeader';

const BASE_URL = process.env.EXPO_PUBLIC_BACKEND_URL || '';

const getToken = async () => {
  if (Platform.OS === 'web') {
    return localStorage.getItem('access_token');
  }
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
      ...options.headers,
    },
  });
  if (!response.ok) {
    const error = await response.json().catch(() => ({ detail: 'Request failed' }));
    throw new Error(error.detail || 'Request failed');
  }
  return response.json();
};

const showAlert = (title: string, message: string) => {
  if (Platform.OS === 'web') {
    window.alert(`${title}: ${message}`);
  } else {
    Alert.alert(title, message);
  }
};

interface PettyCashEntry {
  petty_cash_id: string;
  project_id: string;
  date: string;
  description: string;
  amount: number;
  type: string;
  category: string;
  status: string;
}

const CATEGORIES = ['general', 'travel', 'supplies', 'food', 'transport', 'miscellaneous'];

export default function PettyCashScreen() {
  const [entries, setEntries] = useState<PettyCashEntry[]>([]);
  const [projects, setProjects] = useState<any[]>([]);
  const [loading, setLoading] = useState(true);
  const [refreshing, setRefreshing] = useState(false);
  const [modalVisible, setModalVisible] = useState(false);
  const [saving, setSaving] = useState(false);
  const [editingEntry, setEditingEntry] = useState<PettyCashEntry | null>(null);

  // Form state
  const [projectId, setProjectId] = useState('');
  const [description, setDescription] = useState('');
  const [amount, setAmount] = useState('');
  const [type, setType] = useState('expense');
  const [category, setCategory] = useState('general');

  const loadData = useCallback(async () => {
    try {
      const [entriesData, projectsData] = await Promise.all([
        apiRequest('/api/petty-cash'),
        projectsApi.getAll()
      ]);
      setEntries(entriesData || []);
      setProjects(projectsData || []);
    } catch (error) {
      console.error('Error loading data:', error);
    } finally {
      setLoading(false);
      setRefreshing(false);
    }
  }, []);

  useEffect(() => {
    loadData();
  }, [loadData]);

  const resetForm = () => {
    setProjectId(projects[0]?.project_id || '');
    setDescription('');
    setAmount('');
    setType('expense');
    setCategory('general');
    setEditingEntry(null);
  };

  const openCreateModal = () => {
    resetForm();
    setModalVisible(true);
  };

  const openEditModal = (entry: PettyCashEntry) => {
    setEditingEntry(entry);
    setProjectId(entry.project_id);
    setDescription(entry.description);
    setAmount(entry.amount.toString());
    setType(entry.type);
    setCategory(entry.category);
    setModalVisible(true);
  };

  const handleSave = async () => {
    if (!projectId || !description.trim() || !amount) {
      showAlert('Validation Error', 'Please fill all required fields');
      return;
    }

    setSaving(true);
    try {
      const payload = {
        project_id: projectId,
        date: new Date().toISOString(),
        description: description.trim(),
        amount: parseFloat(amount),
        type,
        category,
      };

      if (editingEntry) {
        await apiRequest(`/api/petty-cash/${editingEntry.petty_cash_id}`, {
          method: 'PUT',
          body: JSON.stringify(payload)
        });
        showAlert('Success', 'Entry updated successfully');
      } else {
        await apiRequest('/api/petty-cash', {
          method: 'POST',
          body: JSON.stringify(payload)
        });
        showAlert('Success', 'Entry created successfully');
      }

      setModalVisible(false);
      resetForm();
      loadData();
    } catch (error: any) {
      showAlert('Error', error.message || 'Failed to save entry');
    } finally {
      setSaving(false);
    }
  };

  const handleDelete = async (entry: PettyCashEntry) => {
    const confirm = Platform.OS === 'web' 
      ? window.confirm('Delete this entry?')
      : await new Promise(resolve => Alert.alert('Delete', 'Delete this entry?', [
          { text: 'Cancel', onPress: () => resolve(false) },
          { text: 'Delete', onPress: () => resolve(true), style: 'destructive' }
        ]));
    
    if (confirm) {
      try {
        await apiRequest(`/api/petty-cash/${entry.petty_cash_id}`, { method: 'DELETE' });
        showAlert('Success', 'Entry deleted');
        loadData();
      } catch (error: any) {
        showAlert('Error', error.message);
      }
    }
  };

  const handleApprove = async (entry: PettyCashEntry) => {
    try {
      await apiRequest(`/api/petty-cash/${entry.petty_cash_id}/approve`, { method: 'POST' });
      showAlert('Success', 'Entry approved');
      loadData();
    } catch (error: any) {
      showAlert('Error', error.message);
    }
  };

  const getStatusColor = (status: string) => {
    switch (status) {
      case 'approved': return Colors.success;
      case 'rejected': return Colors.error;
      default: return Colors.warning;
    }
  };

  const getProjectName = (pid: string) => {
    return projects.find(p => p.project_id === pid)?.project_name || 'Unknown';
  };

  const renderEntry = ({ item }: { item: PettyCashEntry }) => (
    <View style={styles.entryCard}>
      <View style={styles.entryHeader}>
        <View style={styles.entryInfo}>
          <Text style={styles.entryDescription}>{item.description}</Text>
          <Text style={styles.entryProject}>{getProjectName(item.project_id)}</Text>
        </View>
        <View style={{ alignItems: 'flex-end' }}>
          <Text style={[styles.entryAmount, item.type === 'expense' ? styles.expense : styles.reimbursement]}>
            {item.type === 'expense' ? '-' : '+'}₹{item.amount.toLocaleString()}
          </Text>
          <View style={[styles.statusBadge, { backgroundColor: getStatusColor(item.status) + '20' }]}>
            <Text style={[styles.statusText, { color: getStatusColor(item.status) }]}>{item.status}</Text>
          </View>
        </View>
      </View>
      <View style={styles.entryMeta}>
        <Text style={styles.metaText}>{item.category} • {new Date(item.date).toLocaleDateString()}</Text>
      </View>
      <View style={styles.actionRow}>
        <Pressable style={styles.actionBtn} onPress={() => openEditModal(item)}>
          <Ionicons name="create-outline" size={18} color={Colors.primary} />
          <Text style={styles.actionText}>Edit</Text>
        </Pressable>
        {item.status === 'pending' && (
          <Pressable style={styles.actionBtn} onPress={() => handleApprove(item)}>
            <Ionicons name="checkmark-circle-outline" size={18} color={Colors.success} />
            <Text style={[styles.actionText, { color: Colors.success }]}>Approve</Text>
          </Pressable>
        )}
        <Pressable style={styles.actionBtn} onPress={() => handleDelete(item)}>
          <Ionicons name="trash-outline" size={18} color={Colors.error} />
          <Text style={[styles.actionText, { color: Colors.error }]}>Delete</Text>
        </Pressable>
      </View>
    </View>
  );

  if (loading) {
    return (
      <SafeAreaView style={styles.container}>
        <ScreenHeader title="Petty Cash" />
        <View style={styles.loadingContainer}>
          <ActivityIndicator size="large" color={Colors.primary} />
        </View>
      </SafeAreaView>
    );
  }

  return (
    <SafeAreaView style={styles.container} edges={['left', 'right']}>
      <ScreenHeader title="Petty Cash" />

      <FlatList
        data={entries}
        renderItem={renderEntry}
        keyExtractor={(item) => item.petty_cash_id}
        contentContainerStyle={styles.listContent}
        refreshControl={<RefreshControl refreshing={refreshing} onRefresh={() => { setRefreshing(true); loadData(); }} />}
        ListEmptyComponent={
          <View style={styles.emptyContainer}>
            <Ionicons name="wallet-outline" size={48} color={Colors.textMuted} />
            <Text style={styles.emptyText}>No petty cash entries</Text>
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
              <Text style={styles.modalTitle}>{editingEntry ? 'Edit Entry' : 'Add Entry'}</Text>
              <Pressable onPress={() => setModalVisible(false)}>
                <Ionicons name="close" size={24} color={Colors.text} />
              </Pressable>
            </View>

            <ScrollView style={styles.modalBody}>
              <View style={styles.inputGroup}>
                <Text style={styles.inputLabel}>Project *</Text>
                <View style={styles.pickerContainer}>
                  <Picker selectedValue={projectId} onValueChange={setProjectId} style={styles.picker}>
                    <Picker.Item label="Select Project" value="" />
                    {projects.map(p => (
                      <Picker.Item key={p.project_id} label={p.project_name} value={p.project_id} />
                    ))}
                  </Picker>
                </View>
              </View>

              <View style={styles.inputGroup}>
                <Text style={styles.inputLabel}>Description *</Text>
                <TextInput
                  style={styles.input}
                  value={description}
                  onChangeText={setDescription}
                  placeholder="Enter description"
                  placeholderTextColor={Colors.textMuted}
                />
              </View>

              <View style={styles.inputGroup}>
                <Text style={styles.inputLabel}>Amount (₹) *</Text>
                <TextInput
                  style={styles.input}
                  value={amount}
                  onChangeText={setAmount}
                  placeholder="0.00"
                  keyboardType="numeric"
                  placeholderTextColor={Colors.textMuted}
                />
              </View>

              <View style={styles.inputGroup}>
                <Text style={styles.inputLabel}>Type</Text>
                <View style={styles.pickerContainer}>
                  <Picker selectedValue={type} onValueChange={setType} style={styles.picker}>
                    <Picker.Item label="Expense" value="expense" />
                    <Picker.Item label="Reimbursement" value="reimbursement" />
                  </Picker>
                </View>
              </View>

              <View style={styles.inputGroup}>
                <Text style={styles.inputLabel}>Category</Text>
                <View style={styles.pickerContainer}>
                  <Picker selectedValue={category} onValueChange={setCategory} style={styles.picker}>
                    {CATEGORIES.map(c => (
                      <Picker.Item key={c} label={c.charAt(0).toUpperCase() + c.slice(1)} value={c} />
                    ))}
                  </Picker>
                </View>
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
  entryCard: { backgroundColor: Colors.white, borderRadius: BorderRadius.lg, padding: Spacing.md, marginBottom: Spacing.sm },
  entryHeader: { flexDirection: 'row', justifyContent: 'space-between' },
  entryInfo: { flex: 1 },
  entryDescription: { fontSize: FontSizes.md, fontWeight: '600', color: Colors.text },
  entryProject: { fontSize: FontSizes.sm, color: Colors.textMuted, marginTop: 2 },
  entryAmount: { fontSize: FontSizes.lg, fontWeight: '700' },
  expense: { color: Colors.error },
  reimbursement: { color: Colors.success },
  statusBadge: { paddingHorizontal: Spacing.sm, paddingVertical: 2, borderRadius: BorderRadius.sm, marginTop: 4 },
  statusText: { fontSize: FontSizes.xs, fontWeight: '600', textTransform: 'capitalize' },
  entryMeta: { marginTop: Spacing.xs },
  metaText: { fontSize: FontSizes.sm, color: Colors.textMuted, textTransform: 'capitalize' },
  actionRow: { flexDirection: 'row', justifyContent: 'flex-end', gap: Spacing.md, marginTop: Spacing.sm, paddingTop: Spacing.sm, borderTopWidth: 1, borderTopColor: Colors.border },
  actionBtn: { flexDirection: 'row', alignItems: 'center', gap: 4 },
  actionText: { fontSize: FontSizes.sm, color: Colors.primary },
  emptyContainer: { alignItems: 'center', padding: Spacing.xl },
  emptyText: { fontSize: FontSizes.md, color: Colors.textSecondary, marginTop: Spacing.md },
  fab: { position: 'absolute', right: Spacing.lg, bottom: Spacing.lg, width: 56, height: 56, borderRadius: 28, backgroundColor: Colors.accent, justifyContent: 'center', alignItems: 'center', elevation: 5 },
  modalOverlay: { flex: 1, backgroundColor: 'rgba(0,0,0,0.5)', justifyContent: 'flex-end' },
  modalContent: { backgroundColor: Colors.white, borderTopLeftRadius: BorderRadius.xl, borderTopRightRadius: BorderRadius.xl, maxHeight: '85%' },
  modalHeader: { flexDirection: 'row', justifyContent: 'space-between', alignItems: 'center', padding: Spacing.md, borderBottomWidth: 1, borderBottomColor: Colors.border },
  modalTitle: { fontSize: FontSizes.lg, fontWeight: '600', color: Colors.text },
  modalBody: { padding: Spacing.md },
  inputGroup: { marginBottom: Spacing.md },
  inputLabel: { fontSize: FontSizes.sm, fontWeight: '600', color: Colors.text, marginBottom: Spacing.xs },
  input: { backgroundColor: Colors.background, borderWidth: 1, borderColor: Colors.border, borderRadius: BorderRadius.md, paddingHorizontal: Spacing.md, paddingVertical: Spacing.sm, fontSize: FontSizes.md, color: Colors.text },
  pickerContainer: { backgroundColor: Colors.background, borderWidth: 1, borderColor: Colors.border, borderRadius: BorderRadius.md, overflow: 'hidden' },
  picker: { height: 50 },
  modalFooter: { flexDirection: 'row', justifyContent: 'flex-end', gap: Spacing.md, padding: Spacing.md, borderTopWidth: 1, borderTopColor: Colors.border },
  cancelButton: { paddingHorizontal: Spacing.lg, paddingVertical: Spacing.sm },
  cancelButtonText: { fontSize: FontSizes.md, color: Colors.textSecondary },
  saveButton: { backgroundColor: Colors.primary, paddingHorizontal: Spacing.xl, paddingVertical: Spacing.sm, borderRadius: BorderRadius.md },
  saveButtonDisabled: { opacity: 0.6 },
  saveButtonText: { fontSize: FontSizes.md, color: Colors.white, fontWeight: '600' },
});
