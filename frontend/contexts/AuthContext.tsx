// AUTH CONTEXT
// Provides authentication state and methods throughout the app

import React, { createContext, useContext, useState, useEffect, useCallback, ReactNode } from 'react';
import { Alert, Platform } from 'react-native';
import { authApi, ApiError } from '../services/api';
import { User, LoginRequest } from '../types/api';

interface AuthState {
  user: User | null;
  isLoading: boolean;
  isAuthenticated: boolean;
}

interface LogoutCheckResult {
  can_logout: boolean;
  reason?: string;
  message?: string;
  has_draft?: boolean;
}

interface AuthContextType extends AuthState {
  login: (credentials: LoginRequest) => Promise<void>;
  logout: () => Promise<void>;
  refreshUser: () => Promise<void>;
  checkCanLogout: () => Promise<LogoutCheckResult>;
}

const AuthContext = createContext<AuthContextType | undefined>(undefined);

interface AuthProviderProps {
  children: ReactNode;
}

export function AuthProvider({ children }: AuthProviderProps) {
  const [state, setState] = useState<AuthState>({
    user: null,
    isLoading: true,
    isAuthenticated: false,
  });

  // Check for existing session on mount
  useEffect(() => {
    checkAuthStatus();
  }, []);

  const checkAuthStatus = async () => {
    console.log('Checking auth status...');
    try {
      const isAuth = await authApi.isAuthenticated();
      console.log('Is authenticated:', isAuth);
      if (isAuth) {
        const user = await authApi.getCurrentUser();
        console.log('Found user:', user?.email);
        setState({
          user,
          isLoading: false,
          isAuthenticated: !!user,
        });
      } else {
        console.log('No auth token found');
        setState({
          user: null,
          isLoading: false,
          isAuthenticated: false,
        });
      }
    } catch (error) {
      console.error('Auth check failed:', error);
      setState({
        user: null,
        isLoading: false,
        isAuthenticated: false,
      });
    }
  };

  const login = useCallback(async (credentials: LoginRequest) => {
    console.log('Login called with:', credentials.email);
    setState(prev => ({ ...prev, isLoading: true }));
    
    try {
      console.log('Calling authApi.login...');
      const response = await authApi.login(credentials);
      console.log('Login successful, user:', response.user?.email);
      setState({
        user: response.user,
        isLoading: false,
        isAuthenticated: true,
      });
    } catch (error) {
      console.error('Login failed:', error);
      setState(prev => ({ ...prev, isLoading: false }));
      throw error;
    }
  }, []);

  const logout = useCallback(async () => {
    setState(prev => ({ ...prev, isLoading: true }));
    
    try {
      await authApi.logout();
    } finally {
      setState({
        user: null,
        isLoading: false,
        isAuthenticated: false,
      });
    }
  }, []);

  const checkCanLogout = useCallback(async (): Promise<LogoutCheckResult> => {
    try {
      const response = await authApi.checkCanLogout();
      return response;
    } catch (error) {
      console.error('Failed to check logout status:', error);
      // On error, allow logout (fail-safe)
      return { can_logout: true };
    }
  }, []);

  const refreshUser = useCallback(async () => {
    const user = await authApi.getCurrentUser();
    setState(prev => ({ ...prev, user }));
  }, []);

  return (
    <AuthContext.Provider
      value={{
        ...state,
        login,
        logout,
        refreshUser,
      }}
    >
      {children}
    </AuthContext.Provider>
  );
}

export function useAuth() {
  const context = useContext(AuthContext);
  if (context === undefined) {
    throw new Error('useAuth must be used within an AuthProvider');
  }
  return context;
}

export default AuthContext;
