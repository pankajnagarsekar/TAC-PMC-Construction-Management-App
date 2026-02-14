// AUTH CONTEXT
// Provides authentication state and methods throughout the app

import React, { createContext, useContext, useState, useEffect, useCallback, ReactNode } from 'react';
import { authApi, ApiError } from '../services/api';
import { User, LoginRequest } from '../types/api';

interface AuthState {
  user: User | null;
  isLoading: boolean;
  isAuthenticated: boolean;
}

interface AuthContextType extends AuthState {
  login: (credentials: LoginRequest) => Promise<void>;
  logout: () => Promise<void>;
  refreshUser: () => Promise<void>;
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
    try {
      const isAuth = await authApi.isAuthenticated();
      if (isAuth) {
        const user = await authApi.getCurrentUser();
        setState({
          user,
          isLoading: false,
          isAuthenticated: !!user,
        });
      } else {
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
    setState(prev => ({ ...prev, isLoading: true }));
    
    try {
      const response = await authApi.login(credentials);
      setState({
        user: response.user,
        isLoading: false,
        isAuthenticated: true,
      });
    } catch (error) {
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
