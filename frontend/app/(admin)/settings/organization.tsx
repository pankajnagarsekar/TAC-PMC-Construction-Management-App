// ORGANIZATION SETTINGS SCREEN
// View organization details

import React, { useState, useEffect } from 'react';
import {
  View,
  Text,
  StyleSheet,
  ScrollView,
  ActivityIndicator,
} from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';
import { Ionicons } from '@expo/vector-icons';
import { useAuth } from '../../../contexts/AuthContext';
import { Colors, Spacing, FontSizes, BorderRadius } from '../../../constants/theme';

export default function OrganizationSettingsScreen() {
  const { user } = useAuth();
  const [loading, setLoading] = useState(false);

  // Organization info from user context or default
  const orgInfo = {
    name: 'Construction Management Corp',
    id: user?.organisation_id || 'ORG-001',
    address: '123 Business Park, Mumbai, India',
    email: 'contact@constructionmgmt.com',
    phone: '+91-22-12345678',
    gst: 'GSTIN123456789',
    pan: 'ABCDE1234F',
  };

  const InfoRow = ({ icon, label, value }: { icon: string; label: string; value: string }) => (
    <View style={styles.infoRow}>
      <View style={styles.infoIcon}>
        <Ionicons name={icon as any} size={20} color={Colors.primary} />
      </View>
      <View style={styles.infoContent}>
        <Text style={styles.infoLabel}>{label}</Text>
        <Text style={styles.infoValue}>{value}</Text>
      </View>
    </View>
  );

  if (loading) {
    return (
      <SafeAreaView style={styles.container}>
        <View style={styles.loadingContainer}>
          <ActivityIndicator size="large" color={Colors.primary} />
        </View>
      </SafeAreaView>
    );
  }

  return (
    <SafeAreaView style={styles.container} edges={['left', 'right']}>
      <ScrollView contentContainerStyle={styles.content}>
        {/* Organization Logo/Header */}
        <View style={styles.headerCard}>
          <View style={styles.logoContainer}>
            <Ionicons name="business" size={48} color={Colors.primary} />
          </View>
          <Text style={styles.orgName}>{orgInfo.name}</Text>
          <Text style={styles.orgId}>ID: {orgInfo.id}</Text>
        </View>

        {/* Contact Information */}
        <View style={styles.section}>
          <Text style={styles.sectionTitle}>Contact Information</Text>
          <View style={styles.card}>
            <InfoRow icon="location" label="Address" value={orgInfo.address} />
            <InfoRow icon="mail" label="Email" value={orgInfo.email} />
            <InfoRow icon="call" label="Phone" value={orgInfo.phone} />
          </View>
        </View>

        {/* Tax Information */}
        <View style={styles.section}>
          <Text style={styles.sectionTitle}>Tax Information</Text>
          <View style={styles.card}>
            <InfoRow icon="receipt" label="GSTIN" value={orgInfo.gst} />
            <InfoRow icon="card" label="PAN" value={orgInfo.pan} />
          </View>
        </View>

        {/* System Info */}
        <View style={styles.section}>
          <Text style={styles.sectionTitle}>System Information</Text>
          <View style={styles.card}>
            <InfoRow icon="server" label="Database" value="MongoDB (Replica Set)" />
            <InfoRow icon="shield-checkmark" label="Security" value="JWT Authentication" />
            <InfoRow icon="analytics" label="Financial Precision" value="Decimal128 Enabled" />
          </View>
        </View>
      </ScrollView>
    </SafeAreaView>
  );
}

const styles = StyleSheet.create({
  container: { flex: 1, backgroundColor: Colors.background },
  loadingContainer: { flex: 1, justifyContent: 'center', alignItems: 'center' },
  content: { padding: Spacing.md },
  headerCard: {
    backgroundColor: Colors.white,
    borderRadius: BorderRadius.lg,
    padding: Spacing.xl,
    alignItems: 'center',
    marginBottom: Spacing.lg,
  },
  logoContainer: {
    width: 80,
    height: 80,
    borderRadius: 40,
    backgroundColor: Colors.primaryLight + '30',
    justifyContent: 'center',
    alignItems: 'center',
    marginBottom: Spacing.md,
  },
  orgName: { fontSize: FontSizes.xl, fontWeight: 'bold', color: Colors.text },
  orgId: { fontSize: FontSizes.sm, color: Colors.textSecondary, marginTop: Spacing.xs },
  section: { marginBottom: Spacing.lg },
  sectionTitle: {
    fontSize: FontSizes.sm,
    fontWeight: '600',
    color: Colors.textMuted,
    textTransform: 'uppercase',
    marginBottom: Spacing.sm,
    marginLeft: Spacing.xs,
  },
  card: {
    backgroundColor: Colors.white,
    borderRadius: BorderRadius.lg,
    overflow: 'hidden',
  },
  infoRow: {
    flexDirection: 'row',
    alignItems: 'center',
    padding: Spacing.md,
    borderBottomWidth: 1,
    borderBottomColor: Colors.border,
  },
  infoIcon: {
    width: 40,
    height: 40,
    borderRadius: 20,
    backgroundColor: Colors.primaryLight + '20',
    justifyContent: 'center',
    alignItems: 'center',
    marginRight: Spacing.md,
  },
  infoContent: { flex: 1 },
  infoLabel: { fontSize: FontSizes.sm, color: Colors.textSecondary },
  infoValue: { fontSize: FontSizes.md, fontWeight: '500', color: Colors.text },
});
