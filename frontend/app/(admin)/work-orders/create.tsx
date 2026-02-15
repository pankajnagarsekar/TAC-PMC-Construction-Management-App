// CREATE WORK ORDER SCREEN
// Functional form to create new work order
import React, { useState, useEffect, useCallback } from 'react';
import {
  View,
  Text,
  StyleSheet,
  TextInput,
  ScrollView,
  Pressable,
  Alert,
  ActivityIndicator,
  Platform,
} from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';
import { useRouter } from 'expo-router';
import { Ionicons } from '@expo/vector-icons';
import { Picker } from '@react-native-picker/picker';
import { workOrdersApi, projectsApi, codesApi, vendorsApi } from '../../../services/apiClient';
import { Project, Code, Vendor } from '../../../types/api';
import { Colors, Spacing, FontSizes, BorderRadius } from '../../../constants/theme';

// Cross-platform alert helper
const showAlert = (title: string, message: string, onOk?: () => void) => {
  if (Platform.OS === 'web') {
    window.alert(`${title}\n\n${message}`);
    if (onOk) onOk();
  } else {
    Alert.alert(title, message, onOk ? [{ text: 'OK', onPress: onOk }] : undefined);
  }
};

export default function CreateWorkOrderScreen() {
  const router = useRouter();
  const [loading, setLoading] = useState(false);
  const [loadingData, setLoadingData] = useState(true);

  // Dropdown data
  const [projects, setProjects] = useState<Project[]>([]);
  const [codes, setCodes] = useState<Code[]>([]);
  const [vendors, setVendors] = useState<Vendor[]>([]);

  // Form state
  const [projectId, setProjectId] = useState('');
  const [codeId, setCodeId] = useState('');
  const [vendorId, setVendorId] = useState('');
  const [issueDate, setIssueDate] = useState('');
  const [rate, setRate] = useState('');
  const [quantity, setQuantity] = useState('');
  const [retentionPercentage, setRetentionPercentage] = useState('5');

  // Load dropdown data
  useEffect(() => {
    loadDropdownData();
  }, []);

  const loadDropdownData = async () => {
    try {
      const [projectsData, codesData, vendorsData] = await Promise.all([
        projectsApi.getAll(),
        codesApi.getAll(),
        vendorsApi.getAll(),
      ]);
      setProjects(projectsData);
      setCodes(codesData);
      setVendors(vendorsData);
    } catch (error: any) {
      showAlert('Error', 'Failed to load form data');
    } finally {
      setLoadingData(false);
    }
  };

  // Validation
  const validateForm = useCallback((): boolean => {
    if (!projectId) {
      showAlert('Validation Error', 'Project is required');
      return false;
    }
    if (!codeId) {
      showAlert('Validation Error', 'Activity Code is required');
      return false;
    }
    if (!vendorId) {
      showAlert('Validation Error', 'Vendor is required');
      return false;
    }
    if (!issueDate.trim()) {
      showAlert('Validation Error', 'Issue Date is required');
      return false;
    }
    const dateRegex = /^\d{4}-\d{2}-\d{2}$/;
    if (!dateRegex.test(issueDate)) {
      showAlert('Validation Error', 'Issue Date must be in YYYY-MM-DD format');
      return false;
    }
    if (!rate.trim() || isNaN(parseFloat(rate)) || parseFloat(rate) <= 0) {
      showAlert('Validation Error', 'Rate must be a positive number');
      return false;
    }
    if (!quantity.trim() || isNaN(parseFloat(quantity)) || parseFloat(quantity) <= 0) {
      showAlert('Validation Error', 'Quantity must be a positive number');
      return false;
    }
    return true;
  }, [projectId, codeId, vendorId, issueDate, rate, quantity]);

  const handleSubmit = useCallback(async () => {
    console.log('handleSubmit called');
    if (!validateForm()) return;

    setLoading(true);
    try {
      const payload = {
        project_id: projectId,
        code_id: codeId,
        vendor_id: vendorId,
        issue_date: issueDate.trim(),
        rate: parseFloat(rate),
        quantity: parseFloat(quantity),
        retention_percentage: parseFloat(retentionPercentage) || 5,
      };

      console.log('Submitting payload:', payload);
      await workOrdersApi.create(payload);
      console.log('Work order created successfully');
      showAlert('Success', 'Work Order created successfully', () => {
        router.replace('/(admin)/work-orders');
      });
    } catch (error: any) {
      console.error('Error creating work order:', error);
      showAlert('Error', error.message || 'Failed to create work order');
    } finally {
      setLoading(false);
    }
  }, [validateForm, projectId, codeId, vendorId, issueDate, rate, quantity, retentionPercentage, router]);

  if (loadingData) {
    return (
      <SafeAreaView style={styles.container}>
        <View style={styles.loadingContainer}>
          <ActivityIndicator size="large" color={Colors.primary} />
          <Text style={styles.loadingText}>Loading form data...</Text>
        </View>
      </SafeAreaView>
    );
  }

  return (
    <SafeAreaView style={styles.container} edges={['left', 'right']}>
      <ScrollView contentContainerStyle={styles.content} keyboardShouldPersistTaps="handled">
        {/* Project Picker */}
        <View style={styles.fieldGroup}>
          <Text style={styles.label}>Project *</Text>
          <View style={styles.pickerContainer}>
            <Picker selectedValue={projectId} onValueChange={setProjectId} style={styles.picker}>
              <Picker.Item label="Select Project" value="" />
              {projects.map((p) => (
                <Picker.Item key={p.project_id} label={p.project_name} value={p.project_id} />
              ))}
            </Picker>
          </View>
        </View>

        {/* Code Picker */}
        <View style={styles.fieldGroup}>
          <Text style={styles.label}>Activity Code *</Text>
          <View style={styles.pickerContainer}>
            <Picker selectedValue={codeId} onValueChange={setCodeId} style={styles.picker}>
              <Picker.Item label="Select Code" value="" />
              {codes.map((c) => (
                <Picker.Item key={c.code_id} label={`${c.code_short} - ${c.code_name}`} value={c.code_id} />
              ))}
            </Picker>
          </View>
        </View>

        {/* Vendor Picker */}
        <View style={styles.fieldGroup}>
          <Text style={styles.label}>Vendor *</Text>
          <View style={styles.pickerContainer}>
            <Picker selectedValue={vendorId} onValueChange={setVendorId} style={styles.picker}>
              <Picker.Item label="Select Vendor" value="" />
              {vendors.map((v) => (
                <Picker.Item key={v.vendor_id} label={v.vendor_name} value={v.vendor_id} />
              ))}
            </Picker>
          </View>
        </View>

        {/* Issue Date */}
        <View style={styles.fieldGroup}>
          <Text style={styles.label}>Issue Date * (YYYY-MM-DD)</Text>
          <TextInput
            style={styles.input}
            value={issueDate}
            onChangeText={setIssueDate}
            placeholder="2024-01-15"
            placeholderTextColor={Colors.textMuted}
          />
        </View>

        {/* Rate */}
        <View style={styles.fieldGroup}>
          <Text style={styles.label}>Rate *</Text>
          <TextInput
            style={styles.input}
            value={rate}
            onChangeText={setRate}
            placeholder="Enter rate per unit"
            placeholderTextColor={Colors.textMuted}
            keyboardType="numeric"
          />
        </View>

        {/* Quantity */}
        <View style={styles.fieldGroup}>
          <Text style={styles.label}>Quantity *</Text>
          <TextInput
            style={styles.input}
            value={quantity}
            onChangeText={setQuantity}
            placeholder="Enter quantity"
            placeholderTextColor={Colors.textMuted}
            keyboardType="numeric"
          />
        </View>

        {/* Retention Percentage */}
        <View style={styles.fieldGroup}>
          <Text style={styles.label}>Retention Percentage</Text>
          <TextInput
            style={styles.input}
            value={retentionPercentage}
            onChangeText={setRetentionPercentage}
            placeholder="5"
            placeholderTextColor={Colors.textMuted}
            keyboardType="numeric"
          />
        </View>

        <Text style={styles.noteText}>
          Note: Base Amount, Net WO Value, and Retention Amount will be calculated by the backend.
        </Text>

        {/* Submit Button */}
        <Pressable
          style={({ pressed }) => [
            styles.submitButton,
            loading && styles.submitButtonDisabled,
            pressed && styles.submitButtonPressed,
          ]}
          onPress={handleSubmit}
          disabled={loading}
        >
          {loading ? (
            <ActivityIndicator color={Colors.white} />
          ) : (
            <>
              <Ionicons name="checkmark-circle" size={20} color={Colors.white} />
              <Text style={styles.submitButtonText}>Create Work Order</Text>
            </>
          )}
        </Pressable>
      </ScrollView>
    </SafeAreaView>
  );
}

