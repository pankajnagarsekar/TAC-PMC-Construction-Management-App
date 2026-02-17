// ORGANIZATION SETTINGS SCREEN
// Edit organization details, tax settings, document prefixes, terms & conditions
import React, { useState, useEffect } from 'react';
import {
  View,
  Text,
  StyleSheet,
  ScrollView,
  TextInput,
  Pressable,
  ActivityIndicator,
  Alert,
  Platform,
  Image,
} from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';
import { Ionicons } from '@expo/vector-icons';
import * as ImagePicker from 'expo-image-picker';
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
  if (!response.ok) throw new Error('Request failed');
  return response.json();
};

const showAlert = (title: string, message: string) => {
  if (Platform.OS === 'web') window.alert(`${title}: ${message}`);
  else Alert.alert(title, message);
};

interface OrgSettings {
  name: string;
  address: string;
  email: string;
  phone: string;
  logo_base64: string;
  gst_number: string;
  pan_number: string;
  cgst_percentage: number;
  sgst_percentage: number;
  wo_prefix: string;
  pc_prefix: string;
  invoice_prefix: string;
  terms_and_conditions: string;
  currency: string;
  currency_symbol: string;
  owner_name: string;
  owner_mobile: string;
  owner_address: string;
  owner_email: string;
}

export default function OrganizationSettingsScreen() {
  const [settings, setSettings] = useState<OrgSettings>({
    name: '', address: '', email: '', phone: '', logo_base64: '',
    gst_number: '', pan_number: '',
    cgst_percentage: 9, sgst_percentage: 9,
    wo_prefix: 'WO', pc_prefix: 'PC', invoice_prefix: 'INV',
    terms_and_conditions: '',
    currency: 'INR', currency_symbol: '₹',
    owner_name: '', owner_mobile: '', owner_address: '', owner_email: '',
  });
  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(false);
  const [activeSection, setActiveSection] = useState<string | null>('basic');

  useEffect(() => {
    loadSettings();
  }, []);

  const loadSettings = async () => {
    try {
      const data = await apiRequest('/api/organisation-settings');
      setSettings(prev => ({ ...prev, ...data }));
    } catch (error) {
      console.error('Error loading settings:', error);
    } finally {
      setLoading(false);
    }
  };

  const handleSave = async () => {
    setSaving(true);
    try {
      await apiRequest('/api/organisation-settings', {
        method: 'PUT',
        body: JSON.stringify(settings),
      });
      showAlert('Success', 'Organisation settings saved successfully!');
    } catch (error) {
      showAlert('Error', 'Failed to save settings');
    } finally {
      setSaving(false);
    }
  };

  const pickLogo = async () => {
    try {
      const result = await ImagePicker.launchImageLibraryAsync({
        mediaTypes: ImagePicker.MediaTypeOptions.Images,
        allowsEditing: true,
        aspect: [1, 1],
        quality: 0.5,
        base64: true,
      });

      if (!result.canceled && result.assets[0].base64) {
        updateField('logo_base64', `data:image/jpeg;base64,${result.assets[0].base64}`);
        showAlert('Success', 'Logo uploaded successfully');
      }
    } catch (error) {
      showAlert('Error', 'Failed to pick image');
    }
  };

  const removeLogo = () => {
    updateField('logo_base64', '');
  };

  const updateField = (field: keyof OrgSettings, value: string | number) => {
    setSettings(prev => ({ ...prev, [field]: value }));
  };

  const Section = ({ title, icon, id, children }: { title: string; icon: string; id: string; children: React.ReactNode }) => (
    <View style={styles.section}>
      <Pressable style={styles.sectionHeader} onPress={() => setActiveSection(activeSection === id ? null : id)}>
        <View style={styles.sectionTitleRow}>
          <Ionicons name={icon as any} size={20} color={Colors.primary} />
          <Text style={styles.sectionTitle}>{title}</Text>
        </View>
        <Ionicons name={activeSection === id ? 'chevron-up' : 'chevron-down'} size={20} color={Colors.textMuted} />
      </Pressable>
      {activeSection === id && <View style={styles.sectionContent}>{children}</View>}
    </View>
  );

  const InputField = ({ label, value, onChangeText, placeholder, multiline, keyboardType }: any) => (
    <View style={styles.inputGroup}>
      <Text style={styles.inputLabel}>{label}</Text>
      <TextInput
        style={[styles.input, multiline && styles.textArea]}
        value={String(value || '')}
        onChangeText={onChangeText}
        placeholder={placeholder}
        placeholderTextColor={Colors.textMuted}
        multiline={multiline}
        numberOfLines={multiline ? 4 : 1}
        keyboardType={keyboardType || 'default'}
      />
    </View>
  );

  if (loading) {
    return (
      <SafeAreaView style={styles.container}>
        <ScreenHeader title="Organisation Settings" />
        <View style={styles.loadingContainer}>
          <ActivityIndicator size="large" color={Colors.primary} />
        </View>
      </SafeAreaView>
    );
  }

  return (
    <SafeAreaView style={styles.container} edges={['left', 'right']}>
      <ScreenHeader title="Organisation Settings" />
      
      <ScrollView contentContainerStyle={styles.content}>
        {/* Basic Info */}
        <Section title="Basic Information" icon="business" id="basic">
          {/* Logo Upload */}
          <View style={styles.logoSection}>
            <Text style={styles.inputLabel}>Company Logo</Text>
            <View style={styles.logoRow}>
              {settings.logo_base64 ? (
                <Image source={{ uri: settings.logo_base64 }} style={styles.logoImage} />
              ) : (
                <View style={styles.logoPlaceholder}>
                  <Ionicons name="image-outline" size={32} color={Colors.textMuted} />
                </View>
              )}
              <View style={styles.logoButtons}>
                <Pressable style={styles.uploadBtn} onPress={pickLogo}>
                  <Ionicons name="cloud-upload" size={18} color={Colors.primary} />
                  <Text style={styles.uploadBtnText}>Upload Logo</Text>
                </Pressable>
                {settings.logo_base64 && (
                  <Pressable style={styles.removeBtn} onPress={removeLogo}>
                    <Ionicons name="trash-outline" size={18} color={Colors.error} />
                    <Text style={styles.removeBtnText}>Remove</Text>
                  </Pressable>
                )}
              </View>
            </View>
          </View>
          <InputField label="Organisation Name" value={settings.name} onChangeText={(v: string) => updateField('name', v)} placeholder="Company name" />
          <InputField label="Address" value={settings.address} onChangeText={(v: string) => updateField('address', v)} placeholder="Full address" multiline />
          <InputField label="Email" value={settings.email} onChangeText={(v: string) => updateField('email', v)} placeholder="contact@company.com" />
          <InputField label="Phone" value={settings.phone} onChangeText={(v: string) => updateField('phone', v)} placeholder="+91-XXXXXXXXXX" />
        </Section>

        {/* Owner Info */}
        <Section title="Owner Information" icon="person" id="owner">
          <InputField label="Owner Name" value={settings.owner_name} onChangeText={(v: string) => updateField('owner_name', v)} placeholder="Full name" />
          <InputField label="Mobile Number" value={settings.owner_mobile} onChangeText={(v: string) => updateField('owner_mobile', v)} placeholder="+91-XXXXXXXXXX" keyboardType="phone-pad" />
          <InputField label="Email Address" value={settings.owner_email} onChangeText={(v: string) => updateField('owner_email', v)} placeholder="owner@company.com" />
          <InputField label="Address" value={settings.owner_address} onChangeText={(v: string) => updateField('owner_address', v)} placeholder="Owner's address" multiline />
        </Section>

        {/* Tax Info */}
        <Section title="Tax Information" icon="receipt" id="tax">
          <InputField label="GST Number" value={settings.gst_number} onChangeText={(v: string) => updateField('gst_number', v)} placeholder="GSTIN" />
          <InputField label="PAN Number" value={settings.pan_number} onChangeText={(v: string) => updateField('pan_number', v)} placeholder="ABCDE1234F" />
          <InputField label="CGST %" value={settings.cgst_percentage} onChangeText={(v: string) => updateField('cgst_percentage', parseFloat(v) || 0)} placeholder="9" keyboardType="numeric" />
          <InputField label="SGST %" value={settings.sgst_percentage} onChangeText={(v: string) => updateField('sgst_percentage', parseFloat(v) || 0)} placeholder="9" keyboardType="numeric" />
        </Section>

        {/* Currency */}
        <Section title="Currency Settings" icon="cash" id="currency">
          <InputField label="Currency Code" value={settings.currency} onChangeText={(v: string) => updateField('currency', v)} placeholder="INR" />
          <InputField label="Currency Symbol" value={settings.currency_symbol} onChangeText={(v: string) => updateField('currency_symbol', v)} placeholder="₹" />
        </Section>

        {/* Document Prefixes */}
        <Section title="Document Prefixes" icon="document-text" id="prefixes">
          <InputField label="Work Order Prefix" value={settings.wo_prefix} onChangeText={(v: string) => updateField('wo_prefix', v)} placeholder="WO" />
          <InputField label="Payment Certificate Prefix" value={settings.pc_prefix} onChangeText={(v: string) => updateField('pc_prefix', v)} placeholder="PC" />
          <InputField label="Invoice Prefix" value={settings.invoice_prefix} onChangeText={(v: string) => updateField('invoice_prefix', v)} placeholder="INV" />
          <Text style={styles.hintText}>These prefixes will be used when generating document numbers (e.g., WO-00001)</Text>
        </Section>

        {/* Terms & Conditions */}
        <Section title="Terms & Conditions" icon="document" id="terms">
          <Text style={styles.hintText}>This text will be appended to Work Order PDF exports on a separate page.</Text>
          <TextInput
            style={styles.termsInput}
            value={settings.terms_and_conditions}
            onChangeText={(v) => updateField('terms_and_conditions', v)}
            placeholder="Enter your standard terms and conditions here..."
            placeholderTextColor={Colors.textMuted}
            multiline
            numberOfLines={15}
            textAlignVertical="top"
          />
          <Text style={styles.charCount}>{(settings.terms_and_conditions || '').length} characters</Text>
        </Section>

        {/* Save Button */}
        <Pressable 
          style={[styles.saveButton, saving && styles.saveButtonDisabled]} 
          onPress={handleSave}
          disabled={saving}
        >
          {saving ? (
            <ActivityIndicator size="small" color={Colors.white} />
          ) : (
            <>
              <Ionicons name="save" size={20} color={Colors.white} />
              <Text style={styles.saveButtonText}>Save Changes</Text>
            </>
          )}
        </Pressable>
      </ScrollView>
    </SafeAreaView>
  );
}

