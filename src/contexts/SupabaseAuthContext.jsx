import React, { createContext, useContext, useEffect, useState, useCallback, useMemo, useRef } from 'react';

import { supabase } from '@/lib/customSupabaseClient';
import { toast } from '@/components/ui/use-toast';

const AuthContext = createContext(undefined);

export const AuthProvider = ({ children }) => {
  const [user, setUser] = useState(null);
  const [session, setSession] = useState(null);
  const [loading, setLoading] = useState(true);
  const [userRole, setUserRole] = useState(null);
  const [isSyncingRole, setIsSyncingRole] = useState(false);

  // Ref untuk track apakah initial load sudah selesai — mencegah loading flash
  // saat TOKEN_REFRESHED atau SIGNED_IN ulang
  const initialLoadDone = useRef(false);

  const checkUserRole = useCallback(async (userId) => {
    try {
      const { data, error } = await supabase
        .from('user_roles')
        .select('role')
        .eq('user_id', userId)
        .maybeSingle();

      if (error && error.code !== 'PGRST116') {
        console.error('Error checking user role:', error);
        setUserRole('karyawan');
      } else if (data) {
        setUserRole(data.role);
      } else {
        // Tidak ada role di tabel — default karyawan
        // (tidak perlu getUser() lagi, userId sudah valid dari session)
        setUserRole('karyawan');
      }
    } catch (error) {
      console.error('Error in checkUserRole:', error);
      setUserRole('karyawan');
    }
  }, []);

  // handleSession: showLoading hanya untuk initial load, bukan token refresh
  const handleSession = useCallback(async (currentSession, showLoading = false) => {
    if (showLoading) setLoading(true);

    setSession(currentSession);
    setUser(currentSession?.user ?? null);

    if (currentSession?.user) {
      setIsSyncingRole(true);
      await checkUserRole(currentSession.user.id);
      setIsSyncingRole(false);
    } else {
      setUserRole(null);
    }

    if (showLoading) setLoading(false);
  }, [checkUserRole]);

  const isSuperAdmin = useMemo(() => userRole === 'super_admin', [userRole]);
  const isAdmin = useMemo(() => userRole === 'admin' || userRole === 'super_admin', [userRole]);

  // ── Initial load ──────────────────────────────────────────────────────────
  useEffect(() => {
    let mounted = true;

    const init = async () => {
      setLoading(true);
      try {
        const { data: { session: initialSession } } = await supabase.auth.getSession();
        if (!mounted) return;

        setSession(initialSession);
        setUser(initialSession?.user ?? null);

        if (initialSession?.user) {
          setIsSyncingRole(true);
          await checkUserRole(initialSession.user.id);
          if (mounted) setIsSyncingRole(false);
        } else {
          setUserRole(null);
        }
      } catch (err) {
        console.error('[Auth] Init error:', err);
      } finally {
        if (mounted) {
          setLoading(false);
          initialLoadDone.current = true;
        }
      }
    };

    init();
    return () => { mounted = false; };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []); // hanya sekali saat mount

  // ── Auth state changes (setelah initial load) ─────────────────────────────
  useEffect(() => {
    const { data: { subscription } } = supabase.auth.onAuthStateChange(
      async (event, currentSession) => {
        // TOKEN_REFRESHED: update session tanpa loading flash
        if (event === 'TOKEN_REFRESHED') {
          setSession(currentSession);
          setUser(currentSession?.user ?? null);
          return;
        }

        // SIGNED_OUT: reset state — bisa dipicu oleh session expired (403)
        // Jangan reload, cukup reset state agar app redirect ke login screen
        if (event === 'SIGNED_OUT') {
          setSession(null);
          setUser(null);
          setUserRole(null);
          initialLoadDone.current = false;
          setLoading(false);
          return;
        }

        // SIGNED_IN / USER_UPDATED: update tanpa loading jika sudah init
        if (initialLoadDone.current) {
          await handleSession(currentSession, false);
        }
      }
    );

    return () => subscription.unsubscribe();
  }, [handleSession]);

  // ── Realtime role sync (terpisah, tidak trigger re-subscribe saat session berubah) ──
  useEffect(() => {
    const userId = user?.id;
    if (!userId) return;

    const roleChannel = supabase
      .channel(`role_sync_${userId}`)
      .on('postgres_changes', {
        event: '*',
        schema: 'public',
        table: 'user_roles',
        filter: `user_id=eq.${userId}`,
      }, () => checkUserRole(userId))
      .subscribe();

    return () => supabase.removeChannel(roleChannel);
  }, [user?.id, checkUserRole]);

  const signUp = useCallback(async (email, password, options) => {
    // Native mode: backend self-hosted tidak punya public signup (hanya
    // /api/auth/register khusus admin). createNativeSupabaseCompat juga sudah
    // mengembalikan error yang sama; guard eksplisit agar pesan konsisten.
    if (supabase.isNativeCompat) {
      const nativeError = { message: 'Pendaftaran harus melalui admin.' };
      toast({ variant: 'destructive', title: 'Sign up Failed', description: nativeError.message });
      return { error: nativeError };
    }
    const { error } = await supabase.auth.signUp({ email, password, options });
    if (error) {
      toast({ variant: 'destructive', title: 'Sign up Failed', description: error.message || 'Something went wrong' });
    }
    return { error };
  }, []);

  const signIn = useCallback(async (email, password) => {
    const { error } = await supabase.auth.signInWithPassword({ email, password });
    if (error) {
      toast({ variant: 'destructive', title: 'Sign in Failed', description: error.message || 'Something went wrong' });
    }
    return { error };
  }, []);

  const signOut = useCallback(async () => {
    try {
      setLoading(true);
      await supabase.auth.signOut();
    } catch (e) {
      console.error('Signout error:', e);
    } finally {
      // Jangan reload — biarkan onAuthStateChange('SIGNED_OUT') handle redirect
      // supaya form state tidak hilang dan tidak ada flash reload
      const itemsToKeep = ['app_version'];
      Object.keys(localStorage).forEach(key => {
        if (!itemsToKeep.includes(key)) localStorage.removeItem(key);
      });
      sessionStorage.clear();
      if ('caches' in window) {
        try {
          const cacheNames = await caches.keys();
          await Promise.all(cacheNames.map(name => caches.delete(name)));
        } catch (e) { }
      }
      // HAPUS window.location.reload() — auth context sudah handle SIGNED_OUT event
    }
  }, []);

  const refreshSession = useCallback(async () => {
    const { data: { session: s } } = await supabase.auth.getSession();
    await handleSession(s, false);
  }, [handleSession]);

  const value = useMemo(() => ({
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
  }), [user, session, loading, isSyncingRole, userRole, isSuperAdmin, isAdmin, signUp, signIn, signOut, refreshSession]);

  return <AuthContext.Provider value={value}>{children}</AuthContext.Provider>;
};

export const useAuth = () => {
  const context = useContext(AuthContext);
  if (context === undefined) {
    return { loading: true, user: null, session: null, userRole: null, isSuperAdmin: false, isAdmin: false };
  }
  return context;
};
