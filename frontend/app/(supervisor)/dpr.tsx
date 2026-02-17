// SUPERVISOR DPR SCREEN
// Create DPR for assigned project
import React, { useState, useEffect, useCallback } from 'react';
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
} from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';
import { useRouter } from 'expo-router';
import { Ionicons } from '@expo/vector-icons';
import { Picker } from '@react-native-picker/picker';
import * as ImagePicker from 'expo-image-picker';
import { projectsApi } from '../../services/apiClient';
import { Colors, Spacing, FontSizes, BorderRadius } from '../../constants/theme';
import ScreenHeader from '../../components/ScreenHeader';

const BASE_URL = process.env.EXPO_PUBLIC_BACKEND_URL || '';

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

const showAlert = (title: string, message: string) => {
  if (Platform.OS === 'web') window.alert(`${title}: ${message}`);
  else Alert.alert(title, message);
};

interface Photo {
  id: string;
  uri: string;
  base64: string;
  caption: string;
}

export default function SupervisorDPRScreen() {
  const router = useRouter();
  const [projects, setProjects] = useState<any[]>([]);
  const [selectedProject, setSelectedProject] = useState('');
  const [photos, setPhotos] = useState<Photo[]>([]);
  const [notes, setNotes] = useState('');
  const [loading, setLoading] = useState(true);
  const [submitting, setSubmitting] = useState(false);

  useEffect(() => {
    loadProjects();
  }, []);

  const loadProjects = async () => {
    try {
      const data = await projectsApi.getAll();
      setProjects(data || []);
      if (data?.length > 0) setSelectedProject(data[0].project_id);
    } catch (error) {
      console.error('Error loading projects:', error);
    } finally {
      setLoading(false);
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
        const newPhoto: Photo = {
          id: Date.now().toString(),
          uri: result.assets[0].uri,
          base64: result.assets[0].base64 || '',
          caption: '',
        };
        setPhotos(prev => [...prev, newPhoto]);
      }
    } catch (error) {
      showAlert('Error', 'Failed to pick image');
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
        allowsEditing: true,
        quality: 0.7,
        base64: true,
      });

      if (!result.canceled && result.assets[0]) {
        const newPhoto: Photo = {
          id: Date.now().toString(),
          uri: result.assets[0].uri,
          base64: result.assets[0].base64 || '',
          caption: '',
        };
        setPhotos(prev => [...prev, newPhoto]);
      }
    } catch (error) {
      showAlert('Error', 'Failed to take photo');
    }
  };

  const updateCaption = (id: string, caption: string) => {
    setPhotos(prev => prev.map(p => p.id === id ? { ...p, caption } : p));
  };

  const removePhoto = (id: string) => {
    setPhotos(prev => prev.filter(p => p.id !== id));
  };

  const handleSubmit = async () => {
    if (!selectedProject) {
      showAlert('Validation Error', 'Please select a project');
      return;
    }
    if (photos.length === 0) {
      showAlert('Validation Error', 'Please add at least one photo');
      return;
    }

    setSubmitting(true);
    try {
      // Create DPR
      const dprPayload = {
        project_id: selectedProject,
        date: new Date().toISOString().split('T')[0],
        status: 'Draft',
        notes: notes,
      };

      const dpr = await apiRequest('/api/v2/dpr', {
        method: 'POST',
        body: JSON.stringify(dprPayload),
      });

      // Add photos
      for (const photo of photos) {
        await apiRequest('/api/v2/dpr/photos', {
          method: 'POST',
          body: JSON.stringify({
            dpr_id: dpr.dpr_id,
            photo_base64: `data:image/jpeg;base64,${photo.base64}`,
            caption: photo.caption || 'Site progress photo',
          }),
        });
      }

      showAlert('Success', 'DPR created successfully! Admin will be notified.');
      router.back();
    } catch (error: any) {
      showAlert('Error', error.message || 'Failed to create DPR');
    } finally {
      setSubmitting(false);
    }
  };

  if (loading) {
    return (
      <SafeAreaView style={styles.container}>
        <ScreenHeader title="Create DPR" />
        <View style={styles.loadingContainer}>
          <ActivityIndicator size="large" color={Colors.primary} />
        </View>
      </SafeAreaView>
    );
  }

  return (
    <SafeAreaView style={styles.container} edges={['left', 'right']}>
      <ScreenHeader title="Daily Progress Report" />
      
      <ScrollView contentContainerStyle={styles.content}>
        {/* Project Selection */}
        <View style={styles.section}>
          <Text style={styles.sectionTitle}>Select Project</Text>
          <View style={styles.pickerContainer}>
            <Picker
              selectedValue={selectedProject}
              onValueChange={setSelectedProject}
              style={styles.picker}
            >
              {projects.map(p => (
                <Picker.Item key={p.project_id} label={p.project_name} value={p.project_id} />
              ))}
            </Picker>
          </View>
        </View>

        {/* Photos */}
        <View style={styles.section}>
          <Text style={styles.sectionTitle}>Site Photos</Text>
          <View style={styles.photoButtons}>
            <Pressable style={styles.photoBtn} onPress={takePhoto}>
              <Ionicons name="camera" size={24} color={Colors.primary} />
              <Text style={styles.photoBtnText}>Take Photo</Text>
            </Pressable>
            <Pressable style={styles.photoBtn} onPress={pickImage}>
              <Ionicons name="images" size={24} color={Colors.primary} />
              <Text style={styles.photoBtnText}>Gallery</Text>
            </Pressable>
          </View>

          {photos.map(photo => (
            <View key={photo.id} style={styles.photoCard}>
              <Image source={{ uri: photo.uri }} style={styles.photoImage} />
              <View style={styles.photoInfo}>
                <TextInput
                  style={styles.captionInput}
                  value={photo.caption}
                  onChangeText={(text) => updateCaption(photo.id, text)}
                  placeholder="Add caption..."
                  placeholderTextColor={Colors.textMuted}
                />
                <Pressable onPress={() => removePhoto(photo.id)}>
                  <Ionicons name="trash" size={20} color={Colors.error} />
                </Pressable>
              </View>
            </View>
          ))}

          {photos.length === 0 && (
            <View style={styles.emptyPhotos}>
              <Ionicons name="camera-outline" size={48} color={Colors.textMuted} />
              <Text style={styles.emptyText}>No photos added yet</Text>
            </View>
          )}
        </View>

        {/* Notes */}
        <View style={styles.section}>
          <Text style={styles.sectionTitle}>Additional Notes</Text>
          <TextInput
            style={styles.notesInput}
            value={notes}
            onChangeText={setNotes}
            placeholder="Enter any additional notes about today's progress..."
            placeholderTextColor={Colors.textMuted}
            multiline
            numberOfLines={4}
          />
        </View>

        {/* Submit */}
        <Pressable
          style={[styles.submitBtn, submitting && styles.submitBtnDisabled]}
          onPress={handleSubmit}
          disabled={submitting}
        >
          {submitting ? (
            <ActivityIndicator size="small" color={Colors.white} />
          ) : (
            <>
              <Ionicons name="send" size={20} color={Colors.white} />
              <Text style={styles.submitBtnText}>Submit DPR</Text>
            </>
          )}
        </Pressable>
      </ScrollView>
    </SafeAreaView>
  );
}

