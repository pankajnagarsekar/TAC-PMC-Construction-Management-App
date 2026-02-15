// CREATE DPR SCREEN
// Create Daily Progress Report with camera functionality

import React, { useState, useEffect, useCallback, useRef } from 'react';
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
} from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';
import { useRouter } from 'expo-router';
import { Ionicons } from '@expo/vector-icons';
import { Picker } from '@react-native-picker/picker';
import * as ImagePicker from 'expo-image-picker';
import { Camera, CameraView } from 'expo-camera';
import * as Print from 'expo-print';
import * as Sharing from 'expo-sharing';
import { apiClient, projectsApi } from '../../../services/apiClient';
import { Colors, Spacing, FontSizes, BorderRadius } from '../../../constants/theme';

interface CapturedImage {
  id: string;
  uri: string;
  base64: string;
  caption: string;
  aiCaption?: string;
  aiAlternatives?: string[];
}

const showAlert = (title: string, message: string, onOk?: () => void) => {
  if (Platform.OS === 'web') {
    window.alert(`${title}\n\n${message}`);
    if (onOk) onOk();
  } else {
    Alert.alert(title, message, onOk ? [{ text: 'OK', onPress: onOk }] : undefined);
  }
};

export default function CreateDPRScreen() {
  const router = useRouter();
  const cameraRef = useRef<CameraView>(null);
  const [loading, setLoading] = useState(false);
  const [loadingProjects, setLoadingProjects] = useState(true);
  const [showCamera, setShowCamera] = useState(false);
  const [hasPermission, setHasPermission] = useState<boolean | null>(null);

  // Form state
  const [projects, setProjects] = useState<any[]>([]);
  const [projectId, setProjectId] = useState('');
  const [dprDate, setDprDate] = useState(new Date().toISOString().split('T')[0]);
  const [progressNotes, setProgressNotes] = useState('');
  const [weatherConditions, setWeatherConditions] = useState('');
  const [manpowerCount, setManpowerCount] = useState('');
  const [issuesEncountered, setIssuesEncountered] = useState('');
  const [images, setImages] = useState<CapturedImage[]>([]);
  const [currentCaption, setCurrentCaption] = useState('');

  // DPR state after creation
  const [dprId, setDprId] = useState<string | null>(null);
  const [generatingCaption, setGeneratingCaption] = useState<string | null>(null);
  const [selectedImageForCaption, setSelectedImageForCaption] = useState<string | null>(null);

  useEffect(() => {
    loadProjects();
    requestPermissions();
  }, []);

  const loadProjects = async () => {
    try {
      const data = await projectsApi.getAll();
      setProjects(data || []);
      if (data?.length > 0) {
        setProjectId(data[0].project_id || data[0]._id);
      }
    } catch (error) {
      console.error('Error loading projects:', error);
    } finally {
      setLoadingProjects(false);
    }
  };

  const requestPermissions = async () => {
    if (Platform.OS !== 'web') {
      const { status } = await Camera.requestCameraPermissionsAsync();
      setHasPermission(status === 'granted');
    } else {
      setHasPermission(true);
    }
  };

  const handleCreateDPR = async () => {
    if (!projectId) {
      showAlert('Error', 'Please select a project');
      return;
    }

    setLoading(true);
    try {
      const response = await apiClient.post('/api/v2/dpr', {
        project_id: projectId,
        dpr_date: dprDate,
        progress_notes: progressNotes || undefined,
        weather_conditions: weatherConditions || undefined,
        manpower_count: manpowerCount ? parseInt(manpowerCount) : undefined,
        issues_encountered: issuesEncountered || undefined,
      });

      setDprId(response.dpr_id);
      showAlert('Success', 'DPR created! Now add at least 4 photos.');
    } catch (error: any) {
      showAlert('Error', error.message || 'Failed to create DPR');
    } finally {
      setLoading(false);
    }
  };

  const takePicture = async () => {
    if (Platform.OS === 'web') {
      // For web, use image picker
      await pickImage();
      return;
    }

    if (cameraRef.current) {
      try {
        const photo = await cameraRef.current.takePictureAsync({
          base64: true,
          quality: 0.7,
        });

        if (photo) {
          const newImage: CapturedImage = {
            id: Date.now().toString(),
            uri: photo.uri,
            base64: photo.base64 || '',
            caption: currentCaption,
          };
          setImages([...images, newImage]);
          setCurrentCaption('');
          setShowCamera(false);
        }
      } catch (error) {
        console.error('Error taking picture:', error);
        showAlert('Error', 'Failed to capture photo');
      }
    }
  };

  const pickImage = async () => {
    try {
      const result = await ImagePicker.launchImageLibraryAsync({
        mediaTypes: ImagePicker.MediaTypeOptions.Images,
        allowsEditing: true,
        quality: 0.7,
        base64: true,
      });

      if (!result.canceled && result.assets[0]) {
        const newImage: CapturedImage = {
          id: Date.now().toString(),
          uri: result.assets[0].uri,
          base64: result.assets[0].base64 || '',
          caption: currentCaption,
        };
        setImages([...images, newImage]);
        setCurrentCaption('');
      }
    } catch (error) {
      console.error('Error picking image:', error);
    }
  };

  const removeImage = (imageId: string) => {
    setImages(images.filter(img => img.id !== imageId));
  };

  const generateAICaption = async (imageId: string) => {
    const image = images.find(img => img.id === imageId);
    if (!image) return;

    setGeneratingCaption(imageId);
    try {
      const response = await apiClient.post('/api/v2/dpr/ai-caption', {
        image_data: image.base64,
      });

      // Update image with AI caption
      setImages(prevImages => prevImages.map(img => 
        img.id === imageId 
          ? { 
              ...img, 
              caption: response.ai_caption,
              aiCaption: response.ai_caption,
              aiAlternatives: response.alternatives || []
            }
          : img
      ));

      showAlert('AI Caption Generated', `Caption: "${response.ai_caption}"\n\nYou can edit or select from alternatives.`);
    } catch (error: any) {
      showAlert('Error', error.message || 'Failed to generate AI caption');
    } finally {
      setGeneratingCaption(null);
    }
  };

  const updateImageCaption = (imageId: string, newCaption: string) => {
    setImages(prevImages => prevImages.map(img => 
      img.id === imageId 
        ? { ...img, caption: newCaption }
        : img
    ));
  };

  const uploadImages = async () => {
    if (!dprId) {
      showAlert('Error', 'Please create DPR first');
      return;
    }

    if (images.length < 4) {
      showAlert('Error', `Minimum 4 photos required. Current: ${images.length}`);
      return;
    }

    setLoading(true);
    try {
      // Upload each image
      for (const img of images) {
        await apiClient.post(`/api/v2/dpr/${dprId}/images`, {
          dpr_id: dprId,
          image_data: img.base64,
          caption: img.caption || undefined,
        });
      }

      showAlert('Success', 'All photos uploaded!', () => {
        // Auto-submit if we have enough images
        submitDPR();
      });
    } catch (error: any) {
      showAlert('Error', error.message || 'Failed to upload photos');
    } finally {
      setLoading(false);
    }
  };

  const submitDPR = async () => {
    if (!dprId) return;

    setLoading(true);
    try {
      await apiClient.post(`/api/v2/dpr/${dprId}/submit`);
      showAlert('Success', 'DPR submitted successfully!', () => {
        router.replace('/(admin)/dpr');
      });
    } catch (error: any) {
      showAlert('Error', error.message || 'Failed to submit DPR');
    } finally {
      setLoading(false);
    }
  };

  // Camera view
  if (showCamera && Platform.OS !== 'web') {
    return (
      <SafeAreaView style={styles.cameraContainer}>
        <CameraView
          ref={cameraRef}
          style={styles.camera}
          facing="back"
        >
          <View style={styles.cameraOverlay}>
            <Pressable
              style={styles.closeCameraButton}
              onPress={() => setShowCamera(false)}
            >
              <Ionicons name="close" size={28} color={Colors.white} />
            </Pressable>

            <View style={styles.captionInputContainer}>
              <TextInput
                style={styles.captionInput}
                value={currentCaption}
                onChangeText={setCurrentCaption}
                placeholder="Add caption (optional)"
                placeholderTextColor="rgba(255,255,255,0.7)"
              />
            </View>

            <View style={styles.cameraControls}>
              <Pressable style={styles.captureButton} onPress={takePicture}>
                <View style={styles.captureButtonInner} />
              </Pressable>
            </View>
          </View>
        </CameraView>
      </SafeAreaView>
    );
  }

  if (loadingProjects) {
    return (
      <SafeAreaView style={styles.container}>
        <View style={styles.loadingContainer}>
          <ActivityIndicator size="large" color={Colors.primary} />
          <Text style={styles.loadingText}>Loading...</Text>
        </View>
      </SafeAreaView>
    );
  }

  return (
    <SafeAreaView style={styles.container} edges={['left', 'right']}>
      <ScrollView contentContainerStyle={styles.content} keyboardShouldPersistTaps="handled">
        {/* Step 1: DPR Details */}
        {!dprId && (
          <>
            <View style={styles.stepHeader}>
              <View style={styles.stepBadge}>
                <Text style={styles.stepNumber}>1</Text>
              </View>
              <Text style={styles.stepTitle}>DPR Details</Text>
            </View>

            {/* Project Picker */}
            <View style={styles.fieldGroup}>
              <Text style={styles.label}>Project *</Text>
              <View style={styles.pickerContainer}>
                <Picker
                  selectedValue={projectId}
                  onValueChange={setProjectId}
                  style={styles.picker}
                >
                  {projects.map((p) => (
                    <Picker.Item
                      key={p.project_id || p._id}
                      label={p.project_name}
                      value={p.project_id || p._id}
                    />
                  ))}
                </Picker>
              </View>
            </View>

            {/* Date */}
            <View style={styles.fieldGroup}>
              <Text style={styles.label}>DPR Date * (YYYY-MM-DD)</Text>
              <TextInput
                style={styles.input}
                value={dprDate}
                onChangeText={setDprDate}
                placeholder="2024-01-15"
                placeholderTextColor={Colors.textMuted}
              />
            </View>

            {/* Weather */}
            <View style={styles.fieldGroup}>
              <Text style={styles.label}>Weather Conditions</Text>
              <View style={styles.pickerContainer}>
                <Picker
                  selectedValue={weatherConditions}
                  onValueChange={setWeatherConditions}
                  style={styles.picker}
                >
                  <Picker.Item label="Select weather" value="" />
                  <Picker.Item label="Sunny" value="Sunny" />
                  <Picker.Item label="Cloudy" value="Cloudy" />
                  <Picker.Item label="Rainy" value="Rainy" />
                  <Picker.Item label="Windy" value="Windy" />
                  <Picker.Item label="Hot" value="Hot" />
                </Picker>
              </View>
            </View>

            {/* Manpower */}
            <View style={styles.fieldGroup}>
              <Text style={styles.label}>Manpower Count</Text>
              <TextInput
                style={styles.input}
                value={manpowerCount}
                onChangeText={setManpowerCount}
                placeholder="Number of workers on site"
                placeholderTextColor={Colors.textMuted}
                keyboardType="numeric"
              />
            </View>

            {/* Progress Notes */}
            <View style={styles.fieldGroup}>
              <Text style={styles.label}>Progress Notes</Text>
              <TextInput
                style={[styles.input, styles.textArea]}
                value={progressNotes}
                onChangeText={setProgressNotes}
                placeholder="Describe today's progress..."
                placeholderTextColor={Colors.textMuted}
                multiline
                numberOfLines={4}
              />
            </View>

            {/* Issues */}
            <View style={styles.fieldGroup}>
              <Text style={styles.label}>Issues Encountered</Text>
              <TextInput
                style={[styles.input, styles.textArea]}
                value={issuesEncountered}
                onChangeText={setIssuesEncountered}
                placeholder="Any issues or delays..."
                placeholderTextColor={Colors.textMuted}
                multiline
                numberOfLines={3}
              />
            </View>

            {/* Create DPR Button */}
            <Pressable
              style={({ pressed }) => [
                styles.primaryButton,
                pressed && styles.buttonPressed,
                loading && styles.buttonDisabled,
              ]}
              onPress={handleCreateDPR}
              disabled={loading}
            >
              {loading ? (
                <ActivityIndicator color={Colors.white} />
              ) : (
                <>
                  <Ionicons name="create" size={20} color={Colors.white} />
                  <Text style={styles.buttonText}>Create DPR</Text>
                </>
              )}
            </Pressable>
          </>
        )}

        {/* Step 2: Add Photos */}
        {dprId && (
          <>
            <View style={styles.stepHeader}>
              <View style={[styles.stepBadge, styles.stepBadgeActive]}>
                <Text style={styles.stepNumber}>2</Text>
              </View>
              <Text style={styles.stepTitle}>Add Photos (Min. 4 required)</Text>
            </View>

            <View style={styles.infoBox}>
              <Ionicons name="information-circle" size={20} color={Colors.primary} />
              <Text style={styles.infoText}>
                DPR ID: {dprId}. Take or upload at least 4 progress photos.
              </Text>
            </View>

            {/* Photo Grid */}
            <View style={styles.photoGrid}>
              {images.map((img) => (
                <View key={img.id} style={styles.photoItemContainer}>
                  <View style={styles.photoItem}>
                    <Image source={{ uri: img.uri }} style={styles.photoImage} />
                    <Pressable
                      style={styles.removePhotoButton}
                      onPress={() => removeImage(img.id)}
                    >
                      <Ionicons name="close-circle" size={24} color={Colors.error} />
                    </Pressable>
                  </View>
                  
                  {/* Caption section below photo */}
                  <View style={styles.captionSection}>
                    <TextInput
                      style={styles.imageCaptionInput}
                      value={img.caption}
                      onChangeText={(text) => updateImageCaption(img.id, text)}
                      placeholder="Add caption..."
                      placeholderTextColor={Colors.textMuted}
                      multiline
                    />
                    <Pressable
                      style={[
                        styles.aiCaptionButton,
                        generatingCaption === img.id && styles.aiCaptionButtonLoading
                      ]}
                      onPress={() => generateAICaption(img.id)}
                      disabled={generatingCaption === img.id}
                    >
                      {generatingCaption === img.id ? (
                        <ActivityIndicator size="small" color={Colors.white} />
                      ) : (
                        <>
                          <Ionicons name="sparkles" size={14} color={Colors.white} />
                          <Text style={styles.aiCaptionButtonText}>AI</Text>
                        </>
                      )}
                    </Pressable>
                  </View>
                  
                  {/* Show AI alternatives if available */}
                  {img.aiAlternatives && img.aiAlternatives.length > 0 && (
                    <View style={styles.alternativesContainer}>
                      <Text style={styles.alternativesTitle}>Alternatives:</Text>
                      {img.aiAlternatives.map((alt, idx) => (
                        <Pressable
                          key={idx}
                          style={styles.alternativeChip}
                          onPress={() => updateImageCaption(img.id, alt)}
                        >
                          <Text style={styles.alternativeText} numberOfLines={1}>{alt}</Text>
                        </Pressable>
                      ))}
                    </View>
                  )}
                </View>
              ))}

              {/* Add Photo Button */}
              <Pressable
                style={styles.addPhotoButton}
                onPress={() => {
                  if (Platform.OS === 'web') {
                    pickImage();
                  } else if (hasPermission) {
                    setShowCamera(true);
                  } else {
                    pickImage();
                  }
                }}
              >
                <Ionicons name="camera" size={32} color={Colors.primary} />
                <Text style={styles.addPhotoText}>
                  {Platform.OS === 'web' ? 'Upload Photo' : 'Take Photo'}
                </Text>
              </Pressable>
            </View>

            {/* Gallery Button for picking existing photos */}
            <Pressable
              style={styles.galleryButton}
              onPress={pickImage}
            >
              <Ionicons name="images" size={20} color={Colors.primary} />
              <Text style={styles.galleryButtonText}>Pick from Gallery</Text>
            </Pressable>

            {/* Photo count indicator */}
            <View style={styles.photoCountContainer}>
              <Text style={[
                styles.photoCountText,
                images.length >= 4 ? styles.photoCountSuccess : styles.photoCountWarning
              ]}>
                {images.length}/4 photos {images.length >= 4 ? '✓' : '(minimum required)'}
              </Text>
            </View>

            {/* Upload & Submit Buttons */}
            <Pressable
              style={({ pressed }) => [
                styles.primaryButton,
                pressed && styles.buttonPressed,
                (loading || images.length < 4) && styles.buttonDisabled,
              ]}
              onPress={uploadImages}
              disabled={loading || images.length < 4}
            >
              {loading ? (
                <ActivityIndicator color={Colors.white} />
              ) : (
                <>
                  <Ionicons name="cloud-upload" size={20} color={Colors.white} />
                  <Text style={styles.buttonText}>Upload & Submit DPR</Text>
                </>
              )}
            </Pressable>

            {images.length < 4 && (
              <Text style={styles.warningText}>
                Please add at least {4 - images.length} more photo(s)
              </Text>
            )}
          </>
        )}
      </ScrollView>
    </SafeAreaView>
  );
}

