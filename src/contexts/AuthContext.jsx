import React, {
  createContext,
  useContext,
  useEffect,
  useState,
  useCallback,
  useMemo,
  useRef,
} from 'react';
import { authApi } from '../api/auth.api.js';
import { tokenStorage } from '../api/client.js';
import { toast } from '@/components/ui/use-toast';

const AuthContext = createContext(undefined);

export function AuthProvider({ children }) {
  const [user, setUser] = useState(null);
  // session shape kept compat with SupabaseAuthContext: { access_token, user }
  const [session, setSession] = useState(null);
  const [loading, setLoading] = useState(true);
  const [userRole, setUserRole] = useState(null);
  const [isSyncingRole, setIsSyncingRole] = useState(false);

  const roleIntervalRef = useRef(null);

  // ── Init: restore session from stored token ────────────────────────────────
  useEffect(() => {
    let mounted = true;

    const init = async () => {
      const token = tokenStorage.getToken();
      if (!token) {
        if (mounted) setLoading(false);
        return;
      }
      try {
        const { user: u } = await authApi.getSession();
        if (!mounted) return;
        setUser(u);
        setSession({ access_token: token, user: u });
        setUserRole(u.role || 'karyawan');
      } catch {
        tokenStorage.clear();
        if (mounted) {
          setUser(null);
          setSession(null);
          setUserRole(null);
        }
      } finally {
        if (mounted) setLoading(false);
      }
    };

    init();
    return () => { mounted = false; };
  }, []);

  // ── Background role polling every 30 s (replaces Supabase Realtime) ────────
  useEffect(() => {
    if (!user?.id) return;

    const poll = async () => {
      try {
        const { role } = await authApi.getMyRole();
        setUserRole(role);
      } catch {
        // silent — stale role is acceptable for one cycle
      }
    };

    const id = setInterval(poll, 30_000);
    roleIntervalRef.current = id;
    return () => clearInterval(id);
  }, [user?.id]);

  // ── Listen for forced-logout event dispatched by client.js ─────────────────
  useEffect(() => {
    const handler = () => {
      setUser(null);
      setSession(null);
      setUserRole(null);
    };
    window.addEventListener('auth:logout', handler);
    return () => window.removeEventListener('auth:logout', handler);
  }, []);

  // ── Derived booleans ───────────────────────────────────────────────────────
  const isSuperAdmin = useMemo(() => userRole === 'super_admin', [userRole]);
  const isAdmin = useMemo(
    () => userRole === 'admin' || userRole === 'super_admin',
    [userRole]
  );

  // ── signIn ─────────────────────────────────────────────────────────────────
  const signIn = useCallback(async (email, password) => {
    try {
      const data = await authApi.login(email, password);
      setUser(data.user);
      setSession({ access_token: data.accessToken, user: data.user });
      setUserRole(data.user.role || 'karyawan');
      return { error: null };
    } catch (err) {
      toast({
        variant: 'destructive',
        title: 'Sign in Failed',
        description: err.message || 'Something went wrong',
      });
      return { error: err };
    }
  }, []);

  // ── signUp — not active; kept for interface compat ─────────────────────────
  const signUp = useCallback(async () => {
    return { error: new Error('Sign up tidak tersedia. Hubungi admin.') };
  }, []);

  // ── signOut ────────────────────────────────────────────────────────────────
  const signOut = useCallback(async () => {
    try {
      setLoading(true);
      await authApi.logout();
    } catch (e) {
      console.error('Signout error:', e);
    } finally {
      tokenStorage.clear();
      setUser(null);
      setSession(null);
      setUserRole(null);
      // Clear all localStorage except pinned keys
      const itemsToKeep = ['app_version'];
      Object.keys(localStorage).forEach((key) => {
        if (!itemsToKeep.includes(key)) localStorage.removeItem(key);
      });
      sessionStorage.clear();
      setLoading(false);
    }
  }, []);

  // ── refreshSession ─────────────────────────────────────────────────────────
  const refreshSession = useCallback(async () => {
    try {
      const { user: u } = await authApi.getSession();
      const token = tokenStorage.getToken();
      setUser(u);
      setSession({ access_token: token, user: u });
      setUserRole(u.role || 'karyawan');
    } catch {
      // silent — caller decides how to handle
    }
  }, []);

  // ── Context value (memoized) ───────────────────────────────────────────────
  const value = useMemo(
    () => ({
      user,
      session,
      loading: loading || isSyncingRole,
      userRole,
      isSuperAdmin,
      isAdmin,
      signUp,
      signIn,
      signOut,
      refreshSession,
    }),
    [
      user,
      session,
      loading,
      isSyncingRole,
      userRole,
      isSuperAdmin,
      isAdmin,
      signUp,
      signIn,
      signOut,
      refreshSession,
    ]
  );

  return <AuthContext.Provider value={value}>{children}</AuthContext.Provider>;
}

/**
 * useAuth — identical interface to the old SupabaseAuthContext hook.
 * Returns safe defaults when called outside the provider (e.g. during SSR or tests).
 */
export function useAuth() {
  const context = useContext(AuthContext);
  if (context === undefined) {
    return {
      loading: true,
      user: null,
      session: null,
      userRole: null,
      isSuperAdmin: false,
      isAdmin: false,
      signUp: async () => ({ error: null }),
      signIn: async () => ({ error: null }),
      signOut: async () => {},
      refreshSession: async () => {},
    };
  }
  return context;
}

export default AuthContext;
