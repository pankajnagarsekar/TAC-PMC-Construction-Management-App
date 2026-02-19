// SUPERVISOR TAB LAYOUT - SIMPLIFIED
// Bottom tab navigation with streamlined workflow

import React from 'react';
import { Tabs } from 'expo-router';
import { Ionicons } from '@expo/vector-icons';
import { Colors, FontSizes } from '../../constants/theme';
import { useAuth } from '../../contexts/AuthContext';

export default function SupervisorTabLayout() {
  const { user } = useAuth();
  const screenPermissions = user?.screen_permissions || [];
  const hasReportsPermission = screenPermissions.includes('reports');
  
  return (
    <Tabs
      screenOptions={{
        tabBarActiveTintColor: Colors.accent,
        tabBarInactiveTintColor: Colors.textMuted,
        tabBarStyle: {
          backgroundColor: Colors.tabBarBg,
          borderTopColor: Colors.border,
          borderTopWidth: 1,
          height: 60,
          paddingBottom: 8,
          paddingTop: 8,
        },
        tabBarLabelStyle: {
          fontSize: FontSizes.xs,
          fontWeight: '500',
        },
        headerStyle: {
          backgroundColor: Colors.secondary,
        },
        headerTintColor: Colors.textInverse,
        headerTitleStyle: {
          fontWeight: 'bold',
          fontSize: FontSizes.lg,
        },
      }}
    >
      {/* Main Tabs - Simplified to 3 */}
      <Tabs.Screen
        name="dashboard"
        options={{
          title: 'Home',
          headerTitle: 'Supervisor Dashboard',
          tabBarIcon: ({ color, size }) => (
            <Ionicons name="home-outline" size={size} color={color} />
          ),
        }}
      />
      <Tabs.Screen
        name="reports"
        options={{
          href: hasReportsPermission ? '/(supervisor)/reports' : null,
          title: 'Reports',
          headerTitle: 'My Reports',
          tabBarIcon: ({ color, size }) => (
            <Ionicons name="document-text-outline" size={size} color={color} />
          ),
        }}
      />
      <Tabs.Screen
        name="profile"
        options={{
          title: 'Profile',
          headerTitle: 'My Profile',
          tabBarIcon: ({ color, size }) => (
            <Ionicons name="person-outline" size={size} color={color} />
          ),
        }}
      />
      
      {/* Hidden screens - accessible via navigation only */}
      <Tabs.Screen name="select-project" options={{ href: null, headerShown: false }} />
      <Tabs.Screen name="worker-log" options={{ href: null, headerTitle: 'Workers Daily Log' }} />
      <Tabs.Screen name="dpr" options={{ href: null, headerTitle: 'Create DPR' }} />
      <Tabs.Screen name="voice-log" options={{ href: null, headerTitle: 'Voice Log' }} />
      
      {/* Remove from tabs - keep files but hide completely */}
      <Tabs.Screen name="progress" options={{ href: null, headerTitle: 'Progress' }} />
      <Tabs.Screen name="attendance" options={{ href: null, headerTitle: 'Attendance' }} />
      <Tabs.Screen name="issues" options={{ href: null, headerTitle: 'Issues' }} />
    </Tabs>
  );
}
