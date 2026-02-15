// CREATE PROJECT SCREEN
// Functional form to create new project
import React, { useState } from 'react';
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
import { projectsApi } from '../../../services/apiClient';
import { Colors, Spacing, FontSizes, BorderRadius } from '../../../constants/theme';

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
  const validateForm = (): boolean => {
    if (!projectName.trim()) {
      Alert.alert('Validation Error', 'Project Name is required');
      return false;
    }
    if (!startDate.trim()) {
      Alert.alert('Validation Error', 'Start Date is required');
      return false;
    }
    // Validate date format (YYYY-MM-DD)
    const dateRegex = /^\d{4}-\d{2}-\d{2}$/;
    if (!dateRegex.test(startDate)) {
      Alert.alert('Validation Error', 'Start Date must be in YYYY-MM-DD format');
      return false;
    }
    if (endDate.trim() && !dateRegex.test(endDate)) {
      Alert.alert('Validation Error', 'End Date must be in YYYY-MM-DD format');
      return false;
    }
    return true;
  };

  const handleSubmit = async () => {
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

      await projectsApi.create(payload);
      Alert.alert('Success', 'Project created successfully', [
        { text: 'OK', onPress: () => router.replace('/(admin)/projects') }
      ]);
    } catch (error: any) {
      Alert.alert('Error', error.message || 'Failed to create project');
    } finally {
      setLoading(false);
    }
  };

  return (
    <SafeAreaView style={styles.container} edges={['left', 'right']}>
      <ScrollView contentContainerStyle={styles.content}>
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
            keyboardType={Platform.OS === 'ios' ? 'numbers-and-punctuation' : 'default'}
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
            keyboardType={Platform.OS === 'ios' ? 'numbers-and-punctuation' : 'default'}
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
              <Text style={styles.submitButtonText}>Create Project</Text>
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
  submitButtonText: {
    color: Colors.white,
    fontSize: FontSizes.md,
    fontWeight: '600',
  },
});
