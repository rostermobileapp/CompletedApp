import { useEffect, useState } from "react";
import { Link } from "wouter";
import { CheckCircle, Loader2, XCircle } from "lucide-react";
import rosterLightLogo from "@assets/Light_Mode_Logo_1768322748282.png";

type VerificationStatus = "loading" | "ready" | "confirming" | "verified" | "error";

export default function ReferralApplicationVerification() {
  const [status, setStatus] = useState<VerificationStatus>("loading");
  const [message, setMessage] = useState("");
  const [token, setToken] = useState<string | null>(null);

  useEffect(() => {
    const token = new URLSearchParams(window.location.search).get("token");
    if (!token) {
      setStatus("error");
      setMessage("This verification link is missing its confirmation token.");
      return;
    }

    async function validateApplication(verificationToken: string) {
      try {
        const response = await fetch(`/api/referral/verify?token=${encodeURIComponent(verificationToken)}`);
        const data = await response.json();
        if (!response.ok) {
          setStatus("error");
          setMessage(data.message || "This verification link is invalid or expired.");
          return;
        }

        if (data.verified) {
          setStatus("verified");
          setMessage(data.message || "Your email is verified and your application is ready for review.");
          return;
        }

        setToken(verificationToken);
        setStatus("ready");
        setMessage(data.message || "Confirm your email to submit your application for review.");
      } catch {
        setStatus("error");
        setMessage("We couldn't validate your application right now. Please try opening the link again.");
      }
    }

    validateApplication(token);
  }, []);

  async function confirmApplication() {
    if (!token) return;
    setStatus("confirming");
    try {
      const response = await fetch("/api/referral/verify", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ token }),
      });
      const data = await response.json();
      if (!response.ok) {
        setStatus("error");
        setMessage(data.message || "We couldn't confirm your application.");
        return;
      }

      setStatus("verified");
      setMessage(data.message || "Your email is verified and your application is ready for review.");
    } catch {
      setStatus("error");
      setMessage("We couldn't confirm your application right now. Please try again.");
    }
  }

  return (
    <div className="min-h-screen bg-slate-50 text-gray-900">
      <header className="border-b border-gray-200 bg-white">
        <div className="mx-auto flex max-w-6xl items-center px-6 py-4">
          <Link href="/">
            <img src={rosterLightLogo} alt="Roster" className="h-8 cursor-pointer object-contain" />
          </Link>
        </div>
      </header>

      <main className="mx-auto flex min-h-[calc(100vh-73px)] max-w-xl items-center px-6 py-14">
        <section className="w-full rounded-2xl border border-gray-200 bg-white p-8 text-center shadow-sm md:p-10">
          {(status === "loading" || status === "confirming") && (
            <>
              <Loader2 className="mx-auto mb-5 h-12 w-12 animate-spin text-[#3c82f4]" />
              <h1 className="mb-3 text-2xl font-bold text-gray-900">
                {status === "loading" ? "Checking your link" : "Submitting your application"}
              </h1>
              <p className="text-gray-600">
                {status === "loading" ? "Please wait while we validate your referral application." : "Please wait while we confirm your email."}
              </p>
            </>
          )}

          {status === "ready" && (
            <>
              <CheckCircle className="mx-auto mb-5 h-14 w-14 text-[#3c82f4]" />
              <h1 className="mb-3 text-2xl font-bold text-gray-900">Confirm your application</h1>
              <p className="mx-auto mb-7 max-w-md text-gray-600">{message}</p>
              <button
                type="button"
                onClick={confirmApplication}
                className="inline-flex rounded-xl bg-[#3c82f4] px-5 py-3 text-sm font-semibold text-white transition-colors hover:bg-[#3c82f4]/90"
              >
                Confirm Email &amp; Submit Application
              </button>
            </>
          )}

          {status === "verified" && (
            <>
              <CheckCircle className="mx-auto mb-5 h-14 w-14 text-green-500" />
              <h1 className="mb-3 text-2xl font-bold text-gray-900">Email confirmed</h1>
              <p className="mx-auto mb-7 max-w-md text-gray-600">{message}</p>
              <Link
                href="/referral-program"
                className="inline-flex rounded-xl bg-[#3c82f4] px-5 py-3 text-sm font-semibold text-white transition-colors hover:bg-[#3c82f4]/90"
              >
                Back to Referral Program
              </Link>
            </>
          )}

          {status === "error" && (
            <>
              <XCircle className="mx-auto mb-5 h-14 w-14 text-red-500" />
              <h1 className="mb-3 text-2xl font-bold text-gray-900">We couldn't verify this application</h1>
              <p className="mx-auto mb-7 max-w-md text-gray-600">{message}</p>
              <Link
                href="/referral-program#apply"
                className="inline-flex rounded-xl bg-[#3c82f4] px-5 py-3 text-sm font-semibold text-white transition-colors hover:bg-[#3c82f4]/90"
              >
                Return to application
              </Link>
            </>
          )}
        </section>
      </main>
    </div>
  );
}