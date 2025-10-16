import React, { useEffect, useMemo, useState } from 'react';
import { Link, useSearchParams } from 'react-router-dom';
import { supabase } from './lib/supabaseClient';

const isSupabaseConfigured = Boolean(supabase);

const formatNumber = (value) => {
  if (!Number.isFinite(value)) {
    return '—';
  }

  return value.toLocaleString('en-US');
};

const formatCurrency = (value) => {
  if (!Number.isFinite(value)) {
    return '—';
  }

  return new Intl.NumberFormat('en-US', {
    style: 'currency',
    currency: 'USD',
    minimumFractionDigits: 2,
    maximumFractionDigits: 2,
  }).format(value);
};

const formatPercent = (value) => {
  if (!Number.isFinite(value)) {
    return '—';
  }

  return `${value.toFixed(2)}%`;
};

const parseRentRoll = (rawValue) => {
  if (!rawValue) {
    return [];
  }

  if (Array.isArray(rawValue)) {
    return rawValue;
  }

  if (typeof rawValue === 'string') {
    try {
      const parsed = JSON.parse(rawValue);
      return Array.isArray(parsed) ? parsed : [];
    } catch (error) {
      console.warn('Unable to parse rent_roll JSON for shared report:', error);
      return [];
    }
  }

  if (typeof rawValue === 'object') {
    if (Array.isArray(rawValue.data)) {
      return rawValue.data;
    }

    if (Array.isArray(rawValue.rows)) {
      return rawValue.rows;
    }

    const values = Object.values(rawValue);
    return Array.isArray(values) ? values : [];
  }

  return [];
};

const extractAverageRent = (rentRoll) => {
  const rentEntries = parseRentRoll(rentRoll);
  const rentValues = [];

  rentEntries.forEach((entry) => {
    if (entry && typeof entry === 'object') {
      Object.entries(entry).forEach(([key, value]) => {
        if (/rent/i.test(key)) {
          const numericValue = Number(value);
          if (Number.isFinite(numericValue)) {
            rentValues.push(numericValue);
          }
        }
      });
      return;
    }

    const numericEntry = Number(entry);
    if (Number.isFinite(numericEntry)) {
      rentValues.push(numericEntry);
    }
  });

  if (rentValues.length === 0) {
    return null;
  }

  const total = rentValues.reduce((sum, value) => sum + value, 0);
  return total / rentValues.length;
};

const parseReportState = (rawValue) => {
  if (!rawValue) {
    return null;
  }

  if (typeof rawValue === 'object') {
    return rawValue;
  }

  if (typeof rawValue === 'string') {
    try {
      return JSON.parse(rawValue);
    } catch (error) {
      console.warn('Unable to parse report_state JSON for shared report:', error);
      return null;
    }
  }

  return null;
};

const normaliseLineItemNote = (value) => {
  if (typeof value === 'string') {
    return value.trim();
  }

  if (typeof value === 'number' && Number.isFinite(value)) {
    return String(value);
  }

  return '';
};

