// USER MANAGEMENT SCREEN
// View and manage users with CRUD and screen authorization
import React, { useState, useEffect, useCallback } from 'react';
import {
  View,
  Text,
  StyleSheet,
  FlatList,
  RefreshControl,
  Pressable,
  ActivityIndicator,
  Modal,
  TextInput,
  Switch,
  Alert,
  Platform,
  ScrollView,
} from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';
import { Ionicons } from '@expo/vector-icons';
import { Picker } from '@react-native-picker/picker';
import { usersApi, projectsApi } from '../../../services/apiClient';
import { Colors, Spacing, FontSizes, BorderRadius } from '../../../constants/theme';
import ScreenHeader from '../../../components/ScreenHeader';

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

interface Project {
  project_id: string;
  project_name: string;
}

interface User {
  user_id?: string;
  _id?: string;
  name: string;
  email: string;
  role: string;
  active_status: boolean;
  dpr_generation_permission?: boolean;
  screen_permissions?: string[];
  assigned_projects?: string[];
}

const ROLES = ['Admin', 'Supervisor', 'User'];
const SCREENS = [
  { id: 'dashboard', label: 'Dashboard' },
  { id: 'projects', label: 'Projects' },
  { id: 'work_orders', label: 'Work Orders' },
  { id: 'payment_certificates', label: 'Payment Certificates' },
  { id: 'dpr', label: 'DPR' },
  { id: 'budget', label: 'Budget' },
  { id: 'petty_cash', label: 'Petty Cash' },
  { id: 'reports', label: 'Reports' },
  { id: 'settings', label: 'Settings' },
];

