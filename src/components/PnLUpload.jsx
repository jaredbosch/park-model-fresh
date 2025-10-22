import React, {
  Fragment,
  useCallback,
  useEffect,
  useMemo,
  useRef,
  useState,
} from 'react';
import { Button } from './ui/button';
import { useToast } from './ToastProvider';

const UNMAPPED_OPTION = 'Unmapped (Keep As-Is)';
const SLOW_NOTICE_DELAY = 15000;

const DEFAULT_INCOME_OPTIONS = [
  'Lot Rent',
  'Home Rent',
  'Utility Reimbursement',
  'Laundry',
  'Late Fees',
  'Other Income',
];

const DEFAULT_EXPENSE_OPTIONS = [
  'Property Taxes',
  'Insurance',
  'Water/Sewer',
  'Repairs & Maintenance',
  'Payroll',
  'Management Fees',
  'Utilities',
  'Administrative',
  'Other Expense',
];

const STORAGE_KEY = 'pnl-mapping-cache';

function loadCachedMappings() {
  if (typeof window === 'undefined') {
    return {};
  }

  try {
    const raw = window.localStorage.getItem(STORAGE_KEY);
    if (!raw) {
      return {};
    }
    const parsed = JSON.parse(raw);
    if (parsed && typeof parsed === 'object') {
      return parsed;
    }
  } catch (error) {
    console.warn('Unable to load cached P&L mappings:', error);
  }

  return {};
}

function persistCachedMappings(cache) {
  if (typeof window === 'undefined') {
    return;
  }
  try {
    window.localStorage.setItem(STORAGE_KEY, JSON.stringify(cache));
  } catch (error) {
    console.warn('Unable to persist P&L mappings:', error);
  }
}

function buildRowId(section, index, label) {
  return `${section}-${index}-${label}`;
}

function exportAsJson(rows) {
  const payload = rows.map((row) => ({
    section: row.section,
    originalLabel: row.originalLabel,
    mappedCategory: row.mappedCategory,
    customLabel: row.customLabel,
    amount: row.amount,
    note: row.note || '',
  }));
  const blob = new Blob([JSON.stringify(payload, null, 2)], {
    type: 'application/json',
  });
  const url = URL.createObjectURL(blob);
  const anchor = document.createElement('a');
  anchor.href = url;
  anchor.download = 'pnl-mapping.json';
  anchor.click();
  URL.revokeObjectURL(url);
}

