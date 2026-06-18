import { useState, useEffect, type FormEvent } from "react";
import { useNavigate } from "react-router-dom";
import { supabase } from "../lib/supabase.ts";
import { ComingSoonModal } from "../components/ComingSoon.tsx";
import { withTimeout } from "../lib/async.ts";

export function Login() {
  const navigate = useNavigate();
  const [email, setEmail] = useState("");
  const [otpSent, setOtpSent] = useState(false);
  const [token, setToken] = useState("");
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [googleComingSoon, setGoogleComingSoon] = useState(false);

  function isAvailabilityError(message: string) {
    return /timed out|schema cache|temporarily unavailable|upstream request timeout/i.test(
      message,
    );
  }

  useEffect(() => {
    withTimeout(supabase.auth.getSession(), 10000, "Auth session check")
      .then(({ data: { session } }) => {
        if (session) navigate("/", { replace: true });
      })
      .catch(() => {
        // Stay on login; the submit action will surface connection errors.
      });
  }, [navigate]);

  async function handleSendOtp(e: FormEvent) {
    e.preventDefault();
    setLoading(true);
    setError(null);

    const normalizedEmail = email.trim().toLowerCase();

    let prepareData: { ok?: boolean; error?: string } | null = null;
    let prepareError: { message: string } | null = null;

    try {
      const result = await withTimeout(
        supabase.functions.invoke("prepare-login", {
          body: { email: normalizedEmail },
        }),
        15000,
        "Login preparation",
      );
      prepareData = result.data as { ok?: boolean; error?: string } | null;
      prepareError = result.error;
    } catch (err) {
      prepareError = {
        message:
          err instanceof Error
            ? err.message
            : "Login preparation failed. Supabase may be temporarily unavailable.",
      };
    }

    if (prepareError && !isAvailabilityError(prepareError.message)) {
      setLoading(false);
      setError(prepareError.message);
      return;
    }
    const usedPrepareFallback = Boolean(prepareError);
    if (prepareData?.ok === false) {
      setLoading(false);
      setError(prepareData.error ?? "This email is not configured for RetainOS.");
      return;
    }

    let err: { message: string } | null = null;
    try {
      const result = await withTimeout(
        supabase.auth.signInWithOtp({
          email: normalizedEmail,
          options: { shouldCreateUser: false },
        }),
        15000,
        "Login code send",
      );
      err = result.error;
    } catch (sendError) {
      err = {
        message:
          sendError instanceof Error
            ? sendError.message
            : "Login code send failed. Supabase may be temporarily unavailable.",
      };
    }
    setLoading(false);

    if (err) {
      setError(err.message);
      return;
    }
    setEmail(normalizedEmail);
    setOtpSent(true);
    if (usedPrepareFallback) {
      setError(
        "Supabase is still recovering, so RetainOS skipped the access pre-check and sent a code only if this email already exists.",
      );
    }
  }

  async function handleVerify(e: FormEvent) {
    e.preventDefault();
    setLoading(true);
    setError(null);

    let err: { message: string } | null = null;
    try {
      const result = await withTimeout(
        supabase.auth.verifyOtp({
          email,
          token,
          type: "email",
        }),
        15000,
        "Login code verification",
      );
      err = result.error;
    } catch (verifyError) {
      err = {
        message:
          verifyError instanceof Error
            ? verifyError.message
            : "Login code verification failed. Supabase may be temporarily unavailable.",
      };
    }
    setLoading(false);

    if (err) {
      setError(err.message);
      return;
    }
    navigate("/", { replace: true });
  }

  return (
    <div className="grid min-h-screen place-items-center bg-[#f1f4f9] px-4 py-8 text-[#162b3e]">
      <div className="grid min-h-[640px] w-full max-w-[1040px] overflow-hidden rounded-2xl border border-[#e4e9f0] bg-white shadow-[0_12px_32px_rgba(16,27,41,.12)] lg:grid-cols-2">
        <section className="flex items-center justify-center px-6 py-10 sm:px-10 lg:px-14">
          <div className="w-full max-w-md">
            <div className="mb-10 flex flex-col items-center text-center">
              <div className="mb-4 grid h-14 w-14 place-items-center rounded-full bg-[#162b3e]">
                <svg width="30" height="30" viewBox="0 0 24 24" fill="none" aria-hidden="true">
                  <path d="M20.5 8.5A9 9 0 1 0 21 13" stroke="#59ABF0" strokeWidth="2.6" strokeLinecap="round" />
                  <path d="M20.8 3.6 21.4 9 16 8.2z" fill="#59ABF0" />
                </svg>
              </div>
              <h1 className="text-[26px] font-bold tracking-normal text-[#162b3e]">
                RetainOS
              </h1>
              <p className="mt-4 text-sm font-medium text-[#586273]">
                Enter your credentials to access your account
              </p>
            </div>

            <div className="rounded-xl border border-[#e4e9f0] bg-[#f7f9fc] p-6 sm:p-7">
              {!otpSent ? (
                <form onSubmit={handleSendOtp} className="space-y-5">
                  <div>
                    <label
                      htmlFor="email"
                      className="mb-1.5 block text-sm font-semibold text-[#162b3e]"
                    >
                      Email address*
                    </label>
                    <input
                      id="email"
                      type="email"
                      required
                      autoFocus
                      value={email}
                      onChange={(e) => setEmail(e.target.value)}
                      placeholder="you@example.com"
                      className="block w-full rounded-lg border border-[#cbd2dc] bg-white px-3 py-2.5 text-sm text-[#162b3e] shadow-sm placeholder:text-[#98a2b3] focus:border-[#59abf0] focus:outline-none focus:ring-2 focus:ring-[#d6eafb]"
                    />
                  </div>
                  <button
                    type="submit"
                    disabled={loading}
                    className="w-full rounded-lg bg-[#162b3e] px-4 py-3 text-sm font-semibold text-white transition-colors hover:bg-[#1e3a52] disabled:cursor-not-allowed disabled:opacity-50"
                  >
                    {loading ? "Sending..." : "Sign In"}
                  </button>
                </form>
              ) : (
                <form onSubmit={handleVerify} className="space-y-5">
                  <p className="rounded-lg border border-[#e4e9f0] bg-white px-3 py-2 text-sm text-[#586273]">
                    We sent a login code to{" "}
                    <strong className="font-semibold text-[#162b3e]">{email}</strong>
                  </p>
                  <div>
                    <label
                      htmlFor="token"
                      className="mb-1.5 block text-sm font-semibold text-[#162b3e]"
                    >
                      Verification code*
                    </label>
                    <input
                      id="token"
                      type="text"
                      required
                      autoFocus
                      value={token}
                      onChange={(e) => setToken(e.target.value)}
                      placeholder="123456"
                      className="block w-full rounded-lg border border-[#cbd2dc] bg-white px-3 py-2.5 text-center text-sm tracking-widest text-[#162b3e] shadow-sm placeholder:text-[#98a2b3] focus:border-[#59abf0] focus:outline-none focus:ring-2 focus:ring-[#d6eafb]"
                    />
                  </div>
                  <button
                    type="submit"
                    disabled={loading}
                    className="w-full rounded-lg bg-[#162b3e] px-4 py-3 text-sm font-semibold text-white transition-colors hover:bg-[#1e3a52] disabled:cursor-not-allowed disabled:opacity-50"
                  >
                    {loading ? "Verifying..." : "Verify & Sign In"}
                  </button>
                  <button
                    type="button"
                    onClick={() => {
                      setOtpSent(false);
                      setToken("");
                      setError(null);
                    }}
                    className="w-full text-sm font-medium text-[#98a2b3] hover:text-[#586273]"
                  >
                    Use a different email
                  </button>
                </form>
              )}

              <div className="my-8 flex items-center gap-4">
                <div className="h-px flex-1 bg-[#cbd2dc]" />
                <span className="text-sm font-semibold text-[#98a2b3]">Or</span>
                <div className="h-px flex-1 bg-[#cbd2dc]" />
              </div>

              <button
                type="button"
                onClick={() => setGoogleComingSoon(true)}
                title="Google sign-in"
                className="flex w-full items-center justify-center gap-3 rounded-lg border border-[#cbd2dc] bg-white px-4 py-3 text-sm font-semibold text-[#586273] transition hover:border-[#59abf0] hover:bg-[#eaf4fe] hover:text-[#162b3e]"
              >
                <span className="text-base font-bold">G</span>
                Continue with Google
              </button>

              {error && (
                <div className="mt-5 rounded-md border border-red-200 bg-red-50 p-3 text-sm text-red-700">
                  {error}
                </div>
              )}
            </div>
          </div>
        </section>

        <section className="relative hidden flex-col items-center justify-center overflow-hidden bg-gradient-to-br from-[#1e3a52] to-[#0e1b29] px-12 text-center lg:flex">
          <div className="absolute -right-24 -top-24 h-[460px] w-[460px] rounded-full border border-[#59abf0]/10" />
          <div className="mb-7 grid h-28 w-28 place-items-center rounded-full bg-[#59abf0]/10">
            <svg width="64" height="64" viewBox="0 0 24 24" fill="none" aria-hidden="true">
              <path d="M20.5 8.5A9 9 0 1 0 21 13" stroke="#59ABF0" strokeWidth="2.4" strokeLinecap="round" />
              <path d="M20.8 3.6 21.4 9 16 8.2z" fill="#59ABF0" />
            </svg>
          </div>
          <h2 className="text-2xl font-bold text-white">Retention, on autopilot</h2>
          <p className="mt-3 max-w-xs text-sm leading-6 text-[#8fa3b8]">
            Track every client through onboarding, renewal, and beyond in one source of truth for your CSM team.
          </p>
        </section>
      </div>
      {googleComingSoon ? (
        <ComingSoonModal
          title="Google Login"
          description="Google Workspace sign-in will be added after the current authentication flow is fully validated."
          onClose={() => setGoogleComingSoon(false)}
        />
      ) : null}
    </div>
  );
}
