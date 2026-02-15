// DPR SUMMARY REPORT SCREEN
import React from 'react';
import { View, Text, StyleSheet } from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';
import { Colors, Spacing, FontSizes } from '../../../constants/theme';

export default function DPRSummaryReportScreen() {
  return (
    <SafeAreaView style={styles.container}>
      <View style={styles.content}>
        <Text style={styles.title}>DPR Summary Report</Text>
        <Text style={styles.subtitle}>Daily progress report overview</Text>
      </View>
    </SafeAreaView>
  );
}

const styles = StyleSheet.create({
  container: { flex: 1, backgroundColor: Colors.background },
  content: { flex: 1, justifyContent: 'center', alignItems: 'center', padding: Spacing.lg },
  title: { fontSize: FontSizes.xl, fontWeight: '600', color: Colors.text },
  subtitle: { fontSize: FontSizes.md, color: Colors.textSecondary, marginTop: Spacing.sm },
});
