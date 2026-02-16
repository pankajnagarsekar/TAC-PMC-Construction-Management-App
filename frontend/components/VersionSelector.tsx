// VERSION SELECTOR COMPONENT
// UI-3: Dropdown to view historical versions (snapshots) of documents
// Loads versions from backend, shows read-only view for historical versions

import React, { useState, useEffect } from 'react';
import { View, Text, StyleSheet, Pressable, Modal, FlatList, ActivityIndicator } from 'react-native';
import { Ionicons } from '@expo/vector-icons';
import { Colors, Spacing, FontSizes, BorderRadius } from '../constants/theme';
import apiClient from '../services/apiClient';

interface VersionInfo {
  version: number;
  snapshot_id?: string;
  created_at: string;
  is_current: boolean;
}

interface VersionSelectorProps {
  entityType: 'work_order' | 'payment_certificate' | 'dpr';
  entityId: string;
  currentVersion?: number;
  onVersionSelect: (version: number, snapshotData: any | null) => void;
}

export function VersionSelector({
  entityType,
  entityId,
  currentVersion = 1,
  onVersionSelect,
}: VersionSelectorProps) {
  const [versions, setVersions] = useState<VersionInfo[]>([]);
  const [selectedVersion, setSelectedVersion] = useState(currentVersion);
  const [loading, setLoading] = useState(false);
  const [modalVisible, setModalVisible] = useState(false);
  const [loadingSnapshot, setLoadingSnapshot] = useState(false);

  useEffect(() => {
    fetchVersions();
  }, [entityType, entityId]);

  useEffect(() => {
    setSelectedVersion(currentVersion);
  }, [currentVersion]);

  const fetchVersions = async () => {
    setLoading(true);
    try {
      const endpoint = getVersionsEndpoint(entityType, entityId);
      const response = await apiClient.get(endpoint);
      const versionList: VersionInfo[] = response.versions || [];
      
      // Mark current as latest
      if (versionList.length > 0) {
        const maxVersion = Math.max(...versionList.map(v => v.version));
        versionList.forEach(v => {
          v.is_current = v.version === maxVersion;
        });
      }
      
      setVersions(versionList.sort((a, b) => b.version - a.version));
    } catch (error) {
      console.error('Failed to fetch versions:', error);
      // Create a default version if fetch fails
      setVersions([{
        version: currentVersion,
        created_at: new Date().toISOString(),
        is_current: true,
      }]);
    } finally {
      setLoading(false);
    }
  };

  const handleVersionSelect = async (version: number) => {
    setLoadingSnapshot(true);
    setModalVisible(false);
    
    try {
      const selectedVersionInfo = versions.find(v => v.version === version);
      
      if (selectedVersionInfo?.is_current) {
        // Current version - no snapshot needed, use live data
        setSelectedVersion(version);
        onVersionSelect(version, null);
      } else {
        // Historical version - load snapshot
        const endpoint = getSnapshotEndpoint(entityType, entityId, version);
        const snapshotData = await apiClient.get(endpoint);
        setSelectedVersion(version);
        onVersionSelect(version, snapshotData);
      }
    } catch (error) {
      console.error('Failed to load version:', error);
      // Still update selection even if snapshot load fails
      setSelectedVersion(version);
      onVersionSelect(version, null);
    } finally {
      setLoadingSnapshot(false);
    }
  };

  const formatDate = (dateStr: string) => {
    try {
      return new Date(dateStr).toLocaleDateString(undefined, {
        year: 'numeric',
        month: 'short',
        day: 'numeric',
        hour: '2-digit',
        minute: '2-digit',
      });
    } catch {
      return dateStr;
    }
  };

  const currentVersionInfo = versions.find(v => v.version === selectedVersion);
  const isViewingHistorical = currentVersionInfo && !currentVersionInfo.is_current;

  if (versions.length <= 1 && !loading) {
    return null; // Don't show selector if only one version
  }

  return (
    <View style={styles.container}>
      <Pressable
        style={[styles.selector, isViewingHistorical && styles.selectorHistorical]}
        onPress={() => setModalVisible(true)}
        disabled={loading || loadingSnapshot}
      >
        {loading || loadingSnapshot ? (
          <ActivityIndicator size="small" color={Colors.primary} />
        ) : (
          <>
            <Ionicons 
              name={isViewingHistorical ? "time" : "document-text"} 
              size={16} 
              color={isViewingHistorical ? Colors.warning : Colors.primary} 
            />
            <Text style={[styles.selectorText, isViewingHistorical && styles.selectorTextHistorical]}>
              Version {selectedVersion}
              {isViewingHistorical && ' (Historical)'}
            </Text>
            <Ionicons name="chevron-down" size={16} color={Colors.textMuted} />
          </>
        )}
      </Pressable>

      {isViewingHistorical && (
        <View style={styles.readOnlyBanner}>
          <Ionicons name="lock-closed" size={14} color={Colors.warning} />
          <Text style={styles.readOnlyText}>Read-only historical view</Text>
          <Pressable onPress={() => handleVersionSelect(versions[0]?.version || 1)}>
            <Text style={styles.viewLatestLink}>View Latest</Text>
          </Pressable>
        </View>
      )}

      <Modal
        visible={modalVisible}
        transparent
        animationType="fade"
        onRequestClose={() => setModalVisible(false)}
      >
        <Pressable style={styles.modalOverlay} onPress={() => setModalVisible(false)}>
          <View style={styles.modalContent}>
            <View style={styles.modalHeader}>
              <Text style={styles.modalTitle}>Select Version</Text>
              <Pressable onPress={() => setModalVisible(false)}>
                <Ionicons name="close" size={24} color={Colors.text} />
              </Pressable>
            </View>

            <FlatList
              data={versions}
              keyExtractor={(item) => `v${item.version}`}
              renderItem={({ item }) => (
                <Pressable
                  style={[
                    styles.versionItem,
                    item.version === selectedVersion && styles.versionItemSelected,
                  ]}
                  onPress={() => handleVersionSelect(item.version)}
                >
                  <View style={styles.versionInfo}>
                    <View style={styles.versionRow}>
                      <Text style={styles.versionNumber}>Version {item.version}</Text>
                      {item.is_current && (
                        <View style={styles.latestBadge}>
                          <Text style={styles.latestBadgeText}>Latest</Text>
                        </View>
                      )}
                    </View>
                    <Text style={styles.versionDate}>{formatDate(item.created_at)}</Text>
                  </View>
                  {item.version === selectedVersion && (
                    <Ionicons name="checkmark-circle" size={20} color={Colors.success} />
                  )}
                </Pressable>
              )}
              ListEmptyComponent={
                <Text style={styles.emptyText}>No versions available</Text>
              }
            />
          </View>
        </Pressable>
      </Modal>
    </View>
  );
}