function exportAsCsv(rows) {
  const header = ['Section', 'Category', 'Label', 'Amount', 'Note'];
  const lines = [header.join(',')];

  const escapeValue = (value) => {
    if (value === null || value === undefined) {
      return '';
    }

    const text = String(value);
    if (/[",\n]/.test(text)) {
      return `"${text.replace(/"/g, '""')}"`;
    }

    return text;
  };

  rows.forEach((row) => {
    const section = row.section === 'income' ? 'Income' : row.section === 'expense' ? 'Expense' : '';
    const category = row.mappedCategory === UNMAPPED_OPTION ? '' : row.mappedCategory || '';
    const label = row.customLabel || row.originalLabel || '';
    const amount = Number.isFinite(Number(row.amount)) ? Number(row.amount) : '';
    const note = row.note || '';

    lines.push(
      [section, category, label, amount, note].map(escapeValue).join(',')
    );
  });

  const blob = new Blob([lines.join('\n')], { type: 'text/csv;charset=utf-8;' });
  const url = URL.createObjectURL(blob);
  const anchor = document.createElement('a');
  anchor.href = url;
  anchor.download = 'pnl-mapping.csv';
  anchor.click();
  URL.revokeObjectURL(url);
}

function createUniqueId(prefix = 'pnl-line') {
  try {
    if (typeof crypto !== 'undefined' && typeof crypto.randomUUID === 'function') {
      return crypto.randomUUID();
    }
  } catch (error) {
    console.warn('Unable to access crypto.randomUUID:', error);
  }
  return `${prefix}-${Math.random().toString(36).slice(2)}-${Date.now()}`;
}

function groupItemsByMapping(items, mapping) {
  if (!Array.isArray(items) || items.length === 0) {
    return [];
  }

  const grouped = {};
  items.forEach((item) => {
    if (!item || typeof item !== 'object') {
      return;
    }
    const rawLabel = typeof item.label === 'string' ? item.label.trim() : '';
    if (!rawLabel) {
      return;
    }
    const numericAmount = Number(item.amount);
    if (!Number.isFinite(numericAmount)) {
      return;
    }

    const lowerKey = rawLabel.toLowerCase();
    const mappedLabel =
      (mapping && (mapping[rawLabel] || mapping[lowerKey])) || rawLabel;

    if (!grouped[mappedLabel]) {
      grouped[mappedLabel] = 0;
    }
    grouped[mappedLabel] += numericAmount;
  });

  return Object.entries(grouped).map(([label, amount]) => ({ label, amount }));
}

const ProgressBar = ({ progress, label, fading, showNotice }) => (
  <div className={`mt-3 w-full transition-opacity ${fading ? 'opacity-0' : 'opacity-100'}`}>
    <div className="h-2 w-full overflow-hidden rounded-full bg-slate-800">
      <div
        className="h-full bg-blue-500 transition-all duration-500"
        style={{ width: `${progress}%` }}
      />
    </div>
    <div className="mt-2 flex items-center justify-between text-xs text-slate-200">
      <span>{label}</span>
      {showNotice && <span>This may take a minute for large PDFs…</span>}
    </div>
  </div>
);

const MappingRow = ({ row, onChangeCategory, onChangeLabel, onChangeNote, categoryOptions }) => {
  const isUnmapped = row.mappedCategory === UNMAPPED_OPTION;
  const rowClassName = [
    'grid grid-cols-[minmax(0,2.2fr)_minmax(0,1fr)_minmax(0,0.7fr)] gap-4 rounded-lg border p-4 text-sm transition-colors duration-200',
    isUnmapped
      ? 'border-amber-400/50 bg-slate-800/70 hover:bg-slate-800'
      : 'border-slate-700 bg-slate-900 hover:bg-slate-900/80',
  ].join(' ');

  return (
    <div className={rowClassName}>
      <div className="space-y-2">
        <div className="font-medium text-gray-100">{row.originalLabel}</div>
        <input
          type="text"
          value={row.customLabel}
          onChange={(event) => onChangeLabel(row.id, event.target.value)}
          className="w-full rounded-md border border-slate-700 bg-slate-950 px-2 py-1 text-sm text-gray-100 placeholder:text-slate-500 focus:border-blue-400 focus:outline-none"
          placeholder="Rename line item"
        />
        <p className="text-xs text-gray-400">Adjust the label that will appear in your P&amp;L.</p>
        <div className="self-center">
          <label className="mb-1 block text-xs font-semibold text-slate-300">
            Map To Category
          </label>
          <select
            value={row.mappedCategory}
            onChange={(event) => onChangeCategory(row.id, event.target.value)}
            className="w-full rounded-md border border-slate-600 bg-slate-950 px-2 py-1 text-sm text-gray-100 focus:border-blue-400 focus:outline-none"
          >
            <option value={UNMAPPED_OPTION}>{UNMAPPED_OPTION}</option>
            {categoryOptions.map((option) => (
              <option key={option} value={option}>
                {option}
              </option>
            ))}
          </select>
        </div>
      </div>
      <div className="flex flex-col justify-center gap-1">
        <label className="text-xs font-semibold uppercase tracking-wide text-slate-300">
          Notes
        </label>
        <input
          type="text"
          value={row.note || ''}
          onChange={(event) => onChangeNote(row.id, event.target.value)}
          placeholder="Add note..."
          title={row.note || ''}
          className="note-input w-full max-w-[16rem] truncate rounded border border-slate-300 bg-slate-50 px-2 py-1 text-sm text-gray-700 placeholder:text-slate-400 transition focus:max-w-none focus:border-blue-500 focus:bg-white focus:text-gray-900 focus:outline-none focus:ring-2 focus:ring-blue-200"
        />
        <p className="text-xs text-slate-500">Keep track of adjustments or caveats.</p>
      </div>
      <div className="self-center text-right text-base font-semibold text-indigo-200">
        ${row.amount.toLocaleString(undefined, {
          minimumFractionDigits: 0,
          maximumFractionDigits: 0,
        })}
      </div>
    </div>
  );
};

const PnLUpload = ({
  onApplyMapping,
  incomeCategories = DEFAULT_INCOME_OPTIONS,
  expenseCategories = DEFAULT_EXPENSE_OPTIONS,
}) => {
  const { showToast } = useToast();
  const fileInputRef = useRef(null);
  const slowTimerRef = useRef(null);

  const [loading, setLoading] = useState(false);
  const [progress, setProgress] = useState(0);
  const [progressLabel, setProgressLabel] = useState('');
  const [isProgressVisible, setIsProgressVisible] = useState(false);
  const [progressFading, setProgressFading] = useState(false);
  const [showSlowNotice, setShowSlowNotice] = useState(false);
  const [completionMessage, setCompletionMessage] = useState('');
  const [errorMessage, setErrorMessage] = useState('');
  const [modalOpen, setModalOpen] = useState(false);
  const [incomeRows, setIncomeRows] = useState([]);
  const [expenseRows, setExpenseRows] = useState([]);
  const [sourceIncomeItems, setSourceIncomeItems] = useState([]);
  const [sourceExpenseItems, setSourceExpenseItems] = useState([]);
  const [totals, setTotals] = useState({ totalIncome: 0, totalExpenses: 0, netIncome: 0 });
  const [selectAllIncome, setSelectAllIncome] = useState(UNMAPPED_OPTION);
  const [selectAllExpense, setSelectAllExpense] = useState(UNMAPPED_OPTION);
  const cacheRef = useRef({});

  useEffect(() => {
    cacheRef.current = loadCachedMappings();
  }, []);

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

  const beginSlowTimer = useCallback(() => {
    if (slowTimerRef.current) {
      clearTimeout(slowTimerRef.current);
    }
    slowTimerRef.current = setTimeout(() => {
      setShowSlowNotice(true);
    }, SLOW_NOTICE_DELAY);
  }, []);

  useEffect(() => () => {
    if (slowTimerRef.current) {
      clearTimeout(slowTimerRef.current);
    }
  }, []);

  const updateProgress = useCallback((value, label) => {
    setProgress((previous) => (value > previous ? value : previous));
    if (label) {
      setProgressLabel(label);
    }
  }, []);

  const completeProgress = useCallback(() => {
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
          setCompletionMessage('✅ P&L Ready for Review');
        }, 300);
      }, 500);
    }, 60);
  }, [updateProgress]);

  const applyCachedMapping = useCallback((section, label) => {
    const cacheKey = `${section}:${label.toLowerCase()}`;
    return cacheRef.current[cacheKey] || null;
  }, []);

  const handleSetRows = useCallback(
    (section, items, suggestions = {}) => {
      const previousRows = section === 'income' ? incomeRows : expenseRows;
      const nextRows = items.map((item, index) => {
        const rowId = buildRowId(section, index, item.label);
        const cached = applyCachedMapping(section, item.label);
        const suggestionKey = item.label ? item.label.toLowerCase() : '';
        const suggestion = suggestions[suggestionKey];
        const suggestedCategory = suggestion?.category;
        const priorMatch = previousRows.find((row) => {
          return (
            row.originalLabel === item.label &&
            Number(row.amount) === Number(item.amount)
          );
        });
        return {
          id: rowId,
          section,
          originalLabel: item.label,
          customLabel: cached?.customLabel || item.label,
          mappedCategory:
            cached?.mappedCategory ||
            (suggestedCategory ? suggestedCategory : UNMAPPED_OPTION),
          amount: item.amount,
          suggestionSource: suggestion?.source || null,
          note: cached?.note || priorMatch?.note || '',
        };
      });

    const normaliseItems = (list) =>
      Array.isArray(list)
        ? list.map((item) => ({
            label: typeof item?.label === 'string' ? item.label.trim() : '',
            amount: Number(item?.amount) || 0,
          }))
        : [];

      if (section === 'income') {
        setIncomeRows(nextRows);
        setSourceIncomeItems(normaliseItems(items));
      } else {
        setExpenseRows(nextRows);
        setSourceExpenseItems(normaliseItems(items));
      }
    },
    [applyCachedMapping, expenseRows, incomeRows]
  );

  const handleNoteChange = useCallback((id, note) => {
    setIncomeRows((rows) => rows.map((row) => (row.id === id ? { ...row, note } : row)));
    setExpenseRows((rows) => rows.map((row) => (row.id === id ? { ...row, note } : row)));
  }, []);

  const handleUploadClick = useCallback(() => {
    if (!loading && fileInputRef.current) {
      fileInputRef.current.value = '';
      fileInputRef.current.click();
    }
  }, [loading]);

  const handleFileChange = useCallback((event) => {
    const file = event.target.files?.[0];
    if (!file) {
      return;
    }

    setLoading(true);
    setErrorMessage('');
    setCompletionMessage('');
    setIsProgressVisible(true);
    updateProgress(10, 'Uploading P&L…');
    beginSlowTimer();
    const processUpload = async () => {
      try {
        const formData = new FormData();
        formData.append('file', file);

        updateProgress(35, 'Parsing P&L…');

        const response = await fetch('/api/parse-pnl', {
          method: 'POST',
          body: formData,
        });

        updateProgress(60, 'Processing results…');

        let payload;
        try {
          payload = await response.json();
        } catch (parseError) {
          console.error('Raw P&L API response was not valid JSON.');
          throw new Error('Server did not return valid JSON');
        }

        if (!response.ok) {
          throw new Error(payload?.error || 'Upload failed');
        }

        if (!payload?.success) {
          const error =
            payload?.error || 'Could not read line items. Please check file clarity or format.';
          throw new Error(error);
        }

        const { data, metadata } = payload;
        if (!data?.income || !(data?.expense || data?.expenses)) {
          throw new Error('Parser did not return income and expense data.');
        }

        const incomeSource = data.income || data.incomes || {};
        const rawIncomeItems = Array.isArray(incomeSource.individual_items)
          ? incomeSource.individual_items
          : [];
        const expenseSource = data.expense || data.expenses || {};
        const rawExpenseItems = Array.isArray(expenseSource.individual_items)
          ? expenseSource.individual_items
          : [];

        const suggestionSource =
          data.category_suggestions || metadata?.category_suggestions || {};
        const suggestionMapping = {};
        Object.entries(suggestionSource).forEach(([label, meta]) => {
          if (!label || !meta?.category) {
            return;
          }
          suggestionMapping[label] = meta.category;
          suggestionMapping[label.toLowerCase()] = meta.category;
        });

        const mappedIncomePreview = groupItemsByMapping(
          rawIncomeItems,
          suggestionMapping
        );
        const mappedExpensePreview = groupItemsByMapping(
          rawExpenseItems,
          suggestionMapping
        );
        const totalIncome =
          mappedIncomePreview.reduce(
            (sum, item) => sum + (Number(item.amount) || 0),
            0
          ) || Number(incomeSource.total_income) || 0;
        const totalExpenses =
          mappedExpensePreview.reduce(
            (sum, item) => sum + (Number(item.amount) || 0),
            0
          ) || Number(expenseSource.total_expense) || 0;

        handleSetRows('income', rawIncomeItems, suggestionSource);
        handleSetRows('expense', rawExpenseItems, suggestionSource);
        setTotals({
          totalIncome,
          totalExpenses,
          netIncome: totalIncome - totalExpenses,
        });

        completeProgress();
        setModalOpen(true);
      } catch (error) {
        console.error('P&L upload failed:', error);
        setErrorMessage(error.message || 'Could not read line items. Please check file clarity or format.');
        resetProgress();
      } finally {
        if (slowTimerRef.current) {
          clearTimeout(slowTimerRef.current);
          slowTimerRef.current = null;
        }
        setLoading(false);
      }
    };

    processUpload();
  }, [beginSlowTimer, completeProgress, handleSetRows, resetProgress, updateProgress]);

  const handleCloseModal = useCallback(() => {
    setModalOpen(false);
  }, []);

  const handleChangeCategory = useCallback((id, nextCategory) => {
    setIncomeRows((rows) =>
      rows.map((row) => (row.id === id ? { ...row, mappedCategory: nextCategory } : row))
    );
    setExpenseRows((rows) =>
      rows.map((row) => (row.id === id ? { ...row, mappedCategory: nextCategory } : row))
    );
  }, []);

  const handleChangeLabel = useCallback((id, nextLabel) => {
    setIncomeRows((rows) =>
      rows.map((row) => (row.id === id ? { ...row, customLabel: nextLabel } : row))
    );
    setExpenseRows((rows) =>
      rows.map((row) => (row.id === id ? { ...row, customLabel: nextLabel } : row))
    );
  }, []);

  const handleSelectAllIncome = useCallback((value) => {
    setSelectAllIncome(value);
    setIncomeRows((rows) => rows.map((row) => ({ ...row, mappedCategory: value })));
  }, []);

  const handleSelectAllExpense = useCallback((value) => {
    setSelectAllExpense(value);
    setExpenseRows((rows) => rows.map((row) => ({ ...row, mappedCategory: value })));
  }, []);

  const incomeMappingLookup = useMemo(() => {
    const mapping = {};
    incomeRows.forEach((row) => {
      if (!row?.originalLabel) {
        return;
      }
      const key = row.originalLabel.trim();
      if (!key) {
        return;
      }
      if (row.mappedCategory && row.mappedCategory !== UNMAPPED_OPTION) {
        mapping[key] = row.mappedCategory;
      } else if (row.customLabel && row.customLabel.trim() && row.customLabel.trim() !== key) {
        mapping[key] = row.customLabel.trim();
      }
    });
    return mapping;
  }, [incomeRows]);

  const expenseMappingLookup = useMemo(() => {
    const mapping = {};
    expenseRows.forEach((row) => {
      if (!row?.originalLabel) {
        return;
      }
      const key = row.originalLabel.trim();
      if (!key) {
        return;
      }
      if (row.mappedCategory && row.mappedCategory !== UNMAPPED_OPTION) {
        mapping[key] = row.mappedCategory;
      } else if (row.customLabel && row.customLabel.trim() && row.customLabel.trim() !== key) {
        mapping[key] = row.customLabel.trim();
      }
    });
    return mapping;
  }, [expenseRows]);

  const applyMappings = useCallback(
    (items, mapping) => groupItemsByMapping(items, mapping),
    []
  );

  const mappedIncomeItems = useMemo(
    () => applyMappings(sourceIncomeItems, incomeMappingLookup),
    [applyMappings, incomeMappingLookup, sourceIncomeItems]
  );

  const mappedExpenseItems = useMemo(
    () => applyMappings(sourceExpenseItems, expenseMappingLookup),
    [applyMappings, expenseMappingLookup, sourceExpenseItems]
  );

  const resolvedTotals = useMemo(() => {
    const hasMappedValues = mappedIncomeItems.length > 0 || mappedExpenseItems.length > 0;
    if (!hasMappedValues) {
      return totals;
    }

    const totalIncome = mappedIncomeItems.reduce((sum, item) => sum + (Number(item.amount) || 0), 0);
    const totalExpenses = mappedExpenseItems.reduce((sum, item) => sum + (Number(item.amount) || 0), 0);
    const netIncome = totalIncome - totalExpenses;

    return {
      totalIncome: Math.round(totalIncome),
      totalExpenses: Math.round(totalExpenses),
      netIncome: Math.round(netIncome),
    };
  }, [mappedExpenseItems, mappedIncomeItems, totals]);

  const stats = useMemo(() => {
    const incomeMapped = incomeRows.filter((row) => row.mappedCategory !== UNMAPPED_OPTION).length;
    const expenseMapped = expenseRows.filter((row) => row.mappedCategory !== UNMAPPED_OPTION).length;
    const totalMapped = incomeMapped + expenseMapped;
    const totalRows = incomeRows.length + expenseRows.length;
    const coverage = totalRows > 0 ? Math.round((totalMapped / totalRows) * 100) : 0;

    return {
      totalRows,
      totalMapped,
      totalUnmapped: totalRows - totalMapped,
      coverage,
      incomeMapped,
      expenseMapped,
    };
  }, [expenseRows, incomeRows]);

  const persistTrainingExamples = useCallback(async (rows) => {
    if (!Array.isArray(rows) || rows.length === 0) {
      return;
    }

    const examples = rows
      .filter((row) => row && row.mappedCategory && row.mappedCategory !== UNMAPPED_OPTION)
      .map((row) => ({
        label: row.originalLabel,
        category: row.mappedCategory,
        section: row.section,
      }));

    if (examples.length === 0) {
      return;
    }

    try {
      await fetch('/api/pnl-training', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ examples }),
      });
    } catch (error) {
      console.warn('Unable to store P&L training examples:', error);
    }
  }, []);

  const applyMapping = useCallback(async () => {
    const payloadRows = [...incomeRows, ...expenseRows];

    const nextCache = { ...cacheRef.current };
    payloadRows.forEach((row) => {
      if (!row || row.mappedCategory === UNMAPPED_OPTION || !row.originalLabel) {
        return;
      }
      const key = `${row.section}:${row.originalLabel.toLowerCase()}`;
      nextCache[key] = {
        mappedCategory: row.mappedCategory,
        customLabel: row.customLabel || row.originalLabel,
        note: row.note || '',
      };
    });
    cacheRef.current = nextCache;
    persistCachedMappings(nextCache);

    const buildLineItem = (row, section) => {
      const numericAmount = Number(row.amount);
      const safeAmount = Number.isFinite(numericAmount) ? numericAmount : 0;
      const label = row.customLabel?.trim() || row.originalLabel;
      const hasExplicitCategory =
        row.mappedCategory && row.mappedCategory !== UNMAPPED_OPTION
          ? row.mappedCategory
          : null;
      const category =
        hasExplicitCategory || (section === 'income' ? 'Other Income' : 'Other Expense');

      return {
        id: createUniqueId(section),
        section,
        category,
        mappedCategory: hasExplicitCategory,
        originalLabel: row.originalLabel,
        label,
        name: label,
        amount: safeAmount,
        note: row.note || '',
        editable: true,
      };
    };

    const incomeLines = incomeRows.map((row) => buildLineItem(row, 'income'));
    const expenseLines = expenseRows.map((row) => buildLineItem(row, 'expense'));

    const lotRentTotal = incomeLines.reduce((sum, line) => {
      return line.category === 'Lot Rent' ? sum + line.amount : sum;
    }, 0);

    const totalsForParent =
      resolvedTotals || totals || { totalIncome: 0, totalExpenses: 0, netIncome: 0 };

    if (typeof onApplyMapping === 'function') {
      onApplyMapping({
        incomeLines,
        expenseLines,
        totals: totalsForParent,
        stats,
        derived: {
          lotRentTotal,
        },
      });
    }

    showToast({ message: '✅ All P&L items imported as editable lines', tone: 'success' });
    setModalOpen(false);
    setCompletionMessage('');
    persistTrainingExamples(payloadRows);
  }, [
    expenseRows,
    incomeRows,
    onApplyMapping,
    persistTrainingExamples,
    resolvedTotals,
    showToast,
    stats,
    totals,
  ]);

  const handleExportJson = useCallback(() => {
    exportAsJson([...incomeRows, ...expenseRows]);
  }, [expenseRows, incomeRows]);

  const handleExportCsv = useCallback(() => {
    exportAsCsv([...incomeRows, ...expenseRows]);
  }, [expenseRows, incomeRows]);

  return (
    <Fragment>
      <div className="flex flex-col gap-3">
        <Button
          onClick={handleUploadClick}
          disabled={loading}
          className="inline-flex items-center gap-2 bg-indigo-600 text-white hover:bg-indigo-700"
        >
          {loading ? (
            <Fragment>
              <svg
                className="h-4 w-4 animate-spin"
                xmlns="http://www.w3.org/2000/svg"
                fill="none"
                viewBox="0 0 24 24"
              >
                <circle
                  className="opacity-25"
                  cx="12"
                  cy="12"
                  r="10"
                  stroke="currentColor"
                  strokeWidth="4"
                />
                <path
                  className="opacity-75"
                  fill="currentColor"
                  d="M4 12a8 8 0 018-8v8H4z"
                />
              </svg>
              Parsing P&L…
            </Fragment>
          ) : (
            'Upload P&L'
          )}
        </Button>
        <input
          ref={fileInputRef}
          type="file"
          accept=".pdf,.csv"
          className="hidden"
          onChange={handleFileChange}
        />
        {isProgressVisible && (
          <ProgressBar
            progress={progress}
            label={progressLabel}
            fading={progressFading}
            showNotice={showSlowNotice}
          />
        )}
        {completionMessage && (
          <div className="rounded-md border border-green-400 bg-green-50 px-3 py-2 text-sm font-semibold text-green-800">
            {completionMessage}
          </div>
        )}
        {errorMessage && (
          <div className="rounded-md border border-red-400 bg-red-50 px-3 py-2 text-sm font-semibold text-red-700">
            {errorMessage}
          </div>
        )}
      </div>

      {modalOpen && (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/70 p-4">
          <div className="flex max-h-[90vh] w-full max-w-5xl flex-col overflow-hidden rounded-2xl bg-slate-950 text-gray-100 shadow-2xl ring-1 ring-slate-800">
            <div className="flex items-center justify-between border-b border-slate-800 bg-slate-950/80 px-6 py-4">
              <h2 className="text-xl font-semibold text-gray-50">Map P&L Line Items</h2>
              <div className="flex items-center gap-3 text-xs text-gray-300">
                <div className="font-medium">
                  {stats.totalMapped} mapped • {stats.totalUnmapped} unmapped • {stats.coverage}% coverage
                </div>
                <div className="flex items-center gap-2">
                  <button
                    type="button"
                    onClick={handleExportJson}
                    className="rounded-md border border-slate-700 bg-slate-900 px-3 py-1 text-xs font-semibold text-gray-100 transition-colors hover:bg-slate-800"
                  >
                    Export JSON
                  </button>
                  <button
                    type="button"
                    onClick={handleExportCsv}
                    className="rounded-md border border-slate-700 bg-slate-900 px-3 py-1 text-xs font-semibold text-gray-100 transition-colors hover:bg-slate-800"
                  >
                    Export CSV
                  </button>
                </div>
              </div>
            </div>

            <div className="space-y-6 overflow-y-auto px-6 py-6">
              <section className="space-y-4">
                <header className="flex flex-col gap-3 md:flex-row md:items-center md:justify-between">
                  <div>
                    <h3 className="text-lg font-semibold text-blue-200">Income</h3>
                    <p className="text-xs text-gray-400">
                      Assign each income line to a category or keep it unmapped.
                    </p>
                  </div>
                  <div className="flex flex-wrap items-center gap-2">
                    <label className="text-xs font-semibold text-gray-400" htmlFor="select-all-income">
                      Select All
                    </label>
                    <select
                      id="select-all-income"
                      value={selectAllIncome}
                      onChange={(event) => handleSelectAllIncome(event.target.value)}
                      className="rounded-md border border-slate-700 bg-slate-950 px-3 py-1 text-sm text-gray-100 focus:border-blue-400 focus:outline-none"
                    >
                      <option value={UNMAPPED_OPTION}>{UNMAPPED_OPTION}</option>
                      {incomeCategories.map((option) => (
                        <option key={option} value={option}>
                          {option}
                        </option>
                      ))}
                    </select>
                  </div>
                </header>

                <div className="space-y-3">
                  {incomeRows.length === 0 && (
                    <div className="rounded-lg border border-slate-700 bg-slate-900/70 p-4 text-sm text-gray-300">
                      No income line items detected.
                    </div>
                  )}
                  {incomeRows.map((row) => (
                    <MappingRow
                      key={row.id}
                      row={row}
                      onChangeCategory={handleChangeCategory}
                      onChangeLabel={handleChangeLabel}
                      onChangeNote={handleNoteChange}
                      categoryOptions={incomeCategories}
                    />
                  ))}
                </div>
              </section>

              <section className="space-y-4">
                <header className="flex flex-col gap-3 md:flex-row md:items-center md:justify-between">
                  <div>
                    <h3 className="text-lg font-semibold text-rose-200">Expenses</h3>
                    <p className="text-xs text-gray-400">
                      Tag operating expenses for better benchmarking.
                    </p>
                  </div>
                  <div className="flex flex-wrap items-center gap-2">
                    <label className="text-xs font-semibold text-gray-400" htmlFor="select-all-expense">
                      Select All
                    </label>
                    <select
                      id="select-all-expense"
                      value={selectAllExpense}
                      onChange={(event) => handleSelectAllExpense(event.target.value)}
                      className="rounded-md border border-slate-700 bg-slate-950 px-3 py-1 text-sm text-gray-100 focus:border-blue-400 focus:outline-none"
                    >
                      <option value={UNMAPPED_OPTION}>{UNMAPPED_OPTION}</option>
                      {expenseCategories.map((option) => (
                        <option key={option} value={option}>
                          {option}
                        </option>
                      ))}
                    </select>
                  </div>
                </header>

                <div className="space-y-3">
                  {expenseRows.length === 0 && (
                    <div className="rounded-lg border border-slate-700 bg-slate-900/70 p-4 text-sm text-gray-300">
                      No expense line items detected.
                    </div>
                  )}
                  {expenseRows.map((row) => (
                    <MappingRow
                      key={row.id}
                      row={row}
                      onChangeCategory={handleChangeCategory}
                      onChangeLabel={handleChangeLabel}
                      onChangeNote={handleNoteChange}
                      categoryOptions={expenseCategories}
                    />
                  ))}
                </div>
              </section>

              {(mappedIncomeItems.length > 0 || mappedExpenseItems.length > 0) && (
                <section className="space-y-4 rounded-xl border border-slate-800 bg-slate-900/60 p-5">
                  <div className="flex flex-col gap-1">
                    <h3 className="text-lg font-semibold text-gray-100">Preview: Totals by Category</h3>
                    <p className="text-xs text-gray-400">
                      These values reflect your current mappings and will populate the P&amp;L editor once you accept the mapping.
                    </p>
                  </div>
                  <div className="grid gap-4 md:grid-cols-2">
                    <div className="space-y-2">
                      <h4 className="text-sm font-semibold uppercase tracking-wide text-blue-200">Income</h4>
                      {mappedIncomeItems.length === 0 ? (
                        <div className="rounded-md border border-slate-800 bg-slate-900/80 px-3 py-2 text-xs text-gray-400">
                          No mapped income categories yet.
                        </div>
                      ) : (
                        <table className="w-full table-fixed text-sm">
                          <tbody>
                            {mappedIncomeItems.map((item) => (
                              <tr key={`income-${item.label}`} className="border-b border-slate-800/70 last:border-none">
                                <td className="py-2 pr-3 font-medium text-gray-100">{item.label}</td>
                                <td className="py-2 text-right font-semibold text-blue-200">
                                  ${Number(item.amount ?? 0).toLocaleString()}
                                </td>
                              </tr>
                            ))}
                          </tbody>
                        </table>
                      )}
                    </div>
                    <div className="space-y-2">
                      <h4 className="text-sm font-semibold uppercase tracking-wide text-rose-200">Expenses</h4>
                      {mappedExpenseItems.length === 0 ? (
                        <div className="rounded-md border border-slate-800 bg-slate-900/80 px-3 py-2 text-xs text-gray-400">
                          No mapped expense categories yet.
                        </div>
                      ) : (
                        <table className="w-full table-fixed text-sm">
                          <tbody>
                            {mappedExpenseItems.map((item) => (
                              <tr key={`expense-${item.label}`} className="border-b border-slate-800/70 last:border-none">
                                <td className="py-2 pr-3 font-medium text-gray-100">{item.label}</td>
                                <td className="py-2 text-right font-semibold text-rose-200">
                                  ${Number(item.amount ?? 0).toLocaleString()}
                                </td>
                              </tr>
                            ))}
                          </tbody>
                        </table>
                      )}
                    </div>
                  </div>
                </section>
              )}
            </div>

            <footer className="sticky bottom-0 bg-slate-950">
              <div className="border-t border-slate-700 px-6 py-4">
                <div className="grid gap-2 text-sm text-gray-100 md:grid-cols-3">
                  <div className="flex flex-col">
                    <span className="text-xs uppercase tracking-wide text-gray-400">Total Income</span>
                    <span className="text-base font-semibold text-blue-200">
                      ${
                        (resolvedTotals?.totalIncome ?? 0).toLocaleString()
                      }
                    </span>
                  </div>
                  <div className="flex flex-col">
                    <span className="text-xs uppercase tracking-wide text-gray-400">Total Expenses</span>
                    <span className="text-base font-semibold text-rose-200">
                      ${
                        (resolvedTotals?.totalExpenses ?? 0).toLocaleString()
                      }
                    </span>
                  </div>
                  <div className="flex flex-col">
                    <span className="text-xs uppercase tracking-wide text-gray-400">Net Income</span>
                    <span className="text-base font-semibold text-emerald-200">
                      ${
                        (resolvedTotals?.netIncome ?? 0).toLocaleString()
                      }
                    </span>
                  </div>
                </div>
              </div>
              <div className="sticky bottom-0 flex justify-end gap-3 bg-slate-950 border-t border-slate-700 p-4">
                <button
                  className="px-5 py-2 rounded-md bg-slate-700 hover:bg-slate-600 text-gray-200"
                  onClick={() => {
                    setCompletionMessage('');
                    handleCloseModal();
                  }}
                >
                  Cancel
                </button>
                <button
                  className="px-6 py-2 rounded-md bg-indigo-600 hover:bg-indigo-500 text-white font-medium"
                  onClick={() => {
                    void applyMapping();
                  }}
                >
                  Accept Mapping
                </button>
              </div>
            </footer>
          </div>
        </div>
      )}
    </Fragment>
  );
};

export default PnLUpload;
