import { createContext, useContext, useEffect, useMemo, useState, type ReactNode } from 'react';
import { toast } from 'sonner';
import { fetchMe, loginUser, registerUser } from '../lib/api';

interface AuthUser {
  id: number;
  username: string;
  email?: string;
}

interface AuthContextType {
  token: string | null;
  user: AuthUser | null;
  isBootstrapping: boolean;
  login: (username: string, password: string) => Promise<void>;
  register: (username: string, email: string, password: string) => Promise<void>;
  logout: () => void;
}

const AuthContext = createContext<AuthContextType | undefined>(undefined);

const TOKEN_KEY = 'jq.token';
const USER_KEY = 'jq.user';

export function AuthProvider({ children }: { children: ReactNode }) {
  const [token, setToken] = useState<string | null>(() => localStorage.getItem(TOKEN_KEY));
  const [user, setUser] = useState<AuthUser | null>(() => {
    const stored = localStorage.getItem(USER_KEY);
    if (!stored) {
      return null;
    }
    try {
      return JSON.parse(stored) as AuthUser;
    } catch {
      return null;
    }
  });
  const [isBootstrapping, setIsBootstrapping] = useState(true);

  useEffect(() => {
    const bootstrap = async () => {
      if (!token) {
        setIsBootstrapping(false);
        return;
      }
      try {
        const me = await fetchMe(token);
        setUser(me);
        localStorage.setItem(USER_KEY, JSON.stringify(me));
      } catch (error) {
        setToken(null);
        setUser(null);
        localStorage.removeItem(TOKEN_KEY);
        localStorage.removeItem(USER_KEY);
      } finally {
        setIsBootstrapping(false);
      }
    };
    bootstrap();
  }, [token]);

  const login = async (username: string, password: string) => {
    const result = await loginUser(username, password);
    setToken(result.token);
    setUser(result.user);
    localStorage.setItem(TOKEN_KEY, result.token);
    localStorage.setItem(USER_KEY, JSON.stringify(result.user));
    toast.success('Signed in successfully');
  };

  const register = async (username: string, email: string, password: string) => {
    const result = await registerUser(username, email, password);
    setToken(result.token);
    setUser(result.user);
    localStorage.setItem(TOKEN_KEY, result.token);
    localStorage.setItem(USER_KEY, JSON.stringify(result.user));
    toast.success('Account created and signed in');
  };

  const logout = () => {
    setToken(null);
    setUser(null);
    localStorage.removeItem(TOKEN_KEY);
    localStorage.removeItem(USER_KEY);
    toast.success('Signed out');
  };

  const value = useMemo(
    () => ({ token, user, login, register, logout, isBootstrapping }),
    [token, user, isBootstrapping]
  );

  return <AuthContext.Provider value={value}>{children}</AuthContext.Provider>;
}

export function useAuth() {
  const context = useContext(AuthContext);
  if (context === undefined) {
    throw new Error('useAuth must be used within an AuthProvider');
  }
  return context;
}
