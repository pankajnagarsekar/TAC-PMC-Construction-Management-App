// DPR DETAIL/EDIT SCREEN
// View and edit existing Daily Progress Reports
// UI-3: Version selector for viewing historical snapshots
// M10: Admin can view images and edit captions

import React, { useState, useEffect, useCallback } from 'react';
import {
  View,
  Text,
  StyleSheet,
  TextInput,
  ScrollView,
  Pressable,
  Alert,
  ActivityIndicator,
  Platform,
  Image,
  RefreshControl,
  TouchableOpacity,
} from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';
import { useRouter, useLocalSearchParams } from 'expo-router';
import { Ionicons } from '@expo/vector-icons';
import * as ImagePicker from 'expo-image-picker';
import * as Print from 'expo-print';
import * as Sharing from 'expo-sharing';
import { apiClient } from '../../../services/apiClient';
import { Colors, Spacing, FontSizes, BorderRadius } from '../../../constants/theme';
import { VersionSelector } from '../../../components/VersionSelector';

interface DPRImage {
  image_id: string;
  image_url?: string;
  caption?: string;
  uploaded_at?: string;
}

interface DPRDetail {
  dpr_id: string;
  project_id: string;
  project_name?: string;
  project_code?: string;
  dpr_date: string;
  status: string;
  progress_notes?: string;
  weather_conditions?: string;
  manpower_count?: number;
  issues_encountered?: string;
  images: DPRImage[];
  created_at: string;
  updated_at?: string;
  version?: number;
  locked_flag?: boolean;
}

