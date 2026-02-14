// INDEX - Entry point redirect
// Redirects based on authentication status

import { Redirect } from 'expo-router';
import { useAuth } from '../contexts/AuthContext';
import { LoadingScreen } from '../components/ui';

export default function Index() {
  const { isAuthenticated, isLoading, user } = useAuth();

  if (isLoading) {
    return <LoadingScreen message="Initializing..." />;
  }

  if (!isAuthenticated) {
    return <Redirect href="/login" />;
  }

  // Redirect based on role
  if (user?.role === 'Admin') {
    return <Redirect href="/(admin)/dashboard" />;
  }

  return <Redirect href="/(supervisor)/dashboard" />;
}
