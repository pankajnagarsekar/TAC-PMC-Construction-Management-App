// APPEARANCE SETTINGS SCREEN
// Customize app theme and display preferences
import React, { useState, useEffect } from 'react';
import {
  View,
  Text,
  StyleSheet,
  ScrollView,
  Pressable,
  Switch,
  Platform,
  Alert,
} from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';
import { Ionicons } from '@expo/vector-icons';
import AsyncStorage from '@react-native-async-storage/async-storage';
import { Colors, Spacing, FontSizes, BorderRadius } from '../../../constants/theme';
import ScreenHeader from '../../../components/ScreenHeader';

const STORAGE_KEY = 'app_appearance_settings';

const showAlert = (title: string, message: string) => {
  if (Platform.OS === 'web') {
    window.alert(`${title}: ${message}`);
  } else {
    Alert.alert(title, message);
  }
};

interface AppearanceSettings {
  theme: 'light' | 'dark' | 'system';
  fontSize: 'small' | 'medium' | 'large';
  compactMode: boolean;
  showAmounts: boolean;
  colorScheme: string;
}

const defaultSettings: AppearanceSettings = {
  theme: 'light',
  fontSize: 'medium',
  compactMode: false,
  showAmounts: true,
  colorScheme: 'blue',
};

const THEMES = [
  { id: 'light', label: 'Light', icon: 'sunny' },
  { id: 'dark', label: 'Dark', icon: 'moon' },
  { id: 'system', label: 'System', icon: 'phone-portrait' },
];

const FONT_SIZES = [
  { id: 'small', label: 'Small', size: 14 },
  { id: 'medium', label: 'Medium', size: 16 },
  { id: 'large', label: 'Large', size: 18 },
];

const COLOR_SCHEMES = [
  { id: 'blue', color: '#2563eb', label: 'Blue' },
  { id: 'green', color: '#059669', label: 'Green' },
  { id: 'purple', color: '#7c3aed', label: 'Purple' },
  { id: 'orange', color: '#ea580c', label: 'Orange' },
  { id: 'red', color: '#dc2626', label: 'Red' },
];

export default function AppearanceSettingsScreen() {
  const [settings, setSettings] = useState<AppearanceSettings>(defaultSettings);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    loadSettings();
  }, []);

  const loadSettings = async () => {
    try {
      const stored = await AsyncStorage.getItem(STORAGE_KEY);
      if (stored) {
        setSettings({ ...defaultSettings, ...JSON.parse(stored) });
      }
    } catch (error) {
      console.error('Error loading settings:', error);
    } finally {
      setLoading(false);
    }
  };

  const saveSettings = async (newSettings: AppearanceSettings) => {
    try {
      await AsyncStorage.setItem(STORAGE_KEY, JSON.stringify(newSettings));
      setSettings(newSettings);
      showAlert('Success', 'Appearance settings saved');
    } catch (error) {
      showAlert('Error', 'Failed to save settings');
    }
  };

  const updateSetting = <K extends keyof AppearanceSettings>(
    key: K,
    value: AppearanceSettings[K]
  ) => {
    const newSettings = { ...settings, [key]: value };
    saveSettings(newSettings);
  };

  return (
    <SafeAreaView style={styles.container} edges={['left', 'right']}>
      <ScreenHeader title="Appearance" />
      
      <ScrollView contentContainerStyle={styles.content}>
        {/* Theme Selection */}
        <View style={styles.section}>
          <Text style={styles.sectionTitle}>Theme</Text>
          <View style={styles.optionRow}>
            {THEMES.map((theme) => (
              <Pressable
                key={theme.id}
                style={[
                  styles.themeOption,
                  settings.theme === theme.id && styles.themeOptionActive,
                ]}
                onPress={() => updateSetting('theme', theme.id as any)}
              >
                <Ionicons
                  name={theme.icon as any}
                  size={24}
                  color={settings.theme === theme.id ? Colors.primary : Colors.textMuted}
                />
                <Text
                  style={[
                    styles.themeLabel,
                    settings.theme === theme.id && styles.themeLabelActive,
                  ]}
                >
                  {theme.label}
                </Text>
              </Pressable>
            ))}
          </View>
        </View>

        {/* Font Size */}
        <View style={styles.section}>
          <Text style={styles.sectionTitle}>Font Size</Text>
          <View style={styles.optionRow}>
            {FONT_SIZES.map((size) => (
              <Pressable
                key={size.id}
                style={[
                  styles.sizeOption,
                  settings.fontSize === size.id && styles.sizeOptionActive,
                ]}
                onPress={() => updateSetting('fontSize', size.id as any)}
              >
                <Text
                  style={[
                    styles.sizeLabel,
                    { fontSize: size.size },
                    settings.fontSize === size.id && styles.sizeLabelActive,
                  ]}
                >
                  Aa
                </Text>
                <Text style={styles.sizeText}>{size.label}</Text>
              </Pressable>
            ))}
          </View>
        </View>

        {/* Color Scheme */}
        <View style={styles.section}>
          <Text style={styles.sectionTitle}>Accent Color</Text>
          <View style={styles.colorRow}>
            {COLOR_SCHEMES.map((scheme) => (
              <Pressable
                key={scheme.id}
                style={styles.colorOption}
                onPress={() => updateSetting('colorScheme', scheme.id)}
              >
                <View
                  style={[
                    styles.colorCircle,
                    { backgroundColor: scheme.color },
                    settings.colorScheme === scheme.id && styles.colorCircleActive,
                  ]}
                >
                  {settings.colorScheme === scheme.id && (
                    <Ionicons name="checkmark" size={16} color="white" />
                  )}
                </View>
                <Text style={styles.colorLabel}>{scheme.label}</Text>
              </Pressable>
            ))}
          </View>
        </View>

        {/* Toggle Settings */}
        <View style={styles.section}>
          <Text style={styles.sectionTitle}>Display Options</Text>
          
          <View style={styles.toggleItem}>
            <View style={styles.toggleInfo}>
              <Text style={styles.toggleLabel}>Compact Mode</Text>
              <Text style={styles.toggleDesc}>Show more content with less spacing</Text>
            </View>
            <Switch
              value={settings.compactMode}
              onValueChange={(value) => updateSetting('compactMode', value)}
              trackColor={{ false: Colors.border, true: Colors.primary }}
              thumbColor={Colors.white}
            />
          </View>

          <View style={styles.toggleItem}>
            <View style={styles.toggleInfo}>
              <Text style={styles.toggleLabel}>Show Amounts</Text>
              <Text style={styles.toggleDesc}>Display financial amounts in lists</Text>
            </View>
            <Switch
              value={settings.showAmounts}
              onValueChange={(value) => updateSetting('showAmounts', value)}
              trackColor={{ false: Colors.border, true: Colors.primary }}
              thumbColor={Colors.white}
            />
          </View>
        </View>

        {/* Preview */}
        <View style={styles.section}>
          <Text style={styles.sectionTitle}>Preview</Text>
          <View style={styles.previewCard}>
            <Text style={[styles.previewTitle, { fontSize: FONT_SIZES.find(f => f.id === settings.fontSize)?.size || 16 }]}>
              Sample Card Title
            </Text>
            <Text style={styles.previewText}>
              This is how your content will appear with current settings.
            </Text>
            <View style={[styles.previewAccent, { backgroundColor: COLOR_SCHEMES.find(c => c.id === settings.colorScheme)?.color || Colors.primary }]} />
          </View>
        </View>

        {/* Reset */}
        <Pressable style={styles.resetButton} onPress={() => saveSettings(defaultSettings)}>
          <Ionicons name="refresh" size={20} color={Colors.error} />
          <Text style={styles.resetText}>Reset to Defaults</Text>
        </Pressable>
      </ScrollView>
    </SafeAreaView>
  );
}

