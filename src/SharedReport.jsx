import React, { useEffect, useState } from 'react';
import { Link, useParams } from 'react-router-dom';
import supabase, { isSupabaseConfigured } from './supabaseClient';

const parseReportState = (rawState) => {
  if (!rawState) {
    return null;
  }

  if (typeof rawState === 'object') {
    return rawState;
  }

  if (typeof rawState === 'string') {
    try {
      return JSON.parse(rawState);
    } catch (error) {
      console.warn('Unable to parse report_state JSON for shared report:', error);
      return null;
    }
  }

  return null;
};

const resolveReportTitle = (report) => {
  if (!report) {
    return 'Mobile Home Park Report';
  }

  const state = parseReportState(report.report_state);

  const candidates = [
    report.report_name,
    state?.reportName,
    state?.propertyInfo?.name,
  ];

  for (const candidate of candidates) {
    if (typeof candidate === 'string') {
      const trimmed = candidate.trim();
      if (trimmed) {
        return trimmed;
      }
    }
  }

  return 'Mobile Home Park Report';
};

const resolveReportHtml = (report) => {
  if (!report) {
    return '';
  }

  return report.report_html || report.html || '';
};

const SharedReport = () => {
  const { id } = useParams();
  const [loading, setLoading] = useState(true);
  const [report, setReport] = useState(null);
  const [error, setError] = useState('');

  useEffect(() => {
    let isMounted = true;

    const fetchReport = async () => {
      if (!isSupabaseConfigured || !supabase) {
        if (isMounted) {
          setError('Reports are unavailable because Supabase is not configured.');
          setLoading(false);
        }
        return;
      }

      if (!id) {
        if (isMounted) {
          setError('Report not found or no longer shared.');
          setLoading(false);
        }
        return;
      }

      setLoading(true);
      setError('');

      try {
        const { data, error: supabaseError } = await supabase
          .from('reports')
          .select('id, report_html, report_name, report_state, created_at')
          .eq('id', id)
          .maybeSingle();

        if (!isMounted) {
          return;
        }

        if (supabaseError || !data) {
          console.error('Unable to load shared report:', supabaseError);
          setError('Report not found or no longer shared.');
          setLoading(false);
          return;
        }

        setReport(data);
      } catch (fetchError) {
        console.error('Unexpected error loading shared report:', fetchError);
        if (isMounted) {
          setError('Report not found or no longer shared.');
        }
      } finally {
        if (isMounted) {
          setLoading(false);
        }
      }
    };

    fetchReport();

    return () => {
      isMounted = false;
    };
  }, [id, isSupabaseConfigured]);

  const reportTitle = resolveReportTitle(report);
  const reportHtml = resolveReportHtml(report);

  return (
    <div className="min-h-screen bg-slate-100 py-10">
      <div className="mx-auto flex max-w-5xl flex-col gap-6 px-4">
        <div className="flex flex-col gap-3 sm:flex-row sm:items-center sm:justify-between">
          <div>
            <h1 className="text-3xl font-bold text-slate-900">{reportTitle}</h1>
            <p className="text-sm text-slate-600">Read-only shared report</p>
          </div>
          <div className="flex flex-wrap items-center gap-2">
            <Link
              to="/"
              className="rounded border border-slate-300 px-4 py-2 text-sm font-semibold text-slate-700 transition hover:bg-slate-200"
            >
              Back to Home
            </Link>
            <Link
              to="/app"
              className="rounded bg-blue-600 px-4 py-2 text-sm font-semibold text-white transition hover:bg-blue-700"
            >
              Open App
            </Link>
          </div>
        </div>

        {loading ? (
          <div className="rounded-lg border border-slate-200 bg-white p-6 text-sm text-slate-600 shadow-sm">
            Loading shared report…
          </div>
        ) : error ? (
          <div className="rounded-lg border border-amber-200 bg-amber-50 p-6 text-sm text-amber-800">
            {error}
          </div>
        ) : reportHtml ? (
          <div className="overflow-hidden rounded-lg border border-slate-200 bg-white shadow-lg">
            <div className="report-html" dangerouslySetInnerHTML={{ __html: reportHtml }} />
          </div>
        ) : (
          <div className="rounded-lg border border-slate-200 bg-white p-6 text-sm text-slate-600 shadow-sm">
            This report does not include HTML content yet.
          </div>
        )}
      </div>
    </div>
  );
};

export default SharedReport;
