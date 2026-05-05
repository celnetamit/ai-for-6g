
import React, { createContext, useContext, ReactNode, useCallback } from 'react';
import useLocalStorage from '../hooks/useLocalStorage';
import { CapstoneResult } from '../types';

interface Progress {
  completedLessons: string[];
  assessmentScores: Record<string, number>;
  toolResults: Record<string, any>;
  capstoneResult?: CapstoneResult;
}

interface ProgressContextType {
  progress: Progress;
  markLessonCompleted: (lessonId: string) => void;
  getLessonCompleted: (lessonId: string) => boolean;
  saveAssessmentScore: (moduleId: string, score: number) => void;
  saveToolResult: (toolName: string, result: any) => void;
  saveCapstoneResult: (result: CapstoneResult) => void;
  resetProgress: () => void;
}

const ProgressContext = createContext<ProgressContextType | undefined>(undefined);

const initialProgress: Progress = {
  completedLessons: [],
  assessmentScores: {},
  toolResults: {},
};

export const ProgressProvider: React.FC<{ children: ReactNode }> = ({ children }) => {
  const [progress, setProgress] = useLocalStorage<Progress>('userProgress', initialProgress);

  const markLessonCompleted = useCallback((lessonId: string) => {
    setProgress(prev => ({
      ...prev,
      completedLessons: [...new Set([...prev.completedLessons, lessonId])],
    }));
  }, [setProgress]);

  const getLessonCompleted = useCallback((lessonId: string) => {
      return progress.completedLessons.includes(lessonId);
  }, [progress.completedLessons]);

  const saveAssessmentScore = useCallback((moduleId: string, score: number) => {
    setProgress(prev => ({
      ...prev,
      assessmentScores: {
        ...prev.assessmentScores,
        [moduleId]: score,
      },
    }));
  }, [setProgress]);

  const saveToolResult = useCallback((toolName: string, result: any) => {
      setProgress(prev => ({
          ...prev,
          toolResults: {
              ...prev.toolResults,
              [toolName]: result
          }
      }))
  }, [setProgress]);

  const saveCapstoneResult = useCallback((result: CapstoneResult) => {
    setProgress(prev => ({
      ...prev,
      capstoneResult: result,
    }));
  }, [setProgress]);

  const resetProgress = useCallback(() => {
    setProgress(initialProgress);
  }, [setProgress]);


  return (
    <ProgressContext.Provider value={{ progress, markLessonCompleted, getLessonCompleted, saveAssessmentScore, saveToolResult, saveCapstoneResult, resetProgress }}>
      {children}
    </ProgressContext.Provider>
  );
};

export const useProgress = (): ProgressContextType => {
  const context = useContext(ProgressContext);
  if (!context) {
    throw new Error('useProgress must be used within a ProgressProvider');
  }
  return context;
};