
import React, { createContext, useContext, ReactNode, useCallback } from 'react';
import useLocalStorage from '../hooks/useLocalStorage';

interface AuthContextType {
  isAuthenticated: boolean;
  login: (user: string, pass: string) => boolean;
  logout: () => void;
}

const AuthContext = createContext<AuthContextType | undefined>(undefined);

export const AuthProvider: React.FC<{ children: ReactNode }> = ({ children }) => {
  const [isAuthenticated, setIsAuthenticated] = useLocalStorage<boolean>('isAuthenticated', false);

  const login = useCallback((user: string, pass: string) => {
    // Get credentials from env or fallback to demo
    const validUser = import.meta.env.VITE_DEMO_USER || 'demo_user';
    const validPass = import.meta.env.VITE_DEMO_PASSWORD || 'demo123';
    
    if (user === validUser && pass === validPass) {
      setIsAuthenticated(true);
      return true;
    }
    return false;
  }, [setIsAuthenticated]);

  const logout = useCallback(() => {
    setIsAuthenticated(false);
  }, [setIsAuthenticated]);

  return (
    <AuthContext.Provider value={{ isAuthenticated, login, logout }}>
      {children}
    </AuthContext.Provider>
  );
};

export const useAuth = (): AuthContextType => {
  const context = useContext(AuthContext);
  if (context === undefined) {
    throw new Error('useAuth must be used within an AuthProvider');
  }
  return context;
};
