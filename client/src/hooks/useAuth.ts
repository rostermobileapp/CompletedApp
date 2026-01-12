import { useEffect, useState, useCallback } from 'react';
import { supabase, clearStaleSession } from '@/lib/supabase';
import type { User as SupabaseUser } from '@supabase/supabase-js';
import { apiRequest } from '@/lib/queryClient';

export function useAuth() {
  const [user, setUser] = useState<SupabaseUser | null>(null);
  const [isLoading, setIsLoading] = useState(true);

  // Validate session works with backend
  const validateSession = useCallback(async (accessToken: string) => {
    try {
      const response = await fetch('/api/user', {
        headers: { 'Authorization': `Bearer ${accessToken}` }
      });
      if (response.status === 401) {
        console.log('[Auth] Session validation failed - backend rejected token');
        return false;
      }
      return true;
    } catch (error) {
      console.error('[Auth] Session validation error:', error);
      return false;
    }
  }, []);

  useEffect(() => {
    const initAuth = async () => {
      try {
        // First try to get existing session
        const { data: { session }, error } = await supabase.auth.getSession();
        
        if (error) {
          console.error('[Auth] Error getting session:', error.message);
          await clearStaleSession();
          setUser(null);
          setIsLoading(false);
          return;
        }

        if (session?.user && session.access_token) {
          // Validate the session works with our backend
          const isValid = await validateSession(session.access_token);
          
          if (!isValid) {
            console.log('[Auth] Session invalid with backend, attempting refresh...');
            // Try to refresh the token
            const { data: refreshData, error: refreshError } = await supabase.auth.refreshSession();
            
            if (refreshError || !refreshData.session) {
              console.log('[Auth] Token refresh failed:', refreshError?.message || 'no session');
              // Check for specific refresh token errors
              if (refreshError?.message?.includes('refresh_token') || 
                  refreshError?.code === 'refresh_token_not_found') {
                console.log('[Auth] Refresh token not found, clearing stale session');
              }
              await clearStaleSession();
              setUser(null);
            } else {
              console.log('[Auth] Token refreshed successfully');
              setUser(refreshData.session.user);
            }
          } else {
            setUser(session.user);
          }
        } else {
          // No session - also check if there are any stale storage items
          const hasStaleStorage = Object.keys(localStorage).some(
            key => key.includes('supabase') || key.includes('sb-')
          );
          if (hasStaleStorage) {
            console.log('[Auth] No session but found stale storage, clearing...');
            await clearStaleSession();
          }
          setUser(null);
        }
      } catch (err) {
        console.error('[Auth] Init error:', err);
        setUser(null);
      } finally {
        setIsLoading(false);
      }
    };

    initAuth();

    // Listen for auth changes
    const {
      data: { subscription },
    } = supabase.auth.onAuthStateChange((_event, session) => {
      console.log('[Auth] Auth state changed:', _event);
      setUser(session?.user ?? null);
    });

    return () => subscription.unsubscribe();
  }, [validateSession]);

  return {
    user,
    isLoading,
    isAuthenticated: !!user,
  };
}