export default function DPRDetailScreen() {
  const router = useRouter();
  const { id } = useLocalSearchParams<{ id: string }>();
  
  const [dpr, setDpr] = useState<DPRDetail | null>(null);
  const [loading, setLoading] = useState(true);
  const [refreshing, setRefreshing] = useState(false);
  const [editing, setEditing] = useState(false);
  const [saving, setSaving] = useState(false);
  const [generatingPdf, setGeneratingPdf] = useState(false);
  const [isViewingHistorical, setIsViewingHistorical] = useState(false);
  
  // Editable fields
  const [progressNotes, setProgressNotes] = useState('');
  const [weatherConditions, setWeatherConditions] = useState('');
  const [manpowerCount, setManpowerCount] = useState('');
  const [issuesEncountered, setIssuesEncountered] = useState('');
  
  // M10: Image caption editing
  const [editingCaptions, setEditingCaptions] = useState(false);
  const [imageCaptions, setImageCaptions] = useState<Record<string, string>>({});
  const [expandedImageId, setExpandedImageId] = useState<string | null>(null);

  const showAlert = (title: string, message: string, onDismiss?: () => void) => {
    if (Platform.OS === 'web') {
      alert(`${title}\n\n${message}`);
      onDismiss?.();
    } else {
      Alert.alert(title, message, [{ text: 'OK', onPress: onDismiss }]);
    }
  };

  const fetchDPR = useCallback(async () => {
    if (!id) return;
    
    try {
      const response = await apiClient.get<DPRDetail>(`/api/v2/dpr/${id}`);
      setDpr(response);
      // Set editable fields
      setProgressNotes(response.progress_notes || '');
      setWeatherConditions(response.weather_conditions || '');
      setManpowerCount(response.manpower_count?.toString() || '');
      setIssuesEncountered(response.issues_encountered || '');
      
      // M10: Initialize image captions
      const captions: Record<string, string> = {};
      response.images.forEach(img => {
        captions[img.image_id] = img.caption || '';
      });
      setImageCaptions(captions);
    } catch (error: any) {
      console.error('Error fetching DPR:', error);
      showAlert('Error', error.message || 'Failed to load DPR');
    } finally {
      setLoading(false);
      setRefreshing(false);
    }
  }, [id]);

  useEffect(() => {
    fetchDPR();
  }, [fetchDPR]);

  const onRefresh = () => {
    setRefreshing(true);
    fetchDPR();
  };

  const handleSave = async () => {
    if (!dpr) return;
    
    setSaving(true);
    try {
      await apiClient.put(`/api/v2/dpr/${id}`, {
        progress_notes: progressNotes || undefined,
        weather_conditions: weatherConditions || undefined,
        manpower_count: manpowerCount ? parseInt(manpowerCount) : undefined,
        issues_encountered: issuesEncountered || undefined,
      });
      showAlert('Success', 'DPR updated successfully');
      setEditing(false);
      fetchDPR();
    } catch (error: any) {
      showAlert('Error', error.message || 'Failed to update DPR');
    } finally {
      setSaving(false);
    }
  };

  // M10: Save image caption
  const saveImageCaption = async (imageId: string) => {
    if (!dpr) return;
    
    setSaving(true);
    try {
      await apiClient.put(`/api/v2/dpr/${id}/images/${imageId}`, {
        caption: imageCaptions[imageId] || '',
      });
      showAlert('Success', 'Caption updated successfully');
      setExpandedImageId(null); // Collapse after save
      fetchDPR();
    } catch (error: any) {
      showAlert('Error', error.message || 'Failed to update caption');
    } finally {
      setSaving(false);
    }
  };

  const handleSubmit = async () => {
    if (!dpr) return;
    
    if (dpr.images.length < 4) {
      showAlert('Cannot Submit', 'A minimum of 4 photos is required to submit a DPR.');
      return;
    }
    
    setSaving(true);
    try {
      await apiClient.post(`/api/v2/dpr/${id}/submit`);
      showAlert('Success', 'DPR submitted successfully');
      fetchDPR();
    } catch (error: any) {
      showAlert('Error', error.message || 'Failed to submit DPR');
    } finally {
      setSaving(false);
    }
  };

  const addPhoto = async () => {
    try {
      const result = await ImagePicker.launchImageLibraryAsync({
        mediaTypes: ImagePicker.MediaTypeOptions.Images,
        allowsEditing: true,
        quality: 0.7,
        base64: true,
      });

      if (!result.canceled && result.assets[0]) {
        setSaving(true);
        await apiClient.post(`/api/v2/dpr/${id}/images`, {
          dpr_id: id,
          image_data: result.assets[0].base64,
          caption: '',
        });
        showAlert('Success', 'Photo added!');
        fetchDPR();
      }
    } catch (error: any) {
      showAlert('Error', error.message || 'Failed to add photo');
    } finally {
      setSaving(false);
    }
  };

  const generatePDF = async () => {
    if (!dpr) return;
    
    setGeneratingPdf(true);
    try {
      // Format date
      const dateObj = new Date(dpr.dpr_date);
      const monthNames = ['January', 'February', 'March', 'April', 'May', 'June',
        'July', 'August', 'September', 'October', 'November', 'December'];
      const formattedDate = `${monthNames[dateObj.getMonth()]}, ${String(dateObj.getDate()).padStart(2, '0')}, ${dateObj.getFullYear()}`;
      
      // Generate photo pages
      const photoPages = dpr.images.map((img, idx) => `
        <div style="page-break-after: always; height: 100vh; display: flex; flex-direction: column; padding: 30px; box-sizing: border-box;">
          <div style="text-align: center; margin-bottom: 20px;">
            <h2 style="color: #007AFF; margin: 0; font-size: 16px;">Photo ${idx + 1} of ${dpr.images.length}</h2>
            <p style="color: #666; margin: 5px 0 0; font-size: 12px;">${formattedDate}</p>
          </div>
          
          <div style="flex: 1; display: flex; align-items: center; justify-content: center; overflow: hidden;">
            <img src="${img.image_url || ''}" 
                 style="max-width: 100%; max-height: 100%; object-fit: contain; border-radius: 8px; box-shadow: 0 4px 12px rgba(0,0,0,0.15);" />
          </div>
          
          <div style="margin-top: 20px; padding: 15px; background: #f8f9fa; border-radius: 8px; border-left: 4px solid #007AFF;">
            <p style="margin: 0; font-size: 14px; color: #333; font-weight: 500;">
              ${img.caption || 'No caption provided'}
            </p>
          </div>
        </div>
      `).join('');
      
      const htmlContent = `
        <!DOCTYPE html>
        <html>
          <head>
            <meta charset="utf-8">
            <title>Daily Progress Report - ${formattedDate}</title>
            <style>
              @page { margin: 0; size: A4 portrait; }
              body { font-family: -apple-system, BlinkMacSystemFont, 'Segoe UI', Roboto, sans-serif; margin: 0; padding: 0; }
              .cover-page {
                height: 100vh;
                display: flex;
                flex-direction: column;
                justify-content: center;
                align-items: center;
                padding: 40px;
                box-sizing: border-box;
                background: linear-gradient(135deg, #f5f7fa 0%, #e4e8ec 100%);
                page-break-after: always;
              }
              .cover-title { font-size: 32px; font-weight: bold; color: #1a1a1a; margin: 0 0 10px; text-align: center; }
              .cover-subtitle { font-size: 18px; color: #666; margin: 0 0 40px; }
              .cover-info {
                background: white;
                padding: 30px 40px;
                border-radius: 12px;
                box-shadow: 0 4px 20px rgba(0,0,0,0.1);
                width: 100%;
                max-width: 400px;
              }
              .cover-info-row { display: flex; margin-bottom: 15px; padding-bottom: 15px; border-bottom: 1px solid #eee; }
              .cover-info-row:last-child { margin-bottom: 0; padding-bottom: 0; border-bottom: none; }
              .cover-info-label { font-weight: 600; color: #333; width: 100px; }
              .cover-info-value { color: #666; flex: 1; }
            </style>
          </head>
          <body>
            <div class="cover-page">
              <h1 class="cover-title">Daily Progress Report</h1>
              <p class="cover-subtitle">${formattedDate}</p>
              
              <div class="cover-info">
                <div class="cover-info-row">
                  <span class="cover-info-label">Project</span>
                  <span class="cover-info-value">${dpr.project_name || 'N/A'}</span>
                </div>
                <div class="cover-info-row">
                  <span class="cover-info-label">Date</span>
                  <span class="cover-info-value">${formattedDate}</span>
                </div>
                ${dpr.weather_conditions ? `
                <div class="cover-info-row">
                  <span class="cover-info-label">Weather</span>
                  <span class="cover-info-value">${dpr.weather_conditions}</span>
                </div>` : ''}
                ${dpr.manpower_count ? `
                <div class="cover-info-row">
                  <span class="cover-info-label">Manpower</span>
                  <span class="cover-info-value">${dpr.manpower_count} workers</span>
                </div>` : ''}
                <div class="cover-info-row">
                  <span class="cover-info-label">Photos</span>
                  <span class="cover-info-value">${dpr.images.length} progress photos</span>
                </div>
              </div>
              
              ${dpr.progress_notes ? `
              <div style="margin-top: 30px; max-width: 400px; text-align: left;">
                <h3 style="font-size: 14px; color: #333; margin: 0 0 10px;">Progress Notes</h3>
                <p style="font-size: 12px; color: #666; margin: 0; line-height: 1.5;">${dpr.progress_notes}</p>
              </div>` : ''}
            </div>
            
            ${photoPages}
          </body>
        </html>
      `;
      
      const { uri } = await Print.printToFileAsync({ html: htmlContent, base64: false });
      
      if (await Sharing.isAvailableAsync()) {
        await Sharing.shareAsync(uri, {
          mimeType: 'application/pdf',
          dialogTitle: `DPR - ${formattedDate}`,
          UTI: 'com.adobe.pdf',
        });
      } else {
        showAlert('PDF Generated', `PDF saved at: ${uri}`);
      }
    } catch (error: any) {
      showAlert('Error', error.message || 'Failed to generate PDF');
    } finally {
      setGeneratingPdf(false);
    }
  };

  // UI-3: Handle version selection
  const handleVersionSelect = (version: number, snapshotData: any | null) => {
    if (snapshotData && snapshotData.data_json) {
      // Load historical snapshot data
      const historicalDpr = JSON.parse(snapshotData.data_json);
      setDpr(historicalDpr);
      setProgressNotes(historicalDpr.progress_notes || '');
      setWeatherConditions(historicalDpr.weather_conditions || '');
      setManpowerCount(historicalDpr.manpower_count?.toString() || '');
      setIssuesEncountered(historicalDpr.issues_encountered || '');
      setIsViewingHistorical(true);
      setEditing(false); // Disable editing for historical versions
    } else {
      // Load latest from API
      setIsViewingHistorical(false);
      fetchDPR();
    }
  };

  const getStatusColor = (status: string) => {
    switch (status.toLowerCase()) {
      case 'submitted': return Colors.success;
      case 'draft': return Colors.warning;
      default: return Colors.textMuted;
    }
  };

  if (loading) {
    return (
      <SafeAreaView style={styles.container}>
        <View style={styles.loadingContainer}>
          <ActivityIndicator size="large" color={Colors.primary} />
          <Text style={styles.loadingText}>Loading DPR...</Text>
        </View>
      </SafeAreaView>
    );
  }

  if (!dpr) {
    return (
      <SafeAreaView style={styles.container}>
        <View style={styles.errorContainer}>
          <Ionicons name="alert-circle" size={48} color={Colors.error} />
          <Text style={styles.errorText}>DPR not found</Text>
          <Pressable style={styles.backButton} onPress={() => router.back()}>
            <Text style={styles.backButtonText}>Go Back</Text>
          </Pressable>
        </View>
      </SafeAreaView>
    );
  }

  return (
    <SafeAreaView style={styles.container} edges={['left', 'right']}>
      <ScrollView
        contentContainerStyle={styles.content}
        refreshControl={<RefreshControl refreshing={refreshing} onRefresh={onRefresh} />}
      >
        {/* UI-3: Version Selector */}
        <VersionSelector
          entityType="dpr"
          entityId={id || ''}
          currentVersion={dpr.version || 1}
          onVersionSelect={handleVersionSelect}
        />

        {/* Header */}
        <View style={styles.header}>
          <View style={styles.headerLeft}>
            <Text style={styles.title}>Daily Progress Report</Text>
            <Text style={styles.date}>{new Date(dpr.dpr_date).toLocaleDateString()}</Text>
          </View>
          <View style={[styles.statusBadge, { backgroundColor: getStatusColor(dpr.status) + '20' }]}>
            <Text style={[styles.statusText, { color: getStatusColor(dpr.status) }]}>
              {dpr.status}
            </Text>
          </View>
        </View>

        {/* Project Info */}
        <View style={styles.infoCard}>
          <Text style={styles.cardTitle}>Project</Text>
          <Text style={styles.projectName}>{dpr.project_name || 'Unknown Project'}</Text>
        </View>

        {/* Editable Fields */}
        <View style={styles.section}>
          <View style={styles.sectionHeader}>
            <Text style={styles.sectionTitle}>Details</Text>
            {/* UI-3: Hide edit button when viewing historical versions */}
            {dpr.status === 'draft' && !isViewingHistorical && (
              <Pressable onPress={() => setEditing(!editing)}>
                <Ionicons 
                  name={editing ? "checkmark-circle" : "create"} 
                  size={24} 
                  color={Colors.primary} 
                />
              </Pressable>
            )}
          </View>

          {editing && !isViewingHistorical ? (
            <>
              <View style={styles.fieldGroup}>
                <Text style={styles.label}>Progress Notes</Text>
                <TextInput
                  style={[styles.input, styles.textArea]}
                  value={progressNotes}
                  onChangeText={setProgressNotes}
                  placeholder="Describe today's progress..."
                  multiline
                  placeholderTextColor={Colors.textMuted}
                />
              </View>

              <View style={styles.fieldGroup}>
                <Text style={styles.label}>Weather Conditions</Text>
                <TextInput
                  style={styles.input}
                  value={weatherConditions}
                  onChangeText={setWeatherConditions}
                  placeholder="e.g., Sunny, Clear"
                  placeholderTextColor={Colors.textMuted}
                />
              </View>

              <View style={styles.fieldGroup}>
                <Text style={styles.label}>Manpower Count</Text>
                <TextInput
                  style={styles.input}
                  value={manpowerCount}
                  onChangeText={setManpowerCount}
                  placeholder="Number of workers"
                  keyboardType="numeric"
                  placeholderTextColor={Colors.textMuted}
                />
              </View>

              <View style={styles.fieldGroup}>
                <Text style={styles.label}>Issues Encountered</Text>
                <TextInput
                  style={[styles.input, styles.textArea]}
                  value={issuesEncountered}
                  onChangeText={setIssuesEncountered}
                  placeholder="Any problems or delays..."
                  multiline
                  placeholderTextColor={Colors.textMuted}
                />
              </View>

              <Pressable
                style={[styles.saveButton, saving && styles.buttonDisabled]}
                onPress={handleSave}
                disabled={saving}
              >
                {saving ? (
                  <ActivityIndicator color={Colors.white} />
                ) : (
                  <Text style={styles.saveButtonText}>Save Changes</Text>
                )}
              </Pressable>
            </>
          ) : (
            <>
              {dpr.progress_notes && (
                <View style={styles.detailRow}>
                  <Text style={styles.detailLabel}>Progress Notes</Text>
                  <Text style={styles.detailValue}>{dpr.progress_notes}</Text>
                </View>
              )}
              {dpr.weather_conditions && (
                <View style={styles.detailRow}>
                  <Text style={styles.detailLabel}>Weather</Text>
                  <Text style={styles.detailValue}>{dpr.weather_conditions}</Text>
                </View>
              )}
              {dpr.manpower_count && (
                <View style={styles.detailRow}>
                  <Text style={styles.detailLabel}>Manpower</Text>
                  <Text style={styles.detailValue}>{dpr.manpower_count} workers</Text>
                </View>
              )}
              {dpr.issues_encountered && (
                <View style={styles.detailRow}>
                  <Text style={styles.detailLabel}>Issues</Text>
                  <Text style={styles.detailValue}>{dpr.issues_encountered}</Text>
                </View>
              )}
              {!dpr.progress_notes && !dpr.weather_conditions && !dpr.manpower_count && !dpr.issues_encountered && (
                <Text style={styles.emptyText}>No details added yet</Text>
              )}
            </>
          )}
        </View>

        {/* Photos Section - M10: Collapsible frames with editable captions */}
        <View style={styles.section}>
          <View style={styles.sectionHeader}>
            <Text style={styles.sectionTitle}>Photos ({dpr.images.length})</Text>
            {/* UI-3: Hide add photo when viewing historical */}
            {dpr.status === 'draft' && !isViewingHistorical && (
              <Pressable style={styles.addPhotoBtn} onPress={addPhoto}>
                <Ionicons name="camera" size={18} color={Colors.primary} />
                <Text style={styles.addPhotoBtnText}>Add</Text>
              </Pressable>
            )}
          </View>

          {dpr.images.length === 0 ? (
            <View style={styles.emptyPhotos}>
              <Ionicons name="images-outline" size={48} color={Colors.textMuted} />
              <Text style={styles.emptyText}>No photos yet</Text>
              {dpr.status === 'draft' && !isViewingHistorical && (
                <Pressable style={styles.addFirstPhotoBtn} onPress={addPhoto}>
                  <Text style={styles.addFirstPhotoBtnText}>Add First Photo</Text>
                </Pressable>
              )}
            </View>
          ) : (
            <View style={styles.photoGrid}>
              {dpr.images.map((img, idx) => {
                const isExpanded = expandedImageId === img.image_id;
                return (
                  <View key={img.image_id || idx} style={styles.photoCard}>
                    {/* Collapsible Header */}
                    <TouchableOpacity 
                      style={styles.photoHeader}
                      onPress={() => setExpandedImageId(isExpanded ? null : img.image_id)}
                    >
                      <View style={styles.photoHeaderLeft}>
                        <Ionicons name="image" size={20} color={Colors.accent} />
                        <Text style={styles.photoNumber}>Photo {idx + 1}</Text>
                        {!isExpanded && imageCaptions[img.image_id] && (
                          <Text style={styles.photoPreview} numberOfLines={1}>
                            - {imageCaptions[img.image_id]}
                          </Text>
                        )}
                      </View>
                      <Ionicons 
                        name={isExpanded ? "chevron-up" : "chevron-down"} 
                        size={20} 
                        color={Colors.textMuted} 
                      />
                    </TouchableOpacity>
                    
                    {/* Collapsible Content */}
                    {isExpanded && (
                      <View style={styles.photoContent}>
                        <Image 
                          source={{ uri: img.image_url || 'https://via.placeholder.com/300' }} 
                          style={styles.photo} 
                          resizeMode="cover"
                        />
                        
                        {/* M10: Editable Caption */}
                        <Text style={styles.captionLabel}>Caption</Text>
                        <TextInput
                          style={styles.captionInput}
                          value={imageCaptions[img.image_id] || ''}
                          onChangeText={(text) => setImageCaptions(prev => ({
                            ...prev,
                            [img.image_id]: text
                          }))}
                          placeholder="Add a caption for this photo..."
                          multiline
                          numberOfLines={2}
                          placeholderTextColor={Colors.textMuted}
                        />
                        
                        <TouchableOpacity
                          style={[styles.saveCaptionBtn, saving && styles.buttonDisabled]}
                          onPress={() => saveImageCaption(img.image_id)}
                          disabled={saving}
                        >
                          {saving ? (
                            <ActivityIndicator color={Colors.white} size="small" />
                          ) : (
                            <>
                              <Ionicons name="checkmark" size={16} color={Colors.white} />
                              <Text style={styles.saveCaptionText}>Save Caption</Text>
                            </>
                          )}
                        </TouchableOpacity>
                      </View>
                    )}
                  </View>
                );
              })}
            </View>
          )}

          {dpr.images.length > 0 && dpr.images.length < 4 && (
            <Text style={styles.warningText}>
              Minimum 4 photos required to submit. Add {4 - dpr.images.length} more.
            </Text>
          )}
        </View>

        {/* Action Buttons - UI-3: Hide submit when viewing historical */}
        <View style={styles.actions}>
          {dpr.status === 'draft' && dpr.images.length >= 4 && !isViewingHistorical && (
            <Pressable
              style={[styles.submitButton, saving && styles.buttonDisabled]}
              onPress={handleSubmit}
              disabled={saving}
            >
              {saving ? (
                <ActivityIndicator color={Colors.white} />
              ) : (
                <>
                  <Ionicons name="send" size={20} color={Colors.white} />
                  <Text style={styles.submitButtonText}>Submit DPR</Text>
                </>
              )}
            </Pressable>
          )}

          <Pressable
            style={[styles.pdfButton, generatingPdf && styles.buttonDisabled]}
            onPress={generatePDF}
            disabled={generatingPdf || dpr.images.length === 0}
          >
            {generatingPdf ? (
              <ActivityIndicator color={Colors.primary} />
            ) : (
              <>
                <Ionicons name="document" size={20} color={Colors.primary} />
                <Text style={styles.pdfButtonText}>Generate PDF</Text>
              </>
            )}
          </Pressable>
        </View>
      </ScrollView>
    </SafeAreaView>
  );
}

