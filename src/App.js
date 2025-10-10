import React, { useEffect, useState } from "react";
import {
  BrowserRouter as Router,
  Routes,
  Route,
  Navigate,
} from "react-router-dom";
import MobileHomeParkModel from "./MobileHomeParkModel";
import LandingPage from "./LandingPage";
import SharedReport from "./SharedReport";
import supabase, { isSupabaseConfigured } from "./supabaseClient";
import { ToastProvider } from "./components/ToastProvider";

function ProtectedRoute({ children }) {
  const [session, setSession] = useState(null);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    if (!isSupabaseConfigured || !supabase) return;

    supabase.auth.getSession().then(({ data }) => {
      setSession(data.session);
      setLoading(false);
    });

    const {
      data: { subscription },
    } = supabase.auth.onAuthStateChange((_event, session) => {
      setSession(session);
      setLoading(false);
    });

    return () => subscription.unsubscribe();
  }, []);

  if (!isSupabaseConfigured || !supabase) {
    return <div>Authentication not configured.</div>;
  }

  if (loading) {
    return (
      <div className="flex h-screen items-center justify-center bg-slate-50">
        <div className="text-sm font-medium text-slate-500">
          Checking your access...
        </div>
      </div>
    );
  }

  if (!session) {
    return <Navigate to="/" replace />;
  }

  return children;
}

export default function App() {
  const handleTryItNow = () => {
    window.location.href = "/app";
  };

  return (
    <ToastProvider>
      <Router>
        <Routes>
          {/* Landing page now receives Supabase client */}
          <Route
            path="/"
            element={<LandingPage onTryItNow={handleTryItNow} supabase={supabase} />}
          />

          {/* Auth-protected app */}
          <Route
            path="/app"
            element={
              <ProtectedRoute>
                <MobileHomeParkModel />
              </ProtectedRoute>
            }
          />

          {/* Public shared report route */}
          <Route path="/report/:id" element={<SharedReport />} />

          {/* Catch-all redirect */}
          <Route path="*" element={<Navigate to="/" replace />} />
        </Routes>
      </Router>
    </ToastProvider>
  );
}
