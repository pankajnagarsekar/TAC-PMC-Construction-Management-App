// PAYMENT CERTIFICATES SCREEN
// Manage payment certificates

import React from 'react';
import { View, Text, StyleSheet, ScrollView, TouchableOpacity } from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';
import { Ionicons } from '@expo/vector-icons';
import { Card } from '../../components/ui';
import { Colors, Spacing, FontSizes } from '../../constants/theme';

export default function PaymentCertificatesScreen() {
  return (
    <SafeAreaView style={styles.container} edges={['left', 'right']}>
      <ScrollView contentContainerStyle={styles.content}>
        <Card style={styles.headerCard}>
          <Ionicons name="card" size={48} color={Colors.primary} />
          <Text style={styles.title}>Payment Certificates</Text>
          <Text style={styles.subtitle}>Create and certify payment certificates</Text>
        </Card>

        <View style={styles.placeholderList}>
          <Text style={styles.placeholderText}>Payment certificates will be listed here</Text>
          <Text style={styles.placeholderSubtext}>Filter by status: Draft | Certified | Partially Paid | Fully Paid</Text>
        </View>
      </ScrollView>

      <TouchableOpacity style={styles.fab}>
        <Ionicons name="add" size={28} color={Colors.white} />
      </TouchableOpacity>
    </SafeAreaView>
  );
}

const styles = StyleSheet.create({
  container: { flex: 1, backgroundColor: Colors.background },
  content: { padding: Spacing.md },
  headerCard: { alignItems: 'center', padding: Spacing.xl, marginBottom: Spacing.lg },
  title: { fontSize: FontSizes.xl, fontWeight: '600', color: Colors.text, marginTop: Spacing.md },
  subtitle: { fontSize: FontSizes.md, color: Colors.textSecondary, textAlign: 'center', marginTop: Spacing.xs },
  placeholderList: { alignItems: 'center', padding: Spacing.xl },
  placeholderText: { fontSize: FontSizes.md, color: Colors.textSecondary },
  placeholderSubtext: { fontSize: FontSizes.sm, color: Colors.textMuted, marginTop: Spacing.xs },
  fab: {
    position: 'absolute', right: Spacing.lg, bottom: Spacing.lg,
    width: 56, height: 56, borderRadius: 28,
    backgroundColor: Colors.accent, justifyContent: 'center', alignItems: 'center',
    shadowColor: Colors.accent, shadowOffset: { width: 0, height: 4 },
    shadowOpacity: 0.3, shadowRadius: 8, elevation: 5,
  },
});