// Helper functions
function getVersionsEndpoint(entityType: string, entityId: string): string {
  switch (entityType) {
    case 'work_order':
      return `/api/v2/work-orders/${entityId}/versions`;
    case 'payment_certificate':
      return `/api/v2/payment-certificates/${entityId}/versions`;
    case 'dpr':
      return `/api/v2/dpr/${entityId}/versions`;
    default:
      return `/api/v2/${entityType}/${entityId}/versions`;
  }
}

function getSnapshotEndpoint(entityType: string, entityId: string, version: number): string {
  switch (entityType) {
    case 'work_order':
      return `/api/v2/work-orders/${entityId}/snapshots/${version}`;
    case 'payment_certificate':
      return `/api/v2/payment-certificates/${entityId}/snapshots/${version}`;
    case 'dpr':
      return `/api/v2/dpr/${entityId}/snapshots/${version}`;
    default:
      return `/api/v2/${entityType}/${entityId}/snapshots/${version}`;
  }
}

const styles = StyleSheet.create({
  container: {
    marginBottom: Spacing.md,
  },
  selector: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: Spacing.xs,
    backgroundColor: Colors.white,
    paddingHorizontal: Spacing.md,
    paddingVertical: Spacing.sm,
    borderRadius: BorderRadius.md,
    borderWidth: 1,
    borderColor: Colors.border,
  },
  selectorHistorical: {
    borderColor: Colors.warning,
    backgroundColor: Colors.warning + '10',
  },
  selectorText: {
    flex: 1,
    fontSize: FontSizes.sm,
    color: Colors.text,
  },
  selectorTextHistorical: {
    color: Colors.warning,
    fontWeight: '600',
  },
  readOnlyBanner: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: Spacing.xs,
    backgroundColor: Colors.warning + '15',
    paddingHorizontal: Spacing.md,
    paddingVertical: Spacing.xs,
    borderRadius: BorderRadius.sm,
    marginTop: Spacing.xs,
  },
  readOnlyText: {
    flex: 1,
    fontSize: FontSizes.xs,
    color: Colors.warning,
  },
  viewLatestLink: {
    fontSize: FontSizes.xs,
    color: Colors.primary,
    fontWeight: '600',
  },
  modalOverlay: {
    flex: 1,
    backgroundColor: 'rgba(0,0,0,0.5)',
    justifyContent: 'center',
    alignItems: 'center',
    padding: Spacing.lg,
  },
  modalContent: {
    backgroundColor: Colors.white,
    borderRadius: BorderRadius.lg,
    width: '100%',
    maxWidth: 400,
    maxHeight: '70%',
  },
  modalHeader: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
    padding: Spacing.md,
    borderBottomWidth: 1,
    borderBottomColor: Colors.border,
  },
  modalTitle: {
    fontSize: FontSizes.lg,
    fontWeight: '600',
    color: Colors.text,
  },
  versionItem: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    padding: Spacing.md,
    borderBottomWidth: 1,
    borderBottomColor: Colors.border,
  },
  versionItemSelected: {
    backgroundColor: Colors.primary + '10',
  },
  versionInfo: {
    flex: 1,
  },
  versionRow: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: Spacing.sm,
  },
  versionNumber: {
    fontSize: FontSizes.md,
    fontWeight: '600',
    color: Colors.text,
  },
  latestBadge: {
    backgroundColor: Colors.success + '20',
    paddingHorizontal: Spacing.xs,
    paddingVertical: 2,
    borderRadius: BorderRadius.sm,
  },
  latestBadgeText: {
    fontSize: FontSizes.xs,
    color: Colors.success,
    fontWeight: '600',
  },
  versionDate: {
    fontSize: FontSizes.sm,
    color: Colors.textMuted,
    marginTop: 2,
  },
  emptyText: {
    textAlign: 'center',
    padding: Spacing.lg,
    color: Colors.textMuted,
  },
});

export default VersionSelector;
