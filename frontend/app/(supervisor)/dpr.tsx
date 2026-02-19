// SUPERVISOR DPR SCREEN - WITH VOICE-TO-TEXT
// DPR creation with photos, manual captions, and voice summary

import React, { useState, useEffect, useRef } from 'react';
import {
  View,
  Text,
  StyleSheet,
  ScrollView,
  TouchableOpacity,
  ActivityIndicator,
  Alert,
  Platform,
  Image,
  TextInput,
  KeyboardAvoidingView,
} from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';
import { useRouter } from 'expo-router';
import { Ionicons } from '@expo/vector-icons';
import * as ImagePicker from 'expo-image-picker';
import { Audio } from 'expo-av';
import { useProject } from '../../contexts/ProjectContext';
import { useAuth } from '../../contexts/AuthContext';
import { Card } from '../../components/ui';
import { Colors, Spacing, FontSizes, BorderRadius } from '../../constants/theme';

const BASE_URL = process.env.EXPO_PUBLIC_BACKEND_URL || '';
const MIN_PHOTOS = 4;

const getToken = async () => {
  if (Platform.OS === 'web') return localStorage.getItem('access_token');
  const SecureStore = require('expo-secure-store');
  return await SecureStore.getItemAsync('access_token');
};

interface Photo {
  id: string;
  uri: string;
  base64: string;
  caption: string;
  isCollapsed: boolean;
}

