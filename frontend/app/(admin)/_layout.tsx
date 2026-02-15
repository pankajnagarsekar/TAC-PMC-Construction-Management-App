// ADMIN TAB LAYOUT
// Bottom tab navigation for admin users

import React from 'react';
import { Tabs } from 'expo-router';
import { Ionicons } from '@expo/vector-icons';
import { Colors, FontSizes } from '../../constants/theme';

export default function AdminTabLayout() {
  return (
    <Tabs
      screenOptions={{
        tabBarActiveTintColor: Colors.primary,
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
          backgroundColor: Colors.headerBg,
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
          title: 'Dashboard',
          headerTitle: 'Admin Dashboard',
          tabBarIcon: ({ color, size }) => (
            <Ionicons name="grid-outline" size={size} color={color} />
          ),
        }}
      />
      <Tabs.Screen
        name="projects"
        options={{
          title: 'Projects',
          headerTitle: 'Projects',
          tabBarIcon: ({ color, size }) => (
            <Ionicons name="briefcase-outline" size={size} color={color} />
          ),
        }}
      />
      <Tabs.Screen
        name="finance"
        options={{
          title: 'Finance',
          headerTitle: 'Financial Overview',
          tabBarIcon: ({ color, size }) => (
            <Ionicons name="wallet-outline" size={size} color={color} />
          ),
        }}
      />
      <Tabs.Screen
        name="reports"
        options={{
          title: 'Reports',
          headerTitle: 'Reports',
          tabBarIcon: ({ color, size }) => (
            <Ionicons name="bar-chart-outline" size={size} color={color} />
          ),
        }}
      />
      <Tabs.Screen
        name="settings"
        options={{
          title: 'Settings',
          headerTitle: 'Settings',
          tabBarIcon: ({ color, size }) => (
            <Ionicons name="settings-outline" size={size} color={color} />
          ),
        }}
      />
      {/* Hidden screens - accessible via navigation but not shown in tab bar */}
      <Tabs.Screen name="csa" options={{ href: null, headerTitle: 'CSA Management' }} />
      <Tabs.Screen name="dpr" options={{ href: null, headerTitle: 'Daily Progress Reports' }} />
      <Tabs.Screen name="ocr" options={{ href: null, headerTitle: 'OCR Processing' }} />
      <Tabs.Screen name="alerts" options={{ href: null, headerTitle: 'Alerts' }} />
      <Tabs.Screen name="budget" options={{ href: null, headerTitle: 'Budget Management' }} />
      <Tabs.Screen name="timeline" options={{ href: null, headerTitle: 'Timeline' }} />
      <Tabs.Screen name="petty-cash" options={{ href: null, headerTitle: 'Petty Cash' }} />
      <Tabs.Screen name="work-orders" options={{ href: null, headerTitle: 'Work Orders' }} />
      <Tabs.Screen name="payment-certificates" options={{ href: null, headerTitle: 'Payment Certificates' }} />
    </Tabs>
  );
}
