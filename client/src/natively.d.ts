/**
 * Ambient type declarations for BuildNatively (Natively.io) native bridge globals.
 * These are injected by the native app shell at runtime and do not exist in the browser.
 *
 * Providers: Apple Sign-In (iOS native only)
 */

interface NativelyAppleSignInResponse {
  status: boolean;
  message?: string;
  email: string;
  subject: string;
  givenname?: string;
  familyname?: string;
  initial?: string;
}

interface NativelyAppleSignInService {
  signin(callback: (resp: NativelyAppleSignInResponse) => void): void;
}

interface Window {
  NativelyAppleSignInService: new () => NativelyAppleSignInService;
}
