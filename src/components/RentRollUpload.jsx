import React, { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import { Button } from './ui/button';

const ROW_HEIGHT = 52;
const VIRTUAL_BUFFER = 8;
const MIN_INITIAL_ROWS = 5;
const DEFAULT_VISIBLE_ROWS = 18;

const RentRollUpload = ({ onDataParsed }) => {
  const fileInputRef = useRef(null);
  const scrollContainerRef = useRef(null);
  const headerRef = useRef(null);
  const slowTimerRef = useRef(null);

  const [loading, setLoading] = useState(false);
  const [loadingStatus, setLoadingStatus] = useState('');
  const [previewData, setPreviewData] = useState(null);
  const [summary, setSummary] = useState(null);
  const [showModal, setShowModal] = useState(false);
  const [progress, setProgress] = useState(0);
  const [progressLabel, setProgressLabel] = useState('');
  const [isProgressVisible, setIsProgressVisible] = useState(false);
  const [progressFading, setProgressFading] = useState(false);
  const [showSlowNotice, setShowSlowNotice] = useState(false);
  const [completionMessage, setCompletionMessage] = useState('');
  const [virtualRange, setVirtualRange] = useState({ start: 0, end: 0 });

  const resetProgress = useCallback(() => {
    if (slowTimerRef.current) {
      clearTimeout(slowTimerRef.current);
      slowTimerRef.current = null;
    }
    setIsProgressVisible(false);
    setProgress(0);
    setProgressLabel('');
    setShowSlowNotice(false);
    setProgressFading(false);
  }, []);

  const updateProgress = useCallback((value, label) => {
    setProgress((previous) => {
      if (typeof value !== 'number') {
        return previous;
      }
      return value > previous ? value : previous;
    });
    if (label) {
      setProgressLabel(label);
      setLoadingStatus(label);
    }
  }, []);

  const completeProgress = useCallback(() => {
    if (slowTimerRef.current) {
      clearTimeout(slowTimerRef.current);
      slowTimerRef.current = null;
    }

    updateProgress(90, 'Finalizing preview...');
    setTimeout(() => {
      setProgress(100);
      setTimeout(() => {
        setProgressFading(true);
        setTimeout(() => {
          setIsProgressVisible(false);
          setProgressFading(false);
          setShowSlowNotice(false);
          setProgress(0);
          setProgressLabel('');
          setLoadingStatus('');
          setCompletionMessage('✅ Rent Roll Ready for Review');
        }, 300);
      }, 500);
    }, 50);
  }, [updateProgress]);

  const updateVirtualRange = useCallback(() => {
    const container = scrollContainerRef.current;
    if (!container) {
      return;
    }

    const totalRows = Array.isArray(previewData) ? previewData.length : 0;
    if (totalRows === 0) {
      setVirtualRange({ start: 0, end: 0 });
      return;
    }

    const headerHeight = headerRef.current ? headerRef.current.offsetHeight : 0;
    const adjustedScrollTop = Math.max(container.scrollTop - headerHeight, 0);
    const availableHeight = Math.max(container.clientHeight - headerHeight, ROW_HEIGHT);

    const start = Math.max(0, Math.floor(adjustedScrollTop / ROW_HEIGHT) - VIRTUAL_BUFFER);
    const visibleCount = Math.ceil(availableHeight / ROW_HEIGHT) + VIRTUAL_BUFFER * 2;
    const end = Math.min(totalRows, start + visibleCount);

    setVirtualRange((previous) => {
      if (previous.start === start && previous.end === end) {
        return previous;
      }
      return { start, end };
    });
  }, [previewData]);

  const formatCurrency = useCallback((value) => {
    if (typeof value !== 'number' || Number.isNaN(value)) {
      return '-';
    }

    return `$${value.toLocaleString(undefined, { minimumFractionDigits: 0, maximumFractionDigits: 0 })}`;
  }, []);

  useEffect(() => {
    return () => {
      if (slowTimerRef.current) {
        clearTimeout(slowTimerRef.current);
      }
    };
  }, []);

  useEffect(() => {
    if (!Array.isArray(previewData) || previewData.length === 0) {
      setVirtualRange({ start: 0, end: 0 });
      return;
    }

    const totalRows = previewData.length;
    const initialVisible = Math.min(
      totalRows,
      Math.max(MIN_INITIAL_ROWS, DEFAULT_VISIBLE_ROWS)
    );

    setVirtualRange({ start: 0, end: initialVisible });
  }, [previewData]);

  useEffect(() => {
    if (!showModal) {
      return undefined;
    }

    const container = scrollContainerRef.current;
    if (!container) {
      return undefined;
    }

    container.scrollTop = 0;
    updateVirtualRange();

    container.addEventListener('scroll', updateVirtualRange);
    window.addEventListener('resize', updateVirtualRange);

    return () => {
      container.removeEventListener('scroll', updateVirtualRange);
      window.removeEventListener('resize', updateVirtualRange);
    };
  }, [showModal, updateVirtualRange]);

  useEffect(() => {
    if (!showModal) {
      return;
    }

    const frame = requestAnimationFrame(() => {
      updateVirtualRange();
    });

    return () => cancelAnimationFrame(frame);
  }, [showModal, updateVirtualRange]);

  const handleFileUpload = async (event) => {
    const input = event.target;
    const file = input.files?.[0];

    if (!file) {
      return;
    }

    setCompletionMessage('');
    setLoading(true);
    setLoadingStatus('Uploading file...');
    setIsProgressVisible(true);
    setProgressFading(false);
    setProgress(5);
    setProgressLabel('Uploading file...');
    setShowSlowNotice(false);

    if (slowTimerRef.current) {
      clearTimeout(slowTimerRef.current);
    }
    slowTimerRef.current = setTimeout(() => {
      setShowSlowNotice(true);
    }, 15000);

    const reader = new FileReader();
    reader.onloadend = async () => {
      let wasSuccessful = false;

      try {
        if (typeof reader.result !== 'string') {
          throw new Error('Unable to read the selected file.');
        }

        const base64 = reader.result.split(',')[1];
        if (!base64) {
          throw new Error('File payload could not be processed.');
        }
        updateProgress(35, 'Extracting text from PDF...');

        const response = await fetch('/api/parse-rentroll', {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({ file: base64, filename: file.name }),
        });

        updateProgress(65, 'Analyzing rent roll data...');
        const result = await response.json();

        if (!result.success) {
          throw new Error(result.error || 'Failed to parse rent roll');
        }

        const rows = Array.isArray(result.data) ? result.data : [];
        setPreviewData(rows);
        setSummary(result.summary || null);
        setShowModal(true);

        updateProgress(85, 'Finalizing preview...');
        completeProgress();
        wasSuccessful = true;
      } catch (error) {
        console.error('Rent roll upload failed:', error);
        alert('Error: ' + (error?.message || 'Unknown error'));
      } finally {
        if (!wasSuccessful) {
          resetProgress();
          setCompletionMessage('');
        }

        setLoading(false);
        setLoadingStatus('');

        if (input) {
          input.value = '';
        }
      }
    };

    reader.readAsDataURL(file);
  };

  const handleCloseModal = useCallback(() => {
    setShowModal(false);
    setCompletionMessage('');
  }, []);

  const handleConfirmImport = () => {
    if (typeof onDataParsed === 'function' && Array.isArray(previewData)) {
      onDataParsed(previewData);
    }
    handleCloseModal();
  };

  const summaryLine = useMemo(() => {
    if (!summary) {
      return null;
    }

    const { totalLots, occupiedLots, averageRent, modeRent, totalAnnualIncome, vacancyRate, occupancyRate } = summary;
    const parts = [];

    if (typeof totalLots === 'number') {
      parts.push(`${totalLots} ${totalLots === 1 ? 'lot' : 'lots'}`);
    }

    if (typeof occupiedLots === 'number') {
      if (typeof occupancyRate === 'number' && typeof vacancyRate === 'number') {
        parts.push(
          `${occupiedLots} occupied (${occupancyRate.toFixed(1)}% occupancy, ${vacancyRate.toFixed(1)}% vacant)`
        );
      } else {
        parts.push(`${occupiedLots} occupied`);
      }
    }

    if (typeof averageRent === 'number') {
      parts.push(`Avg ${formatCurrency(averageRent)}`);
    }

    if (typeof modeRent === 'number') {
      parts.push(`Mode ${formatCurrency(modeRent)}`);
    }

    if (typeof totalAnnualIncome === 'number' && Number.isFinite(totalAnnualIncome)) {
      parts.push(`Total Annual Income ${formatCurrency(totalAnnualIncome)}`);
    }

    return parts.join(' • ');
  }, [summary, formatCurrency]);

  const warnings = useMemo(() => {
    if (!summary || !Array.isArray(summary.warnings)) {
      return [];
    }
    return summary.warnings;
  }, [summary]);

  const hasOnlySequenceIssue = warnings.length === 1 && warnings[0]?.code === 'non_sequential';

  const totalRows = Array.isArray(previewData) ? previewData.length : 0;
  const { start, end } = virtualRange;
  const visibleRows = Array.isArray(previewData) ? previewData.slice(start, end) : [];
  const paddingTop = Math.max(0, start * ROW_HEIGHT);
  const paddingBottom = Math.max(0, (totalRows - end) * ROW_HEIGHT);

  const immediateRowsCount = Math.min(MIN_INITIAL_ROWS, totalRows);

  return (
    <div>
      <Button
        onClick={() => fileInputRef.current?.click()}
        disabled={loading}
        className="flex items-center gap-2 bg-blue-500 text-white hover:bg-blue-600"
      >
        {loading ? (
          <>
            <svg
              className="h-5 w-5 animate-spin text-white"
              xmlns="http://www.w3.org/2000/svg"
              fill="none"
              viewBox="0 0 24 24"
            >
              <circle className="opacity-25" cx="12" cy="12" r="10" stroke="currentColor" strokeWidth="4" />
              <path className="opacity-75" fill="currentColor" d="M4 12a8 8 0 018-8v8H4z" />
            </svg>
            {progressLabel || loadingStatus || 'Processing...'}
          </>
        ) : (
          'Upload Rent Roll'
        )}
      </Button>
      <input
        type="file"
        ref={fileInputRef}
        accept=".pdf,.csv"
        className="hidden"
        onChange={handleFileUpload}
      />

      {isProgressVisible && (
        <div
          className={`mt-3 w-full max-w-xl rounded-lg bg-slate-900/80 p-4 text-sm text-white shadow-lg transition-opacity duration-500 ${
            progressFading ? 'opacity-0' : 'opacity-100'
          }`}
        >
          <div className="mb-2 flex items-center justify-between text-xs uppercase tracking-wide text-slate-300">
            <span>{progressLabel || loadingStatus || 'Processing...'}</span>
            <span>{Math.round(Math.min(progress, 100))}%</span>
          </div>
          <div className="h-2 w-full overflow-hidden rounded bg-slate-700">
            <div
              className="h-full rounded bg-blue-500 transition-all duration-500"
              style={{ width: `${Math.min(progress, 100)}%` }}
            />
          </div>
          {showSlowNotice && (
            <p className="mt-2 text-xs text-slate-300">This may take a minute for large PDFs…</p>
          )}
        </div>
      )}

      {showModal && Array.isArray(previewData) && (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/70">
          <div className="w-full max-w-4xl rounded-xl bg-slate-900 p-6 text-white shadow-2xl">
            <h2 className="mb-3 text-xl font-semibold">Review Parsed Rent Roll</h2>

            {completionMessage && (
              <div className="mb-4 rounded-lg border border-emerald-500/40 bg-emerald-500/10 p-3 text-sm text-emerald-200">
                {completionMessage}
              </div>
            )}

            {warnings.length > 0 && (
              <div
                className={
                  hasOnlySequenceIssue
                    ? 'mb-4 rounded-lg border border-slate-700 bg-slate-800/70 p-3 text-sm text-slate-200'
                    : 'mb-4 rounded-lg border border-yellow-500/40 bg-yellow-500/10 p-3 text-sm text-yellow-200'
                }
              >
                <p
                  className={
                    hasOnlySequenceIssue ? 'font-medium text-slate-100' : 'font-medium text-yellow-100'
                  }
                >
                  ⚠️ Review suggested before import
                </p>
                <ul className="ml-4 mt-1 list-disc space-y-1">
                  {warnings.map((warning, index) => (
                    <li key={warning?.code || index}>{warning?.message || warning}</li>
                  ))}
                </ul>
              </div>
            )}

            {summary && (
              <div className="mb-4 space-y-2 text-sm text-slate-200">
                {summaryLine && <p className="text-base font-medium text-white">{summaryLine}</p>}
                <div className="grid gap-2 sm:grid-cols-2">
                  <p>Total Lots: {summary.totalLots ?? 0}</p>
                  <p>Occupied Lots: {summary.occupiedLots ?? 0}</p>
                  <p>Average Rent: {formatCurrency(summary.averageRent)}</p>
                  <p>Mode Rent: {formatCurrency(summary.modeRent)}</p>
                  <p>Vacancy Rate: {typeof summary.vacancyRate === 'number' ? `${summary.vacancyRate.toFixed(1)}%` : '-'}</p>
                  <p>
                    Total Annual Income:{' '}
                    {typeof summary.totalAnnualIncome === 'number'
                      ? formatCurrency(summary.totalAnnualIncome)
                      : '-'}
                  </p>
                </div>
              </div>
            )}

            <div className="rounded-lg border border-slate-700 bg-slate-900/80">
              <div
                ref={headerRef}
                className="sticky top-0 z-20 grid grid-cols-[1.2fr_2fr_1fr_1fr] gap-2 border-b border-slate-700 bg-slate-800 px-3 py-2 text-xs font-semibold uppercase tracking-wide text-slate-300"
              >
                <span>Lot #</span>
                <span>Tenant</span>
                <span>Occupied</span>
                <span>Rent</span>
              </div>
              <div ref={scrollContainerRef} className="max-h-[420px] overflow-y-auto">
                <div style={{ height: paddingTop }} />
                {visibleRows.map((row, index) => {
                  const actualIndex = start + index;
                  const rowClasses = [
                    'grid grid-cols-[1.2fr_2fr_1fr_1fr] gap-2 px-3 text-sm transition-colors',
                    row.occupied
                      ? 'bg-slate-900/80 hover:bg-slate-800/80'
                      : 'bg-slate-900/40 text-slate-300',
                    row.isDuplicate ? 'ring-1 ring-red-500/60 ring-inset' : '',
                  ]
                    .filter(Boolean)
                    .join(' ');

                  const tenantDisplay = row.tenant ?? row.tenantName ?? (row.occupied ? '—' : 'Vacant');

                  return (
                    <div
                      key={`${row.lotNumber || 'lot'}-${actualIndex}`}
                      className={rowClasses}
                      style={{
                        minHeight: ROW_HEIGHT,
                        borderBottom: '1px solid rgba(71, 85, 105, 0.45)',
                      }}
                    >
                      <div className="flex flex-col">
                        <span className="font-medium text-white">{row.lotNumber}</span>
                        {row._originalLotToken && row._originalLotToken !== row.lotNumber && (
                          <span className="text-xs text-slate-400">source: "{row._originalLotToken}"</span>
                        )}
                      </div>
                      <div className="truncate text-slate-200">{tenantDisplay}</div>
                      <div className="text-slate-200">{row.occupied ? 'Yes' : 'No'}</div>
                      <div
                        className={`px-2 py-1 text-slate-200 ${
                          row.missingRent ? 'rounded bg-amber-500/20 text-amber-100' : ''
                        }`}
                      >
                        {row.missingRent ? '—' : formatCurrency(row.rent)}
                      </div>
                    </div>
                  );
                })}
                <div style={{ height: paddingBottom }} />
              </div>
            </div>

            <p className="mt-2 text-xs text-slate-400">
              Showing first {immediateRowsCount} rows instantly out of {summary?.totalLots || totalRows}. Scroll to review the
              remaining entries.
            </p>

            <div className="mt-4 flex justify-end gap-3">
              <Button onClick={handleCloseModal}>Cancel</Button>
              <Button onClick={handleConfirmImport} className="bg-blue-500 text-white hover:bg-blue-600">
                Confirm Import
              </Button>
            </div>
          </div>
        </div>
      )}
    </div>
  );
};

export default RentRollUpload;
