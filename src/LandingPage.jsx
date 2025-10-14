import React, { useCallback, useEffect, useMemo, useState } from 'react';
import { useNavigate } from 'react-router-dom';
import LandingHero from './components/LandingHero';
import AuthPortal from './components/AuthPortal';
import { supabase } from './lib/supabaseClient';

const isSupabaseConfigured = Boolean(supabase);

const logUserActivity = async ({ action, metadata, userId }) => {
  if (!supabase || !isSupabaseConfigured) {
    return;
  }

  try {
    await supabase.from('user_activity').insert([
      {
        action,
        user_id: userId || null,
        metadata: metadata ? JSON.stringify(metadata) : null,
      },
    ]);
  } catch (err) {
    console.debug('Unable to record user activity', action, err?.message || err);
  }
};

const LandingPage = () => {
  const navigate = useNavigate();
  const [showAuth, setShowAuth] = useState(false);
  const [session, setSession] = useState(null);
  const [initialised, setInitialised] = useState(!isSupabaseConfigured);

  const handleSession = useCallback(
    (nextSession) => {
      setSession(nextSession);
      if (nextSession?.user) {
        logUserActivity({ action: 'login_success', userId: nextSession.user.id }).catch(() => {});
        navigate('/model', { replace: true });
      }
    },
    [navigate]
  );

  useEffect(() => {
    if (!isSupabaseConfigured || !supabase) {
      setInitialised(true);
      return;
    }

    let active = true;

    const initialise = async () => {
      try {
        const { data } = await supabase.auth.getSession();
        if (!active) {
          return;
        }
        setSession(data?.session || null);
        if (data?.session?.user) {
          navigate('/model', { replace: true });
        }
      } catch (err) {
        console.error('Error resolving Supabase session:', err);
      } finally {
        if (active) {
          setInitialised(true);
        }
      }
    };

    initialise();

    const { data: listener } = supabase.auth.onAuthStateChange((_event, nextSession) => {
      if (!active) {
        return;
      }
      setSession(nextSession);
      if (nextSession?.user) {
        navigate('/model', { replace: true });
      }
    });

    return () => {
      active = false;
      listener?.subscription?.unsubscribe?.();
    };
  }, [navigate]);

  useEffect(() => {
    logUserActivity({ action: 'visited_landing', userId: session?.user?.id }).catch(() => {});
  }, [session?.user?.id]);

  const handleDownloadSample = useCallback(() => {
    logUserActivity({ action: 'download_sample', userId: session?.user?.id }).catch(() => {});
    window.location.href = '/api/download-sample';
  }, [session?.user?.id]);

  const handleOpenAuth = useCallback(() => {
    if (!isSupabaseConfigured || !supabase) {
      alert('Authentication is unavailable. Configure Supabase to enable sign-in.');
      return;
    }
    setShowAuth(true);
  }, []);

  const closeAuth = useCallback(() => setShowAuth(false), []);

  useEffect(() => {
    const handlePortalOpen = () => handleOpenAuth();
    window.addEventListener('landing-auth-open', handlePortalOpen);
    return () => window.removeEventListener('landing-auth-open', handlePortalOpen);
  }, [handleOpenAuth]);

  const isReady = useMemo(() => initialised || !isSupabaseConfigured, [initialised]);

  if (!isReady) {
    return (
      <div className="flex min-h-screen items-center justify-center bg-slate-50">
        <div className="text-sm font-medium text-slate-500">Loading experience…</div>
      </div>
    );
  }

  return (
    <div className="min-h-screen bg-slate-50">
      <div className="mx-auto flex max-w-6xl flex-col gap-12 px-4 py-16">
        <LandingHero
          onSignIn={handleOpenAuth}
          onDownloadSample={handleDownloadSample}
          onTryNow={handleOpenAuth}
        />

        <section className="grid gap-10 rounded-3xl bg-white p-10 shadow-xl md:grid-cols-[1.2fr_1fr] md:items-center">
          <div className="space-y-4">
            <h2 className="text-3xl font-bold text-blue-900">See the model before you sign in</h2>
            <p className="text-base text-gray-600">
              Explore scenario planning, rent roll automation, tiered rent increases, and professional-grade export tools — all tailored for manufactured housing and RV communities.
            </p>
            <ul className="space-y-2 text-sm text-gray-600">
              <li>• Save unlimited reports tied to your Supabase account</li>
              <li>• Analyze returns with adjustable projections (5, 7, or 10 years)</li>
              <li>• Generate investor-ready HTML reports in one click</li>
            </ul>
            <button
              type="button"
              onClick={handleOpenAuth}
              data-landing-auth-trigger="true"
              className="inline-flex items-center justify-center rounded-lg bg-blue-600 px-5 py-2 text-sm font-semibold text-white transition hover:bg-blue-700"
            >
              Try it now
            </button>
          </div>
          <div className="relative overflow-hidden rounded-2xl border border-blue-100 bg-gradient-to-br from-blue-500/10 via-white to-blue-600/10 p-6 shadow-inner">
            <div className="aspect-video w-full rounded-xl bg-white/80 p-4 shadow">
              <div className="flex h-full items-center justify-center rounded-lg border border-dashed border-blue-200 bg-blue-50 text-center text-sm text-blue-600">
                Your dashboard preview will appear here
              </div>
            </div>
          </div>
        </section>
      </div>

      <AuthPortal isOpen={showAuth} onClose={closeAuth} onAuthenticated={handleSession} />
    </div>
  );
};

export default LandingPage;
