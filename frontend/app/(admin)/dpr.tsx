// DPR SCREEN
// Daily Progress Report generation and management

import React from 'react';
import { View, Text, StyleSheet, ScrollView, TouchableOpacity } from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';
import { Ionicons } from '@expo/vector-icons';
import { Card, Button } from '../../components/ui';
import { Colors, Spacing, FontSizes } from '../../constants/theme';

export default function DPRScreen() {
  return (
    <SafeAreaView style={styles.container} edges={['left', 'right']}>
      <ScrollView contentContainerStyle={styles.content}>
        <Card style={styles.headerCard}>
          <Ionicons name="document" size={48} color={Colors.primary} />
          <Text style={styles.title}>Daily Progress Reports</Text>
          <Text style={styles.subtitle}>Generate and review DPRs</Text>
        </Card>

        <Card style={styles.generateCard}>
          <Text style={styles.generateTitle}>Generate New DPR</Text>
          <Text style={styles.generateSubtitle}>Create a daily progress report for today</Text>
          <Button title="Generate DPR" onPress={() => {}} style={styles.generateButton} />
        </Card>

        <View style={styles.placeholderList}>
          <Text style={styles.placeholderText}>Generated DPRs will be listed here</Text>
          <Text style={styles.placeholderSubtext}>Date, Supervisor, File, Drive Link</Text>
        </View>
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
  generateCard: { marginBottom: Spacing.lg },
  generateTitle: { fontSize: FontSizes.lg, fontWeight: '600', color: Colors.text },
  generateSubtitle: { fontSize: FontSizes.sm, color: Colors.textSecondary, marginTop: Spacing.xs, marginBottom: Spacing.md },
  generateButton: { marginTop: Spacing.sm },
  placeholderList: { alignItems: 'center', padding: Spacing.xl },
  placeholderText: { fontSize: FontSizes.md, color: Colors.textSecondary },
  placeholderSubtext: { fontSize: FontSizes.sm, color: Colors.textMuted, marginTop: Spacing.xs },
});
