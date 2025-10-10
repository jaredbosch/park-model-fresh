import React, { useState } from 'react';
import { ArrowRight, LogIn, Download } from 'lucide-react';

const LandingPage = ({ onTryItNow, supabase }) => {

  const [showAuthModal, setShowAuthModal] = useState(false);
  const [authMode, setAuthMode] = useState('sign-in');
  const [email, setEmail] = useState('');
  const [password, setPassword] = useState('');
  const [authLoading, setAuthLoading] = useState(false);
  const [authError, setAuthError] = useState('');
  const [authMessage, setAuthMessage] = useState('');

  const openAuthModal = () => {
    if (!supabase) {
      alert('Authentication is not configured yet. Please contact support.');
      return;
    }

    setShowAuthModal(true);
  };

  const closeAuthModal = () => {
    setShowAuthModal(false);
    setAuthError('');
    setAuthMessage('');
    setEmail('');
    setPassword('');
    setAuthMode('sign-in');
  };

  const handleAuthSubmit = async (event) => {
    event.preventDefault();

    if (!supabase) {
      return;
    }

    setAuthLoading(true);
    setAuthError('');
    setAuthMessage('');

    try {
      if (authMode === 'sign-in') {
        const { error } = await supabase.auth.signInWithPassword({ email, password });
        if (error) {
          throw error;
        }
        setAuthMessage('Welcome back! You are now signed in.');
      } else {
        const { error } = await supabase.auth.signUp({ email, password });
        if (error) {
          throw error;
        }
        setAuthMessage('Account created. Please check your email for confirmation.');
      }
    } catch (error) {
      setAuthError(error.message);
    } finally {
      setAuthLoading(false);
    }
  };

  return (
    <div className="min-h-screen bg-slate-950 text-slate-50">
      <header className="relative overflow-hidden">
        <div className="absolute inset-0 bg-gradient-to-br from-blue-500/20 via-slate-950 to-slate-950" aria-hidden="true" />
        <div className="relative mx-auto flex max-w-6xl flex-col gap-16 px-6 pb-20 pt-24 md:flex-row md:items-center md:pb-32">
          <div className="flex-1 space-y-8">
            <div className="inline-flex items-center gap-2 rounded-full bg-blue-500/10 px-4 py-1 text-sm font-semibold text-blue-200">
              <span className="h-2 w-2 rounded-full bg-blue-400" aria-hidden="true" />
              Precision underwriting for modern park operators
            </div>
            <h1 className="text-4xl font-semibold tracking-tight text-white sm:text-5xl md:text-6xl">
              Build high-conviction mobile home park models in minutes
            </h1>
            <p className="max-w-2xl text-lg text-slate-300 md:text-xl">
              Analyze occupancy, cash flow, financing, and disposition scenarios with a guided workflow. Reports are saved securely to your account for easy sharing with partners and investors.
            </p>
            <div className="flex flex-col gap-4 sm:flex-row">
              <button
                type="button"
                onClick={onTryItNow}
                className="inline-flex items-center justify-center gap-2 rounded-full bg-blue-500 px-6 py-3 text-base font-semibold text-white shadow-lg shadow-blue-500/30 transition hover:bg-blue-400 focus-visible:outline focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-blue-300"
              >
                Try It Now
                <ArrowRight className="h-4 w-4" aria-hidden="true" />
              </button>
              <button
                type="button"
                onClick={openAuthModal}
                className="inline-flex items-center justify-center gap-2 rounded-full border border-slate-700 px-6 py-3 text-base font-semibold text-white transition hover:border-slate-500 hover:bg-slate-900 focus-visible:outline focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-blue-300"
              >
                <LogIn className="h-4 w-4" aria-hidden="true" />
                Sign In / Create Account
              </button>
              <a
                href="/sample-report.html"
                download
                className="inline-flex items-center justify-center gap-2 rounded-full border border-transparent bg-slate-800 px-6 py-3 text-base font-semibold text-white transition hover:bg-slate-700 focus-visible:outline focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-blue-300"
              >
                <Download className="h-4 w-4" aria-hidden="true" />
                Download Sample Report
              </a>
            </div>
            <div className="grid grid-cols-2 gap-8 rounded-3xl border border-slate-800 bg-slate-900/60 p-6 text-sm text-slate-300 sm:text-base md:grid-cols-4">
              <div>
                <p className="text-lg font-semibold text-white">65 lots</p>
                <p>Flexible rent roll modeling with bulk edits.</p>
              </div>
              <div>
                <p className="text-lg font-semibold text-white">Fast underwriting</p>
                <p>Automated pro forma growth and financing projections.</p>
              </div>
              <div>
                <p className="text-lg font-semibold text-white">Report ready</p>
                <p>Export polished investor-ready summaries instantly.</p>
              </div>
              <div>
                <p className="text-lg font-semibold text-white">Secure storage</p>
                <p>Keep your scenarios organized and saved for future updates.</p>
              </div>
            </div>
          </div>
          <div className="relative flex-1">
            <div className="relative mx-auto max-w-md rounded-3xl border border-slate-800 bg-slate-900/80 p-4 shadow-2xl shadow-blue-500/20">
              <img
                src="/images/preview-dashboard.png"
                alt="Preview of the dashboard interface"
                className="w-full rounded-2xl border border-slate-800 object-cover"
                loading="lazy"
              />
              <img
                src="/images/preview-report.png"
                alt="Preview of the downloadable report"
                className="-mt-16 w-4/5 rounded-2xl border border-slate-800 object-cover shadow-2xl shadow-black/40"
                loading="lazy"
              />
            </div>
          </div>
        </div>
      </header>

      <main className="mx-auto max-w-6xl space-y-24 px-6 pb-24">
        <section className="grid gap-12 md:grid-cols-2 md:items-center">
          <div className="space-y-6">
            <h2 className="text-3xl font-semibold text-white">Bring clarity to every assumption</h2>
            <p className="text-lg text-slate-300">
              Quickly capture rent roll inputs, additional income, and operating expenses. Toggle between actual and pro-forma assumptions while keeping a transparent audit trail of every update you make.
            </p>
            <ul className="space-y-3 text-base text-slate-300">
              <li className="flex items-start gap-3"><span className="mt-1 inline-block h-2 w-2 rounded-full bg-blue-400" aria-hidden="true" /> Bulk update occupancy and rents with intelligent safeguards.</li>
              <li className="flex items-start gap-3"><span className="mt-1 inline-block h-2 w-2 rounded-full bg-blue-400" aria-hidden="true" /> Model financing with amortization schedules and refinance scenarios.</li>
              <li className="flex items-start gap-3"><span className="mt-1 inline-block h-2 w-2 rounded-full bg-blue-400" aria-hidden="true" /> Present investor-grade summaries with embedded charts and context.</li>
            </ul>
          </div>
          <div className="rounded-3xl border border-slate-800 bg-slate-900/60 p-8 shadow-2xl shadow-blue-500/10">
            <h3 className="text-2xl font-semibold text-white">All-in-one park underwriting workspace</h3>
            <p className="mt-4 text-slate-300">
              From initial diligence to lender-ready packages, the platform keeps your financial modeling process streamlined and auditable.
            </p>
            <div className="mt-8 grid gap-6 sm:grid-cols-2">
              <div className="rounded-2xl border border-slate-800 bg-slate-900/70 p-4">
                <p className="text-lg font-semibold text-white">Dynamic rent roll</p>
                <p className="text-sm text-slate-400">Adjust occupancy, rent growth, and concessions in seconds.</p>
              </div>
              <div className="rounded-2xl border border-slate-800 bg-slate-900/70 p-4">
                <p className="text-lg font-semibold text-white">Scenario tracking</p>
                <p className="text-sm text-slate-400">Save multiple what-if analyses for future acquisitions.</p>
              </div>
              <div className="rounded-2xl border border-slate-800 bg-slate-900/70 p-4">
                <p className="text-lg font-semibold text-white">Shareable reports</p>
                <p className="text-sm text-slate-400">Generate investor-ready summaries with a single click.</p>
              </div>
              <div className="rounded-2xl border border-slate-800 bg-slate-900/70 p-4">
                <p className="text-lg font-semibold text-white">Secure retention</p>
                <p className="text-sm text-slate-400">Saved securely to your account for consistent record keeping.</p>
              </div>
            </div>
          </div>
        </section>

        <section className="rounded-3xl border border-slate-800 bg-slate-900/50 p-10 text-center">
          <h2 className="text-3xl font-semibold text-white">Ready to see your next acquisition clearly?</h2>
          <p className="mt-4 text-lg text-slate-300">
            Launch the modeling workspace, explore the guided underwriting flow, and deliver professional-grade reports today.
          </p>
          <div className="mt-8 flex flex-col items-center justify-center gap-4 sm:flex-row">
            <button
              type="button"
              onClick={onTryItNow}
              className="inline-flex items-center justify-center gap-2 rounded-full bg-blue-500 px-6 py-3 text-base font-semibold text-white shadow-lg shadow-blue-500/30 transition hover:bg-blue-400 focus-visible:outline focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-blue-300"
            >
              Try It Now
              <ArrowRight className="h-4 w-4" aria-hidden="true" />
            </button>
            <button
              type="button"
              onClick={openAuthModal}
              className="inline-flex items-center justify-center gap-2 rounded-full border border-slate-700 px-6 py-3 text-base font-semibold text-white transition hover:border-slate-500 hover:bg-slate-900 focus-visible:outline focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-blue-300"
            >
              <LogIn className="h-4 w-4" aria-hidden="true" />
              Sign In / Create Account
            </button>
          </div>
        </section>
      </main>

      <footer className="border-t border-slate-800 bg-slate-950/80 py-8">
        <div className="mx-auto flex max-w-6xl flex-col items-center justify-between gap-4 px-6 text-sm text-slate-500 sm:flex-row">
          <p>&copy; {new Date().getFullYear()} Park Model. All rights reserved.</p>
          <div className="flex gap-6">
            <a href="mailto:support@parkmodel.com" className="transition hover:text-slate-300">Contact</a>
            <a href="/sample-report.html" className="transition hover:text-slate-300">Sample Report</a>
            <a href="https://parkmodel.com/privacy" className="transition hover:text-slate-300">Privacy</a>
          </div>
        </div>
      </footer>

      {showAuthModal && (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-slate-950/80 px-4 py-6">
          <div className="relative w-full max-w-md rounded-3xl border border-slate-800 bg-slate-900 p-8 text-slate-50 shadow-2xl shadow-blue-500/20">
            <button
              type="button"
              onClick={closeAuthModal}
              className="absolute right-4 top-4 text-slate-400 transition hover:text-slate-200"
              aria-label="Close authentication"
            >
              ×
            </button>
            <div className="space-y-2">
              <h3 className="text-2xl font-semibold text-white">{authMode === 'sign-in' ? 'Sign in to continue' : 'Create your account'}</h3>
              <p className="text-sm text-slate-400">Saved securely to your account.</p>
            </div>
            {supabase ? (
              <form className="mt-6 space-y-4" onSubmit={handleAuthSubmit}>
                <div className="space-y-2">
                  <label className="text-sm font-medium text-slate-200" htmlFor="auth-email">
                    Email
                  </label>
                  <input
                    id="auth-email"
                    type="email"
                    required
                    value={email}
                    onChange={(event) => setEmail(event.target.value)}
                    className="w-full rounded-lg border border-slate-700 bg-slate-950 px-3 py-2 text-sm text-white placeholder:text-slate-500 focus:border-blue-400 focus:outline-none focus:ring-2 focus:ring-blue-400/30"
                    placeholder="you@example.com"
                  />
                </div>
                <div className="space-y-2">
                  <label className="text-sm font-medium text-slate-200" htmlFor="auth-password">
                    Password
                  </label>
                  <input
                    id="auth-password"
                    type="password"
                    required
                    value={password}
                    onChange={(event) => setPassword(event.target.value)}
                    className="w-full rounded-lg border border-slate-700 bg-slate-950 px-3 py-2 text-sm text-white placeholder:text-slate-500 focus:border-blue-400 focus:outline-none focus:ring-2 focus:ring-blue-400/30"
                    placeholder="••••••••"
                  />
                </div>
                {authError && (
                  <div className="rounded-lg border border-red-400/50 bg-red-500/10 px-3 py-2 text-sm text-red-200">
                    {authError}
                  </div>
                )}
                {authMessage && (
                  <div className="rounded-lg border border-green-400/50 bg-green-500/10 px-3 py-2 text-sm text-green-200">
                    {authMessage}
                  </div>
                )}
                <button
                  type="submit"
                  disabled={authLoading}
                  className="inline-flex w-full items-center justify-center gap-2 rounded-full bg-blue-500 px-6 py-3 text-base font-semibold text-white shadow-lg shadow-blue-500/30 transition hover:bg-blue-400 focus-visible:outline focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-blue-300 disabled:cursor-not-allowed disabled:opacity-70"
                >
                  {authLoading ? 'Please wait…' : authMode === 'sign-in' ? 'Sign In' : 'Create Account'}
                </button>
              </form>
            ) : (
              <div className="mt-6 rounded-2xl border border-yellow-500/40 bg-yellow-500/10 p-4 text-sm text-yellow-200">
                Authentication has not been configured. Please set the required environment variables.
              </div>
            )}
            <div className="mt-4 text-center text-sm text-slate-400">
              {authMode === 'sign-in' ? (
                <button
                  type="button"
                  onClick={() => {
                    setAuthMode('sign-up');
                    setAuthError('');
                    setAuthMessage('');
                  }}
                  className="font-medium text-blue-300 transition hover:text-blue-200"
                >
                  Need an account? Create one now.
                </button>
              ) : (
                <button
                  type="button"
                  onClick={() => {
                    setAuthMode('sign-in');
                    setAuthError('');
                    setAuthMessage('');
                  }}
                  className="font-medium text-blue-300 transition hover:text-blue-200"
                >
                  Already registered? Sign in instead.
                </button>
              )}
            </div>
          </div>
        </div>
      )}
    </div>
  );
};

export default LandingPage;
