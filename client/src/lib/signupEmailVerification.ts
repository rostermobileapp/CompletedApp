import type { SignUpWithPasswordCredentials } from '@supabase/supabase-js';
import { supabase, requireSignupEmailConfirmation } from '@/lib/supabase';

/** Registration never falls back to password sign-in or auto-confirmed access. */
export async function signUpWithEmailVerification(credentials: SignUpWithPasswordCredentials) {
  await requireSignupEmailConfirmation();
  const { data, error } = await supabase.auth.signUp(credentials);
  if (error) throw error;
  if (data.user?.identities?.length === 0) {
    throw new Error('An account with this email already exists. Please sign in instead.');
  }
  if (!data.user) {
    throw new Error('Account registration could not be confirmed. Please try again.');
  }
  if (data.session) {
    // Defense against a provider configuration change between settings and signup.
    // Provider-side email confirmation remains the actual security boundary.
    await supabase.auth.signOut({ scope: 'local' });
    throw new Error('Email verification was not required by the sign-up service. Registration cannot continue. Please contact support.');
  }
  return data.user;
}
