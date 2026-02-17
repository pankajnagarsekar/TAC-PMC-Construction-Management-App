// SUPERVISOR DPR SCREEN - ENHANCED
// Full DPR creation with minimum 4 photos, AI captions, voice notes
import React, { useState, useEffect, useRef } from 'react';
import {
  View,
  Text,
  StyleSheet,
  ScrollView,
  Pressable,
  ActivityIndicator,
  Alert,
  Platform,
  Image,
  TextInput,
  KeyboardAvoidingView,
  Dimensions,
} from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';
import { useRouter } from 'expo-router';
import { Ionicons } from '@expo/vector-icons';
import * as ImagePicker from 'expo-image-picker';
import { Audio } from 'expo-av';
import { useProject } from '../../contexts/ProjectContext';
import { useAuth } from '../../contexts/AuthContext';
import { Colors, Spacing, FontSizes, BorderRadius } from '../../constants/theme';
import ScreenHeader from '../../components/ScreenHeader';

const BASE_URL = process.env.EXPO_PUBLIC_BACKEND_URL || '';
const MIN_PHOTOS = 4;
const { width: SCREEN_WIDTH } = Dimensions.get('window');

const getToken = async () => {
  if (Platform.OS === 'web') return localStorage.getItem('access_token');
  const SecureStore = require('expo-secure-store');
  return await SecureStore.getItemAsync('access_token');
};

const apiRequest = async (endpoint: string, options: RequestInit = {}) => {
  const token = await getToken();
  const response = await fetch(`${BASE_URL}${endpoint}`, {
    ...options,
    headers: {
      'Content-Type': 'application/json',
      ...(token ? { 'Authorization': `Bearer ${token}` } : {}),
    },
  });
  if (!response.ok) {
    const error = await response.json().catch(() => ({ detail: 'Request failed' }));
    throw new Error(error.detail || 'Request failed');
  }
  return response.json();
};

const showAlert = (title: string, message: string, onOk?: () => void) => {
  if (Platform.OS === 'web') {
    window.alert(`${title}: ${message}`);
    onOk?.();
  } else {
    Alert.alert(title, message, [{ text: 'OK', onPress: onOk }]);
  }
};

interface Photo {
  id: string;
  uri: string;
  base64: string;
  caption: string;
  isGeneratingCaption: boolean;
  isPortrait: boolean;
  width: number;
  height: number;
}

interface VoiceNote {
  id: string;
  uri: string;
  duration: number;
}

