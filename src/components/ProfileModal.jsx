import React, { useEffect, useState } from 'react';
import { supabase, isSupabaseConfigured } from '../supabaseClient';
import { useToast } from './ToastProvider';

const DEFAULT_FORM = {
  name: '',
  company: '',
  phone: '',
  email: '',
};

const ProfileModal = ({ open, onClose, onProfileUpdated }) => {
  const { showToast } = useToast();
  const [formValues, setFormValues] = useState({ ...DEFAULT_FORM });
  const [loading, setLoading] = useState(false);
  const [saving, setSaving] = useState(false);

  useEffect(() => {
    if (!open) {
      return;
    }

    if (!isSupabaseConfigured || !supabase) {
      return;
    }

    let isMounted = true;

    const loadProfile = async () => {
      setLoading(true);

      try {
        const {
          data: { user },
        } = await supabase.auth.getUser();

        if (!user) {
          return;
        }

        try {
          await supabase
            .from('profiles')
            .upsert(
              {
                id: user.id,
                email: user.email || user.user_metadata?.email || '',
              },
              { onConflict: 'id' }
            );
        } catch (ensureError) {
          console.warn('Unable to ensure profile exists before loading:', ensureError);
        }

        const { data, error } = await supabase
          .from('profiles')
          .select('name, company, phone, email')
          .eq('id', user.id)
          .single();

        if (error) {
          throw error;
        }

        if (isMounted) {
          const nextValues = {
            name: data?.name || '',
            company: data?.company || '',
            phone: data?.phone || '',
            email: data?.email || user.email || '',
          };
          setFormValues(nextValues);
          onProfileUpdated?.(nextValues);
        }
      } catch (err) {
        console.error('Error loading profile details:', err);
      } finally {
        if (isMounted) {
          setLoading(false);
        }
      }
    };

    loadProfile();

    return () => {
      isMounted = false;
    };
  }, [isSupabaseConfigured, open, onProfileUpdated]);

  const handleChange = (field) => (event) => {
    setFormValues((current) => ({ ...current, [field]: event.target.value }));
  };

  const handleSave = async (event) => {
    event?.preventDefault?.();

    if (!isSupabaseConfigured || !supabase) {
      showToast({ message: '⚠️ Supabase is not configured.', tone: 'error' });
      return;
    }

    setSaving(true);

    try {
      const {
        data: { user },
      } = await supabase.auth.getUser();

      if (!user) {
        showToast({ message: '⚠️ Please sign in again.', tone: 'error' });
        return;
      }

      const payload = {
        id: user.id,
        name: formValues.name || null,
        company: formValues.company || null,
        phone: formValues.phone || null,
        email: formValues.email || user.email || null,
      };

      const { error } = await supabase.from('profiles').upsert(payload);

      if (error) {
        throw error;
      }

      const nextValues = {
        name: payload.name || '',
        company: payload.company || '',
        phone: payload.phone || '',
        email: payload.email || '',
      };

      onProfileUpdated?.(nextValues);
      showToast({ message: '✅ Profile updated successfully.', tone: 'success' });
      onClose?.();
    } catch (err) {
      console.error('Error saving profile:', err);
      showToast({ message: '⚠️ Unable to update profile.', tone: 'error' });
    } finally {
      setSaving(false);
    }
  };

  if (!open) {
    return null;
  }

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/50 px-4 py-6">
      <div className="w-full max-w-lg rounded-lg bg-white p-6 shadow-xl">
        <div className="flex items-center justify-between mb-4">
          <h2 className="text-xl font-semibold text-gray-900">My Profile</h2>
          <button
            type="button"
            onClick={onClose}
            className="text-gray-500 transition hover:text-gray-700"
          >
            ×
          </button>
        </div>

        {!isSupabaseConfigured && (
          <div className="mb-4 rounded border border-yellow-300 bg-yellow-50 p-3 text-sm text-yellow-800">
            Supabase credentials are not configured. Add the required environment variables to enable profile management.
          </div>
        )}

        <form className="space-y-4" onSubmit={handleSave}>
          <div>
            <label className="block text-sm font-medium text-gray-700">Name</label>
            <input
              type="text"
              value={formValues.name}
              onChange={handleChange('name')}
              className="mt-1 w-full rounded border border-gray-300 px-3 py-2 focus:border-blue-500 focus:outline-none"
              placeholder="Jane Doe"
              disabled={loading}
            />
          </div>
          <div>
            <label className="block text-sm font-medium text-gray-700">Company</label>
            <input
              type="text"
              value={formValues.company}
              onChange={handleChange('company')}
              className="mt-1 w-full rounded border border-gray-300 px-3 py-2 focus:border-blue-500 focus:outline-none"
              placeholder="Acme Communities"
              disabled={loading}
            />
          </div>
          <div>
            <label className="block text-sm font-medium text-gray-700">Phone</label>
            <input
              type="tel"
              value={formValues.phone}
              onChange={handleChange('phone')}
              className="mt-1 w-full rounded border border-gray-300 px-3 py-2 focus:border-blue-500 focus:outline-none"
              placeholder="(555) 123-4567"
              disabled={loading}
            />
          </div>
          <div>
            <label className="block text-sm font-medium text-gray-700">Email</label>
            <input
              type="email"
              value={formValues.email}
              onChange={handleChange('email')}
              className="mt-1 w-full rounded border border-gray-300 px-3 py-2 focus:border-blue-500 focus:outline-none"
              placeholder="you@example.com"
              disabled={loading}
            />
          </div>

          <div className="flex items-center justify-end gap-3 pt-2">
            <button
              type="button"
              onClick={onClose}
              className="rounded border border-gray-300 px-4 py-2 text-sm font-medium text-gray-700 transition hover:bg-gray-100"
              disabled={saving}
            >
              Cancel
            </button>
            <button
              type="submit"
              className="rounded bg-blue-600 px-4 py-2 text-sm font-semibold text-white transition hover:bg-blue-700 disabled:opacity-60"
              disabled={saving || loading}
            >
              {saving ? 'Saving…' : 'Save'}
            </button>
          </div>
        </form>
      </div>
    </div>
  );
};

export default ProfileModal;
