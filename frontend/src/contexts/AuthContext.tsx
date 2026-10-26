import { createContext, useContext, useEffect, useState, type ReactNode } from "react";
import { accessToken, clearAccessToken, fetchCurrentUser, signIn, signUp,
  type SignedInUser } from "../services/authService";

type AuthContextValue = {
  user: SignedInUser | null;
  checking: boolean;
  login: (email: string, password: string) => Promise<void>;
  register: (email: string, password: string) => Promise<void>;
  logout: () => void;
};
const AuthContext = createContext<AuthContextValue | null>(null);

export function AuthProvider({ children }: { children: ReactNode }) {
  const [user, setUser] = useState<SignedInUser | null>(null);
  const [checking, setChecking] = useState(true);
  useEffect(() => {
    let mounted = true;
    const onExpired = () => setUser(null);
    window.addEventListener("edumind-auth-expired", onExpired);
    if (accessToken()) {
      fetchCurrentUser().then((value) => { if (mounted) setUser(value); })
        .catch(() => { clearAccessToken(); if (mounted) setUser(null); })
        .finally(() => { if (mounted) setChecking(false); });
    } else {
      // tránh setState đồng bộ trong effect để giữ ESLint React Hooks hợp lệ.
      queueMicrotask(() => { if (mounted) setChecking(false); });
    }
    return () => { mounted = false; window.removeEventListener("edumind-auth-expired", onExpired); };
  }, []);
  const login = async (email: string, password: string) => setUser(await signIn(email, password));
  const register = async (email: string, password: string) => { await signUp(email, password); };
  const logout = () => { clearAccessToken(); setUser(null); };
  return <AuthContext.Provider value={{ user, checking, login, register, logout }}>{children}</AuthContext.Provider>;
}
// eslint-disable-next-line react-refresh/only-export-components
export function useAuth() {
  const context = useContext(AuthContext);
  if (!context) throw new Error("useAuth cần nằm trong AuthProvider");
  return context;
}