export default function UserManagementScreen() {
  const [users, setUsers] = useState<User[]>([]);
  const [projects, setProjects] = useState<Project[]>([]);
  const [loading, setLoading] = useState(true);
  const [refreshing, setRefreshing] = useState(false);
  const [modalVisible, setModalVisible] = useState(false);
  const [saving, setSaving] = useState(false);
  const [editingUser, setEditingUser] = useState<User | null>(null);

  // Form state
  const [name, setName] = useState('');
  const [email, setEmail] = useState('');
  const [password, setPassword] = useState('');
  const [role, setRole] = useState('User');
  const [activeStatus, setActiveStatus] = useState(true);
  const [dprPermission, setDprPermission] = useState(false);
  const [screenPermissions, setScreenPermissions] = useState<string[]>([]);
  const [assignedProjects, setAssignedProjects] = useState<string[]>([]);

  const loadData = useCallback(async () => {
    try {
      const [usersData, projectsData] = await Promise.all([
        usersApi.getAll(),
        projectsApi.getAll(),
      ]);
      setUsers(usersData || []);
      setProjects(projectsData || []);
    } catch (error) {
      console.error('Error loading data:', error);
    } finally {
      setLoading(false);
      setRefreshing(false);
    }
  }, []);

  const loadUsers = useCallback(async () => {
    try {
      const data = await usersApi.getAll();
      setUsers(data || []);
    } catch (error) {
      console.error('Error loading users:', error);
    } finally {
      setLoading(false);
      setRefreshing(false);
    }
  }, []);

  useEffect(() => {
    loadData();
  }, [loadData]);

  const resetForm = () => {
    setName('');
    setEmail('');
    setPassword('');
    setRole('User');
    setActiveStatus(true);
    setDprPermission(false);
    setScreenPermissions([]);
    setAssignedProjects([]);
    setEditingUser(null);
  };

  const openCreateModal = () => {
    resetForm();
    setModalVisible(true);
  };

  const openEditModal = (user: User) => {
    setEditingUser(user);
    setName(user.name);
    setEmail(user.email);
    setPassword('');
    setRole(user.role);
    setActiveStatus(user.active_status);
    setDprPermission(user.dpr_generation_permission || false);
    setScreenPermissions(user.screen_permissions || []);
    setAssignedProjects(user.assigned_projects || []);
    setModalVisible(true);
  };

  const toggleScreenPermission = (screenId: string) => {
    setScreenPermissions(prev => 
      prev.includes(screenId) 
        ? prev.filter(s => s !== screenId)
        : [...prev, screenId]
    );
  };

  const toggleAssignedProject = (projectId: string) => {
    setAssignedProjects(prev =>
      prev.includes(projectId)
        ? prev.filter(p => p !== projectId)
        : [...prev, projectId]
    );
  };

  const getProjectName = (projectId: string) => {
    const project = projects.find(p => (p as any).project_id === projectId || (p as any)._id === projectId);
    return project?.project_name || projectId;
  };

  const handleSave = async () => {
    if (!name.trim() || !email.trim()) {
      showAlert('Validation Error', 'Name and Email are required');
      return;
    }
    if (!editingUser && !password) {
      showAlert('Validation Error', 'Password is required for new users');
      return;
    }

    setSaving(true);
    try {
      if (editingUser) {
        // Update user
        const payload: any = {
          name: name.trim(),
          role,
          active_status: activeStatus,
          dpr_generation_permission: dprPermission,
          screen_permissions: screenPermissions,
          assigned_projects: assignedProjects,
        };
        
        await apiRequest(`/api/users/${editingUser.user_id || editingUser._id}`, {
          method: 'PUT',
          body: JSON.stringify(payload),
        });
        showAlert('Success', 'User updated successfully');
      } else {
        // Create user
        await apiRequest('/api/auth/register', {
          method: 'POST',
          body: JSON.stringify({
            name: name.trim(),
            email: email.trim(),
            password,
            role,
          }),
        });
        showAlert('Success', 'User created successfully');
      }

      setModalVisible(false);
      resetForm();
      loadData();
    } catch (error: any) {
      showAlert('Error', error.message || 'Failed to save user');
    } finally {
      setSaving(false);
    }
  };

  const handleDelete = (user: User) => {
    const doDelete = async () => {
      try {
        await apiRequest(`/api/users/${user.user_id || user._id}`, { method: 'DELETE' });
        showAlert('Success', 'User deactivated successfully');
        loadData();
      } catch (error: any) {
        showAlert('Error', error.message);
      }
    };

    if (Platform.OS === 'web') {
      if (window.confirm(`Deactivate user "${user.name}"?`)) doDelete();
    } else {
      Alert.alert('Deactivate User', `Deactivate "${user.name}"?`, [
        { text: 'Cancel', style: 'cancel' },
        { text: 'Deactivate', onPress: doDelete, style: 'destructive' },
      ]);
    }
  };

  const getRoleColor = (r: string) => {
    switch (r?.toLowerCase()) {
      case 'admin': return Colors.primary;
      case 'supervisor': return Colors.success;
      default: return Colors.textMuted;
    }
  };

  const renderUser = ({ item }: { item: User }) => (
    <View style={styles.userCard}>
      <View style={styles.userHeader}>
        <View style={styles.avatarContainer}>
          <View style={[styles.avatar, { backgroundColor: getRoleColor(item.role) }]}>
            <Text style={styles.avatarText}>{item.name?.charAt(0).toUpperCase()}</Text>
          </View>
          <View style={[styles.statusDot, { backgroundColor: item.active_status ? Colors.success : Colors.error }]} />
        </View>
        <View style={styles.userInfo}>
          <Text style={styles.userName}>{item.name}</Text>
          <Text style={styles.userEmail}>{item.email}</Text>
          <View style={styles.userMeta}>
            <View style={[styles.roleBadge, { backgroundColor: getRoleColor(item.role) + '20' }]}>
              <Text style={[styles.roleText, { color: getRoleColor(item.role) }]}>{item.role}</Text>
            </View>
            {item.dpr_generation_permission && (
              <View style={styles.permissionBadge}>
                <Ionicons name="document-text" size={12} color={Colors.accent} />
                <Text style={styles.permissionText}>DPR</Text>
              </View>
            )}
          </View>
          {item.assigned_projects && item.assigned_projects.length > 0 && (
            <View style={styles.projectsRow}>
              <Ionicons name="folder-outline" size={12} color={Colors.textMuted} />
              <Text style={styles.projectsText} numberOfLines={1}>
                {item.assigned_projects.length} project{item.assigned_projects.length > 1 ? 's' : ''} assigned
              </Text>
            </View>
          )}
        </View>
      </View>
      <View style={styles.actionRow}>
        <Pressable style={styles.actionBtn} onPress={() => openEditModal(item)}>
          <Ionicons name="create-outline" size={18} color={Colors.primary} />
          <Text style={styles.actionText}>Edit</Text>
        </Pressable>
        <Pressable style={styles.actionBtn} onPress={() => handleDelete(item)}>
          <Ionicons name="person-remove-outline" size={18} color={Colors.error} />
          <Text style={[styles.actionText, { color: Colors.error }]}>Deactivate</Text>
        </Pressable>
      </View>
    </View>
  );

  if (loading) {
    return (
      <SafeAreaView style={styles.container}>
        <ScreenHeader title="User Management" />
        <View style={styles.loadingContainer}>
          <ActivityIndicator size="large" color={Colors.primary} />
        </View>
      </SafeAreaView>
    );
  }

  return (
    <SafeAreaView style={styles.container} edges={['left', 'right']}>
      <ScreenHeader title="User Management" />

      {/* Summary */}
      <View style={styles.summaryRow}>
        <View style={styles.summaryItem}>
          <Text style={styles.summaryValue}>{users.length}</Text>
          <Text style={styles.summaryLabel}>Total</Text>
        </View>
        <View style={styles.summaryItem}>
          <Text style={styles.summaryValue}>{users.filter(u => u.active_status).length}</Text>
          <Text style={styles.summaryLabel}>Active</Text>
        </View>
        <View style={styles.summaryItem}>
          <Text style={styles.summaryValue}>{users.filter(u => u.role === 'Admin').length}</Text>
          <Text style={styles.summaryLabel}>Admins</Text>
        </View>
      </View>

      <FlatList
        data={users}
        renderItem={renderUser}
        keyExtractor={(item) => item.user_id || item._id || item.email}
        contentContainerStyle={styles.listContent}
        refreshControl={<RefreshControl refreshing={refreshing} onRefresh={() => { setRefreshing(true); loadData(); }} />}
        ListEmptyComponent={
          <View style={styles.emptyContainer}>
            <Ionicons name="people-outline" size={48} color={Colors.textMuted} />
            <Text style={styles.emptyText}>No users found</Text>
          </View>
        }
      />

      <Pressable style={styles.fab} onPress={openCreateModal}>
        <Ionicons name="person-add" size={24} color={Colors.white} />
      </Pressable>

      {/* Create/Edit Modal */}
      <Modal visible={modalVisible} animationType="slide" transparent>
        <View style={styles.modalOverlay}>
          <View style={styles.modalContent}>
            <View style={styles.modalHeader}>
              <Text style={styles.modalTitle}>{editingUser ? 'Edit User' : 'Add User'}</Text>
              <Pressable onPress={() => setModalVisible(false)}>
                <Ionicons name="close" size={24} color={Colors.text} />
              </Pressable>
            </View>

            <ScrollView style={styles.modalBody}>
              <View style={styles.inputGroup}>
                <Text style={styles.inputLabel}>Name *</Text>
                <TextInput style={styles.input} value={name} onChangeText={setName} placeholder="Full name" placeholderTextColor={Colors.textMuted} />
              </View>

              <View style={styles.inputGroup}>
                <Text style={styles.inputLabel}>Email *</Text>
                <TextInput style={styles.input} value={email} onChangeText={setEmail} placeholder="email@example.com" keyboardType="email-address" autoCapitalize="none" editable={!editingUser} placeholderTextColor={Colors.textMuted} />
                {editingUser && <Text style={styles.hintText}>Email cannot be changed</Text>}
              </View>

              {!editingUser && (
                <View style={styles.inputGroup}>
                  <Text style={styles.inputLabel}>Password *</Text>
                  <TextInput style={styles.input} value={password} onChangeText={setPassword} placeholder="Password" secureTextEntry placeholderTextColor={Colors.textMuted} />
                </View>
              )}

              <View style={styles.inputGroup}>
                <Text style={styles.inputLabel}>Role</Text>
                <View style={styles.pickerContainer}>
                  <Picker selectedValue={role} onValueChange={setRole} style={styles.picker}>
                    {ROLES.map(r => <Picker.Item key={r} label={r} value={r} />)}
                  </Picker>
                </View>
              </View>

              <View style={styles.toggleRow}>
                <View>
                  <Text style={styles.inputLabel}>Active Status</Text>
                  <Text style={styles.hintText}>User can login when active</Text>
                </View>
                <Switch value={activeStatus} onValueChange={setActiveStatus} trackColor={{ false: Colors.border, true: Colors.success }} />
              </View>

              <View style={styles.toggleRow}>
                <View>
                  <Text style={styles.inputLabel}>DPR Permission</Text>
                  <Text style={styles.hintText}>Can create and manage DPRs</Text>
                </View>
                <Switch value={dprPermission} onValueChange={setDprPermission} trackColor={{ false: Colors.border, true: Colors.primary }} />
              </View>

              {editingUser && (
                <View style={styles.inputGroup}>
                  <Text style={styles.inputLabel}>Screen Authorization</Text>
                  <Text style={styles.hintText}>Select screens this user can access</Text>
                  <View style={styles.screenGrid}>
                    {SCREENS.map(screen => (
                      <Pressable
                        key={screen.id}
                        style={[styles.screenItem, screenPermissions.includes(screen.id) && styles.screenItemActive]}
                        onPress={() => toggleScreenPermission(screen.id)}
                      >
                        <Ionicons
                          name={screenPermissions.includes(screen.id) ? 'checkbox' : 'square-outline'}
                          size={20}
                          color={screenPermissions.includes(screen.id) ? Colors.primary : Colors.textMuted}
                        />
                        <Text style={[styles.screenLabel, screenPermissions.includes(screen.id) && styles.screenLabelActive]}>
                          {screen.label}
                        </Text>
                      </Pressable>
                    ))}
                  </View>
                </View>
              )}

              {editingUser && (
                <View style={styles.inputGroup}>
                  <Text style={styles.inputLabel}>Assigned Projects</Text>
                  <Text style={styles.hintText}>Select projects this user can access (for supervisors)</Text>
                  {projects.length > 0 ? (
                    <View style={styles.projectGrid}>
                      {projects.map((project: any) => {
                        const projectId = project.project_id || project._id;
                        const isSelected = assignedProjects.includes(projectId);
                        return (
                          <Pressable
                            key={projectId}
                            style={[styles.projectItem, isSelected && styles.projectItemActive]}
                            onPress={() => toggleAssignedProject(projectId)}
                          >
                            <Ionicons
                              name={isSelected ? 'checkbox' : 'square-outline'}
                              size={20}
                              color={isSelected ? Colors.accent : Colors.textMuted}
                            />
                            <View style={styles.projectItemInfo}>
                              <Text style={[styles.projectItemName, isSelected && styles.projectItemNameActive]} numberOfLines={1}>
                                {project.project_name}
                              </Text>
                              {project.project_code && (
                                <Text style={styles.projectItemCode}>{project.project_code}</Text>
                              )}
                            </View>
                          </Pressable>
                        );
                      })}
                    </View>
                  ) : (
                    <View style={styles.noProjectsContainer}>
                      <Ionicons name="folder-open-outline" size={32} color={Colors.textMuted} />
                      <Text style={styles.noProjectsText}>No projects available</Text>
                    </View>
                  )}
                  {assignedProjects.length > 0 && (
                    <Text style={styles.selectedCountText}>
                      {assignedProjects.length} project{assignedProjects.length > 1 ? 's' : ''} selected
                    </Text>
                  )}
                </View>
              )}
            </ScrollView>

            <View style={styles.modalFooter}>
              <Pressable style={styles.cancelButton} onPress={() => setModalVisible(false)}>
                <Text style={styles.cancelButtonText}>Cancel</Text>
              </Pressable>
              <Pressable style={[styles.saveButton, saving && styles.saveButtonDisabled]} onPress={handleSave} disabled={saving}>
                {saving ? <ActivityIndicator size="small" color={Colors.white} /> : <Text style={styles.saveButtonText}>Save</Text>}
              </Pressable>
            </View>
          </View>
        </View>
      </Modal>
    </SafeAreaView>
  );
}

