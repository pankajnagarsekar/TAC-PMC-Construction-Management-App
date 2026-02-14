// OCR SCREEN
// Invoice scanning and data extraction

import React from 'react';
import { View, Text, StyleSheet, ScrollView, TouchableOpacity } from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';
import { Ionicons } from '@expo/vector-icons';
import { Card, Button } from '../../components/ui';
import { Colors, Spacing, FontSizes, BorderRadius } from '../../constants/theme';

export default function OCRScreen() {
  return (
    <SafeAreaView style={styles.container} edges={['left', 'right']}>
      <ScrollView contentContainerStyle={styles.content}>
        <Card style={styles.headerCard}>
          <Ionicons name="scan" size={48} color={Colors.accent} />
          <Text style={styles.title}>Invoice Scanner</Text>
          <Text style={styles.subtitle}>Scan invoices to extract data automatically</Text>
        </Card>

        <Card style={styles.uploadCard}>
          <TouchableOpacity style={styles.uploadArea}>
            <Ionicons name="cloud-upload" size={48} color={Colors.primary} />
            <Text style={styles.uploadText}>Tap to upload invoice image</Text>
            <Text style={styles.uploadHint}>Supported: JPG, PNG, PDF</Text>
          </TouchableOpacity>
        </Card>

        <Card style={styles.resultCard}>
          <Text style={styles.resultTitle}>Extracted Data Preview</Text>
          <View style={styles.resultRow}>
            <Text style={styles.resultLabel}>Vendor Name:</Text>
            <Text style={styles.resultValue}>—</Text>
          </View>
          <View style={styles.resultRow}>
            <Text style={styles.resultLabel}>Invoice Amount:</Text>
            <Text style={styles.resultValue}>—</Text>
          </View>
          <View style={styles.resultRow}>
            <Text style={styles.resultLabel}>Invoice Date:</Text>
            <Text style={styles.resultValue}>—</Text>
          </View>
          <View style={styles.resultRow}>
            <Text style={styles.resultLabel}>Invoice Number:</Text>
            <Text style={styles.resultValue}>—</Text>
          </View>
          <View style={styles.resultRow}>
            <Text style={styles.resultLabel}>Confidence:</Text>
            <Text style={styles.resultValue}>—</Text>
          </View>
        </Card>
      </ScrollView>
    </SafeAreaView>
  );
}

const styles = StyleSheet.create({
  container: { flex: 1, backgroundColor: Colors.background },
  content: { padding: Spacing.md },
  headerCard: { alignItems: 'center', padding: Spacing.xl, marginBottom: Spacing.md },
  title: { fontSize: FontSizes.xl, fontWeight: '600', color: Colors.text, marginTop: Spacing.md },
  subtitle: { fontSize: FontSizes.md, color: Colors.textSecondary, textAlign: 'center', marginTop: Spacing.xs },
  uploadCard: { marginBottom: Spacing.md },
  uploadArea: {
    alignItems: 'center', padding: Spacing.xl,
    borderWidth: 2, borderStyle: 'dashed', borderColor: Colors.border, borderRadius: BorderRadius.lg,
  },
  uploadText: { fontSize: FontSizes.md, fontWeight: '500', color: Colors.text, marginTop: Spacing.md },
  uploadHint: { fontSize: FontSizes.sm, color: Colors.textMuted, marginTop: Spacing.xs },
  resultCard: { },
  resultTitle: { fontSize: FontSizes.lg, fontWeight: '600', color: Colors.text, marginBottom: Spacing.md },
  resultRow: { flexDirection: 'row', justifyContent: 'space-between', paddingVertical: Spacing.sm, borderBottomWidth: 1, borderBottomColor: Colors.border },
  resultLabel: { fontSize: FontSizes.sm, color: Colors.textSecondary },
  resultValue: { fontSize: FontSizes.sm, fontWeight: '500', color: Colors.text },
});
