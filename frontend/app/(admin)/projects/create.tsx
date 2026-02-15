// CREATE PROJECT SCREEN
// Functional form to create new project
import React, { useState, useCallback } from 'react';
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
import { projectsApi } from '../../../services/apiClient';
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

export default function CreateProjectScreen() {
  const router = useRouter();
  const [loading, setLoading] = useState(false);
  
  // Form state
  const [projectName, setProjectName] = useState('');
  const [clientName, setClientName] = useState('');
  const [startDate, setStartDate] = useState('');
  const [endDate, setEndDate] = useState('');
  const [currencyCode, setCurrencyCode] = useState('INR');
  const [retentionPercentage, setRetentionPercentage] = useState('5');

  // Validation
  const validateForm = useCallback((): boolean => {
    if (!projectName.trim()) {
      showAlert('Validation Error', 'Project Name is required');
      return false;
    }
    if (!startDate.trim()) {
      showAlert('Validation Error', 'Start Date is required');
      return false;
    }
    const dateRegex = /^\d{4}-\d{2}-\d{2}$/;
    if (!dateRegex.test(startDate)) {
      showAlert('Validation Error', 'Start Date must be in YYYY-MM-DD format');
      return false;
    }
    if (endDate.trim() && !dateRegex.test(endDate)) {
      showAlert('Validation Error', 'End Date must be in YYYY-MM-DD format');
      return false;
    }
    return true;
  }, [projectName, startDate, endDate]);

  const handleSubmit = useCallback(async () => {
    console.log('handleSubmit called');
    if (!validateForm()) return;

    setLoading(true);
    try {
      const payload = {
        project_name: projectName.trim(),
        client_name: clientName.trim() || undefined,
        start_date: startDate.trim(),
        end_date: endDate.trim() || undefined,
        currency_code: currencyCode.trim() || 'INR',
        project_retention_percentage: parseFloat(retentionPercentage) || 5,
      };

      console.log('Submitting payload:', payload);
      await projectsApi.create(payload);
      console.log('Project created successfully');
      showAlert('Success', 'Project created successfully', () => {
        router.replace('/(admin)/projects');
      });
    } catch (error: any) {
      console.error('Error creating project:', error);
      showAlert('Error', error.message || 'Failed to create project');
    } finally {
      setLoading(false);
    }
  }, [validateForm, projectName, clientName, startDate, endDate, currencyCode, retentionPercentage, router]);

  return (
    <SafeAreaView style={styles.container} edges={['left', 'right']}>
      <ScrollView contentContainerStyle={styles.content} keyboardShouldPersistTaps="handled">
        {/* Project Name */}
        <View style={styles.fieldGroup}>
          <Text style={styles.label}>Project Name *</Text>
          <TextInput
            style={styles.input}
            value={projectName}
            onChangeText={setProjectName}
            placeholder="Enter project name"
            placeholderTextColor={Colors.textMuted}
          />
        </View>

        {/* Client Name */}
        <View style={styles.fieldGroup}>
          <Text style={styles.label}>Client Name</Text>
          <TextInput
            style={styles.input}
            value={clientName}
            onChangeText={setClientName}
            placeholder="Enter client name"
            placeholderTextColor={Colors.textMuted}
          />
        </View>

        {/* Start Date */}
        <View style={styles.fieldGroup}>
          <Text style={styles.label}>Start Date * (YYYY-MM-DD)</Text>
          <TextInput
            style={styles.input}
            value={startDate}
            onChangeText={setStartDate}
            placeholder="2024-01-01"
            placeholderTextColor={Colors.textMuted}
          />
        </View>

        {/* End Date */}
        <View style={styles.fieldGroup}>
          <Text style={styles.label}>End Date (YYYY-MM-DD)</Text>
          <TextInput
            style={styles.input}
            value={endDate}
            onChangeText={setEndDate}
            placeholder="2024-12-31"
            placeholderTextColor={Colors.textMuted}
          />
        </View>

        {/* Currency Code */}
        <View style={styles.fieldGroup}>
          <Text style={styles.label}>Currency Code</Text>
          <TextInput
            style={styles.input}
            value={currencyCode}
            onChangeText={setCurrencyCode}
            placeholder="INR"
            placeholderTextColor={Colors.textMuted}
            autoCapitalize="characters"
            maxLength={3}
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
              <Text style={styles.submitButtonText}>Create Project</Text>
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
  submitButtonText: {
    color: Colors.white,
    fontSize: FontSizes.md,
    fontWeight: '600',
  },
});
