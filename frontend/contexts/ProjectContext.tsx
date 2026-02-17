// PROJECT CONTEXT FOR SUPERVISORS
// Manages the currently selected project for supervisor workflow

import React, { createContext, useContext, useState, useEffect, ReactNode } from 'react';
import AsyncStorage from '@react-native-async-storage/async-storage';
import { Project } from '../types/api';

interface ProjectContextType {
  selectedProject: Project | null;
  setSelectedProject: (project: Project | null) => void;
  clearProject: () => void;
  isProjectSelected: boolean;
}

const ProjectContext = createContext<ProjectContextType | undefined>(undefined);

const STORAGE_KEY = 'supervisor_selected_project';

export function ProjectProvider({ children }: { children: ReactNode }) {
  const [selectedProject, setSelectedProjectState] = useState<Project | null>(null);
  const [isLoaded, setIsLoaded] = useState(false);

  // Load persisted project on mount
  useEffect(() => {
    loadPersistedProject();
  }, []);

  const loadPersistedProject = async () => {
    try {
      const stored = await AsyncStorage.getItem(STORAGE_KEY);
      if (stored) {
        setSelectedProjectState(JSON.parse(stored));
      }
    } catch (error) {
      console.error('Failed to load persisted project:', error);
    } finally {
      setIsLoaded(true);
    }
  };

  const setSelectedProject = async (project: Project | null) => {
    setSelectedProjectState(project);
    try {
      if (project) {
        await AsyncStorage.setItem(STORAGE_KEY, JSON.stringify(project));
      } else {
        await AsyncStorage.removeItem(STORAGE_KEY);
      }
    } catch (error) {
      console.error('Failed to persist project:', error);
    }
  };

  const clearProject = async () => {
    setSelectedProjectState(null);
    try {
      await AsyncStorage.removeItem(STORAGE_KEY);
    } catch (error) {
      console.error('Failed to clear project:', error);
    }
  };

  if (!isLoaded) {
    return null; // Or a loading spinner
  }

  return (
    <ProjectContext.Provider
      value={{
        selectedProject,
        setSelectedProject,
        clearProject,
        isProjectSelected: selectedProject !== null,
      }}
    >
      {children}
    </ProjectContext.Provider>
  );
}

export function useProject() {
  const context = useContext(ProjectContext);
  if (context === undefined) {
    throw new Error('useProject must be used within a ProjectProvider');
  }
  return context;
}

export default ProjectContext;