export default function SupervisorDPRScreen() {
  const router = useRouter();
  const { selectedProject } = useProject();
  const { user } = useAuth();
  
  const [photos, setPhotos] = useState<Photo[]>([]);
  const [notes, setNotes] = useState('');
  const [submitting, setSubmitting] = useState(false);
  
  // Voice recording state
  const [recording, setRecording] = useState<Audio.Recording | null>(null);
  const [isRecording, setIsRecording] = useState(false);
  const [voiceNotes, setVoiceNotes] = useState<VoiceNote[]>([]);
  const [playingVoice, setPlayingVoice] = useState<string | null>(null);
  const soundRef = useRef<Audio.Sound | null>(null);

  // Redirect if no project selected
  useEffect(() => {
    if (!selectedProject) {
      router.replace('/(supervisor)/select-project');
    }
  }, [selectedProject]);

  const getProjectCode = () => {
    return (selectedProject as any)?.project_code || 'DPR';
  };

  const getTodayFormatted = () => {
    const today = new Date();
    return today.toLocaleDateString('en-US', { 
      month: 'short', 
      day: '2-digit', 
      year: 'numeric' 
    });
  };

  // AI Caption Generation
  const generateAICaption = async (photo: Photo) => {
    setPhotos(prev => prev.map(p => 
      p.id === photo.id ? { ...p, isGeneratingCaption: true } : p
    ));

    try {
      const response = await apiRequest('/api/v2/dpr/ai-caption', {
        method: 'POST',
        body: JSON.stringify({
          image_base64: `data:image/jpeg;base64,${photo.base64}`,
          project_context: selectedProject?.project_name || 'Construction project',
        }),
      });

      setPhotos(prev => prev.map(p => 
        p.id === photo.id 
          ? { ...p, caption: response.ai_caption || '', isGeneratingCaption: false } 
          : p
      ));
    } catch (error) {
      console.error('AI caption error:', error);
      setPhotos(prev => prev.map(p => 
        p.id === photo.id ? { ...p, isGeneratingCaption: false } : p
      ));
    }
  };

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
        exif: true,
      });

      if (!result.canceled && result.assets[0]) {
        const asset = result.assets[0];
        const isPortrait = (asset.height || 0) > (asset.width || 0);
        
        const newPhoto: Photo = {
          id: Date.now().toString(),
          uri: asset.uri,
          base64: asset.base64 || '',
          caption: '',
          isGeneratingCaption: false,
          isPortrait,
          width: asset.width || 0,
          height: asset.height || 0,
        };
        
        setPhotos(prev => [...prev, newPhoto]);
        
        // Auto-generate AI caption
        setTimeout(() => generateAICaption(newPhoto), 500);
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
        selectionLimit: MIN_PHOTOS - photos.length,
      });

      if (!result.canceled && result.assets) {
        const newPhotos: Photo[] = result.assets.map((asset, index) => {
          const isPortrait = (asset.height || 0) > (asset.width || 0);
          return {
            id: `${Date.now()}-${index}`,
            uri: asset.uri,
            base64: asset.base64 || '',
            caption: '',
            isGeneratingCaption: false,
            isPortrait,
            width: asset.width || 0,
            height: asset.height || 0,
          };
        });
        
        setPhotos(prev => [...prev, ...newPhotos]);
        
        // Auto-generate AI captions for all new photos
        newPhotos.forEach((photo, index) => {
          setTimeout(() => generateAICaption(photo), 500 * (index + 1));
        });
      }
    } catch (error) {
      showAlert('Error', 'Failed to pick images');
    }
  };

  const updateCaption = (id: string, caption: string) => {
    setPhotos(prev => prev.map(p => p.id === id ? { ...p, caption } : p));
  };

  const removePhoto = (id: string) => {
    setPhotos(prev => prev.filter(p => p.id !== id));
  };

  const regenerateCaption = (photo: Photo) => {
    generateAICaption(photo);
  };

  // Voice Recording Functions
  const startRecording = async () => {
    try {
      const { status } = await Audio.requestPermissionsAsync();
      if (status !== 'granted') {
        showAlert('Permission Required', 'Microphone access is needed for voice notes');
        return;
      }

      await Audio.setAudioModeAsync({
        allowsRecordingIOS: true,
        playsInSilentModeIOS: true,
      });

      const { recording } = await Audio.Recording.createAsync(
        Audio.RecordingOptionsPresets.HIGH_QUALITY
      );
      
      setRecording(recording);
      setIsRecording(true);
    } catch (error) {
      console.error('Failed to start recording:', error);
      showAlert('Error', 'Failed to start recording');
    }
  };

  const stopRecording = async () => {
    if (!recording) return;

    try {
      setIsRecording(false);
      await recording.stopAndUnloadAsync();
      
      const uri = recording.getURI();
      const status = await recording.getStatusAsync();
      
      if (uri) {
        const newVoiceNote: VoiceNote = {
          id: Date.now().toString(),
          uri,
          duration: Math.round((status.durationMillis || 0) / 1000),
        };
        setVoiceNotes(prev => [...prev, newVoiceNote]);
      }
      
      setRecording(null);
    } catch (error) {
      console.error('Failed to stop recording:', error);
    }
  };

  const playVoiceNote = async (voiceNote: VoiceNote) => {
    try {
      if (soundRef.current) {
        await soundRef.current.unloadAsync();
      }

      const { sound } = await Audio.Sound.createAsync(
        { uri: voiceNote.uri },
        { shouldPlay: true }
      );
      
      soundRef.current = sound;
      setPlayingVoice(voiceNote.id);

      sound.setOnPlaybackStatusUpdate((status) => {
        if (status.isLoaded && status.didJustFinish) {
          setPlayingVoice(null);
        }
      });
    } catch (error) {
      console.error('Failed to play voice note:', error);
    }
  };

  const removeVoiceNote = (id: string) => {
    setVoiceNotes(prev => prev.filter(v => v.id !== id));
  };

  const getPortraitCount = () => {
    return photos.filter(p => p.isPortrait).length;
  };

  const canSubmit = () => {
    return photos.length >= MIN_PHOTOS && selectedProject;
  };

  const handleSubmit = async () => {
    if (!selectedProject) {
      showAlert('Error', 'No project selected');
      return;
    }
    
    if (photos.length < MIN_PHOTOS) {
      showAlert('Validation Error', `Please add at least ${MIN_PHOTOS} photos`);
      return;
    }

    const portraitCount = getPortraitCount();
    if (portraitCount < MIN_PHOTOS) {
      // Warning but allow submission
      const proceedAnyway = Platform.OS === 'web' 
        ? window.confirm(`Only ${portraitCount} of ${photos.length} photos are portrait. Portrait photos are recommended for DPR. Continue anyway?`)
        : true; // On mobile, we'll just proceed with a warning
      
      if (!proceedAnyway) return;
    }

    setSubmitting(true);
    try {
      const projectId = (selectedProject as any).project_id || (selectedProject as any)._id;
      
      // Create DPR
      const dprPayload = {
        project_id: projectId,
        date: new Date().toISOString().split('T')[0],
        status: 'Draft',
        notes: notes,
        supervisor_id: user?.user_id,
        voice_notes_count: voiceNotes.length,
      };

      const dpr = await apiRequest('/api/v2/dpr', {
        method: 'POST',
        body: JSON.stringify(dprPayload),
      });

      // Add photos with captions
      for (const photo of photos) {
        await apiRequest('/api/v2/dpr/photos', {
          method: 'POST',
          body: JSON.stringify({
            dpr_id: dpr.dpr_id,
            photo_base64: `data:image/jpeg;base64,${photo.base64}`,
            caption: photo.caption || 'Site progress photo',
            is_portrait: photo.isPortrait,
          }),
        });
      }

      // Generate filename: Project Code - MM DD, YYYY
      const pdfFilename = `${getProjectCode()} - ${getTodayFormatted()}`;
      console.log('DPR PDF Filename:', pdfFilename);

      showAlert('Success', `DPR "${pdfFilename}" created successfully!`, () => {
        router.back();
      });
    } catch (error: any) {
      showAlert('Error', error.message || 'Failed to create DPR');
    } finally {
      setSubmitting(false);
    }
  };

  if (!selectedProject) {
    return (
      <SafeAreaView style={styles.container}>
        <ScreenHeader title="Create DPR" />
        <View style={styles.loadingContainer}>
          <ActivityIndicator size="large" color={Colors.primary} />
          <Text style={styles.loadingText}>Loading project...</Text>
        </View>
      </SafeAreaView>
    );
  }

  return (
    <SafeAreaView style={styles.container} edges={['left', 'right']}>
      <ScreenHeader title="Daily Progress Report" />
      
      <KeyboardAvoidingView 
        style={{ flex: 1 }} 
        behavior={Platform.OS === 'ios' ? 'padding' : 'height'}
      >
        <ScrollView contentContainerStyle={styles.content}>
          {/* Project Info Banner */}
          <View style={styles.projectBanner}>
            <View style={styles.projectBannerIcon}>
              <Ionicons name="business" size={20} color={Colors.accent} />
            </View>
            <View style={styles.projectBannerInfo}>
              <Text style={styles.projectBannerLabel}>Creating DPR for</Text>
              <Text style={styles.projectBannerName}>{selectedProject.project_name}</Text>
              <Text style={styles.projectBannerDate}>{getTodayFormatted()}</Text>
            </View>
          </View>

          {/* Progress Indicator */}
          <View style={styles.progressSection}>
            <View style={styles.progressItem}>
              <View style={[
                styles.progressCircle, 
                photos.length >= MIN_PHOTOS && styles.progressCircleComplete
              ]}>
                <Text style={[
                  styles.progressNumber,
                  photos.length >= MIN_PHOTOS && styles.progressNumberComplete
                ]}>
                  {photos.length}/{MIN_PHOTOS}
                </Text>
              </View>
              <Text style={styles.progressLabel}>Photos</Text>
              {photos.length < MIN_PHOTOS && (
                <Text style={styles.progressHint}>Min {MIN_PHOTOS} required</Text>
              )}
            </View>
            <View style={styles.progressItem}>
              <View style={[styles.progressCircle, styles.progressCircleOptional]}>
                <Ionicons name="mic" size={20} color={Colors.textSecondary} />
              </View>
              <Text style={styles.progressLabel}>{voiceNotes.length} Voice</Text>
              <Text style={styles.progressHint}>Optional</Text>
            </View>
            <View style={styles.progressItem}>
              <View style={[styles.progressCircle, styles.progressCircleOptional]}>
                <Ionicons name="document-text" size={20} color={Colors.textSecondary} />
              </View>
              <Text style={styles.progressLabel}>Notes</Text>
              <Text style={styles.progressHint}>Optional</Text>
            </View>
          </View>

          {/* Photo Section */}
          <View style={styles.section}>
            <View style={styles.sectionHeader}>
              <Text style={styles.sectionTitle}>
                Site Photos <Text style={styles.required}>*</Text>
              </Text>
              <Text style={styles.sectionHint}>
                {getPortraitCount()} portrait • {photos.length - getPortraitCount()} landscape
              </Text>
            </View>

            <View style={styles.photoActions}>
              <Pressable style={styles.photoActionBtn} onPress={takePhoto}>
                <Ionicons name="camera" size={28} color={Colors.white} />
                <Text style={styles.photoActionText}>Camera</Text>
              </Pressable>
              <Pressable style={[styles.photoActionBtn, styles.photoActionBtnSecondary]} onPress={pickImage}>
                <Ionicons name="images" size={28} color={Colors.primary} />
                <Text style={[styles.photoActionText, styles.photoActionTextSecondary]}>Gallery</Text>
              </Pressable>
            </View>

            {/* Photo Grid */}
            {photos.length > 0 ? (
              <View style={styles.photoGrid}>
                {photos.map((photo, index) => (
                  <View key={photo.id} style={styles.photoCard}>
                    <View style={styles.photoImageContainer}>
                      <Image source={{ uri: photo.uri }} style={styles.photoImage} />
                      <View style={styles.photoOverlay}>
                        <View style={[
                          styles.orientationBadge,
                          photo.isPortrait ? styles.portraitBadge : styles.landscapeBadge
                        ]}>
                          <Ionicons 
                            name={photo.isPortrait ? "phone-portrait" : "phone-landscape"} 
                            size={12} 
                            color={Colors.white} 
                          />
                          <Text style={styles.orientationText}>
                            {photo.isPortrait ? 'Portrait' : 'Landscape'}
                          </Text>
                        </View>
                        <Pressable 
                          style={styles.removePhotoBtn}
                          onPress={() => removePhoto(photo.id)}
                        >
                          <Ionicons name="close-circle" size={28} color={Colors.error} />
                        </Pressable>
                      </View>
                      <Text style={styles.photoNumber}>#{index + 1}</Text>
                    </View>
                    
                    <View style={styles.captionContainer}>
                      {photo.isGeneratingCaption ? (
                        <View style={styles.captionLoading}>
                          <ActivityIndicator size="small" color={Colors.accent} />
                          <Text style={styles.captionLoadingText}>Generating AI caption...</Text>
                        </View>
                      ) : (
                        <>
                          <TextInput
                            style={styles.captionInput}
                            value={photo.caption}
                            onChangeText={(text) => updateCaption(photo.id, text)}
                            placeholder="Add or edit caption..."
                            placeholderTextColor={Colors.textMuted}
                            multiline
                          />
                          <Pressable 
                            style={styles.regenerateBtn}
                            onPress={() => regenerateCaption(photo)}
                          >
                            <Ionicons name="sparkles" size={18} color={Colors.accent} />
                          </Pressable>
                        </>
                      )}
                    </View>
                  </View>
                ))}
              </View>
            ) : (
              <View style={styles.emptyPhotos}>
                <View style={styles.emptyPhotosIcon}>
                  <Ionicons name="camera-outline" size={48} color={Colors.textMuted} />
                </View>
                <Text style={styles.emptyTitle}>No photos added</Text>
                <Text style={styles.emptyText}>
                  Add at least {MIN_PHOTOS} photos to create your DPR.{'\n'}
                  Portrait orientation is recommended.
                </Text>
              </View>
            )}
          </View>

          {/* Voice Notes Section */}
          <View style={styles.section}>
            <View style={styles.sectionHeader}>
              <Text style={styles.sectionTitle}>Voice Notes</Text>
              <Text style={styles.sectionHint}>Optional</Text>
            </View>

            <Pressable 
              style={[styles.voiceRecordBtn, isRecording && styles.voiceRecordBtnActive]}
              onPress={isRecording ? stopRecording : startRecording}
            >
              <View style={[styles.voiceRecordIcon, isRecording && styles.voiceRecordIconActive]}>
                <Ionicons 
                  name={isRecording ? "stop" : "mic"} 
                  size={24} 
                  color={isRecording ? Colors.white : Colors.accent} 
                />
              </View>
              <Text style={[styles.voiceRecordText, isRecording && styles.voiceRecordTextActive]}>
                {isRecording ? 'Tap to Stop Recording' : 'Tap to Record Voice Note'}
              </Text>
              {isRecording && (
                <View style={styles.recordingIndicator}>
                  <View style={styles.recordingDot} />
                  <Text style={styles.recordingText}>Recording...</Text>
                </View>
              )}
            </Pressable>

            {voiceNotes.map((voice) => (
              <View key={voice.id} style={styles.voiceNoteItem}>
                <Pressable 
                  style={styles.voicePlayBtn}
                  onPress={() => playVoiceNote(voice)}
                >
                  <Ionicons 
                    name={playingVoice === voice.id ? "pause" : "play"} 
                    size={20} 
                    color={Colors.white} 
                  />
                </Pressable>
                <View style={styles.voiceNoteInfo}>
                  <Text style={styles.voiceNoteName}>Voice Note</Text>
                  <Text style={styles.voiceNoteDuration}>{voice.duration}s</Text>
                </View>
                <Pressable onPress={() => removeVoiceNote(voice.id)}>
                  <Ionicons name="trash-outline" size={20} color={Colors.error} />
                </Pressable>
              </View>
            ))}
          </View>

          {/* Text Notes Section */}
          <View style={styles.section}>
            <View style={styles.sectionHeader}>
              <Text style={styles.sectionTitle}>Additional Notes</Text>
              <Text style={styles.sectionHint}>Optional</Text>
            </View>
            <TextInput
              style={styles.notesInput}
              value={notes}
              onChangeText={setNotes}
              placeholder="Enter any additional notes about today's progress, issues, or observations..."
              placeholderTextColor={Colors.textMuted}
              multiline
              numberOfLines={4}
            />
          </View>

          {/* Submit Button */}
          <Pressable
            style={[
              styles.submitBtn, 
              !canSubmit() && styles.submitBtnDisabled,
              submitting && styles.submitBtnSubmitting
            ]}
            onPress={handleSubmit}
            disabled={!canSubmit() || submitting}
          >
            {submitting ? (
              <>
                <ActivityIndicator size="small" color={Colors.white} />
                <Text style={styles.submitBtnText}>Creating DPR...</Text>
              </>
            ) : (
              <>
                <Ionicons name="checkmark-circle" size={24} color={Colors.white} />
                <Text style={styles.submitBtnText}>
                  {canSubmit() ? 'Submit DPR' : `Add ${MIN_PHOTOS - photos.length} more photo${MIN_PHOTOS - photos.length > 1 ? 's' : ''}`}
                </Text>
              </>
            )}
          </Pressable>

          {/* Filename Preview */}
          <Text style={styles.filenamePreview}>
            PDF will be saved as: {getProjectCode()} - {getTodayFormatted()}
          </Text>
        </ScrollView>
      </KeyboardAvoidingView>
    </SafeAreaView>
  );
}

