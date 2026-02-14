// THEME CONSTANTS
// Professional blue/gray with safety orange accent

export const Colors = {
  // Primary - Professional Blue
  primary: '#1E3A5F',
  primaryDark: '#152C4A',
  primaryLight: '#2E5A8F',
  
  // Secondary - Steel Gray
  secondary: '#4A5568',
  secondaryDark: '#2D3748',
  secondaryLight: '#718096',
  
  // Accent - Safety Orange
  accent: '#F97316',
  accentDark: '#EA580C',
  accentLight: '#FB923C',
  
  // Status Colors
  success: '#10B981',
  successLight: '#D1FAE5',
  warning: '#F59E0B',
  warningLight: '#FEF3C7',
  error: '#EF4444',
  errorLight: '#FEE2E2',
  info: '#3B82F6',
  infoLight: '#DBEAFE',
  
  // Neutrals
  white: '#FFFFFF',
  background: '#F3F4F6',
  surface: '#FFFFFF',
  border: '#E5E7EB',
  divider: '#D1D5DB',
  
  // Text
  text: '#111827',
  textSecondary: '#6B7280',
  textMuted: '#9CA3AF',
  textInverse: '#FFFFFF',
  
  // Specific UI
  headerBg: '#1E3A5F',
  tabBarBg: '#FFFFFF',
  cardBg: '#FFFFFF',
  inputBg: '#F9FAFB',
  inputBorder: '#D1D5DB',
  placeholder: '#9CA3AF',
};

export const Spacing = {
  xs: 4,
  sm: 8,
  md: 16,
  lg: 24,
  xl: 32,
  xxl: 48,
};

export const FontSizes = {
  xs: 12,
  sm: 14,
  md: 16,
  lg: 18,
  xl: 20,
  xxl: 24,
  xxxl: 32,
};

export const BorderRadius = {
  sm: 4,
  md: 8,
  lg: 12,
  xl: 16,
  full: 9999,
};

export const Shadows = {
  sm: {
    shadowColor: '#000',
    shadowOffset: { width: 0, height: 1 },
    shadowOpacity: 0.05,
    shadowRadius: 2,
    elevation: 1,
  },
  md: {
    shadowColor: '#000',
    shadowOffset: { width: 0, height: 2 },
    shadowOpacity: 0.1,
    shadowRadius: 4,
    elevation: 3,
  },
  lg: {
    shadowColor: '#000',
    shadowOffset: { width: 0, height: 4 },
    shadowOpacity: 0.15,
    shadowRadius: 8,
    elevation: 5,
  },
};

export default {
  Colors,
  Spacing,
  FontSizes,
  BorderRadius,
  Shadows,
};