const styles = StyleSheet.create({
  container: { flex: 1, backgroundColor: Colors.background },
  loadingContainer: { flex: 1, justifyContent: 'center', alignItems: 'center' },
  content: { padding: Spacing.md },
  section: { marginBottom: Spacing.lg },
  sectionTitle: { fontSize: FontSizes.md, fontWeight: '600', color: Colors.text, marginBottom: Spacing.sm },
  pickerContainer: { backgroundColor: Colors.white, borderRadius: BorderRadius.md, overflow: 'hidden' },
  picker: { height: 50 },
  photoButtons: { flexDirection: 'row', gap: Spacing.md, marginBottom: Spacing.md },
  photoBtn: {
    flex: 1,
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'center',
    gap: Spacing.sm,
    backgroundColor: Colors.white,
    padding: Spacing.md,
    borderRadius: BorderRadius.md,
    borderWidth: 1,
    borderColor: Colors.primary,
  },
  photoBtnText: { fontSize: FontSizes.md, color: Colors.primary, fontWeight: '500' },
  photoCard: { backgroundColor: Colors.white, borderRadius: BorderRadius.md, marginBottom: Spacing.sm, overflow: 'hidden' },
  photoImage: { width: '100%', height: 200, resizeMode: 'cover' },
  photoInfo: { flexDirection: 'row', alignItems: 'center', padding: Spacing.sm, gap: Spacing.sm },
  captionInput: { flex: 1, fontSize: FontSizes.sm, color: Colors.text, padding: Spacing.xs },
  emptyPhotos: { alignItems: 'center', padding: Spacing.xl, backgroundColor: Colors.white, borderRadius: BorderRadius.md },
  emptyText: { fontSize: FontSizes.sm, color: Colors.textMuted, marginTop: Spacing.sm },
  notesInput: {
    backgroundColor: Colors.white,
    borderRadius: BorderRadius.md,
    padding: Spacing.md,
    fontSize: FontSizes.md,
    color: Colors.text,
    minHeight: 100,
    textAlignVertical: 'top',
  },
  submitBtn: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'center',
    gap: Spacing.sm,
    backgroundColor: Colors.primary,
    padding: Spacing.md,
    borderRadius: BorderRadius.md,
  },
  submitBtnDisabled: { opacity: 0.6 },
  submitBtnText: { fontSize: FontSizes.md, fontWeight: '600', color: Colors.white },
});
