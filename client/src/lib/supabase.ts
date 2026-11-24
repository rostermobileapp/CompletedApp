import { createClient } from '@supabase/supabase-js';

const supabaseUrl = import.meta.env.VITE_SUPABASE_URL;
const supabaseAnonKey = import.meta.env.VITE_SUPABASE_ANON_KEY;

if (!supabaseUrl || !supabaseAnonKey) {
  throw new Error('Missing Supabase environment variables');
}

export const supabase = createClient(supabaseUrl, supabaseAnonKey, {
  auth: {
    persistSession: true,
    autoRefreshToken: true,
    detectSessionInUrl: true,
  },
});

/** Check the provider before registration, not after an auto-confirmed account exists. */
export async function requireSignupEmailConfirmation() {
  const response = await fetch(`${supabaseUrl}/auth/v1/settings`, {
    headers: { apikey: supabaseAnonKey },
    signal: AbortSignal.timeout(10000),
  });
  if (!response.ok) {
    throw new Error('Email verification is temporarily unavailable. No account was created. Please try again later.');
  }
  const settings = await response.json();
  if (settings.mailer_autoconfirm !== false) {
    throw new Error('New account registration is temporarily unavailable while email verification is being configured. No account was created.');
  }
}

// Helper to clear stale sessions - call this when authentication fails
export async function clearStaleSession() {
  console.log('[Supabase] Clearing potentially stale session...');
  await supabase.auth.signOut();
  // Clear any localStorage items related to Supabase
  const keysToRemove: string[] = [];
  for (let i = 0; i < localStorage.length; i++) {
    const key = localStorage.key(i);
    if (key && (key.includes('supabase') || key.includes('sb-'))) {
      keysToRemove.push(key);
    }
  }
  keysToRemove.forEach(key => {
    console.log('[Supabase] Removing localStorage key:', key);
    localStorage.removeItem(key);
  });
}
