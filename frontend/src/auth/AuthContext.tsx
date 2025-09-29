import { createContext, useContext, useMemo, useState } from 'react';
import { Base64 } from 'js-base64';

interface AuthState {
  basicUser: string;
  basicPass: string;
  sessionToken?: string;
}

interface AuthContextValue {
  isAuthenticated: boolean;
  sessionToken?: string;
  authorizationHeader?: string;
  signIn: (credentials: { username: string; password: string }) => Promise<void>;
  signOut: () => void;
}

const AuthContext = createContext<AuthContextValue | undefined>(undefined);

const STORAGE_KEY = 'curasev-reporting-auth';
const API_BASE = import.meta.env.VITE_BACKEND_URL ?? '';

function loadInitialState(): AuthState | undefined {
  if (typeof window === 'undefined') return undefined;
  const raw = window.localStorage.getItem(STORAGE_KEY);
  if (!raw) return undefined;
  try {
    return JSON.parse(raw) as AuthState;
  } catch (error) {
    console.warn('Failed to parse auth state', error);
    return undefined;
  }
}

export function AuthProvider({ children }: { children: React.ReactNode }) {
  const [state, setState] = useState<AuthState | undefined>(() => loadInitialState());

  async function signIn({ username, password }: { username: string; password: string }) {
    const authHeader = `Basic ${Base64.encode(`${username}:${password}`)}`;
    const response = await fetch(`${API_BASE}/api/auth/login`, {
      method: 'POST',
      headers: {
        Authorization: authHeader,
      },
    });

    if (!response.ok) {
      const text = await response.text();
      throw new Error(text || 'Invalid credentials or API unreachable');
    }

    const payload = (await response.json()) as { token: string };
    const nextState: AuthState = {
      basicUser: username,
      basicPass: password,
      sessionToken: payload.token,
    };
    if (typeof window !== 'undefined') {
      window.localStorage.setItem(STORAGE_KEY, JSON.stringify(nextState));
    }
    setState(nextState);
  }

  function signOut() {
    if (typeof window !== 'undefined') {
      window.localStorage.removeItem(STORAGE_KEY);
    }
    setState(undefined);
  }

  const value = useMemo<AuthContextValue>(() => {
    if (!state) {
      return {
        isAuthenticated: false,
        signIn,
        signOut,
      };
    }
    const authorizationHeader = `Basic ${Base64.encode(`${state.basicUser}:${state.basicPass}`)}`;
    return {
      isAuthenticated: true,
      sessionToken: state.sessionToken,
      authorizationHeader,
      signIn,
      signOut,
    };
  }, [state]);

  return <AuthContext.Provider value={value}>{children}</AuthContext.Provider>;
}

export function useAuth() {
  const ctx = useContext(AuthContext);
  if (!ctx) {
    throw new Error('AuthContext not found. Wrap component tree with AuthProvider');
  }
  return ctx;
}
