import React, { useEffect } from 'react';
import { Auth } from '@supabase/auth-ui-react';
import { ThemeSupa } from '@supabase/auth-ui-shared';
import supabase, { isSupabaseConfigured } from '../supabaseClient';

const AuthPortal = ({ isOpen, onClose, onAuthenticated }) => {
  useEffect(() => {
    if (!isOpen || !supabase) {
      return undefined;
    }

    const { data: listener } = supabase.auth.onAuthStateChange((_event, session) => {
      if (session?.user) {
        onAuthenticated?.(session);
      }
    });

    return () => {
      listener?.subscription?.unsubscribe?.();
    };
  }, [isOpen, onAuthenticated]);

  if (!isOpen) {
    return null;
  }

  if (!isSupabaseConfigured || !supabase) {
    return (
      <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/40 p-4">
        <div className="w-full max-w-md rounded-xl bg-white p-6 shadow-xl">
          <div className="space-y-3 text-center">
            <h2 className="text-xl font-semibold text-gray-800">Authentication Unavailable</h2>
            <p className="text-sm text-gray-600">
              Supabase environment variables are not configured. Add REACT_APP_SUPABASE_URL and
              REACT_APP_SUPABASE_ANON_KEY to enable authentication.
            </p>
            <button
              type="button"
              onClick={onClose}
              className="inline-flex items-center justify-center rounded-lg bg-blue-600 px-4 py-2 text-sm font-semibold text-white transition hover:bg-blue-700"
            >
              Close
            </button>
          </div>
        </div>
      </div>
    );
  }

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/40 p-4">
      <div className="relative w-full max-w-lg overflow-hidden rounded-2xl bg-white shadow-2xl">
        <button
          type="button"
          onClick={onClose}
          className="absolute right-4 top-4 text-gray-400 transition hover:text-gray-600"
          aria-label="Close authentication"
        >
          ×
        </button>
        <div className="border-b border-gray-100 bg-gradient-to-r from-blue-600 to-blue-700 p-6 text-white">
          <h2 className="text-2xl font-semibold">Access your financial model</h2>
          <p className="text-sm text-blue-100">Sign in with Google or email to continue.</p>
        </div>
        <div className="p-6">
          <Auth
            supabaseClient={supabase}
            view="sign_in"
            appearance={{
              theme: ThemeSupa,
              variables: {
                default: {
                  colors: {
                    brand: '#1d4ed8',
                    brandAccent: '#1e40af',
                  },
                  radii: {
                    borderRadiusButton: '0.5rem',
                    inputBorderRadius: '0.5rem',
                  },
                },
              },
            }}
            providers={["google"]}
            onlyThirdPartyProviders={false}
          />
        </div>
      </div>
    </div>
  );
};

export default AuthPortal;