const SharedReport = () => {
  const [searchParams] = useSearchParams();
  const reportId = searchParams.get('id');
  const [loading, setLoading] = useState(true);
  const [report, setReport] = useState(null);
  const [error, setError] = useState('');
  const [showNotes, setShowNotes] = useState(true);

  useEffect(() => {
    let isMounted = true;

    const loadReport = async () => {
      if (!isSupabaseConfigured || !supabase) {
        if (isMounted) {
          setError('Reports are unavailable because Supabase is not configured.');
          setLoading(false);
        }
        return;
      }

      if (!reportId) {
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
          .select(
            [
              'id',
              'report_name',
              'property_name',
              'total_lots',
              'occupied_lots',
              'physical_occupancy',
              'economic_occupancy',
              'purchase_price',
              'cap_rate',
              'noi',
              'rent_roll',
              'report_state',
            ].join(', ')
          )
          .eq('id', reportId)
          .maybeSingle();

        if (!isMounted) {
          return;
        }

        if (supabaseError || !data) {
          console.error('Unable to load shared report summary:', supabaseError);
          setError('Report not found or no longer shared.');
          setLoading(false);
          return;
        }

        setReport(data);
      } catch (fetchError) {
        console.error('Unexpected error loading shared report summary:', fetchError);
        if (isMounted) {
          setError('Report not found or no longer shared.');
        }
      } finally {
        if (isMounted) {
          setLoading(false);
        }
      }
    };

    loadReport();

    return () => {
      isMounted = false;
    };
  }, [reportId]);

  const reportState = useMemo(() => parseReportState(report?.report_state), [report]);

  const incomeItems = useMemo(() => {
    const items = Array.isArray(reportState?.additionalIncome)
      ? reportState.additionalIncome
      : [];

    return items.map((item, index) => {
      const rawLabel = item?.name ?? item?.label ?? '';
      const label = typeof rawLabel === 'string' ? rawLabel.trim() : String(rawLabel || `Income ${index + 1}`);
      const amount = Number(item?.amount);

      return {
        id: item?.id ?? `${label || 'income'}-${index}`,
        label: label || `Income ${index + 1}`,
        amount: Number.isFinite(amount) ? amount : 0,
        note: normaliseLineItemNote(item?.note),
      };
    });
  }, [reportState]);

  const expenseItems = useMemo(() => {
    const items = Array.isArray(reportState?.expenses) ? reportState.expenses : [];

    return items.map((item, index) => {
      const rawLabel = item?.name ?? item?.label ?? '';
      const label = typeof rawLabel === 'string' ? rawLabel.trim() : String(rawLabel || `Expense ${index + 1}`);
      const amount = Number(item?.amount);

      return {
        id: item?.id ?? `${label || 'expense'}-${index}`,
        label: label || `Expense ${index + 1}`,
        amount: Number.isFinite(amount) ? amount : 0,
        note: normaliseLineItemNote(item?.note),
      };
    });
  }, [reportState]);

  const derivedMetrics = useMemo(() => {
    if (!report) {
      return {
        totalLots: null,
        occupiedLots: null,
        physicalOccupancy: null,
        economicOccupancy: null,
        averageRent: null,
        purchasePrice: null,
        capRate: null,
        noi: null,
      };
    }

    const totalLots = Number(report.total_lots);
    const occupiedLots = Number(report.occupied_lots);
    const physicalOccupancy = Number(report.physical_occupancy);
    const economicOccupancy = Number(report.economic_occupancy);
    const purchasePrice = Number(report.purchase_price);
    const capRate = Number(report.cap_rate);
    const noi = Number(report.noi);
    const averageRent = extractAverageRent(report.rent_roll);

    return {
      totalLots: Number.isFinite(totalLots) ? totalLots : null,
      occupiedLots: Number.isFinite(occupiedLots) ? occupiedLots : null,
      physicalOccupancy: Number.isFinite(physicalOccupancy)
        ? physicalOccupancy
        : null,
      economicOccupancy: Number.isFinite(economicOccupancy)
        ? economicOccupancy
        : null,
      averageRent: Number.isFinite(averageRent) ? averageRent : null,
      purchasePrice: Number.isFinite(purchasePrice) ? purchasePrice : null,
      capRate: Number.isFinite(capRate) ? capRate : null,
      noi: Number.isFinite(noi) ? noi : null,
    };
  }, [report]);

  const reportTitle = report?.report_name?.trim() || 'Shared Report Summary';

  return (
    <div className="min-h-screen bg-slate-100 py-12">
      <div className="mx-auto flex max-w-3xl flex-col gap-8 px-4">
        <header className="flex flex-col gap-4 sm:flex-row sm:items-center sm:justify-between">
          <div>
            <p className="text-sm font-medium uppercase tracking-wide text-blue-600">
              Shared Report
            </p>
            <h1 className="text-3xl font-bold text-slate-900">{reportTitle}</h1>
            <p className="text-sm text-slate-600">Read-only summary</p>
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
        </header>

        {loading ? (
          <div className="rounded-lg border border-slate-200 bg-white p-6 text-sm text-slate-600 shadow-sm">
            Loading report details…
          </div>
        ) : error ? (
          <div className="rounded-lg border border-amber-200 bg-amber-50 p-6 text-sm text-amber-800">
            {error}
          </div>
        ) : (
          <div className="rounded-lg border border-slate-200 bg-white shadow">
            <div className="border-b border-slate-200 px-6 py-4">
              <h2 className="text-lg font-semibold text-slate-900">Property Overview</h2>
            </div>
            <div className="grid gap-4 px-6 py-6 sm:grid-cols-2">
              <div className="flex items-center justify-between text-sm text-slate-700">
                <span className="font-medium text-slate-600">Total Lots</span>
                <span className="text-slate-900">{formatNumber(derivedMetrics.totalLots)}</span>
              </div>
              <div className="flex items-center justify-between text-sm text-slate-700">
                <span className="font-medium text-slate-600">Occupied Lots</span>
                <span className="text-slate-900">{formatNumber(derivedMetrics.occupiedLots)}</span>
              </div>
              <div className="flex items-center justify-between text-sm text-slate-700">
                <span className="font-medium text-slate-600">Physical Occupancy</span>
                <span className="text-slate-900">{formatPercent(derivedMetrics.physicalOccupancy)}</span>
              </div>
              <div className="flex items-center justify-between text-sm text-slate-700">
                <span className="font-medium text-slate-600">Economic Occupancy</span>
                <span className="text-slate-900">{formatPercent(derivedMetrics.economicOccupancy)}</span>
              </div>
              <div className="flex items-center justify-between text-sm text-slate-700 sm:col-span-2">
                <span className="font-medium text-slate-600">Average Rent</span>
                <span className="text-slate-900">{formatCurrency(derivedMetrics.averageRent)}</span>
              </div>
            </div>

            <div className="border-t border-slate-200 px-6 py-4">
              <h2 className="text-lg font-semibold text-slate-900">Key Financials</h2>
            </div>
            <div className="grid gap-4 px-6 py-6 sm:grid-cols-3">
              <div className="flex flex-col rounded-lg bg-blue-50 p-4 text-sm text-blue-700">
                <span className="text-xs font-semibold uppercase tracking-wide text-blue-500">
                  Purchase Price
                </span>
                <span className="mt-2 text-lg font-semibold text-blue-900">
                  {formatCurrency(derivedMetrics.purchasePrice)}
                </span>
              </div>
              <div className="flex flex-col rounded-lg bg-emerald-50 p-4 text-sm text-emerald-700">
                <span className="text-xs font-semibold uppercase tracking-wide text-emerald-500">
                  Cap Rate
                </span>
                <span className="mt-2 text-lg font-semibold text-emerald-900">
                  {formatPercent(derivedMetrics.capRate)}
                </span>
              </div>
              <div className="flex flex-col rounded-lg bg-indigo-50 p-4 text-sm text-indigo-700">
                <span className="text-xs font-semibold uppercase tracking-wide text-indigo-500">
                  NOI
                </span>
                <span className="mt-2 text-lg font-semibold text-indigo-900">
                  {formatCurrency(derivedMetrics.noi)}
                </span>
              </div>
            </div>

            {(incomeItems.length > 0 || expenseItems.length > 0) && (
              <>
                <div className="border-t border-slate-200 px-6 py-4">
                  <div className="flex flex-col gap-2 sm:flex-row sm:items-center sm:justify-between">
                    <h2 className="text-lg font-semibold text-slate-900">Income &amp; Expenses</h2>
                    <label className="flex items-center gap-2 text-xs font-medium text-slate-600">
                      <input
                        type="checkbox"
                        className="h-4 w-4 rounded border-slate-300 text-blue-600 focus:ring-blue-500"
                        checked={showNotes}
                        onChange={() => setShowNotes((value) => !value)}
                      />
                      Show Notes
                    </label>
                  </div>
                </div>
                <div className="grid gap-6 px-6 pb-6 sm:grid-cols-2">
                  {incomeItems.length > 0 && (
                    <div className="rounded-lg border border-emerald-100 bg-emerald-50/40 p-4">
                      <h3 className="text-sm font-semibold uppercase tracking-wide text-emerald-600">Income</h3>
                      <table className="mt-3 w-full border-collapse text-sm">
                        <tbody>
                          {incomeItems.map((item) => (
                            <tr key={item.id} className="border-b border-emerald-100 last:border-0">
                              <td className="py-2 pr-4 align-top">
                                <div className="font-medium text-slate-800">{item.label}</div>
                                {showNotes && item.note && (
                                  <div className="mt-1 text-xs italic text-slate-500">{item.note}</div>
                                )}
                              </td>
                              <td className="py-2 text-right align-top font-semibold text-emerald-700">
                                {formatCurrency(item.amount)}
                              </td>
                            </tr>
                          ))}
                        </tbody>
                      </table>
                    </div>
                  )}

                  {expenseItems.length > 0 && (
                    <div className="rounded-lg border border-rose-100 bg-rose-50/40 p-4">
                      <h3 className="text-sm font-semibold uppercase tracking-wide text-rose-600">Expenses</h3>
                      <table className="mt-3 w-full border-collapse text-sm">
                        <tbody>
                          {expenseItems.map((item) => (
                            <tr key={item.id} className="border-b border-rose-100 last:border-0">
                              <td className="py-2 pr-4 align-top">
                                <div className="font-medium text-slate-800">{item.label}</div>
                                {showNotes && item.note && (
                                  <div className="mt-1 text-xs italic text-slate-500">{item.note}</div>
                                )}
                              </td>
                              <td className="py-2 text-right align-top font-semibold text-rose-700">
                                {formatCurrency(item.amount)}
                              </td>
                            </tr>
                          ))}
                        </tbody>
                      </table>
                    </div>
                  )}
                </div>
              </>
            )}
          </div>
        )}
      </div>
    </div>
  );
};

export default SharedReport;
