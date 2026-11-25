import { useEffect, useState } from "react";
import { supabase } from "@/lib/supabase";
import { apiRequest, getAuthHeaders, ApiError } from "@/lib/queryClient";
import { parentVerificationSession } from "@/lib/parentVerificationSession";
import { forgetMobileScreen } from "@/lib/mobileScreenResume";
import { Link, useLocation } from "wouter";
import { PARENT_CODE_DIGITS } from "@shared/highSchoolParentCodePolicy";
import "@/components/onboarding-auth-light.css";

const API = "/api/high-school/parent-verification";
type Purpose = "parent_action" | "password_change";
function friendlyError(error: unknown) {
  const code = error instanceof ApiError ? error.data?.code : (error as { code?: string })?.code;
  const messages: Record<string, string> = {
    CODE_RATE_LIMIT: "Too many requests. Wait before requesting or checking another code.",
    INVALID_OR_EXPIRED_CODE: "That code is incorrect, expired, or already used. Check the email or request a new code.",
    INVALID_CODE: "Enter the four-digit code from the parent's email.",
    INVALID_SESSION: "This session has ended. Sign in again before requesting a code.",
    INVALID_PASSWORD: "Use 12 or more characters with uppercase, lowercase, a number and a symbol. Keep it within 72 UTF-8 bytes.",
    PASSWORD_MUST_DIFFER: "Choose a password different from the current shared password.",
    PASSWORD_VERIFICATION_REQUIRED: "A fresh password-change code is required. Request another code.",
    FAMILY_NOT_ENROLLED: "This account has not started family setup.",
  };
  if (code && messages[code]) return messages[code];
  return "Verification is unavailable. No parent access or password change was approved. Try again later.";
}
export default function ParentVerification({ authenticated = true, enrolled = true, verified = false, unavailable = false, initialPurpose = "parent_action" }: {
  authenticated?: boolean; enrolled?: boolean; verified?: boolean; unavailable?: boolean; initialPurpose?: Purpose;
}) {
  const [, navigate] = useLocation();
  const [leaving, setLeaving] = useState(false);
  const [purpose, setPurpose] = useState<Purpose>(initialPurpose);
  const [challenge, setChallenge] = useState<string>();
  const [code, setCode] = useState("");
  const [passwordGrant, setPasswordGrant] = useState<{ value: string; until: number }>();
  const [password, setPassword] = useState("");
  const [confirm, setConfirm] = useState("");
  const [busy, setBusy] = useState(false);
  const [message, setMessage] = useState("");
  const [error, setError] = useState("");
  const [resendAt, setResendAt] = useState(0);
  const [tick, setTick] = useState(Date.now());
  const [finished, setFinished] = useState(false);
  const [unlocked, setUnlocked] = useState(false);
  useEffect(() => {
    const timer = window.setInterval(() => setTick(Date.now()), 1000);
    return () => window.clearInterval(timer);
  }, []);
  useEffect(() => {
    if (passwordGrant && passwordGrant.until <= tick) {
      setPasswordGrant(undefined); setPassword(""); setConfirm("");
      setError("Password approval expired. Request and verify a new password-change code.");
    }
  }, [tick, passwordGrant]);
  const run = async (fn: () => Promise<void>) => {
    setBusy(true); setError(""); setMessage("");
    try { await fn(); } catch (error) { setError(friendlyError(error)); }
    finally { setBusy(false); }
  };
  const request = () => run(async () => {
    const response = await apiRequest("POST", `${API}/challenge`, { purpose });
    const result = await response.json();
    setChallenge(result.challengeId); setCode(""); setPasswordGrant(undefined);
    setResendAt(Date.now() + 60_000);
    setMessage("Code requested. Check the parent's registered email. It expires in two minutes.");
  });
  const verify = () => run(async () => {
    const result = await (await apiRequest("POST", `${API}/verify`, { challengeId: challenge, code, rememberDevice: purpose === "parent_action" })).json();
    setCode(""); setChallenge(undefined);
    if (result.purpose === "password_change") {
      setPasswordGrant({ value: result.verificationToken, until: Date.now() + result.expiresInSeconds * 1000 });
      setMessage("Email verified. Choose the new shared password within two minutes.");
    } else {
      const { data: { session } } = await supabase.auth.getSession();
      if (!session) throw { code: "INVALID_SESSION" };
      let persisted = false;
      if (result.remembered) persisted = parentVerificationSession.remember(session.access_token, result.deviceId, result.expiresInSeconds);
      else parentVerificationSession.save(session.access_token, result.verificationToken, result.expiresInSeconds);
      setUnlocked(true);
      setMessage(result.remembered
        ? persisted
          ? "This parent device is verified for 30 days. You can return to manage your children without another code. Signing out or locking parent controls ends this approval."
          : "Parent controls are unlocked while this app stays open, but this browser blocked saved device information. Allow site storage to remember this parent device for 30 days."
        : "Parent controls are unlocked for this session for ten minutes.");
    }
  });
  const changePassword = () => run(async () => {
    if (password !== confirm) { setError("The passwords do not match."); return; }
    if (!passwordGrant || passwordGrant.until <= Date.now()) throw { code: "PASSWORD_VERIFICATION_REQUIRED" };
    const response = await fetch(`${import.meta.env.VITE_API_BASE_URL || ""}${API}/password`, {
      method: "POST", redirect: "error",
      headers: { ...await getAuthHeaders(), "Content-Type": "application/json", "x-parent-verification": passwordGrant.value },
      body: JSON.stringify({ password }),
    });
    const result = await response.json();
    if (!response.ok) {
      if ([401, 403].includes(response.status)) setPasswordGrant(undefined);
      throw { code: result.code };
    }
    setPassword(""); setConfirm(""); setPasswordGrant(undefined);
    parentVerificationSession.clear();
    await supabase.auth.signOut({ scope: "local" }).catch(() => {});
    setFinished(true);
  });
  const lock = () => run(async () => {
    try {
      await apiRequest("POST", `${API}/revoke`, {});
      setMessage("Parent controls are locked for this session.");
    } finally {
      parentVerificationSession.clear();
      setUnlocked(false);
      setPasswordGrant(undefined); setChallenge(undefined); setCode(""); setPassword(""); setConfirm("");
    }
  });
  const selectPurpose = (next: Purpose) => {
    setPurpose(next); setChallenge(undefined); setCode(""); setPasswordGrant(undefined);
    setPassword(""); setConfirm(""); setError(""); setMessage("");
  };
  const goHome = () => {
    if (leaving) return;
    setLeaving(true);
    // Navigation never ends the login or changes parent-device authority.
    try { forgetMobileScreen(window.localStorage); } catch { /* Storage can be blocked. */ }
    navigate("/", { replace: true });
  };
  const working = busy || leaving;
  const button = "rounded-lg border px-4 py-3 text-sm font-medium disabled:opacity-50";
  const input = "w-full rounded-lg border bg-background px-3 py-3";
  return <main className="onboarding-light parent-verification-light min-h-screen bg-background text-foreground flex items-center justify-center px-4 py-10">
    <section className="parent-verification-card w-full max-w-md rounded-2xl border bg-card p-6 shadow-lg space-y-5" aria-labelledby="parent-verification-title">
      <nav aria-label="Parent verification navigation" className="space-y-2">
        <button type="button" className={`${button} w-full text-center`} onClick={() => void goHome()} disabled={leaving}>
          {leaving ? "Returning Home…" : "Back to Home"}
        </button>
      </nav>
      <p className="text-xs font-semibold uppercase tracking-wider text-amber-600">Parent verification</p>
      <h1 id="parent-verification-title" className="text-2xl font-semibold">Verify you're the parent</h1>
      <p className="text-sm text-muted-foreground">Verify this parent device once to manage your children for 30 days, including after reopening the app. New devices and password changes need a code sent to the parent's registered email.</p>
      {finished ? <div role="status" className="space-y-3"><p>The shared password was changed. All previous sessions were ended.</p><a href="/login" className={button}>Sign in again</a></div>
        : !authenticated ? <p>Sign in with the shared family login first. <a className="underline" href="/login">Go to sign-in</a>.</p>
        : unavailable ? <p role="alert">The verification service is unavailable. Parent controls remain locked. Refresh to retry.</p>
        : !enrolled ? <p role="status">This account has not started family setup. Existing adult accounts are unchanged.</p>
        : <>
          <div className="grid grid-cols-2 gap-2" aria-label="Verification purpose">
            <button className={button} disabled={working} aria-pressed={purpose === "parent_action"} onClick={() => selectPurpose("parent_action")}>Parent controls</button>
            <button className={button} disabled={working} aria-pressed={purpose === "password_change"} onClick={() => selectPurpose("password_change")}>Change password</button>
          </div>
          <p className="text-xs text-muted-foreground">{purpose === "password_change" ? "Password changes always require a separate, one-use email code." : "Remember this parent-only device for 30 days. Shared sign-in alone never unlocks parent controls. Sign out or lock parent controls to end its approval."}</p>
          {!passwordGrant && <button className={`${button} w-full bg-primary text-primary-foreground`} onClick={request}
            disabled={working || tick < resendAt}>{tick < resendAt ? `Request another code in ${Math.ceil((resendAt - tick) / 1000)}s` : "Email a verification code"}</button>}
          {challenge && <form className="space-y-3" onSubmit={event => { event.preventDefault(); void verify(); }}>
            <label className="block text-sm" htmlFor="parent-email-code">Four-digit email code</label>
            <input id="parent-email-code" className={input} value={code} onChange={event => setCode(event.target.value.replace(/\D/g, "").slice(0, PARENT_CODE_DIGITS))}
              inputMode="numeric" autoComplete="one-time-code" pattern="[0-9]{4}" maxLength={PARENT_CODE_DIGITS} required disabled={working} />
            <p className="text-xs text-muted-foreground">After three failed guesses, verification is locked across all sessions and code requests until the 15-minute failure window clears.</p>
            <button className={`${button} w-full`} type="submit" disabled={working || code.length !== PARENT_CODE_DIGITS}>Verify email code</button>
          </form>}
          {passwordGrant && <form className="space-y-3" onSubmit={event => { event.preventDefault(); void changePassword(); }}>
            <label className="block text-sm" htmlFor="new-shared-password">New shared password</label>
            <input id="new-shared-password" className={input} type="password" autoComplete="new-password" minLength={12} value={password} required disabled={working} onChange={event => setPassword(event.target.value)} />
            <label className="block text-sm" htmlFor="confirm-shared-password">Confirm shared password</label>
            <input id="confirm-shared-password" className={input} type="password" autoComplete="new-password" minLength={12} value={confirm} required disabled={working} onChange={event => setConfirm(event.target.value)} />
            <p className="text-xs text-muted-foreground">Use at least 12 characters, uppercase, lowercase, a number and a symbol. Changing it signs out every device.</p>
            <button className={`${button} w-full bg-primary text-primary-foreground`} disabled={working} type="submit">Change shared password</button>
          </form>}
          <button className={`${button} w-full`} disabled={working} onClick={lock}>Lock parent controls</button>
          {unlocked && <Link href="/" className={`${button} block text-center`}>Continue to the app</Link>}
        </>}
      {message && <p role="status" className="text-sm">{message}</p>}
      {error && <p role="alert" className="text-sm text-destructive">{error}</p>}
      <p className="text-xs text-muted-foreground">No child profiles or production family accounts are enabled by this DEV test.</p>
    </section>
  </main>;
}
