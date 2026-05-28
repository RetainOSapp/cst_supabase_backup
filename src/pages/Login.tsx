import { useState, useEffect, type FormEvent } from "react";
import { useNavigate } from "react-router-dom";
import { supabase } from "../lib/supabase.ts";

export function Login() {
  const navigate = useNavigate();
  const [email, setEmail] = useState("");
  const [otpSent, setOtpSent] = useState(false);
  const [token, setToken] = useState("");
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    supabase.auth.getSession().then(({ data: { session } }) => {
      if (session) navigate("/", { replace: true });
    });
  }, [navigate]);

  async function handleSendOtp(e: FormEvent) {
    e.preventDefault();
    setLoading(true);
    setError(null);

    const normalizedEmail = email.trim().toLowerCase();

    const { data: prepareData, error: prepareError } = await supabase.functions.invoke(
      "prepare-login",
      {
        body: { email: normalizedEmail },
      },
    );

    if (prepareError) {
      setLoading(false);
      setError(prepareError.message);
      return;
    }
    if (prepareData?.ok === false) {
      setLoading(false);
      setError(prepareData.error ?? "This email is not configured for RetainOS.");
      return;
    }

    const { error: err } = await supabase.auth.signInWithOtp({
      email: normalizedEmail,
      options: { shouldCreateUser: false },
    });
    setLoading(false);

    if (err) {
      setError(err.message);
      return;
    }
    setEmail(normalizedEmail);
    setOtpSent(true);
  }

  async function handleVerify(e: FormEvent) {
    e.preventDefault();
    setLoading(true);
    setError(null);

    const { error: err } = await supabase.auth.verifyOtp({
      email,
      token,
      type: "email",
    });
    setLoading(false);

    if (err) {
      setError(err.message);
      return;
    }
    navigate("/", { replace: true });
  }

  return (
    <div className="min-h-screen bg-slate-100 px-4 py-8 text-slate-900 sm:px-6 lg:px-8">
      <div className="mx-auto flex min-h-[calc(100vh-4rem)] w-full max-w-6xl overflow-hidden rounded-lg border border-slate-200 bg-white shadow-sm">
        <section className="flex flex-1 items-center justify-center px-6 py-10 sm:px-10 lg:px-16">
          <div className="w-full max-w-md">
            <div className="mb-10 flex flex-col items-center text-center">
              <div className="mb-4 flex h-14 w-14 items-center justify-center rounded-full bg-slate-200">
                <div className="h-8 w-8 rounded-full border-[10px] border-slate-500 border-l-transparent" />
              </div>
              <h1 className="text-2xl font-bold tracking-normal text-slate-900">
                RetainOS
              </h1>
              <p className="mt-4 text-sm font-medium text-slate-500">
                Enter your credentials to access your account
              </p>
            </div>

            <div className="rounded-lg bg-slate-50 p-6 sm:p-8">
              {!otpSent ? (
                <form onSubmit={handleSendOtp} className="space-y-5">
                  <div>
                    <label
                      htmlFor="email"
                      className="mb-1.5 block text-sm font-semibold text-slate-800"
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
                      className="block w-full rounded-md border border-slate-300 bg-white px-3 py-2.5 text-sm text-slate-900 shadow-sm placeholder:text-slate-400 focus:border-indigo-500 focus:outline-none focus:ring-2 focus:ring-indigo-500"
                    />
                  </div>
                  <button
                    type="submit"
                    disabled={loading}
                    className="w-full rounded-md bg-slate-700 px-4 py-3 text-sm font-semibold text-white transition-colors hover:bg-slate-800 disabled:cursor-not-allowed disabled:opacity-50"
                  >
                    {loading ? "Sending..." : "Sign In"}
                  </button>
                </form>
              ) : (
                <form onSubmit={handleVerify} className="space-y-5">
                  <p className="rounded-md border border-slate-200 bg-white px-3 py-2 text-sm text-slate-600">
                    We sent a login code to{" "}
                    <strong className="font-semibold text-slate-900">{email}</strong>
                  </p>
                  <div>
                    <label
                      htmlFor="token"
                      className="mb-1.5 block text-sm font-semibold text-slate-800"
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
                      className="block w-full rounded-md border border-slate-300 bg-white px-3 py-2.5 text-center text-sm tracking-widest text-slate-900 shadow-sm placeholder:text-slate-400 focus:border-indigo-500 focus:outline-none focus:ring-2 focus:ring-indigo-500"
                    />
                  </div>
                  <button
                    type="submit"
                    disabled={loading}
                    className="w-full rounded-md bg-slate-700 px-4 py-3 text-sm font-semibold text-white transition-colors hover:bg-slate-800 disabled:cursor-not-allowed disabled:opacity-50"
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
                    className="w-full text-sm font-medium text-slate-500 hover:text-slate-700"
                  >
                    Use a different email
                  </button>
                </form>
              )}

              <div className="my-8 flex items-center gap-4">
                <div className="h-px flex-1 bg-slate-300" />
                <span className="text-sm font-semibold text-slate-500">Or</span>
                <div className="h-px flex-1 bg-slate-300" />
              </div>

              <button
                type="button"
                disabled
                title="Google sign-in is not enabled yet"
                className="flex w-full items-center justify-center gap-3 rounded-md border border-slate-300 bg-white px-4 py-3 text-sm font-semibold text-slate-400"
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

        <section className="hidden flex-1 items-center justify-center bg-slate-200 lg:flex">
          <div className="flex h-40 w-40 items-center justify-center rounded-2xl bg-slate-400 text-slate-100">
            <div className="relative h-20 w-24">
              <div className="absolute left-2 top-8 h-10 w-14 rotate-[-8deg] rounded-sm bg-slate-100/80" />
              <div className="absolute right-0 top-4 h-16 w-16 rotate-45 rounded-sm bg-slate-100/90" />
              <div className="absolute left-3 top-0 h-8 w-8 rounded-full bg-slate-100/90" />
            </div>
          </div>
        </section>
      </div>
    </div>
  );
}
