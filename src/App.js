import React, { useEffect, useMemo, useState } from 'react';
import {
  BrowserRouter,
  Navigate,
  Route,
  Routes,
  useLocation,
  Link,
} from 'react-router-dom';
import MobileHomeParkModel from './MobileHomeParkModel';
import LandingPage from './LandingPage';
import supabase, { isSupabaseConfigured } from './supabaseClient';

const ProtectedRoute = ({ sessionReady, session, children }) => {
  if (!isSupabaseConfigured || !supabase) {
    return children;
  }

  if (!sessionReady) {
    return (
      <div className="flex min-h-screen items-center justify-center bg-slate-50">
        <div className="text-sm font-medium text-slate-500">Checking your access…</div>
      </div>
    );
  }

  if (!session) {
    return <Navigate to="/landing" replace />;
  }

  return children;
};

const SiteHeader = ({ session }) => {
  const location = useLocation();
  const isLanding = location.pathname === '/landing';

  return (
    <header className="border-b border-slate-200 bg-white/90 backdrop-blur">
      <div className="mx-auto flex max-w-6xl items-center justify-between px-4 py-4">
        <Link to="/" className="text-lg font-semibold text-blue-700">
          Redline CRE
        </Link>
        <nav className="flex items-center gap-4 text-sm font-semibold">
          {!session && !isLanding && (
            <Link
              to="/landing"
              className="rounded-full border border-blue-200 px-4 py-2 text-blue-700 transition hover:border-blue-300 hover:bg-blue-50"
            >
              Sign In
            </Link>
          )}
          {!session && isLanding && (
            <button
              type="button"
              onClick={() => {
                window.dispatchEvent(new Event('landing-auth-open'));
              }}
              className="rounded-full bg-blue-600 px-4 py-2 text-white transition hover:bg-blue-700"
            >
              Try the Model
            </button>
          )}
          {session && (
            <Link
              to="/model"
              className="rounded-full bg-blue-600 px-4 py-2 text-white transition hover:bg-blue-700"
            >
              Open Model
            </Link>
          )}
        </nav>
      </div>
    </header>
  );
};

const AppRoutes = () => {
  const [session, setSession] = useState(null);
  const [ready, setReady] = useState(!isSupabaseConfigured);

  useEffect(() => {
    if (!isSupabaseConfigured || !supabase) {
      setReady(true);
      return undefined;
    }

    let mounted = true;

    const initialise = async () => {
      try {
        const { data } = await supabase.auth.getSession();
        if (!mounted) {
          return;
        }
        setSession(data?.session || null);
      } catch (err) {
        console.error('Error retrieving Supabase session:', err);
      } finally {
        if (mounted) {
          setReady(true);
        }
      }
    };

    initialise();

    const { data: listener } = supabase.auth.onAuthStateChange((_event, nextSession) => {
      if (!mounted) {
        return;
      }
      setSession(nextSession);
    });

    return () => {
      mounted = false;
      listener?.subscription?.unsubscribe?.();
    };
  }, []);

  const landingRedirect = useMemo(() => {
    if (!isSupabaseConfigured || !supabase) {
      return '/model';
    }
    return session ? '/model' : '/landing';
  }, [session]);

  return (
    <>
      <SiteHeader session={session} />
      <Routes>
        <Route path="/landing" element={<LandingPage />} />
        <Route
          path="/model"
          element={
            <ProtectedRoute sessionReady={ready} session={session}>
              <MobileHomeParkModel />
            </ProtectedRoute>
          }
        />
        <Route path="/" element={<Navigate to={landingRedirect} replace />} />
        <Route path="*" element={<Navigate to={landingRedirect} replace />} />
      </Routes>
    </>
  );
};

function App() {
  return (
    <BrowserRouter>
      <AppRoutes />
    </BrowserRouter>
  );
}

export default App;