const styles = StyleSheet.create({
  container: { flex: 1, backgroundColor: Colors.background },
  loadingContainer: { flex: 1, justifyContent: 'center', alignItems: 'center' },
  summaryRow: { flexDirection: 'row', backgroundColor: Colors.white, margin: Spacing.md, borderRadius: BorderRadius.lg, padding: Spacing.md },
  summaryItem: { flex: 1, alignItems: 'center' },
  summaryValue: { fontSize: FontSizes.xl, fontWeight: 'bold', color: Colors.primary },
  summaryLabel: { fontSize: FontSizes.sm, color: Colors.textSecondary },
  listContent: { padding: Spacing.md, paddingTop: 0 },
  userCard: { backgroundColor: Colors.white, borderRadius: BorderRadius.lg, padding: Spacing.md, marginBottom: Spacing.sm },
  userHeader: { flexDirection: 'row', alignItems: 'center' },
  avatarContainer: { position: 'relative', marginRight: Spacing.md },
  avatar: { width: 48, height: 48, borderRadius: 24, justifyContent: 'center', alignItems: 'center' },
  avatarText: { fontSize: FontSizes.lg, fontWeight: 'bold', color: Colors.white },
  statusDot: { position: 'absolute', bottom: 0, right: 0, width: 14, height: 14, borderRadius: 7, borderWidth: 2, borderColor: Colors.white },
  userInfo: { flex: 1 },
  userName: { fontSize: FontSizes.md, fontWeight: '600', color: Colors.text },
  userEmail: { fontSize: FontSizes.sm, color: Colors.textSecondary },
  userMeta: { flexDirection: 'row', marginTop: Spacing.xs, gap: Spacing.xs },
  roleBadge: { paddingHorizontal: Spacing.sm, paddingVertical: 2, borderRadius: BorderRadius.sm },
  roleText: { fontSize: FontSizes.xs, fontWeight: '600' },
  permissionBadge: { flexDirection: 'row', alignItems: 'center', backgroundColor: Colors.accent + '20', paddingHorizontal: Spacing.sm, paddingVertical: 2, borderRadius: BorderRadius.sm, gap: 2 },
  permissionText: { fontSize: FontSizes.xs, color: Colors.accent, fontWeight: '600' },
  projectsRow: { flexDirection: 'row', alignItems: 'center', marginTop: Spacing.xs, gap: 4 },
  projectsText: { fontSize: FontSizes.xs, color: Colors.textMuted },
  actionRow: { flexDirection: 'row', justifyContent: 'flex-end', gap: Spacing.lg, marginTop: Spacing.sm, paddingTop: Spacing.sm, borderTopWidth: 1, borderTopColor: Colors.border },
  actionBtn: { flexDirection: 'row', alignItems: 'center', gap: 4 },
  actionText: { fontSize: FontSizes.sm, color: Colors.primary },
  emptyContainer: { alignItems: 'center', padding: Spacing.xl },
  emptyText: { fontSize: FontSizes.md, color: Colors.textMuted, marginTop: Spacing.md },
  fab: { position: 'absolute', right: Spacing.lg, bottom: Spacing.lg, width: 56, height: 56, borderRadius: 28, backgroundColor: Colors.accent, justifyContent: 'center', alignItems: 'center', elevation: 5 },
  modalOverlay: { flex: 1, backgroundColor: 'rgba(0,0,0,0.5)', justifyContent: 'flex-end' },
  modalContent: { backgroundColor: Colors.white, borderTopLeftRadius: BorderRadius.xl, borderTopRightRadius: BorderRadius.xl, maxHeight: '90%' },
  modalHeader: { flexDirection: 'row', justifyContent: 'space-between', alignItems: 'center', padding: Spacing.md, borderBottomWidth: 1, borderBottomColor: Colors.border },
  modalTitle: { fontSize: FontSizes.lg, fontWeight: '600', color: Colors.text },
  modalBody: { padding: Spacing.md },
  inputGroup: { marginBottom: Spacing.md },
  inputLabel: { fontSize: FontSizes.sm, fontWeight: '600', color: Colors.text, marginBottom: Spacing.xs },
  input: { backgroundColor: Colors.background, borderWidth: 1, borderColor: Colors.border, borderRadius: BorderRadius.md, paddingHorizontal: Spacing.md, paddingVertical: Spacing.sm, fontSize: FontSizes.md, color: Colors.text },
  hintText: { fontSize: FontSizes.xs, color: Colors.textMuted, marginTop: 2 },
  pickerContainer: { backgroundColor: Colors.background, borderWidth: 1, borderColor: Colors.border, borderRadius: BorderRadius.md, overflow: 'hidden' },
  picker: { height: 50 },
  toggleRow: { flexDirection: 'row', justifyContent: 'space-between', alignItems: 'center', paddingVertical: Spacing.sm, marginBottom: Spacing.sm },
  screenGrid: { marginTop: Spacing.sm },
  screenItem: { flexDirection: 'row', alignItems: 'center', gap: Spacing.sm, paddingVertical: Spacing.sm, paddingHorizontal: Spacing.sm, borderRadius: BorderRadius.md, marginBottom: 4 },
  screenItemActive: { backgroundColor: Colors.primary + '10' },
  screenLabel: { fontSize: FontSizes.sm, color: Colors.textSecondary },
  screenLabelActive: { color: Colors.primary, fontWeight: '500' },
  modalFooter: { flexDirection: 'row', justifyContent: 'flex-end', gap: Spacing.md, padding: Spacing.md, borderTopWidth: 1, borderTopColor: Colors.border },
  cancelButton: { paddingHorizontal: Spacing.lg, paddingVertical: Spacing.sm },
  cancelButtonText: { fontSize: FontSizes.md, color: Colors.textSecondary },
  saveButton: { backgroundColor: Colors.primary, paddingHorizontal: Spacing.xl, paddingVertical: Spacing.sm, borderRadius: BorderRadius.md },
  saveButtonDisabled: { opacity: 0.6 },
  saveButtonText: { fontSize: FontSizes.md, color: Colors.white, fontWeight: '600' },
});