const styles = StyleSheet.create({
  container: { flex: 1, backgroundColor: Colors.background },
  loadingContainer: { flex: 1, justifyContent: 'center', alignItems: 'center' },
  content: { padding: Spacing.md, paddingBottom: Spacing.xl },
  section: { backgroundColor: Colors.white, borderRadius: BorderRadius.lg, marginBottom: Spacing.md, overflow: 'hidden' },
  sectionHeader: { flexDirection: 'row', justifyContent: 'space-between', alignItems: 'center', padding: Spacing.md },
  sectionTitleRow: { flexDirection: 'row', alignItems: 'center', gap: Spacing.sm },
  sectionTitle: { fontSize: FontSizes.md, fontWeight: '600', color: Colors.text },
  sectionContent: { padding: Spacing.md, paddingTop: 0, borderTopWidth: 1, borderTopColor: Colors.border },
  logoSection: { marginBottom: Spacing.md },
  logoRow: { flexDirection: 'row', alignItems: 'center', gap: Spacing.md, marginTop: Spacing.sm },
  logoImage: { width: 80, height: 80, borderRadius: BorderRadius.md },
  logoPlaceholder: { width: 80, height: 80, borderRadius: BorderRadius.md, backgroundColor: Colors.background, justifyContent: 'center', alignItems: 'center', borderWidth: 1, borderColor: Colors.border, borderStyle: 'dashed' },
  logoButtons: { gap: Spacing.sm },
  uploadBtn: { flexDirection: 'row', alignItems: 'center', gap: Spacing.xs, padding: Spacing.sm, borderWidth: 1, borderColor: Colors.primary, borderRadius: BorderRadius.md },
  uploadBtnText: { fontSize: FontSizes.sm, color: Colors.primary },
  removeBtn: { flexDirection: 'row', alignItems: 'center', gap: Spacing.xs, padding: Spacing.sm },
  removeBtnText: { fontSize: FontSizes.sm, color: Colors.error },
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
  termsInput: {
    backgroundColor: Colors.background,
    borderWidth: 1,
    borderColor: Colors.border,
    borderRadius: BorderRadius.md,
    padding: Spacing.md,
    fontSize: FontSizes.md,
    color: Colors.text,
    minHeight: 200,
    textAlignVertical: 'top',
  },
  hintText: { fontSize: FontSizes.sm, color: Colors.textMuted, marginBottom: Spacing.sm, fontStyle: 'italic' },
  charCount: { fontSize: FontSizes.xs, color: Colors.textMuted, textAlign: 'right', marginTop: Spacing.xs },
  saveButton: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'center',
    gap: Spacing.sm,
    backgroundColor: Colors.primary,
    borderRadius: BorderRadius.md,
    padding: Spacing.md,
    marginTop: Spacing.md,
  },
  saveButtonDisabled: { opacity: 0.6 },
  saveButtonText: { fontSize: FontSizes.md, fontWeight: '600', color: Colors.white },
});
