// WORKERS DAILY LOG SCREEN
// Fields: Vendor Name (Autocomplete), Workers Count, Purpose of Work

import React, { useState, useEffect, useCallback } from 'react';
import {
  View,
  Text,
  StyleSheet,
  ScrollView,
  TouchableOpacity,
  TextInput,
  Alert,
  FlatList,
  Modal,
  ActivityIndicator,
  Platform,
} from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';
import { Ionicons } from '@expo/vector-icons';
import { useRouter } from 'expo-router';
import { useAuth } from '../../contexts/AuthContext';
import { useProject } from '../../contexts/ProjectContext';
import { Card } from '../../components/ui';
import { Colors, Spacing, FontSizes, BorderRadius } from '../../constants/theme';

const BASE_URL = process.env.EXPO_PUBLIC_BACKEND_URL || '';

interface Vendor {
  code_id: string;
  code: string;
  first_name: string;
  last_name: string;
  display_name: string; // "CODE - FirstName LastName"
}

interface WorkerEntry {
  id: string;
  vendor: Vendor | null;
  workers_count: number;
  purpose: string;
  isCollapsed: boolean;
}

export default function WorkerLogScreen() {
  const router = useRouter();
  const { user } = useAuth();
  const { selectedProject } = useProject();
  
  const [vendors, setVendors] = useState<Vendor[]>([]);
  const [entries, setEntries] = useState<WorkerEntry[]>([]);
  const [isLoading, setIsLoading] = useState(true);
  const [isSaving, setIsSaving] = useState(false);
  
  // Modal state for vendor selection
  const [showVendorModal, setShowVendorModal] = useState(false);
  const [activeEntryId, setActiveEntryId] = useState<string | null>(null);
  const [vendorSearch, setVendorSearch] = useState('');

  // Get token helper
  const getToken = async () => {
    if (Platform.OS === 'web') {
      return localStorage.getItem('access_token');
    }
    const SecureStore = require('expo-secure-store');
    return await SecureStore.getItemAsync('access_token');
  };

  // Load vendors
  useEffect(() => {
    loadVendors();
  }, []);

  const loadVendors = async () => {
    try {
      const token = await getToken();
      const response = await fetch(`${BASE_URL}/api/vendors`, {
        headers: { 'Authorization': `Bearer ${token}` },
      });
      
      if (response.ok) {
        const data = await response.json();
        const formattedVendors = (data || []).map((v: any) => ({
          code_id: v.vendor_id,
          code: v.vendor_type || '',
          first_name: v.vendor_name || '',
          last_name: '',
          display_name: v.vendor_name || v.display_name || '',
        }));
        setVendors(formattedVendors);
      }
    } catch (error) {
      console.error('Failed to load vendors:', error);
    } finally {
      setIsLoading(false);
    }
  };

  // Add new entry
  const addEntry = () => {
    const newEntry: WorkerEntry = {
      id: Date.now().toString(),
      vendor: null,
      workers_count: 0,
      purpose: '',
      isCollapsed: false,
    };
    // Collapse all existing entries
    setEntries(prev => [...prev.map(e => ({ ...e, isCollapsed: true })), newEntry]);
  };

  // Toggle entry collapse
  const toggleCollapse = (id: string) => {
    setEntries(entries.map(e => 
      e.id === id ? { ...e, isCollapsed: !e.isCollapsed } : e
    ));
  };

  // Check if entry is complete (for showing checkmark)
  const isEntryComplete = (entry: WorkerEntry) => {
    return entry.vendor && entry.workers_count > 0 && entry.purpose.trim();
  };

  // Remove entry
  const removeEntry = (id: string) => {
    setEntries(entries.filter(e => e.id !== id));
  };

  // Update entry
  const updateEntry = (id: string, field: keyof WorkerEntry, value: any) => {
    setEntries(entries.map(e => 
      e.id === id ? { ...e, [field]: value } : e
    ));
  };

  // Open vendor selection modal
  const openVendorModal = (entryId: string) => {
    setActiveEntryId(entryId);
    setVendorSearch('');
    setShowVendorModal(true);
  };

  // Select vendor
  const selectVendor = (vendor: Vendor) => {
    if (activeEntryId) {
      updateEntry(activeEntryId, 'vendor', vendor);
    }
    setShowVendorModal(false);
    setActiveEntryId(null);
  };

  // Filter vendors based on search
  const filteredVendors = vendors.filter(v => 
    v.display_name.toLowerCase().includes(vendorSearch.toLowerCase())
  );

  // Calculate total workers
  const totalWorkers = entries.reduce((sum, e) => sum + (e.workers_count || 0), 0);

  // Save entries
  const handleSave = async () => {
    // Validation
    const invalidEntries = entries.filter(e => !e.vendor || !e.workers_count || !e.purpose.trim());
    if (invalidEntries.length > 0) {
      Alert.alert('Incomplete Entries', 'Please fill all fields for each entry.');
      return;
    }

    if (entries.length === 0) {
      Alert.alert('No Entries', 'Please add at least one worker entry.');
      return;
    }

    try {
      setIsSaving(true);
      const token = await getToken();
      
      const payload = {
        project_id: selectedProject?.project_id,
        date: new Date().toISOString().split('T')[0],
        entries: entries.map(e => ({
          vendor_code: e.vendor?.code,
          vendor_name: e.vendor?.display_name,
          workers_count: e.workers_count,
          purpose: e.purpose,
        })),
        total_workers: totalWorkers,
      };

      const response = await fetch(`${BASE_URL}/api/worker-logs`, {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          'Authorization': `Bearer ${token}`,
        },
        body: JSON.stringify(payload),
      });

      if (response.ok) {
        Alert.alert(
          'Success',
          'Worker log saved successfully!',
          [{ text: 'OK', onPress: () => router.back() }]
        );
      } else {
        const error = await response.json();
        Alert.alert('Error', error.detail || 'Failed to save worker log');
      }
    } catch (error) {
      console.error('Save error:', error);
      Alert.alert('Error', 'Failed to save worker log');
    } finally {
      setIsSaving(false);
    }
  };

  if (isLoading) {
    return (
      <SafeAreaView style={styles.container}>
        <View style={styles.loadingContainer}>
          <ActivityIndicator size="large" color={Colors.accent} />
          <Text style={styles.loadingText}>Loading...</Text>
        </View>
      </SafeAreaView>
    );
  }

  return (
    <SafeAreaView style={styles.container} edges={['left', 'right']}>
      {/* Header with project info */}
      <View style={styles.header}>
        <View style={styles.headerInfo}>
          <Text style={styles.headerTitle}>Workers Daily Log</Text>
          <Text style={styles.headerSubtitle}>
            {selectedProject?.project_name} • {new Date().toLocaleDateString()}
          </Text>
        </View>
        <View style={styles.totalBadge}>
          <Text style={styles.totalLabel}>Total</Text>
          <Text style={styles.totalValue}>{totalWorkers}</Text>
        </View>
      </View>

      <ScrollView style={styles.scrollView} contentContainerStyle={styles.scrollContent}>
        {/* Entries List */}
        {entries.map((entry, index) => (
          <Card key={entry.id} style={styles.entryCard}>
            <View style={styles.entryHeader}>
              <Text style={styles.entryNumber}>Entry #{index + 1}</Text>
              <TouchableOpacity onPress={() => removeEntry(entry.id)} style={styles.removeButton}>
                <Ionicons name="trash-outline" size={20} color={Colors.error} />
              </TouchableOpacity>
            </View>

            {/* Vendor Selection */}
            <Text style={styles.fieldLabel}>Vendor Name</Text>
            <TouchableOpacity 
              style={styles.selectField}
              onPress={() => openVendorModal(entry.id)}
            >
              <Text style={entry.vendor ? styles.selectFieldText : styles.selectFieldPlaceholder}>
                {entry.vendor ? entry.vendor.display_name : 'Select Vendor'}
              </Text>
              <Ionicons name="chevron-down" size={20} color={Colors.textMuted} />
            </TouchableOpacity>

            {/* Workers Count */}
            <Text style={styles.fieldLabel}>No. of Workers Present</Text>
            <TextInput
              style={styles.numberInput}
              keyboardType="number-pad"
              placeholder="0"
              value={entry.workers_count ? entry.workers_count.toString() : ''}
              onChangeText={(text) => {
                const num = parseInt(text) || 0;
                updateEntry(entry.id, 'workers_count', num);
              }}
            />

            {/* Purpose of Work */}
            <Text style={styles.fieldLabel}>Purpose of Work</Text>
            <TextInput
              style={styles.textInput}
              placeholder="Enter work description..."
              value={entry.purpose}
              onChangeText={(text) => updateEntry(entry.id, 'purpose', text)}
              multiline
              numberOfLines={2}
            />
          </Card>
        ))}

        {/* Add Entry Button */}
        <TouchableOpacity style={styles.addButton} onPress={addEntry}>
          <Ionicons name="add-circle" size={24} color={Colors.accent} />
          <Text style={styles.addButtonText}>Add Worker Entry</Text>
        </TouchableOpacity>

        {/* Empty State */}
        {entries.length === 0 && (
          <View style={styles.emptyState}>
            <Ionicons name="people-outline" size={64} color={Colors.textMuted} />
            <Text style={styles.emptyTitle}>No Entries Yet</Text>
            <Text style={styles.emptyText}>
              Tap "Add Worker Entry" to log workers for today
            </Text>
          </View>
        )}
      </ScrollView>

      {/* Save Button */}
      <View style={styles.footer}>
        <TouchableOpacity 
          style={[styles.saveButton, isSaving && styles.saveButtonDisabled]}
          onPress={handleSave}
          disabled={isSaving}
        >
          {isSaving ? (
            <ActivityIndicator color={Colors.white} />
          ) : (
            <>
              <Ionicons name="checkmark-circle" size={20} color={Colors.white} />
              <Text style={styles.saveButtonText}>Save Worker Log</Text>
            </>
          )}
        </TouchableOpacity>
      </View>

      {/* Vendor Selection Modal */}
      <Modal
        visible={showVendorModal}
        animationType="slide"
        transparent={true}
        onRequestClose={() => setShowVendorModal(false)}
      >
        <View style={styles.modalOverlay}>
          <View style={styles.modalContent}>
            <View style={styles.modalHeader}>
              <Text style={styles.modalTitle}>Select Vendor</Text>
              <TouchableOpacity onPress={() => setShowVendorModal(false)}>
                <Ionicons name="close" size={24} color={Colors.text} />
              </TouchableOpacity>
            </View>

            {/* Search Input */}
            <View style={styles.searchContainer}>
              <Ionicons name="search" size={20} color={Colors.textMuted} />
              <TextInput
                style={styles.searchInput}
                placeholder="Search vendor..."
                value={vendorSearch}
                onChangeText={setVendorSearch}
                autoFocus
              />
            </View>

            {/* Vendor List */}
            <FlatList
              data={filteredVendors}
              keyExtractor={(item) => item.code_id}
              renderItem={({ item }) => (
                <TouchableOpacity 
                  style={styles.vendorItem}
                  onPress={() => selectVendor(item)}
                >
                  <View style={styles.vendorIcon}>
                    <Ionicons name="business" size={20} color={Colors.accent} />
                  </View>
                  <View style={styles.vendorInfo}>
                    <Text style={styles.vendorName}>{item.display_name}</Text>
                    <Text style={styles.vendorCode}>{item.code}</Text>
                  </View>
                </TouchableOpacity>
              )}
              ListEmptyComponent={
                <View style={styles.noResults}>
                  <Text style={styles.noResultsText}>No vendors found</Text>
                </View>
              }
              style={styles.vendorList}
            />
          </View>
        </View>
      </Modal>
    </SafeAreaView>
  );
}

