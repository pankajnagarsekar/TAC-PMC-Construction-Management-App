// CREATE PAYMENT CERTIFICATE SCREEN
// Functional form to create new payment certificate
import React, { useState, useEffect } from 'react';
import {
  View,
  Text,
  StyleSheet,
  TextInput,
  ScrollView,
  TouchableOpacity,
  Alert,
  ActivityIndicator,
  Platform,
} from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';
import { useRouter } from 'expo-router';
import { Ionicons } from '@expo/vector-icons';
import { Picker } from '@react-native-picker/picker';
import { paymentCertificatesApi, projectsApi, codesApi, vendorsApi } from '../../../services/apiClient';
import { Project, Code, Vendor } from '../../../types/api';
import { Colors, Spacing, FontSizes, BorderRadius } from '../../../constants/theme';

export default function CreatePaymentCertificateScreen() {
  const router = useRouter();
  const [loading, setLoading] = useState(false);
  const [loadingData, setLoadingData] = useState(true);

  // Dropdown data
  const [projects, setProjects] = useState<Project[]>([]);
  const [codes, setCodes] = useState<Code[]>([]);
  const [vendors, setVendors] = useState<Vendor[]>([]);

  // Form state - only fields frontend should send
  const [projectId, setProjectId] = useState('');
  const [codeId, setCodeId] = useState('');
  const [vendorId, setVendorId] = useState('');
  const [billDate, setBillDate] = useState('');
  const [currentBillAmount, setCurrentBillAmount] = useState('');
  const [retentionPercentage, setRetentionPercentage] = useState('');

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
      Alert.alert('Error', 'Failed to load form data');
    } finally {
      setLoadingData(false);
    }
  };

  // Validation
  const validateForm = (): boolean => {
    if (!projectId) {
      Alert.alert('Validation Error', 'Project is required');
      return false;
    }
    if (!codeId) {
      Alert.alert('Validation Error', 'Activity Code is required');
      return false;
    }
    if (!vendorId) {
      Alert.alert('Validation Error', 'Vendor is required');
      return false;
    }
    if (!billDate.trim()) {
      Alert.alert('Validation Error', 'Bill Date is required');
      return false;
    }
    const dateRegex = /^\d{4}-\d{2}-\d{2}$/;
    if (!dateRegex.test(billDate)) {
      Alert.alert('Validation Error', 'Bill Date must be in YYYY-MM-DD format');
      return false;
    }
    if (!currentBillAmount.trim() || isNaN(parseFloat(currentBillAmount)) || parseFloat(currentBillAmount) <= 0) {
      Alert.alert('Validation Error', 'Current Bill Amount must be a positive number');
      return false;
    }
    return true;
  };

  const handleSubmit = async () => {
    if (!validateForm()) return;

    setLoading(true);
    try {
      // Only send current_bill_amount - backend computes GST, retention, cumulative values
      const payload = {
        project_id: projectId,
        code_id: codeId,
        vendor_id: vendorId,
        bill_date: billDate.trim(),
        current_bill_amount: parseFloat(currentBillAmount),
        retention_percentage: retentionPercentage ? parseFloat(retentionPercentage) : undefined,
      };

      await paymentCertificatesApi.create(payload);
      Alert.alert('Success', 'Payment Certificate created successfully', [
        { text: 'OK', onPress: () => router.replace('/(admin)/payment-certificates') }
      ]);
    } catch (error: any) {
      Alert.alert('Error', error.message || 'Failed to create payment certificate');
    } finally {
      setLoading(false);
    }
  };

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
      <ScrollView contentContainerStyle={styles.content}>
        {/* Project Picker */}
        <View style={styles.fieldGroup}>
          <Text style={styles.label}>Project *</Text>
          <View style={styles.pickerContainer}>
            <Picker
              selectedValue={projectId}
              onValueChange={setProjectId}
              style={styles.picker}
            >
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
            <Picker
              selectedValue={codeId}
              onValueChange={setCodeId}
              style={styles.picker}
            >
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
            <Picker
              selectedValue={vendorId}
              onValueChange={setVendorId}
              style={styles.picker}
            >
              <Picker.Item label="Select Vendor" value="" />
              {vendors.map((v) => (
                <Picker.Item key={v.vendor_id} label={v.vendor_name} value={v.vendor_id} />
              ))}
            </Picker>
          </View>
        </View>

        {/* Bill Date */}
        <View style={styles.fieldGroup}>
          <Text style={styles.label}>Bill Date * (YYYY-MM-DD)</Text>
          <TextInput
            style={styles.input}
            value={billDate}
            onChangeText={setBillDate}
            placeholder="2024-01-15"
            placeholderTextColor={Colors.textMuted}
            keyboardType={Platform.OS === 'ios' ? 'numbers-and-punctuation' : 'default'}
          />
        </View>

        {/* Current Bill Amount */}
        <View style={styles.fieldGroup}>
          <Text style={styles.label}>Current Bill Amount *</Text>
          <TextInput
            style={styles.input}
            value={currentBillAmount}
            onChangeText={setCurrentBillAmount}
            placeholder="Enter bill amount"
            placeholderTextColor={Colors.textMuted}
            keyboardType="numeric"
          />
        </View>

        {/* Retention Percentage (optional override) */}
        <View style={styles.fieldGroup}>
          <Text style={styles.label}>Retention Percentage (optional)</Text>
          <TextInput
            style={styles.input}
            value={retentionPercentage}
            onChangeText={setRetentionPercentage}
            placeholder="Leave blank to use project default"
            placeholderTextColor={Colors.textMuted}
            keyboardType="numeric"
          />
        </View>

        <Text style={styles.noteText}>
          Note: GST (CGST/SGST), Retention, Cumulative values, Taxable Amount, and Net Payable will be calculated by the backend.
        </Text>

        {/* Submit Button */}
        <TouchableOpacity
          style={[styles.submitButton, loading && styles.submitButtonDisabled]}
          onPress={handleSubmit}
          disabled={loading}
        >
          {loading ? (
            <ActivityIndicator color={Colors.white} />
          ) : (
            <>
              <Ionicons name="checkmark-circle" size={20} color={Colors.white} />
              <Text style={styles.submitButtonText}>Create Payment Certificate</Text>
            </>
          )}
        </TouchableOpacity>
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
  label: {
    fontSize: FontSizes.sm,
    fontWeight: '600',
    color: Colors.text,
    marginBottom: Spacing.xs,
  },
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
  picker: {
    height: 50,
  },
  noteText: {
    fontSize: FontSizes.sm,
    color: Colors.textMuted,
    fontStyle: 'italic',
    marginBottom: Spacing.md,
  },
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
  submitButtonText: {
    color: Colors.white,
    fontSize: FontSizes.md,
    fontWeight: '600',
  },
});