const styles = StyleSheet.create({
  container: { flex: 1, backgroundColor: Colors.background },
  loadingContainer: { flex: 1, justifyContent: 'center', alignItems: 'center' },
  loadingText: { marginTop: Spacing.md, fontSize: FontSizes.md, color: Colors.textSecondary },
  content: { padding: Spacing.md },
  stepHeader: { flexDirection: 'row', alignItems: 'center', marginBottom: Spacing.lg, gap: Spacing.sm },
  stepBadge: {
    width: 32,
    height: 32,
    borderRadius: 16,
    backgroundColor: Colors.primary,
    justifyContent: 'center',
    alignItems: 'center',
  },
  stepBadgeActive: { backgroundColor: Colors.success },
  stepNumber: { fontSize: FontSizes.md, fontWeight: 'bold', color: Colors.white },
  stepTitle: { fontSize: FontSizes.lg, fontWeight: '600', color: Colors.text },
  fieldGroup: { marginBottom: Spacing.md },
  label: { fontSize: FontSizes.sm, fontWeight: '600', color: Colors.text, marginBottom: Spacing.xs },
  input: {
    backgroundColor: Colors.white,
    borderWidth: 1,
    borderColor: Colors.border,
    borderRadius: BorderRadius.md,
    paddingHorizontal: Spacing.md,
    paddingVertical: Spacing.sm,
    fontSize: FontSizes.md,
    color: Colors.text,
  },
  textArea: { minHeight: 100, textAlignVertical: 'top' },
  pickerContainer: {
    backgroundColor: Colors.white,
    borderWidth: 1,
    borderColor: Colors.border,
    borderRadius: BorderRadius.md,
    overflow: 'hidden',
  },
  picker: { height: 50 },
  primaryButton: {
    backgroundColor: Colors.primary,
    borderRadius: BorderRadius.md,
    paddingVertical: Spacing.md,
    flexDirection: 'row',
    justifyContent: 'center',
    alignItems: 'center',
    gap: Spacing.sm,
    marginTop: Spacing.lg,
  },
  buttonPressed: { opacity: 0.8 },
  buttonDisabled: { opacity: 0.5 },
  buttonText: { color: Colors.white, fontSize: FontSizes.md, fontWeight: '600' },
  infoBox: {
    flexDirection: 'row',
    alignItems: 'center',
    backgroundColor: Colors.primaryLight + '20',
    padding: Spacing.md,
    borderRadius: BorderRadius.md,
    gap: Spacing.sm,
    marginBottom: Spacing.md,
  },
  infoText: { flex: 1, fontSize: FontSizes.sm, color: Colors.primary },
  photoGrid: {
    flexDirection: 'row',
    flexWrap: 'wrap',
    gap: Spacing.md,
    marginBottom: Spacing.md,
  },
  photoItemContainer: {
    width: '100%',
    marginBottom: Spacing.md,
    backgroundColor: Colors.white,
    borderRadius: BorderRadius.md,
    padding: Spacing.sm,
    borderWidth: 1,
    borderColor: Colors.border,
  },
  photoItem: { 
    position: 'relative', 
    width: '100%', 
    aspectRatio: 9/16,
    maxHeight: 300,
    borderRadius: BorderRadius.md,
    overflow: 'hidden',
  },
  photoImage: { width: '100%', height: '100%', borderRadius: BorderRadius.md },
  removePhotoButton: { position: 'absolute', top: 4, right: 4, backgroundColor: Colors.white, borderRadius: 12 },
  captionSection: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: Spacing.sm,
    marginTop: Spacing.sm,
  },
  imageCaptionInput: {
    flex: 1,
    backgroundColor: Colors.background,
    borderWidth: 1,
    borderColor: Colors.border,
    borderRadius: BorderRadius.sm,
    paddingHorizontal: Spacing.sm,
    paddingVertical: Spacing.xs,
    fontSize: FontSizes.sm,
    color: Colors.text,
    minHeight: 36,
  },
  aiCaptionButton: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 4,
    backgroundColor: Colors.primary,
    paddingHorizontal: Spacing.sm,
    paddingVertical: Spacing.xs,
    borderRadius: BorderRadius.sm,
    minWidth: 50,
    justifyContent: 'center',
  },
  aiCaptionButtonLoading: {
    opacity: 0.7,
  },
  aiCaptionButtonText: {
    color: Colors.white,
    fontSize: FontSizes.xs,
    fontWeight: '600',
  },
  alternativesContainer: {
    marginTop: Spacing.xs,
    flexDirection: 'row',
    flexWrap: 'wrap',
    gap: 6,
    alignItems: 'center',
  },
  alternativesTitle: {
    fontSize: FontSizes.xs,
    color: Colors.textMuted,
    marginRight: 4,
  },
  alternativeChip: {
    backgroundColor: Colors.background,
    paddingHorizontal: 8,
    paddingVertical: 4,
    borderRadius: 12,
    borderWidth: 1,
    borderColor: Colors.border,
  },
  alternativeText: {
    fontSize: FontSizes.xs,
    color: Colors.textSecondary,
    maxWidth: 150,
  },
  galleryButton: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'center',
    gap: Spacing.sm,
    paddingVertical: Spacing.md,
    borderWidth: 1,
    borderColor: Colors.primary,
    borderRadius: BorderRadius.md,
    marginBottom: Spacing.md,
  },
  galleryButtonText: {
    color: Colors.primary,
    fontSize: FontSizes.md,
    fontWeight: '500',
  },
  addPhotoButton: {
    width: '100%',
    aspectRatio: 16/9,
    maxHeight: 150,
    borderWidth: 2,
    borderColor: Colors.primary,
    borderStyle: 'dashed',
    borderRadius: BorderRadius.md,
    justifyContent: 'center',
    alignItems: 'center',
  },
  addPhotoText: { fontSize: FontSizes.sm, color: Colors.primary, marginTop: 4 },
  photoCountContainer: { alignItems: 'center', marginVertical: Spacing.md },
  photoCountText: { fontSize: FontSizes.md, fontWeight: '600' },
  photoCountSuccess: { color: Colors.success },
  photoCountWarning: { color: Colors.warning },
  warningText: { textAlign: 'center', color: Colors.warning, fontSize: FontSizes.sm, marginTop: Spacing.sm },
  cameraContainer: { flex: 1, backgroundColor: 'black' },
  camera: { flex: 1 },
  cameraOverlay: { flex: 1, justifyContent: 'space-between', padding: Spacing.md },
  closeCameraButton: {
    alignSelf: 'flex-end',
    padding: Spacing.sm,
    backgroundColor: 'rgba(0,0,0,0.5)',
    borderRadius: BorderRadius.full,
  },
  captionInputContainer: {
    backgroundColor: 'rgba(0,0,0,0.5)',
    borderRadius: BorderRadius.md,
    padding: Spacing.sm,
  },
  captionInput: { color: Colors.white, fontSize: FontSizes.md },
  cameraControls: { alignItems: 'center', paddingBottom: Spacing.xl },
  captureButton: {
    width: 70,
    height: 70,
    borderRadius: 35,
    backgroundColor: 'rgba(255,255,255,0.3)',
    justifyContent: 'center',
    alignItems: 'center',
  },
  captureButtonInner: {
    width: 60,
    height: 60,
    borderRadius: 30,
    backgroundColor: Colors.white,
  },
});