const styles = StyleSheet.create({
  container: {
    flex: 1,
    backgroundColor: Colors.background,
  },
  loadingContainer: {
    flex: 1,
    justifyContent: 'center',
    alignItems: 'center',
  },
  loadingText: {
    marginTop: Spacing.md,
    color: Colors.textSecondary,
  },
  header: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
    padding: Spacing.md,
    backgroundColor: Colors.white,
    borderBottomWidth: 1,
    borderBottomColor: Colors.border,
  },
  headerInfo: {
    flex: 1,
  },
  headerTitle: {
    fontSize: FontSizes.lg,
    fontWeight: 'bold',
    color: Colors.text,
  },
  headerSubtitle: {
    fontSize: FontSizes.sm,
    color: Colors.textSecondary,
    marginTop: 2,
  },
  totalBadge: {
    backgroundColor: Colors.accent,
    paddingHorizontal: Spacing.md,
    paddingVertical: Spacing.sm,
    borderRadius: BorderRadius.md,
    alignItems: 'center',
  },
  totalLabel: {
    fontSize: FontSizes.xs,
    color: Colors.white,
    opacity: 0.8,
  },
  totalValue: {
    fontSize: FontSizes.xl,
    fontWeight: 'bold',
    color: Colors.white,
  },
  scrollView: {
    flex: 1,
  },
  scrollContent: {
    padding: Spacing.md,
    paddingBottom: 100,
  },
  entryCard: {
    padding: Spacing.md,
    marginBottom: Spacing.md,
  },
  entryHeader: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
    marginBottom: Spacing.md,
    paddingBottom: Spacing.sm,
    borderBottomWidth: 1,
    borderBottomColor: Colors.border,
  },
  entryNumber: {
    fontSize: FontSizes.md,
    fontWeight: '600',
    color: Colors.accent,
  },
  removeButton: {
    padding: Spacing.xs,
  },
  fieldLabel: {
    fontSize: FontSizes.sm,
    fontWeight: '500',
    color: Colors.textSecondary,
    marginBottom: Spacing.xs,
    marginTop: Spacing.sm,
  },
  selectField: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    backgroundColor: Colors.background,
    borderWidth: 1,
    borderColor: Colors.border,
    borderRadius: BorderRadius.md,
    padding: Spacing.md,
  },
  selectFieldText: {
    fontSize: FontSizes.md,
    color: Colors.text,
  },
  selectFieldPlaceholder: {
    fontSize: FontSizes.md,
    color: Colors.textMuted,
  },
  numberInput: {
    backgroundColor: Colors.background,
    borderWidth: 1,
    borderColor: Colors.border,
    borderRadius: BorderRadius.md,
    padding: Spacing.md,
    fontSize: FontSizes.lg,
    fontWeight: '600',
    color: Colors.text,
  },
  textInput: {
    backgroundColor: Colors.background,
    borderWidth: 1,
    borderColor: Colors.border,
    borderRadius: BorderRadius.md,
    padding: Spacing.md,
    fontSize: FontSizes.md,
    color: Colors.text,
    minHeight: 60,
    textAlignVertical: 'top',
  },
  addButton: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'center',
    padding: Spacing.md,
    borderWidth: 2,
    borderColor: Colors.accent,
    borderStyle: 'dashed',
    borderRadius: BorderRadius.md,
    marginTop: Spacing.sm,
    gap: Spacing.sm,
  },
  addButtonText: {
    fontSize: FontSizes.md,
    fontWeight: '600',
    color: Colors.accent,
  },
  emptyState: {
    alignItems: 'center',
    paddingVertical: Spacing.xxl,
  },
  emptyTitle: {
    fontSize: FontSizes.lg,
    fontWeight: '600',
    color: Colors.text,
    marginTop: Spacing.md,
  },
  emptyText: {
    fontSize: FontSizes.md,
    color: Colors.textSecondary,
    marginTop: Spacing.xs,
    textAlign: 'center',
  },
  footer: {
    position: 'absolute',
    bottom: 0,
    left: 0,
    right: 0,
    padding: Spacing.md,
    backgroundColor: Colors.white,
    borderTopWidth: 1,
    borderTopColor: Colors.border,
  },
  saveButton: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'center',
    backgroundColor: Colors.success,
    padding: Spacing.md,
    borderRadius: BorderRadius.md,
    gap: Spacing.sm,
  },
  saveButtonDisabled: {
    opacity: 0.6,
  },
  saveButtonText: {
    fontSize: FontSizes.md,
    fontWeight: '600',
    color: Colors.white,
  },
  
  // Modal Styles
  modalOverlay: {
    flex: 1,
    backgroundColor: 'rgba(0,0,0,0.5)',
    justifyContent: 'flex-end',
  },
  modalContent: {
    backgroundColor: Colors.white,
    borderTopLeftRadius: BorderRadius.xl,
    borderTopRightRadius: BorderRadius.xl,
    maxHeight: '80%',
  },
  modalHeader: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
    padding: Spacing.md,
    borderBottomWidth: 1,
    borderBottomColor: Colors.border,
  },
  modalTitle: {
    fontSize: FontSizes.lg,
    fontWeight: 'bold',
    color: Colors.text,
  },
  searchContainer: {
    flexDirection: 'row',
    alignItems: 'center',
    backgroundColor: Colors.background,
    margin: Spacing.md,
    padding: Spacing.sm,
    borderRadius: BorderRadius.md,
    gap: Spacing.sm,
  },
  searchInput: {
    flex: 1,
    fontSize: FontSizes.md,
    color: Colors.text,
    padding: Spacing.xs,
  },
  vendorList: {
    maxHeight: 400,
  },
  vendorItem: {
    flexDirection: 'row',
    alignItems: 'center',
    padding: Spacing.md,
    borderBottomWidth: 1,
    borderBottomColor: Colors.border,
  },
  vendorIcon: {
    width: 40,
    height: 40,
    borderRadius: 20,
    backgroundColor: Colors.accent + '20',
    justifyContent: 'center',
    alignItems: 'center',
    marginRight: Spacing.md,
  },
  vendorInfo: {
    flex: 1,
  },
  vendorName: {
    fontSize: FontSizes.md,
    fontWeight: '500',
    color: Colors.text,
  },
  vendorCode: {
    fontSize: FontSizes.sm,
    color: Colors.textMuted,
  },
  noResults: {
    padding: Spacing.xl,
    alignItems: 'center',
  },
  noResultsText: {
    fontSize: FontSizes.md,
    color: Colors.textMuted,
  },
});