export default function SupervisorDPRScreen() {
  const router = useRouter();
  const { selectedProject } = useProject();
  const { user } = useAuth();
  
  const [photos, setPhotos] = useState<Photo[]>([]);
  const [voiceSummary, setVoiceSummary] = useState('');
  const [isSubmitting, setIsSubmitting] = useState(false);
  const [expandedPhotoId, setExpandedPhotoId] = useState<string | null>(null);
  
  // Voice recording state
  const [isRecording, setIsRecording] = useState(false);
  const [isTranscribing, setIsTranscribing] = useState(false);
  const [recordingDuration, setRecordingDuration] = useState(0);
  const recordingRef = useRef<Audio.Recording | null>(null);
  const timerRef = useRef<NodeJS.Timeout | null>(null);

  // Redirect if no project selected
  useEffect(() => {
    if (!selectedProject) {
      router.replace('/(supervisor)/select-project');
    }
  }, [selectedProject]);

  // Cleanup on unmount
  useEffect(() => {
    return () => {
      if (timerRef.current) clearInterval(timerRef.current);
      if (recordingRef.current) {
        recordingRef.current.stopAndUnloadAsync().catch(() => {});
      }
    };
  }, []);

  const showAlert = (title: string, message: string, onOk?: () => void) => {
    if (Platform.OS === 'web') {
      window.alert(`${title}: ${message}`);
      onOk?.();
    } else {
      Alert.alert(title, message, [{ text: 'OK', onPress: onOk }]);
    }
  };

  // Voice Recording Functions
  const startRecording = async () => {
    try {
      // Request permission
      const { status } = await Audio.requestPermissionsAsync();
      if (status !== 'granted') {
        showAlert('Permission Required', 'Microphone permission is needed for voice recording');
        return;
      }

      // Configure audio mode
      await Audio.setAudioModeAsync({
        allowsRecordingIOS: true,
        playsInSilentModeIOS: true,
      });

      // Start recording
      const { recording } = await Audio.Recording.createAsync(
        Audio.RecordingOptionsPresets.HIGH_QUALITY
      );
      
      recordingRef.current = recording;
      setIsRecording(true);
      setRecordingDuration(0);

      // Start timer
      timerRef.current = setInterval(() => {
        setRecordingDuration(prev => prev + 1);
      }, 1000);

    } catch (error) {
      console.error('Failed to start recording:', error);
      showAlert('Error', 'Failed to start recording');
    }
  };

  const stopRecording = async () => {
    try {
      if (!recordingRef.current) return;

      // Stop timer
      if (timerRef.current) {
        clearInterval(timerRef.current);
        timerRef.current = null;
      }

      setIsRecording(false);
      setIsTranscribing(true);

      // Stop recording
      await recordingRef.current.stopAndUnloadAsync();
      const uri = recordingRef.current.getURI();
      recordingRef.current = null;

      if (!uri) {
        setIsTranscribing(false);
        showAlert('Error', 'No audio recorded');
        return;
      }

      // Read audio file and convert to base64
      const response = await fetch(uri);
      const blob = await response.blob();
      
      const reader = new FileReader();
      reader.readAsDataURL(blob);
      reader.onloadend = async () => {
        const base64Audio = reader.result as string;
        await transcribeAudio(base64Audio);
      };

    } catch (error) {
      console.error('Failed to stop recording:', error);
      setIsTranscribing(false);
      showAlert('Error', 'Failed to process recording');
    }
  };

  const transcribeAudio = async (base64Audio: string) => {
    try {
      const token = await getToken();
      
      const response = await fetch(`${BASE_URL}/api/v2/speech-to-text`, {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          'Authorization': `Bearer ${token}`,
        },
        body: JSON.stringify({
          audio_data: base64Audio,
          audio_format: 'm4a', // expo-av records in m4a format
        }),
      });

      const result = await response.json();
      
      if (result.transcript) {
        // Append to existing summary (don't replace)
        setVoiceSummary(prev => {
          if (prev.trim()) {
            return prev + ' ' + result.transcript;
          }
          return result.transcript;
        });
        showAlert('Transcribed', 'Voice has been converted to text');
      } else if (result.error) {
        showAlert('Transcription Failed', result.note || result.error);
      }
    } catch (error) {
      console.error('Transcription error:', error);
      showAlert('Error', 'Failed to transcribe audio');
    } finally {
      setIsTranscribing(false);
    }
  };

  const formatDuration = (seconds: number) => {
    const mins = Math.floor(seconds / 60);
    const secs = seconds % 60;
    return `${mins}:${secs.toString().padStart(2, '0')}`;
  };

  // Photo Functions
  const takePhoto = async () => {
    try {
      const { status } = await ImagePicker.requestCameraPermissionsAsync();
      if (status !== 'granted') {
        showAlert('Permission Required', 'Camera access is needed to take photos');
        return;
      }

      const result = await ImagePicker.launchCameraAsync({
        allowsEditing: false,
        quality: 0.8,
        base64: true,
      });

      if (!result.canceled && result.assets[0]) {
        const asset = result.assets[0];
        const newPhotoId = Date.now().toString();
        const newPhoto: Photo = {
          id: newPhotoId,
          uri: asset.uri,
          base64: asset.base64 || '',
          caption: '',
          isCollapsed: false,
        };
        setPhotos(prev => [...prev.map(p => ({ ...p, isCollapsed: true })), newPhoto]);
        setExpandedPhotoId(newPhotoId);
      }
    } catch (error) {
      showAlert('Error', 'Failed to take photo');
    }
  };

  const pickImage = async () => {
    try {
      const result = await ImagePicker.launchImageLibraryAsync({
        mediaTypes: ImagePicker.MediaTypeOptions.Images,
        allowsEditing: false,
        quality: 0.8,
        base64: true,
        allowsMultipleSelection: true,
        selectionLimit: 10 - photos.length,
      });

      if (!result.canceled && result.assets) {
        const newPhotos: Photo[] = result.assets.map((asset, index) => ({
          id: `${Date.now()}-${index}`,
          uri: asset.uri,
          base64: asset.base64 || '',
          caption: '',
          isCollapsed: index > 0, // Only first new photo expanded
        }));
        const firstNewId = newPhotos[0]?.id;
        setPhotos(prev => [...prev.map(p => ({ ...p, isCollapsed: true })), ...newPhotos]);
        if (firstNewId) setExpandedPhotoId(firstNewId);
      }
    } catch (error) {
      showAlert('Error', 'Failed to pick images');
    }
  };

  const updateCaption = (id: string, caption: string) => {
    setPhotos(prev => prev.map(p => p.id === id ? { ...p, caption } : p));
  };

  const collapsePhoto = (id: string) => {
    setPhotos(prev => prev.map(p => p.id === id ? { ...p, isCollapsed: true } : p));
    setExpandedPhotoId(null);
  };

  const togglePhotoExpand = (id: string) => {
    const photo = photos.find(p => p.id === id);
    if (photo?.isCollapsed) {
      setPhotos(prev => prev.map(p => ({ ...p, isCollapsed: p.id !== id })));
      setExpandedPhotoId(id);
    } else {
      setPhotos(prev => prev.map(p => p.id === id ? { ...p, isCollapsed: true } : p));
      setExpandedPhotoId(null);
    }
  };

  const removePhoto = (id: string) => {
    setPhotos(prev => prev.filter(p => p.id !== id));
  };

  const canSubmit = () => {
    if (photos.length < MIN_PHOTOS) return false;
    const allCaptioned = photos.every(p => p.caption.trim().length > 0);
    return allCaptioned && selectedProject;
  };

  const getValidationMessage = () => {
    if (photos.length < MIN_PHOTOS) {
      return `Add ${MIN_PHOTOS - photos.length} more photo(s)`;
    }
    const uncaptioned = photos.filter(p => !p.caption.trim()).length;
    if (uncaptioned > 0) {
      return `${uncaptioned} photo(s) need captions`;
    }
    return '';
  };

  const handleSubmit = async () => {
    if (!canSubmit()) {
      showAlert('Incomplete', getValidationMessage());
      return;
    }

    setIsSubmitting(true);
    try {
      const token = await getToken();
      const projectId = (selectedProject as any).project_id || (selectedProject as any)._id;
      const today = new Date();
      
      // Create DPR
      const dprPayload = {
        project_id: projectId,
        dpr_date: today.toISOString().split('T')[0],
        progress_notes: voiceSummary || 'Daily progress report',
        weather_conditions: 'Normal',
        manpower_count: 0,
        status: 'Draft',
      };

      const createResponse = await fetch(`${BASE_URL}/api/v2/dpr`, {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          'Authorization': `Bearer ${token}`,
        },
        body: JSON.stringify(dprPayload),
      });

      const dprData = await createResponse.json();
      
      // Handle existing DPR - delete it and use that ID
      if (dprData.exists) {
        // Delete existing DPR
        await fetch(`${BASE_URL}/api/v2/dpr/${dprData.dpr_id}`, {
          method: 'DELETE',
          headers: { 'Authorization': `Bearer ${token}` },
        });
        
        // Create new one
        const retryResponse = await fetch(`${BASE_URL}/api/v2/dpr`, {
          method: 'POST',
          headers: {
            'Content-Type': 'application/json',
            'Authorization': `Bearer ${token}`,
          },
          body: JSON.stringify(dprPayload),
        });
        
        if (!retryResponse.ok) {
          throw new Error('Failed to create DPR after deleting existing');
        }
        
        const retryData = await retryResponse.json();
        var dprId = retryData.dpr_id;
      } else if (!createResponse.ok) {
        throw new Error(dprData.detail || 'Failed to create DPR');
      } else {
        var dprId = dprData.dpr_id;
      }

      // Upload photos with captions
      for (const photo of photos) {
        await fetch(`${BASE_URL}/api/v2/dpr/${dprId}/images`, {
          method: 'POST',
          headers: {
            'Content-Type': 'application/json',
            'Authorization': `Bearer ${token}`,
          },
          body: JSON.stringify({
            dpr_id: dprId,
            image_data: `data:image/jpeg;base64,${photo.base64}`,
            caption: photo.caption,
            is_portrait: true,
          }),
        });
      }

      // Submit DPR - this generates PDF and sends notification
      const submitResponse = await fetch(`${BASE_URL}/api/v2/dpr/${dprId}/submit`, {
        method: 'POST',
        headers: {
          'Authorization': `Bearer ${token}`,
        },
      });

      if (submitResponse.ok) {
        const submitData = await submitResponse.json();
        
        // Download PDF directly
        if (submitData.pdf_data) {
          try {
            if (Platform.OS === 'web') {
              // Web: Create blob and download
              const byteCharacters = atob(submitData.pdf_data);
              const byteNumbers = new Array(byteCharacters.length);
              for (let i = 0; i < byteCharacters.length; i++) {
                byteNumbers[i] = byteCharacters.charCodeAt(i);
              }
              const byteArray = new Uint8Array(byteNumbers);
              const blob = new Blob([byteArray], { type: 'application/pdf' });
              
              const url = window.URL.createObjectURL(blob);
              const link = document.createElement('a');
              link.href = url;
              link.download = submitData.file_name || 'DPR.pdf';
              document.body.appendChild(link);
              link.click();
              document.body.removeChild(link);
              window.URL.revokeObjectURL(url);
              
              showAlert('Success', `DPR submitted and PDF downloaded!\n\nFilename: ${submitData.file_name}\n\nAdmin has been notified.`, () => {
                router.back();
              });
            } else {
              // Mobile: Use expo-file-system and expo-sharing
              try {
                const FileSystem = require('expo-file-system');
                const Sharing = require('expo-sharing');
                
                const fileName = submitData.file_name || 'DPR.pdf';
                const fileUri = FileSystem.documentDirectory + fileName;
                
                // Write base64 to file
                await FileSystem.writeAsStringAsync(fileUri, submitData.pdf_data, {
                  encoding: 'base64',
                });
                
                // Check if sharing is available
                const canShare = await Sharing.isAvailableAsync();
                if (canShare) {
                  await Sharing.shareAsync(fileUri, {
                    mimeType: 'application/pdf',
                    dialogTitle: `Share ${fileName}`,
                  });
                }
                
                showAlert('Success', `DPR submitted!\n\nFilename: ${fileName}\nAdmin has been notified.`, () => {
                  router.back();
                });
              } catch (mobileError) {
                console.error('Mobile PDF error:', mobileError);
                showAlert('Success', `DPR submitted successfully!\n\nFilename: ${submitData.file_name}\nAdmin has been notified.`, () => {
                  router.back();
                });
              }
            }
          } catch (downloadError) {
            console.error('PDF download error:', downloadError);
            showAlert('Success', `DPR submitted successfully!\n\nFilename: ${submitData.file_name}\nAdmin has been notified.`, () => {
              router.back();
            });
          }
        } else {
          showAlert('Success', 'DPR submitted successfully! Admin has been notified.', () => {
            router.back();
          });
        }
      } else {
        throw new Error('Failed to submit DPR');
      }
    } catch (error) {
      console.error('Submit error:', error);
      showAlert('Error', 'Failed to submit DPR. Please try again.');
    } finally {
      setIsSubmitting(false);
    }
  };

  const getProjectCode = () => {
    return (selectedProject as any)?.project_code || 'DPR';
  };

  const getTodayFormatted = () => {
    return new Date().toLocaleDateString('en-US', { 
      month: 'short', 
      day: '2-digit', 
      year: 'numeric' 
    });
  };

  if (!selectedProject) {
    return (
      <SafeAreaView style={styles.container}>
        <View style={styles.centerContainer}>
          <ActivityIndicator size="large" color={Colors.accent} />
        </View>
      </SafeAreaView>
    );
  }

  return (
    <SafeAreaView style={styles.container} edges={['left', 'right']}>
      <KeyboardAvoidingView 
        style={styles.flex} 
        behavior={Platform.OS === 'ios' ? 'padding' : undefined}
      >
        {/* Header */}
        <View style={styles.header}>
          <TouchableOpacity onPress={() => router.back()} style={styles.backButton}>
            <Ionicons name="arrow-back" size={24} color={Colors.text} />
          </TouchableOpacity>
          <View style={styles.headerInfo}>
            <Text style={styles.headerTitle}>Create DPR</Text>
            <Text style={styles.headerSubtitle}>
              {getProjectCode()} • {getTodayFormatted()}
            </Text>
          </View>
        </View>

        <ScrollView style={styles.scrollView} contentContainerStyle={styles.scrollContent}>
          {/* Project Info */}
          <Card style={styles.projectCard}>
            <Ionicons name="business" size={24} color={Colors.accent} />
            <View style={styles.projectInfo}>
              <Text style={styles.projectName}>{selectedProject?.project_name}</Text>
              <Text style={styles.projectCode}>{getProjectCode()}</Text>
            </View>
          </Card>

          {/* Voice Summary Section */}
          <Card style={styles.sectionCard}>
            <View style={styles.sectionHeader}>
              <Ionicons name="mic" size={20} color={Colors.info} />
              <Text style={styles.sectionTitle}>Voice Summary</Text>
              <Text style={styles.languageNote}>(Any language → English)</Text>
            </View>

            {/* Voice Recording Button */}
            <View style={styles.voiceControls}>
              {!isRecording && !isTranscribing ? (
                <TouchableOpacity 
                  style={styles.recordButton}
                  onPress={startRecording}
                >
                  <Ionicons name="mic" size={32} color={Colors.white} />
                  <Text style={styles.recordButtonText}>Hold to Record</Text>
                </TouchableOpacity>
              ) : isRecording ? (
                <TouchableOpacity 
                  style={[styles.recordButton, styles.recordingButton]}
                  onPress={stopRecording}
                >
                  <View style={styles.recordingIndicator}>
                    <Ionicons name="stop" size={32} color={Colors.white} />
                  </View>
                  <Text style={styles.recordButtonText}>
                    Recording... {formatDuration(recordingDuration)}
                  </Text>
                  <Text style={styles.recordHint}>Tap to stop</Text>
                </TouchableOpacity>
              ) : (
                <View style={styles.transcribingContainer}>
                  <ActivityIndicator size="large" color={Colors.info} />
                  <Text style={styles.transcribingText}>Transcribing...</Text>
                </View>
              )}
            </View>

            {/* Summary Text */}
            <TextInput
              style={styles.summaryInput}
              placeholder="Speak or type your summary here..."
              value={voiceSummary}
              onChangeText={setVoiceSummary}
              multiline
              numberOfLines={4}
              textAlignVertical="top"
            />
            <Text style={styles.helperText}>
              Speak in any language - AI will translate to English
            </Text>
          </Card>

          {/* Photos Section */}
          <Card style={styles.sectionCard}>
            <View style={styles.sectionHeader}>
              <Ionicons name="images" size={20} color={Colors.success} />
              <Text style={styles.sectionTitle}>
                Photos ({photos.length}/{MIN_PHOTOS} minimum)
              </Text>
            </View>

            {/* Photo Grid */}
            <View style={styles.photoGrid}>
              {photos.map((photo, index) => (
                <View key={photo.id} style={styles.photoCard}>
                  {/* Collapsible Header */}
                  <TouchableOpacity 
                    style={styles.photoHeader}
                    onPress={() => togglePhotoExpand(photo.id)}
                  >
                    <View style={styles.photoHeaderLeft}>
                      {photo.caption.trim() && (
                        <Ionicons name="checkmark-circle" size={18} color={Colors.success} style={{marginRight: 6}} />
                      )}
                      <Text style={styles.photoNumber}>Photo {index + 1}</Text>
                      {photo.isCollapsed && photo.caption.trim() && (
                        <Text style={styles.photoPreview} numberOfLines={1}> - {photo.caption}</Text>
                      )}
                    </View>
                    <View style={styles.photoHeaderRight}>
                      <Ionicons 
                        name={photo.isCollapsed ? "chevron-down" : "chevron-up"} 
                        size={20} 
                        color={Colors.textMuted} 
                      />
                      <TouchableOpacity onPress={() => removePhoto(photo.id)}>
                        <Ionicons name="trash-outline" size={20} color={Colors.error} />
                      </TouchableOpacity>
                    </View>
                  </TouchableOpacity>
                  
                  {/* Collapsible Content */}
                  {!photo.isCollapsed && (
                    <View style={styles.photoContent}>
                      <Image source={{ uri: photo.uri }} style={styles.photoImage} />
                      <TextInput
                        style={styles.captionInput}
                        placeholder="Type caption for this photo..."
                        value={photo.caption}
                        onChangeText={(text) => updateCaption(photo.id, text)}
                        multiline
                        numberOfLines={2}
                      />
                      {!photo.caption.trim() && (
                        <Text style={styles.captionWarning}>Caption required</Text>
                      )}
                      {photo.caption.trim() && (
                        <TouchableOpacity 
                          style={styles.doneButton}
                          onPress={() => collapsePhoto(photo.id)}
                        >
                          <Ionicons name="checkmark" size={16} color={Colors.white} />
                          <Text style={styles.doneButtonText}>Done</Text>
                        </TouchableOpacity>
                      )}
                    </View>
                  )}
                </View>
              ))}
            </View>

            {/* Add Photo Buttons */}
            <View style={styles.addPhotoButtons}>
              <TouchableOpacity style={styles.addPhotoBtn} onPress={takePhoto}>
                <Ionicons name="camera" size={24} color={Colors.accent} />
                <Text style={styles.addPhotoBtnText}>Take Photo</Text>
              </TouchableOpacity>
              <TouchableOpacity style={styles.addPhotoBtn} onPress={pickImage}>
                <Ionicons name="images" size={24} color={Colors.accent} />
                <Text style={styles.addPhotoBtnText}>Gallery</Text>
              </TouchableOpacity>
            </View>
          </Card>

          {/* Validation Message */}
          {getValidationMessage() && (
            <View style={styles.validationBanner}>
              <Ionicons name="information-circle" size={20} color={Colors.warning} />
              <Text style={styles.validationText}>{getValidationMessage()}</Text>
            </View>
          )}
        </ScrollView>

        {/* Submit Button */}
        <View style={styles.footer}>
          <TouchableOpacity
            style={[
              styles.submitButton,
              !canSubmit() && styles.submitButtonDisabled,
            ]}
            onPress={handleSubmit}
            disabled={!canSubmit() || isSubmitting}
          >
            {isSubmitting ? (
              <ActivityIndicator color={Colors.white} />
            ) : (
              <>
                <Ionicons name="checkmark-circle" size={24} color={Colors.white} />
                <Text style={styles.submitButtonText}>Generate & Submit DPR</Text>
              </>
            )}
          </TouchableOpacity>
        </View>
      </KeyboardAvoidingView>
    </SafeAreaView>
  );
}