const styles = StyleSheet.create({
  container: { flex: 1, backgroundColor: Colors.background },
  loadingContainer: { flex: 1, justifyContent: 'center', alignItems: 'center' },
  loadingText: { marginTop: Spacing.md, color: Colors.textSecondary },
  content: { padding: Spacing.md, paddingBottom: Spacing.xl * 2 },
  
  // Project Banner
  projectBanner: {
    flexDirection: 'row',
    alignItems: 'center',
    backgroundColor: Colors.accent + '15',
    borderRadius: BorderRadius.lg,
    padding: Spacing.md,
    marginBottom: Spacing.md,
    borderLeftWidth: 4,
    borderLeftColor: Colors.accent,
  },
  projectBannerIcon: {
    width: 44,
    height: 44,
    borderRadius: BorderRadius.md,
    backgroundColor: Colors.white,
    justifyContent: 'center',
    alignItems: 'center',
    marginRight: Spacing.md,
  },
  projectBannerInfo: { flex: 1 },
  projectBannerLabel: { fontSize: FontSizes.xs, color: Colors.textMuted },
  projectBannerName: { fontSize: FontSizes.md, fontWeight: '600', color: Colors.text },
  projectBannerDate: { fontSize: FontSizes.sm, color: Colors.accent, marginTop: 2 },

  // Progress Section
  progressSection: {
    flexDirection: 'row',
    justifyContent: 'space-around',
    backgroundColor: Colors.white,
    borderRadius: BorderRadius.lg,
    padding: Spacing.md,
    marginBottom: Spacing.lg,
  },
  progressItem: { alignItems: 'center' },
  progressCircle: {
    width: 50,
    height: 50,
    borderRadius: 25,
    backgroundColor: Colors.background,
    justifyContent: 'center',
    alignItems: 'center',
    borderWidth: 2,
    borderColor: Colors.border,
  },
  progressCircleComplete: {
    backgroundColor: Colors.successLight,
    borderColor: Colors.success,
  },
  progressCircleOptional: {
    borderStyle: 'dashed',
  },
  progressNumber: { fontSize: FontSizes.md, fontWeight: 'bold', color: Colors.textSecondary },
  progressNumberComplete: { color: Colors.success },
  progressLabel: { fontSize: FontSizes.sm, color: Colors.text, marginTop: Spacing.xs },
  progressHint: { fontSize: FontSizes.xs, color: Colors.textMuted },

  // Section
  section: { marginBottom: Spacing.lg },
  sectionHeader: { flexDirection: 'row', justifyContent: 'space-between', alignItems: 'center', marginBottom: Spacing.sm },
  sectionTitle: { fontSize: FontSizes.md, fontWeight: '600', color: Colors.text },
  sectionHint: { fontSize: FontSizes.xs, color: Colors.textMuted },
  required: { color: Colors.error },

  // Photo Actions
  photoActions: { flexDirection: 'row', gap: Spacing.md, marginBottom: Spacing.md },
  photoActionBtn: {
    flex: 1,
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'center',
    gap: Spacing.sm,
    backgroundColor: Colors.accent,
    paddingVertical: Spacing.md,
    borderRadius: BorderRadius.lg,
  },
  photoActionBtnSecondary: {
    backgroundColor: Colors.white,
    borderWidth: 2,
    borderColor: Colors.primary,
  },
  photoActionText: { fontSize: FontSizes.md, fontWeight: '600', color: Colors.white },
  photoActionTextSecondary: { color: Colors.primary },

  // Photo Grid
  photoGrid: { gap: Spacing.md },
  photoCard: {
    backgroundColor: Colors.white,
    borderRadius: BorderRadius.lg,
    overflow: 'hidden',
  },
  photoImageContainer: { position: 'relative' },
  photoImage: { width: '100%', height: 200, resizeMode: 'cover' },
  photoOverlay: {
    position: 'absolute',
    top: 0,
    left: 0,
    right: 0,
    flexDirection: 'row',
    justifyContent: 'space-between',
    padding: Spacing.sm,
  },
  orientationBadge: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 4,
    paddingHorizontal: Spacing.sm,
    paddingVertical: 4,
    borderRadius: BorderRadius.sm,
  },
  portraitBadge: { backgroundColor: Colors.success },
  landscapeBadge: { backgroundColor: Colors.warning },
  orientationText: { fontSize: FontSizes.xs, color: Colors.white, fontWeight: '500' },
  removePhotoBtn: { backgroundColor: Colors.white, borderRadius: 14 },
  photoNumber: {
    position: 'absolute',
    bottom: Spacing.sm,
    left: Spacing.sm,
    backgroundColor: 'rgba(0,0,0,0.6)',
    color: Colors.white,
    fontSize: FontSizes.sm,
    fontWeight: 'bold',
    paddingHorizontal: Spacing.sm,
    paddingVertical: 2,
    borderRadius: BorderRadius.sm,
  },
  captionContainer: {
    flexDirection: 'row',
    alignItems: 'center',
    padding: Spacing.sm,
    borderTopWidth: 1,
    borderTopColor: Colors.border,
  },
  captionInput: {
    flex: 1,
    fontSize: FontSizes.sm,
    color: Colors.text,
    padding: Spacing.xs,
    minHeight: 40,
  },
  captionLoading: {
    flex: 1,
    flexDirection: 'row',
    alignItems: 'center',
    gap: Spacing.sm,
    padding: Spacing.xs,
  },
  captionLoadingText: { fontSize: FontSizes.sm, color: Colors.accent },
  regenerateBtn: {
    padding: Spacing.sm,
    backgroundColor: Colors.accent + '15',
    borderRadius: BorderRadius.md,
  },

  // Empty Photos
  emptyPhotos: {
    alignItems: 'center',
    padding: Spacing.xl,
    backgroundColor: Colors.white,
    borderRadius: BorderRadius.lg,
    borderWidth: 2,
    borderColor: Colors.border,
    borderStyle: 'dashed',
  },
  emptyPhotosIcon: {
    width: 80,
    height: 80,
    borderRadius: 40,
    backgroundColor: Colors.background,
    justifyContent: 'center',
    alignItems: 'center',
    marginBottom: Spacing.md,
  },
  emptyTitle: { fontSize: FontSizes.md, fontWeight: '600', color: Colors.text, marginBottom: Spacing.xs },
  emptyText: { fontSize: FontSizes.sm, color: Colors.textMuted, textAlign: 'center', lineHeight: 20 },

  // Voice Recording
  voiceRecordBtn: {
    flexDirection: 'row',
    alignItems: 'center',
    backgroundColor: Colors.white,
    padding: Spacing.md,
    borderRadius: BorderRadius.lg,
    borderWidth: 2,
    borderColor: Colors.accent,
    marginBottom: Spacing.sm,
  },
  voiceRecordBtnActive: {
    backgroundColor: Colors.error,
    borderColor: Colors.error,
  },
  voiceRecordIcon: {
    width: 44,
    height: 44,
    borderRadius: 22,
    backgroundColor: Colors.accent + '20',
    justifyContent: 'center',
    alignItems: 'center',
    marginRight: Spacing.md,
  },
  voiceRecordIconActive: {
    backgroundColor: Colors.white,
  },
  voiceRecordText: { flex: 1, fontSize: FontSizes.md, color: Colors.accent, fontWeight: '500' },
  voiceRecordTextActive: { color: Colors.white },
  recordingIndicator: { flexDirection: 'row', alignItems: 'center', gap: Spacing.xs },
  recordingDot: { width: 8, height: 8, borderRadius: 4, backgroundColor: Colors.white },
  recordingText: { fontSize: FontSizes.xs, color: Colors.white },
  voiceNoteItem: {
    flexDirection: 'row',
    alignItems: 'center',
    backgroundColor: Colors.white,
    padding: Spacing.sm,
    borderRadius: BorderRadius.md,
    marginBottom: Spacing.xs,
  },
  voicePlayBtn: {
    width: 36,
    height: 36,
    borderRadius: 18,
    backgroundColor: Colors.accent,
    justifyContent: 'center',
    alignItems: 'center',
    marginRight: Spacing.sm,
  },
  voiceNoteInfo: { flex: 1 },
  voiceNoteName: { fontSize: FontSizes.sm, color: Colors.text },
  voiceNoteDuration: { fontSize: FontSizes.xs, color: Colors.textMuted },

  // Notes Input
  notesInput: {
    backgroundColor: Colors.white,
    borderRadius: BorderRadius.lg,
    padding: Spacing.md,
    fontSize: FontSizes.md,
    color: Colors.text,
    minHeight: 120,
    textAlignVertical: 'top',
  },

  // Submit Button
  submitBtn: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'center',
    gap: Spacing.sm,
    backgroundColor: Colors.success,
    paddingVertical: Spacing.md + 4,
    borderRadius: BorderRadius.lg,
    marginTop: Spacing.md,
  },
  submitBtnDisabled: {
    backgroundColor: Colors.textMuted,
  },
  submitBtnSubmitting: {
    backgroundColor: Colors.accent,
  },
  submitBtnText: { fontSize: FontSizes.lg, fontWeight: '600', color: Colors.white },
  filenamePreview: {
    textAlign: 'center',
    fontSize: FontSizes.xs,
    color: Colors.textMuted,
    marginTop: Spacing.md,
  },
});
