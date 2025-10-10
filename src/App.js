import React, { useCallback, useEffect, useMemo, useState } from 'react';
import { createClient } from '@supabase/supabase-js';
import LandingPage from './LandingPage';
import MobileHomeParkModel from './MobileHomeParkModel';

const APP_HASH = '#/app';
const LANDING_HASH = '#/';

function App() {
  const [view, setView] = useState(() => (typeof window !== 'undefined' && window.location.hash === APP_HASH ? 'app' : 'landing'));

  const supabase = useMemo(() => {
    const url = process.env.REACT_APP_SUPABASE_URL;
    const anonKey = process.env.REACT_APP_SUPABASE_ANON_KEY;

    if (!url || !anonKey) {
      console.warn('Supabase environment variables are missing. Auth will be disabled.');
      return null;
    }

    return createClient(url, anonKey);
  }, []);

  useEffect(() => {
    if (typeof window === 'undefined') {
      return undefined;
    }

    const handleHashChange = () => {
      setView(window.location.hash === APP_HASH ? 'app' : 'landing');
    };

    window.addEventListener('hashchange', handleHashChange);
    return () => {
      window.removeEventListener('hashchange', handleHashChange);
    };
  }, []);

  const navigateToApp = useCallback(() => {
    if (typeof window !== 'undefined') {
      window.location.hash = APP_HASH;
      setView('app');
    }
  }, []);

  const navigateToLanding = useCallback(() => {
    if (typeof window !== 'undefined') {
      window.location.hash = LANDING_HASH;
      setView('landing');
    }
  }, []);

  useEffect(() => {
    if (!supabase) {
      return undefined;
    }

    let isMounted = true;

    supabase.auth.getSession().then(({ data: { session } }) => {
      if (!isMounted) return;
      if (session) {
        navigateToApp();
      }
    });

    const {
      data: { subscription },
    } = supabase.auth.onAuthStateChange((_event, session) => {
      if (session) {
        navigateToApp();
      } else {
        navigateToLanding();
      }
    });

    return () => {
      isMounted = false;
      subscription.unsubscribe();
    };
  }, [supabase, navigateToApp, navigateToLanding]);

  if (view === 'app') {
    return <MobileHomeParkModel onBackToLanding={navigateToLanding} />;
  }

  return <LandingPage supabase={supabase} onTryItNow={navigateToApp} />;
}

export default App;