const styles = StyleSheet.create({
  container: { flex: 1, backgroundColor: Colors.background },
  content: { padding: Spacing.md },
  loadingContainer: { flex: 1, justifyContent: 'center', alignItems: 'center' },
  loadingText: { marginTop: Spacing.md, fontSize: FontSizes.md, color: Colors.textSecondary },
  fieldGroup: { marginBottom: Spacing.md },
  label: { fontSize: FontSizes.sm, fontWeight: '600', color: Colors.text, marginBottom: Spacing.xs },
  input: {
    backgroundColor: Colors.white,
    borderWidth: 1,
    borderColor: Colors.border,
    borderRadius: BorderRadius.md,
    paddingHorizontal: Spacing.md,
    paddingVertical: Spacing.sm,
    fontSize: FontSizes.md,
    color: Colors.text,
  },
  pickerContainer: {
    backgroundColor: Colors.white,
    borderWidth: 1,
    borderColor: Colors.border,
    borderRadius: BorderRadius.md,
    overflow: 'hidden',
  },
  picker: { height: 50 },
  noteText: { fontSize: FontSizes.sm, color: Colors.textMuted, fontStyle: 'italic', marginBottom: Spacing.md },
  submitButton: {
    backgroundColor: Colors.primary,
    borderRadius: BorderRadius.md,
    paddingVertical: Spacing.md,
    flexDirection: 'row',
    justifyContent: 'center',
    alignItems: 'center',
    gap: Spacing.sm,
    marginTop: Spacing.lg,
  },
  submitButtonDisabled: { opacity: 0.6 },
  submitButtonPressed: { opacity: 0.8 },
  submitButtonText: { color: Colors.white, fontSize: FontSizes.md, fontWeight: '600' },
});
