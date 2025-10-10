import React from 'react';

const LandingHero = ({ onSignIn, onDownloadSample, onTryNow }) => {
  return (
    <section className="relative overflow-hidden rounded-3xl bg-gradient-to-br from-blue-50 via-white to-blue-100 p-8 shadow-xl">
      <div className="grid gap-8 md:grid-cols-2 md:items-center">
        <div className="space-y-6">
          <div className="space-y-3">
            <span className="inline-flex items-center rounded-full bg-blue-100 px-3 py-1 text-sm font-semibold text-blue-700">
              Powered by Redline CRE
            </span>
            <h1 className="text-4xl font-bold tracking-tight text-blue-900 md:text-5xl">
              Mobile Home Park Financial Model
            </h1>
            <p className="text-lg text-gray-600">
              Build, analyze, and save professional reports instantly for manufactured housing and RV communities.
            </p>
          </div>

          <div className="flex flex-col gap-3 sm:flex-row">
            <button
              type="button"
              onClick={onSignIn}
              data-landing-auth-trigger="true"
              className="inline-flex items-center justify-center rounded-lg bg-blue-600 px-6 py-3 text-base font-semibold text-white shadow transition hover:bg-blue-700"
            >
              Sign In / Create Account
            </button>
            <button
              type="button"
              onClick={onDownloadSample}
              className="inline-flex items-center justify-center rounded-lg border border-blue-200 px-6 py-3 text-base font-semibold text-blue-700 transition hover:border-blue-300 hover:bg-white"
            >
              Download Sample Report
            </button>
          </div>

          <div className="space-y-1 text-sm text-gray-500">
            <p>Built for Manufactured Housing &amp; RV Communities</p>
            <p>Secure, authenticated access with Supabase</p>
          </div>
        </div>

        <div className="relative">
          <div className="rounded-3xl border border-blue-100 bg-white/80 p-6 shadow-inner backdrop-blur">
            <div className="aspect-[4/3] w-full rounded-2xl border border-dashed border-blue-200 bg-blue-50/60">
              <div className="flex h-full w-full flex-col items-center justify-center gap-2 text-center text-blue-500">
                <span className="text-2xl font-semibold">Preview the Model</span>
                <span className="text-sm text-blue-600">Upload your assumptions &amp; download investor-ready reports</span>
                <button
                  type="button"
                  onClick={onTryNow || onSignIn}
                  data-landing-auth-trigger="true"
                  className="mt-4 inline-flex items-center justify-center rounded-full bg-blue-600 px-5 py-2 text-sm font-semibold text-white shadow-sm transition hover:bg-blue-700"
                >
                  Try it now
                </button>
              </div>
            </div>
          </div>
        </div>
      </div>
    </section>
  );
};

export default LandingHero;
