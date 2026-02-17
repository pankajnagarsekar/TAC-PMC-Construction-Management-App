// ROOT LAYOUT
// Handles authentication state and role-based navigation

import React from 'react';
import { Stack, useRouter, useSegments } from 'expo-router';
import { StatusBar } from 'expo-status-bar';
import { useEffect } from 'react';
import { AuthProvider, useAuth } from '../contexts/AuthContext';
import { ProjectProvider } from '../contexts/ProjectContext';
import { LoadingScreen } from '../components/ui';
import { Colors } from '../constants/theme';

// Navigation guard component
function NavigationGuard({ children }: { children: React.ReactNode }) {
  const { isAuthenticated, isLoading, user } = useAuth();
  const segments = useSegments();
  const router = useRouter();

  useEffect(() => {
    if (isLoading) return;

    const inAuthGroup = segments[0] === 'login';
    const inAdminGroup = segments[0] === '(admin)';
    const inSupervisorGroup = segments[0] === '(supervisor)';

    if (!isAuthenticated && !inAuthGroup) {
      // Not authenticated, redirect to login
      router.replace('/login');
    } else if (isAuthenticated && inAuthGroup) {
      // Authenticated but on login page, redirect based on role
      if (user?.role === 'Admin') {
        router.replace('/(admin)/dashboard');
      } else {
        router.replace('/(supervisor)/dashboard');
      }
    } else if (isAuthenticated && user) {
      // STRICT ROLE-BASED ACCESS ENFORCEMENT
      // Supervisor CANNOT access Admin routes - redirect immediately
      if (user.role !== 'Admin' && inAdminGroup) {
        router.replace('/(supervisor)/dashboard');
      }
      // Admin CAN access Supervisor routes (for oversight)
      // But Supervisor is strictly blocked from Admin routes
    }
  }, [isAuthenticated, isLoading, segments, user]);

  if (isLoading) {
    return <LoadingScreen message="Loading..." />;
  }

  return <>{children}</>;
}

// Root layout with auth provider
export default function RootLayout() {
  return (
    <AuthProvider>
      <NavigationGuard>
        <StatusBar style="light" />
        <Stack
          screenOptions={{
            headerShown: false,
            contentStyle: { backgroundColor: Colors.background },
          }}
        >
          <Stack.Screen name="login" options={{ headerShown: false }} />
          <Stack.Screen name="(admin)" options={{ headerShown: false }} />
          <Stack.Screen name="(supervisor)" options={{ headerShown: false }} />
          <Stack.Screen name="index" options={{ headerShown: false }} />
        </Stack>
      </NavigationGuard>
    </AuthProvider>
  );
}
