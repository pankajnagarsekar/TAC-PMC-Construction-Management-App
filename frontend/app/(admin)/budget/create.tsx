// CREATE BUDGET SCREEN
// Functional form to create budget allocation per code
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
import { budgetsApi, projectsApi, codesApi } from '../../../services/apiClient';
import { Project, Code } from '../../../types/api';
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

export default function CreateBudgetScreen() {
  const router = useRouter();
  const [loading, setLoading] = useState(false);
  const [loadingData, setLoadingData] = useState(true);

  // Dropdown data
  const [projects, setProjects] = useState<Project[]>([]);
  const [codes, setCodes] = useState<Code[]>([]);

  // Form state
  const [projectId, setProjectId] = useState('');
  const [codeId, setCodeId] = useState('');
  const [approvedBudgetAmount, setApprovedBudgetAmount] = useState('');

  // Load dropdown data
  useEffect(() => {
    loadDropdownData();
  }, []);

  const loadDropdownData = async () => {
    try {
      const [projectsData, codesData] = await Promise.all([
        projectsApi.getAll(),
        codesApi.getAll(),
      ]);
      setProjects(projectsData);
      setCodes(codesData);
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
    if (!approvedBudgetAmount.trim() || isNaN(parseFloat(approvedBudgetAmount)) || parseFloat(approvedBudgetAmount) < 0) {
      showAlert('Validation Error', 'Approved Budget Amount must be a non-negative number');
      return false;
    }
    return true;
  }, [projectId, codeId, approvedBudgetAmount]);

  const handleSubmit = useCallback(async () => {
    console.log('handleSubmit called');
    if (!validateForm()) return;

    setLoading(true);
    try {
      const payload = {
        project_id: projectId,
        code_id: codeId,
        approved_budget_amount: parseFloat(approvedBudgetAmount),
      };

      console.log('Submitting payload:', payload);
      await budgetsApi.create(payload);
      console.log('Budget created successfully');
      showAlert('Success', 'Budget allocation created successfully', () => {
        router.replace('/(admin)/budget');
      });
    } catch (error: any) {
      console.error('Error creating budget:', error);
      showAlert('Error', error.message || 'Failed to create budget allocation');
    } finally {
      setLoading(false);
    }
  }, [validateForm, projectId, codeId, approvedBudgetAmount, router]);

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

        {/* Approved Budget Amount */}
        <View style={styles.fieldGroup}>
          <Text style={styles.label}>Approved Budget Amount *</Text>
          <TextInput
            style={styles.input}
            value={approvedBudgetAmount}
            onChangeText={setApprovedBudgetAmount}
            placeholder="Enter approved budget amount"
            placeholderTextColor={Colors.textMuted}
            keyboardType="numeric"
          />
        </View>

        <Text style={styles.noteText}>
          Note: Committed Value, Certified Value, Balance Remaining, and Over-commit flags will be computed by the backend based on Work Orders and Payment Certificates.
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
              <Text style={styles.submitButtonText}>Create Budget Allocation</Text>
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