const styles = StyleSheet.create({
  container: { flex: 1, backgroundColor: Colors.background },
  content: { padding: Spacing.md },
  section: { marginBottom: Spacing.lg },
  sectionTitle: { fontSize: FontSizes.sm, fontWeight: '600', color: Colors.textMuted, marginBottom: Spacing.sm, textTransform: 'uppercase' },
  optionRow: { flexDirection: 'row', gap: Spacing.sm },
  themeOption: {
    flex: 1,
    backgroundColor: Colors.white,
    borderRadius: BorderRadius.md,
    padding: Spacing.md,
    alignItems: 'center',
    borderWidth: 2,
    borderColor: 'transparent',
  },
  themeOptionActive: { borderColor: Colors.primary },
  themeLabel: { fontSize: FontSizes.sm, color: Colors.textSecondary, marginTop: Spacing.xs },
  themeLabelActive: { color: Colors.primary, fontWeight: '600' },
  sizeOption: {
    flex: 1,
    backgroundColor: Colors.white,
    borderRadius: BorderRadius.md,
    padding: Spacing.md,
    alignItems: 'center',
    borderWidth: 2,
    borderColor: 'transparent',
  },
  sizeOptionActive: { borderColor: Colors.primary },
  sizeLabel: { color: Colors.textSecondary, fontWeight: '600' },
  sizeLabelActive: { color: Colors.primary },
  sizeText: { fontSize: FontSizes.xs, color: Colors.textMuted, marginTop: 4 },
  colorRow: { flexDirection: 'row', flexWrap: 'wrap', gap: Spacing.md },
  colorOption: { alignItems: 'center' },
  colorCircle: {
    width: 44,
    height: 44,
    borderRadius: 22,
    justifyContent: 'center',
    alignItems: 'center',
  },
  colorCircleActive: { borderWidth: 3, borderColor: Colors.white, shadowColor: '#000', shadowOffset: { width: 0, height: 2 }, shadowOpacity: 0.2, shadowRadius: 4, elevation: 4 },
  colorLabel: { fontSize: FontSizes.xs, color: Colors.textMuted, marginTop: 4 },
  toggleItem: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
    backgroundColor: Colors.white,
    borderRadius: BorderRadius.md,
    padding: Spacing.md,
    marginBottom: Spacing.sm,
  },
  toggleInfo: { flex: 1, marginRight: Spacing.md },
  toggleLabel: { fontSize: FontSizes.md, fontWeight: '500', color: Colors.text },
  toggleDesc: { fontSize: FontSizes.sm, color: Colors.textMuted, marginTop: 2 },
  previewCard: {
    backgroundColor: Colors.white,
    borderRadius: BorderRadius.md,
    padding: Spacing.md,
    overflow: 'hidden',
  },
  previewTitle: { fontWeight: '600', color: Colors.text, marginBottom: Spacing.xs },
  previewText: { fontSize: FontSizes.sm, color: Colors.textSecondary },
  previewAccent: { height: 4, marginTop: Spacing.md, marginHorizontal: -Spacing.md, marginBottom: -Spacing.md },
  resetButton: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'center',
    gap: Spacing.xs,
    padding: Spacing.md,
    marginTop: Spacing.md,
  },
  resetText: { fontSize: FontSizes.md, color: Colors.error },
});
