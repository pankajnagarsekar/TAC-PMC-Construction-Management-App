// SUPERVISOR DPR SCREEN - SIMPLIFIED
// DPR creation with photos and manual captions (no AI)

import React, { useState, useEffect } from 'react';
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
}

export default function SupervisorDPRScreen() {
  const router = useRouter();
  const { selectedProject } = useProject();
  const { user } = useAuth();
  
  const [photos, setPhotos] = useState<Photo[]>([]);
  const [voiceSummary, setVoiceSummary] = useState(''); // Will be used for voice-to-text later
  const [isSubmitting, setIsSubmitting] = useState(false);
  const [activePhotoIndex, setActivePhotoIndex] = useState<number | null>(null);

  // Redirect if no project selected
  useEffect(() => {
    if (!selectedProject) {
      router.replace('/(supervisor)/select-project');
    }
  }, [selectedProject]);

  const showAlert = (title: string, message: string, onOk?: () => void) => {
    if (Platform.OS === 'web') {
      window.alert(`${title}: ${message}`);
      onOk?.();
    } else {
      Alert.alert(title, message, [{ text: 'OK', onPress: onOk }]);
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
      });

      if (!result.canceled && result.assets[0]) {
        const asset = result.assets[0];
        const newPhoto: Photo = {
          id: Date.now().toString(),
          uri: asset.uri,
          base64: asset.base64 || '',
          caption: '',
        };
        setPhotos(prev => [...prev, newPhoto]);
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
        }));
        setPhotos(prev => [...prev, ...newPhotos]);
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

  const canSubmit = () => {
    if (photos.length < MIN_PHOTOS) return false;
    // Check if all photos have captions
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

      if (!createResponse.ok) {
        throw new Error('Failed to create DPR');
      }

      const dprData = await createResponse.json();
      const dprId = dprData.dpr_id;

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

      // Submit DPR
      const submitResponse = await fetch(`${BASE_URL}/api/v2/dpr/${dprId}/submit`, {
        method: 'POST',
        headers: {
          'Authorization': `Bearer ${token}`,
        },
      });

      if (submitResponse.ok) {
        showAlert('Success', 'DPR submitted successfully! Admin has been notified.', () => {
          router.back();
        });
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

          {/* Voice Summary Section (placeholder for M5) */}
          <Card style={styles.sectionCard}>
            <View style={styles.sectionHeader}>
              <Ionicons name="mic" size={20} color={Colors.info} />
              <Text style={styles.sectionTitle}>Summary Notes</Text>
            </View>
            <TextInput
              style={styles.summaryInput}
              placeholder="Enter summary notes for this DPR..."
              value={voiceSummary}
              onChangeText={setVoiceSummary}
              multiline
              numberOfLines={3}
              textAlignVertical="top"
            />
            <Text style={styles.helperText}>
              Voice-to-text coming soon. Type your summary for now.
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
                  <View style={styles.photoHeader}>
                    <Text style={styles.photoNumber}>Photo {index + 1}</Text>
                    <TouchableOpacity onPress={() => removePhoto(photo.id)}>
                      <Ionicons name="close-circle" size={24} color={Colors.error} />
                    </TouchableOpacity>
                  </View>
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
  summaryInput: {
    backgroundColor: Colors.background,
    borderWidth: 1,
    borderColor: Colors.border,
    borderRadius: BorderRadius.md,
    padding: Spacing.md,
    fontSize: FontSizes.md,
    color: Colors.text,
    minHeight: 80,
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
