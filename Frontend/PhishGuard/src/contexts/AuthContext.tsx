import { createContext, useContext, useEffect, useState, type ReactNode } from 'react';
import { supabase, type UserProfile } from '../lib/supabase';
import type { Session } from '@supabase/supabase-js';

interface AuthContextValue {
  session: Session | null;
  profile: UserProfile | null;
  loading: boolean;
  /** True immediately after signUpWithEmail — prompts user to check inbox */
  emailConfirmPending: boolean;
  signInWithGoogle: () => Promise<void>;
  signInWithEmail: (email: string, pass: string) => Promise<void>;
  signUpWithEmail: (email: string, pass: string, displayName: string) => Promise<void>;
  signOut: () => Promise<void>;
  clearEmailConfirmPending: () => void;
  refreshProfile: () => Promise<void>;
  token: string | null;
}

const AuthContext = createContext<AuthContextValue | null>(null);

export function AuthProvider({ children }: { children: ReactNode }) {
  const [session, setSession] = useState<Session | null>(null);
  const [profile, setProfile] = useState<UserProfile | null>(null);
  const [loading, setLoading] = useState(true);
  const [emailConfirmPending, setEmailConfirmPending] = useState(false);

  useEffect(() => {
    supabase.auth.getSession().then(({ data: { session } }) => {
      setSession(session);
      if (session) fetchProfile(session.user.id, session.access_token);
      else setLoading(false);
    });

    const { data: { subscription } } = supabase.auth.onAuthStateChange((_event, session) => {
      setSession(session);
      if (session) {
        // Clear pending banner once user is actually signed in
        setEmailConfirmPending(false);
        fetchProfile(session.user.id, session.access_token);
      } else {
        setProfile(null);
        setLoading(false);
      }
    });

    return () => subscription.unsubscribe();
  }, []);

  async function fetchProfile(userId: string, token: string) {
    try {
      const res = await fetch(`${import.meta.env.VITE_API_URL || 'http://localhost:8000'}/auth/me`, {
        headers: { Authorization: `Bearer ${token}` },
      });
      if (res.ok) {
        const data = await res.json();
        setProfile(data);
      } else {
        await buildProfileFromSession(userId);
      }
    } catch {
      await buildProfileFromSession(userId);
    } finally {
      setLoading(false);
    }
  }

  async function buildProfileFromSession(userId: string) {
    const { data: { user } } = await supabase.auth.getUser();
    if (user) {
      setProfile({
        id: userId,
        email: user.email || '',
        display_name:
          user.user_metadata?.full_name ||
          user.user_metadata?.name ||
          null,
        avatar_url:
          user.user_metadata?.avatar_url ||
          user.user_metadata?.picture ||
          null,
        role: 'user',
        created_at: user.created_at,
      });
    }
  }

  async function signInWithGoogle() {
    await supabase.auth.signInWithOAuth({
      provider: 'google',
      options: { redirectTo: window.location.origin },
    });
  }

  async function signInWithEmail(email: string, pass: string) {
    const { error } = await supabase.auth.signInWithPassword({ email, password: pass });
    if (error) throw error;
  }

  async function signUpWithEmail(email: string, pass: string, displayName: string) {
    const { data, error } = await supabase.auth.signUp({
      email,
      password: pass,
      options: {
        data: {
          full_name: displayName.trim() || email.split('@')[0],
          display_name: displayName.trim() || email.split('@')[0],
        },
        // Redirect after email confirmation — Supabase sends a link to this URL
        emailRedirectTo: `${window.location.origin}/dashboard`,
      },
    });
    if (error) throw error;

    // If Supabase requires email confirmation, user.identities will be empty or
    // data.session will be null. Either way, show the verification banner.
    if (!data.session) {
      setEmailConfirmPending(true);
    }
  }

  async function signOut() {
    await supabase.auth.signOut();
    setProfile(null);
    setEmailConfirmPending(false);
  }

  function clearEmailConfirmPending() {
    setEmailConfirmPending(false);
  }

  return (
    <AuthContext.Provider value={{
      session, profile, loading,
      emailConfirmPending,
      signInWithGoogle, signInWithEmail, signUpWithEmail, signOut,
      clearEmailConfirmPending,
      refreshProfile: async () => {
        if (session) await fetchProfile(session.user.id, session.access_token);
      },
      token: session?.access_token ?? null,
    }}>
      {children}
    </AuthContext.Provider>
  );
}

export function useAuth() {
  const ctx = useContext(AuthContext);
  if (!ctx) throw new Error('useAuth must be used within AuthProvider');
  return ctx;
}
