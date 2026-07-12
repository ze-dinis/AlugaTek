import {
  createContext,
  useContext,
  useMemo,
  useState,
  type ReactNode,
} from 'react';
import type { SupportLoginResponse } from '../types/disputes';

interface AuthState {
  token: string;
  name: string;
  role: 'Support' | 'Admin';
}

interface AuthContextValue {
  user: AuthState | null;
  login: (session: SupportLoginResponse) => void;
  logout: () => void;
}

const AuthContext = createContext<AuthContextValue | undefined>(undefined);

const TOKEN_KEY = 'support_token';
const NAME_KEY = 'support_name';
const ROLE_KEY = 'support_role';

function readStoredAuth(): AuthState | null {
  const token = localStorage.getItem(TOKEN_KEY);
  const name = localStorage.getItem(NAME_KEY);
  const role = localStorage.getItem(ROLE_KEY) as 'Support' | 'Admin' | null;

  if (!token || !name || !role) {
    return null;
  }

  return { token, name, role };
}

export function AuthProvider({ children }: { children: ReactNode }) {
  const [user, setUser] = useState<AuthState | null>(() => readStoredAuth());

  const value = useMemo<AuthContextValue>(
    () => ({
      user,
      login: session => {
        localStorage.setItem(TOKEN_KEY, session.token);
        localStorage.setItem(NAME_KEY, session.name);
        localStorage.setItem(ROLE_KEY, session.role);
        setUser({ token: session.token, name: session.name, role: session.role });
      },
      logout: () => {
        localStorage.removeItem(TOKEN_KEY);
        localStorage.removeItem(NAME_KEY);
        localStorage.removeItem(ROLE_KEY);
        setUser(null);
      },
    }),
    [user],
  );

  return <AuthContext.Provider value={value}>{children}</AuthContext.Provider>;
}

export function useAuth() {
  const context = useContext(AuthContext);
  if (!context) {
    throw new Error('useAuth must be used inside AuthProvider');
  }
  return context;
}
