// src/AuthPortal.jsx
import React, { useEffect } from 'react';
import { Auth, ThemeSupa } from '@supabase/auth-ui-react';
import { supabase } from './supabaseClient';
import { useNavigate } from 'react-router-dom';

export default function AuthPortal({ isOpen, onClose }) {
  const navigate = useNavigate();

  // If the modal isn't open, don't render anything
  if (!isOpen) return null;

  // Redirect to /app after successful login
  useEffect(() => {
    const {
      data: { subscription },
    } = supabase.auth.onAuthStateChange((event) => {
      if (event === 'SIGNED_IN') {
        navigate('/app');
        if (onClose) onClose();
      }
    });

    return () => subscription.unsubscribe();
  }, [navigate, onClose]);

  // Render the Supabase Auth UI
  return (
    <div className="fixed inset-0 bg-black bg-opacity-50 flex items-center justify-center z-50">
      <div className="bg-white rounded-xl shadow-2xl p-8 w-full max-w-md relative">
        <button
          onClick={onClose}
          className="absolute top-3 right-3 text-gray-500 hover:text-gray-700"
        >
          ✕
        </button>
        <h2 className="text-xl font-semibold text-center mb-4">
          Sign In / Create Account
        </h2>

        <Auth
          supabaseClient={supabase}
          appearance={{
            theme: ThemeSupa,
            variables: {
              default: {
                colors: {
                  brand: '#e11d48',
                  brandAccent: '#be123c',
                },
              },
            },
          }}
          providers={['google']}
          redirectTo={window.location.origin + '/app'}
        />
      </div>
    </div>
  );
}