const styles = StyleSheet.create({
  container: {
    flex: 1,
    backgroundColor: Colors.background,
  },
  flex: {
    flex: 1,
  },
  centerContainer: {
    flex: 1,
    justifyContent: 'center',
    alignItems: 'center',
  },
  header: {
    flexDirection: 'row',
    alignItems: 'center',
    padding: Spacing.md,
    backgroundColor: Colors.white,
    borderBottomWidth: 1,
    borderBottomColor: Colors.border,
  },
  backButton: {
    padding: Spacing.xs,
    marginRight: Spacing.sm,
  },
  headerInfo: {
    flex: 1,
  },
  headerTitle: {
    fontSize: FontSizes.lg,
    fontWeight: 'bold',
    color: Colors.text,
  },
  headerSubtitle: {
    fontSize: FontSizes.sm,
    color: Colors.textSecondary,
  },
  scrollView: {
    flex: 1,
  },
  scrollContent: {
    padding: Spacing.md,
    paddingBottom: 100,
  },
  projectCard: {
    flexDirection: 'row',
    alignItems: 'center',
    padding: Spacing.md,
    marginBottom: Spacing.md,
    gap: Spacing.md,
  },
  projectInfo: {
    flex: 1,
  },
  projectName: {
    fontSize: FontSizes.md,
    fontWeight: '600',
    color: Colors.text,
  },
  projectCode: {
    fontSize: FontSizes.sm,
    color: Colors.textSecondary,
  },
  sectionCard: {
    padding: Spacing.md,
    marginBottom: Spacing.md,
  },
  sectionHeader: {
    flexDirection: 'row',
    alignItems: 'center',
    marginBottom: Spacing.md,
    gap: Spacing.sm,
  },
  sectionTitle: {
    fontSize: FontSizes.md,
    fontWeight: '600',
    color: Colors.text,
  },
  languageNote: {
    fontSize: FontSizes.xs,
    color: Colors.textMuted,
    marginLeft: 'auto',
  },
  voiceControls: {
    alignItems: 'center',
    marginBottom: Spacing.md,
  },
  recordButton: {
    flexDirection: 'column',
    alignItems: 'center',
    justifyContent: 'center',
    backgroundColor: Colors.info,
    width: 120,
    height: 120,
    borderRadius: 60,
    gap: Spacing.xs,
  },
  recordingButton: {
    backgroundColor: Colors.error,
  },
  recordButtonText: {
    fontSize: FontSizes.sm,
    color: Colors.white,
    fontWeight: '500',
  },
  recordHint: {
    fontSize: FontSizes.xs,
    color: Colors.white,
    opacity: 0.8,
  },
  recordingIndicator: {
    width: 48,
    height: 48,
    borderRadius: 24,
    backgroundColor: 'rgba(255,255,255,0.2)',
    justifyContent: 'center',
    alignItems: 'center',
  },
  transcribingContainer: {
    alignItems: 'center',
    padding: Spacing.lg,
  },
  transcribingText: {
    marginTop: Spacing.sm,
    fontSize: FontSizes.md,
    color: Colors.info,
  },
  summaryInput: {
    backgroundColor: Colors.background,
    borderWidth: 1,
    borderColor: Colors.border,
    borderRadius: BorderRadius.md,
    padding: Spacing.md,
    fontSize: FontSizes.md,
    color: Colors.text,
    minHeight: 100,
    textAlignVertical: 'top',
  },
  helperText: {
    fontSize: FontSizes.xs,
    color: Colors.textMuted,
    marginTop: Spacing.xs,
    fontStyle: 'italic',
  },
  photoGrid: {
    gap: Spacing.md,
  },
  photoCard: {
    backgroundColor: Colors.background,
    borderRadius: BorderRadius.md,
    padding: Spacing.sm,
    marginBottom: Spacing.sm,
  },
  photoHeader: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
    marginBottom: Spacing.xs,
  },
  photoNumber: {
    fontSize: FontSizes.sm,
    fontWeight: '600',
    color: Colors.accent,
  },
  photoImage: {
    width: '100%',
    height: 200,
    borderRadius: BorderRadius.md,
    backgroundColor: Colors.border,
  },
  captionInput: {
    backgroundColor: Colors.white,
    borderWidth: 1,
    borderColor: Colors.border,
    borderRadius: BorderRadius.md,
    padding: Spacing.sm,
    fontSize: FontSizes.sm,
    color: Colors.text,
    marginTop: Spacing.sm,
    minHeight: 60,
  },
  captionWarning: {
    fontSize: FontSizes.xs,
    color: Colors.error,
    marginTop: 4,
  },
  addPhotoButtons: {
    flexDirection: 'row',
    gap: Spacing.sm,
    marginTop: Spacing.md,
  },
  addPhotoBtn: {
    flex: 1,
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'center',
    padding: Spacing.md,
    borderWidth: 2,
    borderColor: Colors.accent,
    borderStyle: 'dashed',
    borderRadius: BorderRadius.md,
    gap: Spacing.sm,
  },
  addPhotoBtnText: {
    fontSize: FontSizes.md,
    fontWeight: '500',
    color: Colors.accent,
  },
  validationBanner: {
    flexDirection: 'row',
    alignItems: 'center',
    backgroundColor: Colors.warning + '20',
    padding: Spacing.md,
    borderRadius: BorderRadius.md,
    gap: Spacing.sm,
  },
  validationText: {
    fontSize: FontSizes.sm,
    color: Colors.warning,
    fontWeight: '500',
  },
  footer: {
    position: 'absolute',
    bottom: 0,
    left: 0,
    right: 0,
    padding: Spacing.md,
    backgroundColor: Colors.white,
    borderTopWidth: 1,
    borderTopColor: Colors.border,
  },
  submitButton: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'center',
    backgroundColor: Colors.success,
    padding: Spacing.md,
    borderRadius: BorderRadius.md,
    gap: Spacing.sm,
  },
  submitButtonDisabled: {
    backgroundColor: Colors.textMuted,
    opacity: 0.6,
  },
  submitButtonText: {
    fontSize: FontSizes.md,
    fontWeight: '600',
    color: Colors.white,
  },
});
