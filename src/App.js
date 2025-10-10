import React, { useCallback, useEffect, useState } from 'react';
import LandingPage from './LandingPage';
import MobileHomeParkModel from './MobileHomeParkModel';

const APP_HASH = '#/app';

function App() {
  const [view, setView] = useState(() => (typeof window !== 'undefined' && window.location.hash === APP_HASH ? 'app' : 'landing'));

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
      window.location.hash = '/';
      setView('landing');
    }
  }, []);

  if (view === 'app') {
    return <MobileHomeParkModel onBackToLanding={navigateToLanding} />;
  }

  return <LandingPage onTryItNow={navigateToApp} />;
}

export default App;