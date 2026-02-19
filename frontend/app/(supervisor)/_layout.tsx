// SUPERVISOR TAB LAYOUT
// Bottom tab navigation for supervisor users

import React from 'react';
import { Tabs } from 'expo-router';
import { Ionicons } from '@expo/vector-icons';
import { Colors, FontSizes } from '../../constants/theme';
import { useAuth } from '../../contexts/AuthContext';

export default function SupervisorTabLayout() {
  const { user } = useAuth();
  const screenPermissions = user?.screen_permissions || [];
  
  // Check if user has reports permission
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
      <Tabs.Screen
        name="dashboard"
        options={{
          title: 'Home',
          headerTitle: 'Site Dashboard',
          tabBarIcon: ({ color, size }) => (
            <Ionicons name="home-outline" size={size} color={color} />
          ),
        }}
      />
      <Tabs.Screen
        name="progress"
        options={{
          title: 'Progress',
          headerTitle: 'Progress Tracking',
          tabBarIcon: ({ color, size }) => (
            <Ionicons name="trending-up-outline" size={size} color={color} />
          ),
        }}
      />
      <Tabs.Screen
        name="attendance"
        options={{
          title: 'Attendance',
          headerTitle: 'My Attendance',
          tabBarIcon: ({ color, size }) => (
            <Ionicons name="finger-print-outline" size={size} color={color} />
          ),
        }}
      />
      <Tabs.Screen
        name="issues"
        options={{
          title: 'Issues',
          headerTitle: 'Issue Log',
          tabBarIcon: ({ color, size }) => (
            <Ionicons name="warning-outline" size={size} color={color} />
          ),
        }}
      />
      {/* Reports tab - shown only if user has permission */}
      <Tabs.Screen
        name="reports"
        options={{
          href: hasReportsPermission ? '/(supervisor)/reports' : null,
          title: 'Reports',
          headerTitle: 'Reports',
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
      {/* Hidden screens - accessible via navigation but not shown in tab bar */}
      <Tabs.Screen name="voice-log" options={{ href: null, headerTitle: 'Voice Log' }} />
      <Tabs.Screen name="dpr" options={{ href: null, headerTitle: 'Daily Progress Report' }} />
      <Tabs.Screen name="select-project" options={{ href: null, headerShown: false }} />
      <Tabs.Screen name="worker-log" options={{ href: null, headerTitle: 'Workers Daily Log' }} />
    </Tabs>
  );
}