const styles = StyleSheet.create({
  container: { flex: 1, backgroundColor: Colors.background },
  loadingContainer: { flex: 1, justifyContent: 'center', alignItems: 'center' },
  loadingText: { marginTop: Spacing.md, fontSize: FontSizes.md, color: Colors.textSecondary },
  errorContainer: { flex: 1, justifyContent: 'center', alignItems: 'center', padding: Spacing.xl },
  errorText: { fontSize: FontSizes.lg, color: Colors.error, marginTop: Spacing.md },
  backButton: { marginTop: Spacing.lg, paddingHorizontal: Spacing.lg, paddingVertical: Spacing.md, backgroundColor: Colors.primary, borderRadius: BorderRadius.md },
  backButtonText: { color: Colors.white, fontWeight: '600' },
  content: { padding: Spacing.md },
  header: { flexDirection: 'row', justifyContent: 'space-between', alignItems: 'flex-start', marginBottom: Spacing.lg },
  headerLeft: { flex: 1 },
  title: { fontSize: FontSizes.xl, fontWeight: 'bold', color: Colors.text },
  date: { fontSize: FontSizes.md, color: Colors.textSecondary, marginTop: 4 },
  statusBadge: { paddingHorizontal: Spacing.md, paddingVertical: Spacing.xs, borderRadius: BorderRadius.full },
  statusText: { fontSize: FontSizes.sm, fontWeight: '600', textTransform: 'capitalize' },
  infoCard: { backgroundColor: Colors.white, padding: Spacing.md, borderRadius: BorderRadius.md, marginBottom: Spacing.md, borderLeftWidth: 4, borderLeftColor: Colors.primary },
  cardTitle: { fontSize: FontSizes.sm, color: Colors.textMuted, marginBottom: 4 },
  projectName: { fontSize: FontSizes.md, fontWeight: '600', color: Colors.text },
  section: { backgroundColor: Colors.white, padding: Spacing.md, borderRadius: BorderRadius.md, marginBottom: Spacing.md },
  sectionHeader: { flexDirection: 'row', justifyContent: 'space-between', alignItems: 'center', marginBottom: Spacing.md },
  sectionTitle: { fontSize: FontSizes.lg, fontWeight: '600', color: Colors.text },
  fieldGroup: { marginBottom: Spacing.md },
  label: { fontSize: FontSizes.sm, fontWeight: '600', color: Colors.text, marginBottom: Spacing.xs },
  input: { backgroundColor: Colors.background, borderWidth: 1, borderColor: Colors.border, borderRadius: BorderRadius.md, paddingHorizontal: Spacing.md, paddingVertical: Spacing.sm, fontSize: FontSizes.md, color: Colors.text },
  textArea: { minHeight: 80, textAlignVertical: 'top' },
  saveButton: { backgroundColor: Colors.primary, paddingVertical: Spacing.md, borderRadius: BorderRadius.md, alignItems: 'center', marginTop: Spacing.sm },
  saveButtonText: { color: Colors.white, fontWeight: '600', fontSize: FontSizes.md },
  buttonDisabled: { opacity: 0.6 },
  detailRow: { marginBottom: Spacing.md },
  detailLabel: { fontSize: FontSizes.sm, color: Colors.textMuted, marginBottom: 4 },
  detailValue: { fontSize: FontSizes.md, color: Colors.text },
  emptyText: { fontSize: FontSizes.md, color: Colors.textMuted, textAlign: 'center', paddingVertical: Spacing.md },
  addPhotoBtn: { flexDirection: 'row', alignItems: 'center', gap: 4, paddingHorizontal: Spacing.sm, paddingVertical: Spacing.xs, borderWidth: 1, borderColor: Colors.primary, borderRadius: BorderRadius.sm },
  addPhotoBtnText: { fontSize: FontSizes.sm, color: Colors.primary },
  emptyPhotos: { alignItems: 'center', paddingVertical: Spacing.xl },
  addFirstPhotoBtn: { marginTop: Spacing.md, paddingHorizontal: Spacing.lg, paddingVertical: Spacing.sm, backgroundColor: Colors.primary, borderRadius: BorderRadius.md },
  addFirstPhotoBtnText: { color: Colors.white, fontWeight: '600' },
  photoGrid: { gap: Spacing.md },
  photoCard: { backgroundColor: Colors.background, borderRadius: BorderRadius.md, overflow: 'hidden' },
  photo: { width: '100%', aspectRatio: 16/9 },
  photoCaption: { padding: Spacing.sm, fontSize: FontSizes.sm, color: Colors.textSecondary },
  warningText: { textAlign: 'center', color: Colors.warning, fontSize: FontSizes.sm, marginTop: Spacing.md },
  actions: { gap: Spacing.md, marginTop: Spacing.md },
  submitButton: { backgroundColor: Colors.success, flexDirection: 'row', alignItems: 'center', justifyContent: 'center', gap: Spacing.sm, paddingVertical: Spacing.md, borderRadius: BorderRadius.md },
  submitButtonText: { color: Colors.white, fontWeight: '600', fontSize: FontSizes.md },
  pdfButton: { flexDirection: 'row', alignItems: 'center', justifyContent: 'center', gap: Spacing.sm, paddingVertical: Spacing.md, borderRadius: BorderRadius.md, borderWidth: 1, borderColor: Colors.primary },
  pdfButtonText: { color: Colors.primary, fontWeight: '600', fontSize: FontSizes.md },
});
