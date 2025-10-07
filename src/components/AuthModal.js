import React, { useState } from 'react';
import supabase, { isSupabaseConfigured } from '../supabaseClient';

const AuthModal = ({ isOpen, onClose, onAuthSuccess }) => {
  const [mode, setMode] = useState('sign-in');
  const [email, setEmail] = useState('');
  const [password, setPassword] = useState('');
  const [error, setError] = useState('');
  const [loading, setLoading] = useState(false);

  if (!isOpen) {
    return null;
  }

  const resetForm = () => {
    setEmail('');
    setPassword('');
    setError('');
    setMode('sign-in');
  };

  const closeModal = () => {
    resetForm();
    onClose?.();
  };

  const handleSubmit = async (event) => {
    event.preventDefault();

    if (!isSupabaseConfigured || !supabase) {
      setError('Supabase is not configured. Please add your environment variables to enable authentication.');
      return;
    }

    setLoading(true);
    setError('');

    const credentials = { email, password };
    try {
      let response;
      if (mode === 'sign-in') {
        response = await supabase.auth.signInWithPassword(credentials);
      } else {
        response = await supabase.auth.signUp(credentials);
      }

      if (response?.error) {
        setError(response.error.message);
        return;
      }

      if (mode === 'sign-up') {
        setError('Check your email to confirm your account before signing in.');
      } else {
        onAuthSuccess?.();
        closeModal();
      }
    } catch (err) {
      setError(err.message);
    } finally {
      setLoading(false);
    }
  };

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/50">
      <div className="bg-white rounded-lg shadow-xl w-full max-w-md p-6">
        <div className="flex items-center justify-between mb-4">
          <h2 className="text-xl font-semibold text-gray-800">
            {mode === 'sign-in' ? 'Sign in to your account' : 'Create a new account'}
          </h2>
          <button
            type="button"
            className="text-gray-500 hover:text-gray-700"
            onClick={closeModal}
          >
            ×
          </button>
        </div>

        {!isSupabaseConfigured && (
          <div className="mb-4 rounded border border-yellow-300 bg-yellow-50 p-3 text-sm text-yellow-800">
            Supabase credentials are not configured. Add REACT_APP_SUPABASE_URL and
            REACT_APP_SUPABASE_ANON_KEY to enable authentication.
          </div>
        )}

        <form className="space-y-4" onSubmit={handleSubmit}>
          <div>
            <label className="block text-sm font-medium text-gray-700">Email</label>
            <input
              type="email"
              required
              value={email}
              onChange={(e) => setEmail(e.target.value)}
              className="mt-1 w-full rounded border border-gray-300 px-3 py-2 focus:border-blue-500 focus:outline-none"
              placeholder="you@example.com"
            />
          </div>
          <div>
            <label className="block text-sm font-medium text-gray-700">Password</label>
            <input
              type="password"
              required
              value={password}
              onChange={(e) => setPassword(e.target.value)}
              className="mt-1 w-full rounded border border-gray-300 px-3 py-2 focus:border-blue-500 focus:outline-none"
              placeholder="Enter a secure password"
            />
          </div>

          {error && (
            <div className="rounded border border-red-200 bg-red-50 p-3 text-sm text-red-600">{error}</div>
          )}

          <button
            type="submit"
            disabled={loading}
            className="w-full rounded bg-blue-600 px-4 py-2 font-semibold text-white transition hover:bg-blue-700 disabled:opacity-60"
          >
            {loading ? 'Processing...' : mode === 'sign-in' ? 'Sign In' : 'Sign Up'}
          </button>
        </form>

        <div className="mt-4 text-center text-sm text-gray-600">
          {mode === 'sign-in' ? (
            <span>
              Need an account?{' '}
              <button
                type="button"
                className="font-semibold text-blue-600 hover:text-blue-700"
                onClick={() => {
                  setMode('sign-up');
                  setError('');
                }}
              >
                Create one
              </button>
            </span>
          ) : (
            <span>
              Already registered?{' '}
              <button
                type="button"
                className="font-semibold text-blue-600 hover:text-blue-700"
                onClick={() => {
                  setMode('sign-in');
                  setError('');
                }}
              >
                Sign in
              </button>
            </span>
          )}
        </div>
      </div>
    </div>
  );
};

export default AuthModal;
