// VOICE LOG SCREEN (Supervisor)
// Record and manage voice logs

import React from 'react';
import { View, Text, StyleSheet, ScrollView, TouchableOpacity } from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';
import { Ionicons } from '@expo/vector-icons';
import { Card } from '../../components/ui';
import { Colors, Spacing, FontSizes, BorderRadius } from '../../constants/theme';

export default function VoiceLogScreen() {
  return (
    <SafeAreaView style={styles.container} edges={['left', 'right']}>
      <ScrollView contentContainerStyle={styles.content}>
        <Card style={styles.headerCard}>
          <Ionicons name="mic" size={48} color={Colors.accent} />
          <Text style={styles.title}>Voice Log</Text>
          <Text style={styles.subtitle}>Record voice notes for daily updates</Text>
        </Card>

        <Card style={styles.recordCard}>
          <TouchableOpacity style={styles.recordButton}>
            <View style={styles.recordCircle}>
              <Ionicons name="mic" size={32} color={Colors.white} />
            </View>
          </TouchableOpacity>
          <Text style={styles.recordText}>Tap to start recording</Text>
          <Text style={styles.recordHint}>Your voice will be transcribed automatically</Text>
        </Card>

        <View style={styles.section}>
          <Text style={styles.sectionTitle}>Recent Voice Logs</Text>
          <View style={styles.placeholderList}>
            <Text style={styles.placeholderText}>Voice logs will be listed here</Text>
            <Text style={styles.placeholderSubtext}>Date, Duration, Transcription</Text>
          </View>
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
  recordCard: { alignItems: 'center', padding: Spacing.xl, marginBottom: Spacing.lg },
  recordButton: { marginBottom: Spacing.md },
  recordCircle: {
    width: 80, height: 80, borderRadius: 40, backgroundColor: Colors.accent,
    justifyContent: 'center', alignItems: 'center',
    shadowColor: Colors.accent, shadowOffset: { width: 0, height: 4 },
    shadowOpacity: 0.3, shadowRadius: 8, elevation: 5,
  },
  recordText: { fontSize: FontSizes.md, fontWeight: '500', color: Colors.text },
  recordHint: { fontSize: FontSizes.sm, color: Colors.textMuted, marginTop: Spacing.xs },
  section: { marginBottom: Spacing.lg },
  sectionTitle: { fontSize: FontSizes.lg, fontWeight: '600', color: Colors.text, marginBottom: Spacing.md },
  placeholderList: { alignItems: 'center', padding: Spacing.xl },
  placeholderText: { fontSize: FontSizes.md, color: Colors.textSecondary },
  placeholderSubtext: { fontSize: FontSizes.sm, color: Colors.textMuted, marginTop: Spacing.xs },
});
