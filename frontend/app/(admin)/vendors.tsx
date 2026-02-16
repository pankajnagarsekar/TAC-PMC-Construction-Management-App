// VENDOR MANAGEMENT SCREEN
// View, create, update, delete vendors
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
import { vendorsApi } from '../../services/apiClient';
import { Vendor } from '../../types/api';
import { Colors, Spacing, FontSizes, BorderRadius } from '../../constants/theme';
import ScreenHeader from '../../components/ScreenHeader';

const showAlert = (title: string, message: string, onOk?: () => void) => {
  if (Platform.OS === 'web') {
    window.alert(`${title}\n\n${message}`);
    if (onOk) onOk();
  } else {
    Alert.alert(title, message, onOk ? [{ text: 'OK', onPress: onOk }] : undefined);
  }
};

const showConfirm = (title: string, message: string, onConfirm: () => void) => {
  if (Platform.OS === 'web') {
    if (window.confirm(`${title}\n\n${message}`)) {
      onConfirm();
    }
  } else {
    Alert.alert(title, message, [
      { text: 'Cancel', style: 'cancel' },
      { text: 'Confirm', onPress: onConfirm, style: 'destructive' }
    ]);
  }
};

export default function VendorsScreen() {
  const [vendors, setVendors] = useState<Vendor[]>([]);
  const [loading, setLoading] = useState(true);
  const [refreshing, setRefreshing] = useState(false);
  const [modalVisible, setModalVisible] = useState(false);
  const [editingVendor, setEditingVendor] = useState<Vendor | null>(null);
  const [saving, setSaving] = useState(false);

  // Form state
  const [vendorCode, setVendorCode] = useState('');
  const [vendorName, setVendorName] = useState('');
  const [contactPerson, setContactPerson] = useState('');
  const [phone, setPhone] = useState('');
  const [email, setEmail] = useState('');
  const [address, setAddress] = useState('');
  const [panNumber, setPanNumber] = useState('');
  const [gstNumber, setGstNumber] = useState('');

  const loadVendors = useCallback(async () => {
    try {
      const data = await vendorsApi.getAll(false); // Get all including inactive
      setVendors(data || []);
    } catch (error) {
      console.error('Error loading vendors:', error);
      showAlert('Error', 'Failed to load vendors');
    } finally {
      setLoading(false);
      setRefreshing(false);
    }
  }, []);

  useEffect(() => {
    loadVendors();
  }, [loadVendors]);

  const onRefresh = () => {
    setRefreshing(true);
    loadVendors();
  };

  const resetForm = () => {
    setVendorCode('');
    setVendorName('');
    setContactPerson('');
    setPhone('');
    setEmail('');
    setAddress('');
    setPanNumber('');
    setGstNumber('');
    setEditingVendor(null);
  };

  const openCreateModal = () => {
    resetForm();
    setModalVisible(true);
  };

  const openEditModal = (vendor: Vendor) => {
    setEditingVendor(vendor);
    setVendorCode(vendor.vendor_code || '');
    setVendorName(vendor.vendor_name || '');
    setContactPerson(vendor.contact_person || '');
    setPhone(vendor.phone || '');
    setEmail(vendor.email || '');
    setAddress(vendor.address || '');
    setPanNumber(vendor.pan_number || '');
    setGstNumber(vendor.gst_number || '');
    setModalVisible(true);
  };

  const handleSave = async () => {
    if (!vendorCode.trim() || !vendorName.trim()) {
      showAlert('Validation Error', 'Vendor Code and Name are required');
      return;
    }

    setSaving(true);
    try {
      const payload = {
        vendor_code: vendorCode.trim(),
        vendor_name: vendorName.trim(),
        contact_person: contactPerson.trim() || undefined,
        phone: phone.trim() || undefined,
        email: email.trim() || undefined,
        address: address.trim() || undefined,
        pan_number: panNumber.trim() || undefined,
        gst_number: gstNumber.trim() || undefined,
      };

      if (editingVendor) {
        await vendorsApi.update(editingVendor.vendor_id, payload);
        showAlert('Success', 'Vendor updated successfully');
      } else {
        await vendorsApi.create(payload);
        showAlert('Success', 'Vendor created successfully');
      }
      
      setModalVisible(false);
      resetForm();
      loadVendors();
    } catch (error: any) {
      showAlert('Error', error.message || 'Failed to save vendor');
    } finally {
      setSaving(false);
    }
  };

  const handleDelete = (vendor: Vendor) => {
    showConfirm(
      'Delete Vendor',
      `Are you sure you want to delete "${vendor.vendor_name}"?`,
      async () => {
        try {
          await vendorsApi.delete(vendor.vendor_id);
          showAlert('Success', 'Vendor deleted successfully');
          loadVendors();
        } catch (error: any) {
          showAlert('Error', error.message || 'Failed to delete vendor');
        }
      }
    );
  };

  const renderVendor = ({ item }: { item: Vendor }) => (
    <View style={styles.vendorCard}>
      <View style={styles.vendorHeader}>
        <View style={styles.vendorInfo}>
          <Text style={styles.vendorName}>{item.vendor_name}</Text>
          <Text style={styles.vendorCode}>{item.vendor_code}</Text>
        </View>
        <View style={[styles.statusBadge, item.active_status ? styles.activeBadge : styles.inactiveBadge]}>
          <Text style={styles.statusText}>{item.active_status ? 'Active' : 'Inactive'}</Text>
        </View>
      </View>
      
      {item.contact_person && (
        <View style={styles.detailRow}>
          <Ionicons name="person-outline" size={16} color={Colors.textMuted} />
          <Text style={styles.detailText}>{item.contact_person}</Text>
        </View>
      )}
      {item.phone && (
        <View style={styles.detailRow}>
          <Ionicons name="call-outline" size={16} color={Colors.textMuted} />
          <Text style={styles.detailText}>{item.phone}</Text>
        </View>
      )}
      {item.email && (
        <View style={styles.detailRow}>
          <Ionicons name="mail-outline" size={16} color={Colors.textMuted} />
          <Text style={styles.detailText}>{item.email}</Text>
        </View>
      )}
      
      <View style={styles.actionRow}>
        <Pressable style={styles.editButton} onPress={() => openEditModal(item)}>
          <Ionicons name="create-outline" size={18} color={Colors.primary} />
          <Text style={styles.editButtonText}>Edit</Text>
        </Pressable>
        <Pressable style={styles.deleteButton} onPress={() => handleDelete(item)}>
          <Ionicons name="trash-outline" size={18} color={Colors.error} />
          <Text style={styles.deleteButtonText}>Delete</Text>
        </Pressable>
      </View>
    </View>
  );

  if (loading) {
    return (
      <SafeAreaView style={styles.container}>
        <ScreenHeader title="Vendors" />
        <View style={styles.loadingContainer}>
          <ActivityIndicator size="large" color={Colors.primary} />
          <Text style={styles.loadingText}>Loading vendors...</Text>
        </View>
      </SafeAreaView>
    );
  }

  return (
    <SafeAreaView style={styles.container} edges={['left', 'right']}>
      <ScreenHeader title="Vendor Management" />
      
      <FlatList
        data={vendors}
        renderItem={renderVendor}
        keyExtractor={(item) => item.vendor_id}
        contentContainerStyle={styles.listContent}
        refreshControl={<RefreshControl refreshing={refreshing} onRefresh={onRefresh} />}
        ListEmptyComponent={
          <View style={styles.emptyContainer}>
            <Ionicons name="business-outline" size={48} color={Colors.textMuted} />
            <Text style={styles.emptyText}>No vendors found</Text>
            <Text style={styles.emptySubtext}>Add your first vendor to get started</Text>
          </View>
        }
      />

      {/* FAB */}
      <Pressable style={styles.fab} onPress={openCreateModal}>
        <Ionicons name="add" size={28} color={Colors.white} />
      </Pressable>

      {/* Create/Edit Modal */}
      <Modal visible={modalVisible} animationType="slide" transparent>
        <View style={styles.modalOverlay}>
          <View style={styles.modalContent}>
            <View style={styles.modalHeader}>
              <Text style={styles.modalTitle}>{editingVendor ? 'Edit Vendor' : 'Add Vendor'}</Text>
              <Pressable onPress={() => setModalVisible(false)}>
                <Ionicons name="close" size={24} color={Colors.text} />
              </Pressable>
            </View>
            
            <ScrollView style={styles.modalBody}>
              <View style={styles.inputGroup}>
                <Text style={styles.inputLabel}>Vendor Code *</Text>
                <TextInput
                  style={styles.input}
                  value={vendorCode}
                  onChangeText={setVendorCode}
                  placeholder="e.g., VEN001"
                  placeholderTextColor={Colors.textMuted}
                />
              </View>
              
              <View style={styles.inputGroup}>
                <Text style={styles.inputLabel}>Vendor Name *</Text>
                <TextInput
                  style={styles.input}
                  value={vendorName}
                  onChangeText={setVendorName}
                  placeholder="Company name"
                  placeholderTextColor={Colors.textMuted}
                />
              </View>
              
              <View style={styles.inputGroup}>
                <Text style={styles.inputLabel}>Contact Person</Text>
                <TextInput
                  style={styles.input}
                  value={contactPerson}
                  onChangeText={setContactPerson}
                  placeholder="Primary contact name"
                  placeholderTextColor={Colors.textMuted}
                />
              </View>
              
              <View style={styles.inputGroup}>
                <Text style={styles.inputLabel}>Phone</Text>
                <TextInput
                  style={styles.input}
                  value={phone}
                  onChangeText={setPhone}
                  placeholder="Phone number"
                  keyboardType="phone-pad"
                  placeholderTextColor={Colors.textMuted}
                />
              </View>
              
              <View style={styles.inputGroup}>
                <Text style={styles.inputLabel}>Email</Text>
                <TextInput
                  style={styles.input}
                  value={email}
                  onChangeText={setEmail}
                  placeholder="Email address"
                  keyboardType="email-address"
                  autoCapitalize="none"
                  placeholderTextColor={Colors.textMuted}
                />
              </View>
              
              <View style={styles.inputGroup}>
                <Text style={styles.inputLabel}>Address</Text>
                <TextInput
                  style={[styles.input, styles.textArea]}
                  value={address}
                  onChangeText={setAddress}
                  placeholder="Full address"
                  multiline
                  numberOfLines={3}
                  placeholderTextColor={Colors.textMuted}
                />
              </View>
              
              <View style={styles.inputGroup}>
                <Text style={styles.inputLabel}>PAN Number</Text>
                <TextInput
                  style={styles.input}
                  value={panNumber}
                  onChangeText={setPanNumber}
                  placeholder="e.g., ABCDE1234F"
                  autoCapitalize="characters"
                  placeholderTextColor={Colors.textMuted}
                />
              </View>
              
              <View style={styles.inputGroup}>
                <Text style={styles.inputLabel}>GST Number</Text>
                <TextInput
                  style={styles.input}
                  value={gstNumber}
                  onChangeText={setGstNumber}
                  placeholder="e.g., 29ABCDE1234F1Z5"
                  autoCapitalize="characters"
                  placeholderTextColor={Colors.textMuted}
                />
              </View>
            </ScrollView>
            
            <View style={styles.modalFooter}>
              <Pressable style={styles.cancelButton} onPress={() => setModalVisible(false)}>
                <Text style={styles.cancelButtonText}>Cancel</Text>
              </Pressable>
              <Pressable 
                style={[styles.saveButton, saving && styles.saveButtonDisabled]} 
                onPress={handleSave}
                disabled={saving}
              >
                {saving ? (
                  <ActivityIndicator size="small" color={Colors.white} />
                ) : (
                  <Text style={styles.saveButtonText}>{editingVendor ? 'Update' : 'Create'}</Text>
                )}
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
  loadingText: { marginTop: Spacing.md, fontSize: FontSizes.md, color: Colors.textSecondary },
  listContent: { padding: Spacing.md },
  vendorCard: {
    backgroundColor: Colors.white,
    borderRadius: BorderRadius.lg,
    padding: Spacing.md,
    marginBottom: Spacing.sm,
  },
  vendorHeader: { flexDirection: 'row', justifyContent: 'space-between', alignItems: 'flex-start', marginBottom: Spacing.sm },
  vendorInfo: { flex: 1 },
  vendorName: { fontSize: FontSizes.md, fontWeight: '600', color: Colors.text },
  vendorCode: { fontSize: FontSizes.sm, color: Colors.textMuted, marginTop: 2 },
  statusBadge: { paddingHorizontal: Spacing.sm, paddingVertical: 2, borderRadius: BorderRadius.sm },
  activeBadge: { backgroundColor: Colors.success + '20' },
  inactiveBadge: { backgroundColor: Colors.error + '20' },
  statusText: { fontSize: FontSizes.xs, fontWeight: '600' },
  detailRow: { flexDirection: 'row', alignItems: 'center', gap: Spacing.xs, marginBottom: 4 },
  detailText: { fontSize: FontSizes.sm, color: Colors.textSecondary },
  actionRow: { flexDirection: 'row', justifyContent: 'flex-end', gap: Spacing.md, marginTop: Spacing.sm, paddingTop: Spacing.sm, borderTopWidth: 1, borderTopColor: Colors.border },
  editButton: { flexDirection: 'row', alignItems: 'center', gap: 4 },
  editButtonText: { fontSize: FontSizes.sm, color: Colors.primary },
  deleteButton: { flexDirection: 'row', alignItems: 'center', gap: 4 },
  deleteButtonText: { fontSize: FontSizes.sm, color: Colors.error },
  emptyContainer: { alignItems: 'center', padding: Spacing.xl },
  emptyText: { fontSize: FontSizes.md, color: Colors.textSecondary, marginTop: Spacing.md },
  emptySubtext: { fontSize: FontSizes.sm, color: Colors.textMuted },
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
  modalOverlay: { flex: 1, backgroundColor: 'rgba(0,0,0,0.5)', justifyContent: 'flex-end' },
  modalContent: { backgroundColor: Colors.white, borderTopLeftRadius: BorderRadius.xl, borderTopRightRadius: BorderRadius.xl, maxHeight: '90%' },
  modalHeader: { flexDirection: 'row', justifyContent: 'space-between', alignItems: 'center', padding: Spacing.md, borderBottomWidth: 1, borderBottomColor: Colors.border },
  modalTitle: { fontSize: FontSizes.lg, fontWeight: '600', color: Colors.text },
  modalBody: { padding: Spacing.md, maxHeight: 400 },
  inputGroup: { marginBottom: Spacing.md },
  inputLabel: { fontSize: FontSizes.sm, fontWeight: '600', color: Colors.text, marginBottom: Spacing.xs },
  input: {
    backgroundColor: Colors.background,
    borderWidth: 1,
    borderColor: Colors.border,
    borderRadius: BorderRadius.md,
    paddingHorizontal: Spacing.md,
    paddingVertical: Spacing.sm,
    fontSize: FontSizes.md,
    color: Colors.text,
  },
  textArea: { minHeight: 80, textAlignVertical: 'top' },
  modalFooter: { flexDirection: 'row', justifyContent: 'flex-end', gap: Spacing.md, padding: Spacing.md, borderTopWidth: 1, borderTopColor: Colors.border },
  cancelButton: { paddingHorizontal: Spacing.lg, paddingVertical: Spacing.sm },
  cancelButtonText: { fontSize: FontSizes.md, color: Colors.textSecondary },
  saveButton: { backgroundColor: Colors.primary, paddingHorizontal: Spacing.xl, paddingVertical: Spacing.sm, borderRadius: BorderRadius.md },
  saveButtonDisabled: { opacity: 0.6 },
  saveButtonText: { fontSize: FontSizes.md, color: Colors.white, fontWeight: '600' },
});
