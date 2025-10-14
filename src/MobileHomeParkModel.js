import React, { useState, useMemo, useEffect, useCallback, useRef } from 'react';
import {
  Download,
  RefreshCw,
  Share2,
  BarChart3,
  DollarSign,
  Home as HomeIcon,
  Percent,
  PieChart,
} from 'lucide-react';
import { supabase } from './lib/supabaseClient';
import AuthModal from './components/AuthModal';
import ProfileModal from './components/ProfileModal';
import { useToast } from './components/ToastProvider';
import RentRollUpload from './components/RentRollUpload';
import PnLUpload from './components/PnLUpload';

console.log('Supabase instance:', supabase);

if (!supabase) {
  console.error('⚠️ Supabase client not initialized yet');
}

const isSupabaseConfigured = Boolean(supabase);

let globalUser = null;

if (supabase && typeof supabase.auth !== 'undefined') {
  supabase.auth.onAuthStateChange((_event, session) => {
    globalUser = session?.user || null;

    if (globalUser?.email) {
      console.log(`✅ Supabase connected as ${globalUser.email}`);
    } else {
      console.warn('⚠️ No Supabase session found yet');
    }
  });
} else if (supabase) {
  console.error('Supabase auth API is unavailable on the current client instance.');
} else {
  console.error('Supabase client not initialized');
}

const normaliseReportState = (state) => {
  if (!state) {
    return null;
  }

  if (typeof state === 'object') {
    return state;
  }

  if (typeof state === 'string') {
    try {
      return JSON.parse(state);
    } catch (err) {
      console.warn('Unable to parse saved report_state JSON:', err);
      return null;
    }
  }

  return null;
};

const resolveReportName = (report, stateOverride = undefined) => {
  const state =
    stateOverride !== undefined
      ? stateOverride
      : normaliseReportState(report?.report_state);

  const rawName =
    state?.reportName ||
    state?.propertyInfo?.name ||
    report?.report_name ||
    report?.park_name ||
    '';

  const trimmed = typeof rawName === 'string' ? rawName.trim() : '';

  return trimmed || 'Untitled Report';
};

const resolvePropertyName = (report, stateOverride = undefined) => {
  const state =
    stateOverride !== undefined
      ? stateOverride
      : normaliseReportState(report?.report_state);
  const rawName = state?.propertyInfo?.name || report?.park_name || '';
  return typeof rawName === 'string' && rawName.trim() ? rawName.trim() : '—';
};

const resolveCity = (report, stateOverride = undefined) => {
  const state =
    stateOverride !== undefined
      ? stateOverride
      : normaliseReportState(report?.report_state);
  const rawCity = state?.propertyInfo?.city || report?.park_city || '';
  return typeof rawCity === 'string' ? rawCity.trim() : '';
};

const resolveState = (report, stateOverride = undefined) => {
  const state =
    stateOverride !== undefined
      ? stateOverride
      : normaliseReportState(report?.report_state);
  const rawState = state?.propertyInfo?.state || report?.park_state || '';
  return typeof rawState === 'string' ? rawState.trim() : '';
};

const resolveSiteCount = (report, stateOverride = undefined) => {
  const state =
    stateOverride !== undefined
      ? stateOverride
      : normaliseReportState(report?.report_state);

  const candidates = [
    state?.propertyInfo?.totalLots,
    state?.calculations?.totalUnits,
    report?.total_lots,
  ];

  for (const candidate of candidates) {
    if (typeof candidate === 'number' && Number.isFinite(candidate)) {
      return candidate;
    }

    if (typeof candidate === 'string') {
      const parsed = Number(candidate);
      if (Number.isFinite(parsed)) {
        return parsed;
      }
    }
  }

  return null;
};

const slugify = (value) => {
  if (!value) {
    return 'report';
  }

  const slug = value
    .toString()
    .trim()
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, '-')
    .replace(/^-+|-+$/g, '');

  return slug || 'report';
};

const resolvePurchasePrice = (report, stateOverride = undefined) => {
  const state =
    stateOverride !== undefined
      ? stateOverride
      : normaliseReportState(report?.report_state);

  const valueCandidates = [
    report?.purchase_price,
    state?.purchaseInputs?.purchasePrice,
  ];

  for (const candidate of valueCandidates) {
    if (typeof candidate === 'number' && Number.isFinite(candidate)) {
      return candidate;
    }

    if (typeof candidate === 'string') {
      const parsed = Number(candidate);
      if (!Number.isNaN(parsed)) {
        return parsed;
      }
    }
  }

  return null;
};

const resolveReportDateValue = (report, stateOverride = undefined) => {
  const state =
    stateOverride !== undefined
      ? stateOverride
      : normaliseReportState(report?.report_state);
  const candidates = [
    report?.created_at,
    report?.updated_at,
    state?.savedAt,
    state?.createdAt,
    state?.updatedAt,
  ];

  for (const candidate of candidates) {
    if (!candidate) {
      continue;
    }

    const date = new Date(candidate);
    const timestamp = date.getTime();

    if (!Number.isNaN(timestamp)) {
      return timestamp;
    }
  }

  return null;
};

const coerceNumber = (value) => {
  if (typeof value === 'number' && Number.isFinite(value)) {
    return value;
  }

  if (typeof value === 'string') {
    const parsed = Number(value);
    if (Number.isFinite(parsed)) {
      return parsed;
    }
  }

  return null;
};

const resolveCapRate = (report, stateOverride = undefined) => {
  const state =
    stateOverride !== undefined
      ? stateOverride
      : normaliseReportState(report?.report_state);

  const candidates = [report?.cap_rate, state?.calculations?.capRate];

  for (const candidate of candidates) {
    const numeric = coerceNumber(candidate);
    if (numeric !== null) {
      return numeric;
    }
  }

  return null;
};

const resolveTotalIncome = (report, stateOverride = undefined) => {
  const state =
    stateOverride !== undefined
      ? stateOverride
      : normaliseReportState(report?.report_state);

  const candidates = [
    report?.total_income,
    state?.calculations?.effectiveGrossIncome,
    state?.calculations?.totalIncome,
  ];

  for (const candidate of candidates) {
    const numeric = coerceNumber(candidate);
    if (numeric !== null) {
      return numeric;
    }
  }

  return null;
};

const resolveTotalExpenses = (report, stateOverride = undefined) => {
  const state =
    stateOverride !== undefined
      ? stateOverride
      : normaliseReportState(report?.report_state);

  const candidates = [report?.total_expenses, state?.calculations?.totalOpEx];

  for (const candidate of candidates) {
    const numeric = coerceNumber(candidate);
    if (numeric !== null) {
      return numeric;
    }
  }

  return null;
};

const DEFAULT_ANALYTICS_METRICS = {
  totalReports: 0,
  averagePurchasePrice: null,
  averagePricePerSite: null,
  averageCapRate: null,
  averageExpenseRatio: null,
};

const DEFAULT_PROPERTY_INFO = {
  name: 'Mobile Home Park',
  address: '',
  city: '',
  state: '',
  totalLots: '',
};

const DEFAULT_CONTACT_INFO = {
  name: '',
  email: '',
  phone: '',
  company: ''
};

const DEFAULT_PURCHASE_INPUTS = {
  purchasePrice: 850000,
  closingCosts: 25000,
  downPaymentPercent: 25,
  interestRate: 6.5,
  amortizationYears: 25,
  loanTermYears: 25,
  interestOnlyPeriodYears: 0,
};

const DEFAULT_IRR_INPUTS = {
  holdPeriod: 5,
  exitCapRate: 7.5
};

const DEFAULT_EXPENSES = [
  { id: 1, name: 'Property Tax', amount: 18000 },
  { id: 2, name: 'Insurance', amount: 12000 },
  { id: 3, name: 'Utilities', amount: 8400 },
  { id: 4, name: 'Maintenance & Repairs', amount: 15000 },
  { id: 5, name: 'Advertising & Marketing', amount: 2400 },
  { id: 6, name: 'Legal & Professional', amount: 3000 },
  { id: 7, name: 'Administrative', amount: 5000 },
  { id: 8, name: 'Payroll', amount: 0 },
];

const createDefaultExpenses = () =>
  DEFAULT_EXPENSES.map((expense) => ({ ...expense }));

const DEFAULT_PROFORMA_INPUTS = {
  year1NewLeases: 7,
  year2NewLeases: 5,
  year3NewLeases: 5,
  year4NewLeases: 5,
  year5NewLeases: 5,
  year1RentIncreaseValue: 0,
  year1RentIncreaseMode: 'percent',
  year2RentIncreaseValue: 0,
  year2RentIncreaseMode: 'percent',
  annualRentIncrease: 3,
  annualRentIncreaseMode: 'percent',
  annualExpenseIncrease: 2.5
};

const normaliseProformaInputs = (inputs = {}) => ({
  ...DEFAULT_PROFORMA_INPUTS,
  ...inputs,
});

const INCOME_CATEGORY_OPTIONS = [
  'Lot Rent',
  'Home Rent',
  'Utility Reimbursement',
  'Laundry',
  'Late Fees',
  'Other Income',
];

const EXPENSE_CATEGORY_OPTIONS = [
  'Property Tax',
  'Insurance',
  'Utilities',
  'Repairs & Maintenance',
  'Payroll',
  'Management Fee',
  'Advertising & Marketing',
  'Legal & Professional',
  'Administrative',
  'Other Expense',
];

const AUTH_REQUIRED_ERROR = 'AUTH_REQUIRED';

const generateUniqueLabel = (baseLabel, existingLabels = []) => {
  const trimmedBase = baseLabel && typeof baseLabel === 'string' ? baseLabel.trim() : '';
  const fallback = trimmedBase || 'New Item';

  if (!existingLabels.includes(fallback)) {
    return fallback;
  }

  let counter = 2;
  let candidate = `${fallback} (${counter})`;

  while (existingLabels.includes(candidate)) {
    counter += 1;
    candidate = `${fallback} (${counter})`;
  }

  return candidate;
};
const MobileHomeParkModel = () => {
  const { showToast } = useToast();
  const [session, setSession] = useState(null);
  const [authModalOpen, setAuthModalOpen] = useState(false);
  const [savedReports, setSavedReports] = useState([]);
  const [reportSort, setReportSort] = useState({ column: 'date', direction: 'desc' });
  const [selectedReportId, setSelectedReportId] = useState('');
  const [loadingReports, setLoadingReports] = useState(false);
  const [loadingReportId, setLoadingReportId] = useState(null);
  const [deletingReportId, setDeletingReportId] = useState(null);
  const [analyticsMetrics, setAnalyticsMetrics] = useState({
    ...DEFAULT_ANALYTICS_METRICS,
  });
  const [loadingAnalytics, setLoadingAnalytics] = useState(false);
  const [analyticsError, setAnalyticsError] = useState('');
  const [analyticsInitialized, setAnalyticsInitialized] = useState(false);
  const [reportName, setReportName] = useState('Mobile Home Park Report');
  const [quickPopulateRows, setQuickPopulateRows] = useState([
    {
      id: 1,
      numberOfLots: '',
      rentAmount: '',
      occupancyStatus: 'occupied',
    },
  ]);
  const quickPopulateIdRef = useRef(2);
  const [vacantTargetLots, setVacantTargetLots] = useState('');

  const [activeTab, setActiveTab] = useState('rent-roll');

  const formatReportDate = useCallback((value) => {
    if (!value) {
      return '';
    }

    const date = new Date(value);
    if (Number.isNaN(date.getTime())) {
      return '';
    }

    return date.toLocaleDateString('en-US', {
      month: '2-digit',
      day: '2-digit',
      year: 'numeric',
    });
  }, []);

  const sortedReports = useMemo(() => {
    if (!Array.isArray(savedReports)) {
      return [];
    }

    const items = [...savedReports];

    const { column, direction } = reportSort;
    const multiplier = direction === 'asc' ? 1 : -1;

    const compareText = (aValue, bValue) => {
      const aText = (aValue || '').toString().toLowerCase();
      const bText = (bValue || '').toString().toLowerCase();

      if (aText === bText) {
        return 0;
      }

      return aText > bText ? multiplier : -multiplier;
    };

    const compareNumber = (aValue, bValue) => {
      const aNum = Number.isFinite(aValue) ? aValue : null;
      const bNum = Number.isFinite(bValue) ? bValue : null;

      if (aNum === bNum) {
        return 0;
      }

      if (aNum === null) {
        return multiplier;
      }

      if (bNum === null) {
        return -multiplier;
      }

      return aNum > bNum ? multiplier : -multiplier;
    };

    const compareDate = (aReport, bReport) => {
      const aDate = resolveReportDateValue(aReport);
      const bDate = resolveReportDateValue(bReport);

      if (aDate === bDate) {
        return 0;
      }

      if (aDate === null) {
        return multiplier;
      }

      if (bDate === null) {
        return -multiplier;
      }

      return aDate > bDate ? multiplier : -multiplier;
    };

    items.sort((aReport, bReport) => {
      switch (column) {
        case 'name':
          return compareText(resolveReportName(aReport), resolveReportName(bReport));
        case 'city':
          return compareText(resolveCity(aReport), resolveCity(bReport));
        case 'state':
          return compareText(resolveState(aReport), resolveState(bReport));
        case 'sites':
          return compareNumber(
            resolveSiteCount(aReport),
            resolveSiteCount(bReport)
          );
        case 'price':
          return compareNumber(
            resolvePurchasePrice(aReport),
            resolvePurchasePrice(bReport)
          );
        case 'date':
        default:
          return compareDate(aReport, bReport);
      }
    });

    return items;
  }, [reportSort, savedReports]);

  const handleReportSort = useCallback((column) => {
    setReportSort((prev) => {
      if (prev.column === column) {
        return {
          column,
          direction: prev.direction === 'asc' ? 'desc' : 'asc',
        };
      }

      return {
        column,
        direction: column === 'date' ? 'desc' : 'asc',
      };
    });
  }, []);

  const [contactInfo, setContactInfo] = useState(() => ({ ...DEFAULT_CONTACT_INFO }));
  const [profileDefaults, setProfileDefaults] = useState(null);
  const [profileOpen, setProfileOpen] = useState(false);

  const handleProfileUpdated = useCallback((defaults) => {
    if (!defaults || typeof defaults !== 'object') {
      setProfileDefaults(null);
      return;
    }

    const normalised = {
      name: defaults.name || '',
      company: defaults.company || '',
      phone: defaults.phone || '',
      email: defaults.email || '',
    };

    setProfileDefaults((previous) => {
      setContactInfo((current) => {
        const next = { ...current };
        let changed = false;

        ['name', 'company', 'phone', 'email'].forEach((field) => {
          const nextValue = normalised[field] || '';
          const prevValue = previous ? previous[field] || '' : '';
          const currentValue = current[field] || '';

          if (!currentValue || (!prevValue && nextValue) || currentValue === prevValue) {
            if (nextValue && currentValue !== nextValue) {
              next[field] = nextValue;
              changed = true;
            }
          }
        });

        return changed ? next : current;
      });

      return normalised;
    });
  }, []);

  const sessionEmail = useMemo(
    () =>
      session?.user?.email ||
      session?.user?.user_metadata?.email ||
      session?.user?.user_metadata?.email_address ||
      '',
    [session]
  );

  useEffect(() => {
    if (!session?.user) {
      handleProfileUpdated(null);
      setContactInfo({ ...DEFAULT_CONTACT_INFO });
      setProfileOpen(false);
    }
  }, [handleProfileUpdated, session?.user]);

  const preparedByContact = useMemo(() => {
    const metadata = session?.user?.user_metadata || {};

    const resolveString = (value) => (typeof value === 'string' ? value.trim() : '');

    const emailCandidates = [
      contactInfo.email,
      profileDefaults?.email,
      metadata.email,
      metadata.email_address,
      session?.user?.email,
      sessionEmail,
    ];

    const resolvedEmail = emailCandidates
      .map(resolveString)
      .find((value) => Boolean(value)) || '';

    return {
      name: resolveString(contactInfo.name),
      company: resolveString(contactInfo.company),
      email: resolvedEmail,
      phone: resolveString(contactInfo.phone),
    };
  }, [contactInfo, profileDefaults, session, sessionEmail]);

  const hasValidQuickPopulateRows = useMemo(
    () =>
      quickPopulateRows.some((row) => {
        const lots = parseInt(row.numberOfLots, 10);
        return Number.isFinite(lots) && lots > 0;
      }),
    [quickPopulateRows]
  );

  // Rent Roll Inputs
  const [units, setUnits] = useState(() => {
    const initialUnits = [];
    for (let i = 1; i <= 65; i++) {
      initialUnits.push({
        id: i,
        lotNumber: i.toString(),
        tenant: i <= 50 ? 'Occupied' : 'Vacant',
        rent: 450,
        occupied: i <= 50
      });
    }
    return initialUnits;
  });

  const [selectedUnits, setSelectedUnits] = useState([]);

  const handleRentRollImport = useCallback(
    (rows) => {
      if (!Array.isArray(rows) || rows.length === 0) {
        return;
      }

      setUnits(() =>
        rows.map((row, index) => {
          const rawLotNumber = row?.lotNumber;
          const lotNumber =
            rawLotNumber !== undefined && rawLotNumber !== null && `${rawLotNumber}`.trim()
              ? `${rawLotNumber}`.trim()
              : `${index + 1}`;

          const occupied = (() => {
            if (typeof row?.occupied === 'string') {
              return /^(true|yes|y|1|occupied)$/i.test(row.occupied.trim());
            }
            return Boolean(row?.occupied);
          })();

          const numericRent = Number(row?.rent);
          const rent = Number.isFinite(numericRent) ? numericRent : 0;

          const tenantName =
            typeof row?.tenantName === 'string' && row.tenantName.trim()
              ? row.tenantName.trim()
              : occupied
              ? 'Occupied'
              : 'Vacant';

          return {
            id: index + 1,
            lotNumber,
            tenant: tenantName,
            rent,
            occupied,
          };
        })
      );
      setSelectedUnits([]);
      showToast({ message: '📥 Rent roll imported successfully.', tone: 'success' });
    },
    [setUnits, setSelectedUnits, showToast]
  );

  const handlePnLMappingApplied = useCallback(
    (payload) => {
      if (!payload || typeof payload !== 'object') {
        return;
      }

      const {
        mappedIncome = [],
        unmappedIncome = [],
        mappedExpense = [],
        unmappedExpense = [],
        totals = null,
        stats = null,
        derived = {},
      } = payload;

      const normaliseAmount = (value) => {
        const numeric = Number(value);
        return Number.isFinite(numeric) ? numeric : 0;
      };

      const lotRentEntries = mappedIncome.filter(
        (row) => row.mappedCategory === 'Lot Rent'
      );

      const lotRentTotal =
        Number.isFinite(Number(derived?.lotRentTotal))
          ? Number(derived.lotRentTotal)
          : lotRentEntries.reduce((sum, row) => sum + normaliseAmount(row.amount), 0);

      const otherIncomeItems = mappedIncome.filter(
        (row) => row.mappedCategory !== 'Lot Rent'
      );

      setAdditionalIncome(
        otherIncomeItems.map((item, index) => ({
          id: index + 1,
          name: item.label,
          amount: normaliseAmount(item.amount),
          originalLabel: item.originalLabel,
          mappedCategory: item.mappedCategory,
        }))
      );

      setUnmappedIncomeItems(
        unmappedIncome.map((item, index) => ({
          id: `unmapped-income-${index}`,
          name: item.label,
          amount: normaliseAmount(item.amount),
          originalLabel: item.originalLabel,
          mappedCategory: item.mappedCategory,
        }))
      );

      setExpenses(
        mappedExpense.map((item, index) => ({
          id: index + 1,
          name: item.label,
          amount: normaliseAmount(item.amount),
          originalLabel: item.originalLabel,
          mappedCategory: item.mappedCategory,
        }))
      );

      setUnmappedExpenseItems(
        unmappedExpense.map((item, index) => ({
          id: `unmapped-expense-${index}`,
          name: item.label,
          amount: normaliseAmount(item.amount),
          originalLabel: item.originalLabel,
          mappedCategory: item.mappedCategory,
        }))
      );

      if (lotRentTotal > 0) {
        setUseActualIncome(true);
        setActualIncome(Math.round(lotRentTotal));
      }

      try {
        const nextTotals =
          totals && typeof totals === 'object'
            ? {
                ...totals,
                lotRentAnnual: Math.round(Math.max(lotRentTotal, 0)),
              }
            : { lotRentAnnual: Math.round(Math.max(lotRentTotal, 0)) };

        setPnlTotals(nextTotals);
        setPnlMappingStats(stats || null);

        showToast({
          message: '✅ P&L Imported and Mapped Successfully',
          tone: 'success',
        });
      } catch (err) {
        console.error('❌ Error setting P&L totals:', err);
        showToast({
          message: '⚠️ Error processing P&L import',
          tone: 'error',
        });
      }
    },
    [
      setAdditionalIncome,
      setExpenses,
      setUnmappedExpenseItems,
      setUnmappedIncomeItems,
      setUseActualIncome,
      setActualIncome,
      setPnlTotals,
      setPnlMappingStats,
      showToast,
    ]
  );

  const quickPopulatePreview = useMemo(() => {
    if (!Array.isArray(units) || units.length === 0) {
      return {
        totalLots: 0,
        occupiedLots: 0,
        averageRent: 0,
        totalRentIncome: 0,
      };
    }

    let occupiedLots = 0;
    let occupiedRentSum = 0;
    const occupiedRentValues = [];

    units.forEach((unit) => {
      if (!unit) {
        return;
      }

      const rentValue = Number(unit.rent);

      if (unit.occupied) {
        occupiedLots += 1;

        if (Number.isFinite(rentValue) && rentValue > 0) {
          occupiedRentValues.push(rentValue);
          occupiedRentSum += rentValue;
        } else if (Number.isFinite(rentValue)) {
          occupiedRentSum += Math.max(rentValue, 0);
        }
      }
    });

    const averageRent =
      occupiedRentValues.length > 0
        ? occupiedRentValues.reduce((sum, value) => sum + value, 0) /
          occupiedRentValues.length
        : 0;

    return {
      totalLots: units.length,
      occupiedLots,
      averageRent,
      totalRentIncome: occupiedRentSum * 12,
    };
  }, [units]);

  const parsedVacantTarget = useMemo(() => {
    const target = parseInt(vacantTargetLots, 10);
    return Number.isFinite(target) ? target : null;
  }, [vacantTargetLots]);
  const canVacantRemaining = parsedVacantTarget !== null && parsedVacantTarget > units.length;

  // Property Information
  const [propertyInfo, setPropertyInfo] = useState(() => ({ ...DEFAULT_PROPERTY_INFO }));
  const [savingReport, setSavingReport] = useState(false);
  
  // Additional Income Inputs
  const [additionalIncome, setAdditionalIncome] = useState([
    { id: 1, name: 'Utility Income', amount: 3600 },
    { id: 2, name: 'Rental Home Income', amount: 12000 },
    { id: 3, name: 'Late Fees', amount: 1200 },
  ]);
  const [unmappedIncomeItems, setUnmappedIncomeItems] = useState([]);
  const [selectedIncomeCategory, setSelectedIncomeCategory] = useState(
    INCOME_CATEGORY_OPTIONS[0]
  );

  const [useActualIncome, setUseActualIncome] = useState(false);
  const [actualIncome, setActualIncome] = useState(0);

  // Operating Expense Inputs
  const [expenses, setExpenses] = useState(() => createDefaultExpenses());
  const [unmappedExpenseItems, setUnmappedExpenseItems] = useState([]);
  const [selectedExpenseCategory, setSelectedExpenseCategory] = useState(
    EXPENSE_CATEGORY_OPTIONS[0]
  );

  const [managementPercent, setManagementPercent] = useState(5);
  const [expenseRatio, setExpenseRatio] = useState(0);

  const [pnlTotals, setPnlTotals] = useState(null);
  const [pnlMappingStats, setPnlMappingStats] = useState(null);

  // Purchase & Financing Inputs
  const [purchaseInputs, setPurchaseInputs] = useState(() => ({ ...DEFAULT_PURCHASE_INPUTS }));

  // IRR Inputs
  const [irrInputs, setIrrInputs] = useState(() => ({ ...DEFAULT_IRR_INPUTS }));

  // Proforma Inputs
  const [proformaInputs, setProformaInputs] = useState(() => normaliseProformaInputs());
  const [projectionYears, setProjectionYears] = useState(5);

  const fetchSavedReports = useCallback(
    async ({ sessionOverride, accessToken, userId } = {}) => {
      if (!isSupabaseConfigured || !supabase) {
        return;
      }

      const activeSession = sessionOverride || session;
      const effectiveUserId = userId || activeSession?.user?.id || null;
      const effectiveAccessToken =
        accessToken || activeSession?.access_token || null;

      if (!effectiveUserId) {
        setSavedReports([]);
        return;
      }

      const effectiveEmail =
        activeSession?.user?.email ||
        activeSession?.user?.user_metadata?.email ||
        activeSession?.user?.user_metadata?.email_address ||
        sessionEmail ||
        '';

      setLoadingReports(true);

      const apiBase = process.env.REACT_APP_API_BASE || '';

      try {
        if (effectiveAccessToken) {
          try {
            const response = await fetch(`${apiBase}/api/list-reports`, {
              method: 'POST',
              headers: { 'Content-Type': 'application/json' },
              body: JSON.stringify({ accessToken: effectiveAccessToken }),
            });

            let payload = null;
            try {
              payload = await response.json();
            } catch (parseError) {
              console.error('Unable to parse saved reports response JSON:', parseError);
            }

            if (response.ok && payload?.success && Array.isArray(payload.data)) {
              const warnings = Array.isArray(payload?.warnings)
                ? payload.warnings.filter(Boolean)
                : [];

              warnings.forEach((warning) =>
                console.warn('Saved reports retrieved with warning:', warning)
              );

              setSavedReports(payload.data);
              return;
            }

            if (payload?.warnings) {
              payload.warnings
                .filter(Boolean)
                .forEach((warning) =>
                  console.warn('Saved reports API warning:', warning)
                );
            }

            const apiErrorMessage =
              payload?.error || response.statusText || 'Unknown list reports error';
            console.warn(
              'Falling back to direct Supabase query for saved reports:',
              apiErrorMessage
            );
          } catch (apiError) {
            console.error('Error fetching saved reports via API:', apiError);
          }
        }

        const columnVariants = [
          'id, report_name, park_name, created_at, updated_at, user_id, user_email, report_state',
          'id, report_name, park_name, created_at, updated_at, user_email, report_state',
          'id, report_name, park_name, created_at, updated_at, report_state',
          'id, park_name, created_at, updated_at, report_state',
          'id, park_name, created_at, updated_at',
          'id, park_name, created_at',
        ];

        const filterStrategies = [];

        if (effectiveUserId) {
          filterStrategies.push({
            label: 'user_id',
            apply: (query) => query.eq('user_id', effectiveUserId),
          });
        }

        if (effectiveEmail) {
          filterStrategies.push({
            label: 'user_email',
            apply: (query) => query.eq('user_email', effectiveEmail),
          });
        }

        filterStrategies.push({
          label: 'none',
          apply: (query) => query,
        });

        for (const columns of columnVariants) {
          for (const strategy of filterStrategies) {
            try {
              let query = supabase
                .from('reports')
                .select(columns)
                .order('updated_at', { ascending: false })
                .order('created_at', { ascending: false });

              query = strategy.apply(query);

              const { data, error } = await query;

              if (error) {
                if (error.code === '42703') {
                  console.warn(
                    `Supabase reports query skipped due to missing column (strategy: ${strategy.label}, columns: ${columns}).`,
                    error.message || error
                  );
                  continue;
                }

                if (error.code === '42501' || /permission denied/i.test(`${error.message} ${error.details}`)) {
                  console.error(
                    'Supabase Row Level Security prevented listing saved reports. Ensure select policies allow authenticated users to view their own data.',
                    error.message || error
                  );
                  break;
                }

                console.error('Error fetching saved reports:', error);
                continue;
              }

              if (!Array.isArray(data)) {
                continue;
              }

              let resolvedData = data;

              if (strategy.label === 'none' && effectiveUserId) {
                resolvedData = data.filter((row) => {
                  const state = row?.report_state;
                  const ownerId =
                    (state && (state.ownerUserId || state.userId || state.sessionUserId)) || null;
                  return ownerId === effectiveUserId;
                });
              }

              if (resolvedData.length === 0 && strategy.label !== 'none') {
                continue;
              }

              setSavedReports(resolvedData);
              return;
            } catch (strategyError) {
              console.error('Unexpected error executing Supabase report fetch strategy:', strategyError);
            }
          }
        }

        setSavedReports([]);
      } catch (err) {
        console.error('Unexpected error fetching saved reports:', err);
      } finally {
        setLoadingReports(false);
      }
    },
    [session, sessionEmail]
  );

  const fetchSavedReportsRef = useRef(fetchSavedReports);

  useEffect(() => {
    fetchSavedReportsRef.current = fetchSavedReports;
  }, [fetchSavedReports]);

  const sessionUserId = session?.user?.id || null;

  useEffect(() => {
    if (!sessionUserId) {
      setAnalyticsMetrics({ ...DEFAULT_ANALYTICS_METRICS });
      setAnalyticsError('');
    }

    setAnalyticsInitialized(false);
  }, [sessionUserId, isSupabaseConfigured]);

  const fetchAnalytics = useCallback(async () => {
    try {
      setLoadingAnalytics(true);
      setAnalyticsError(null);

      if (!supabase || !isSupabaseConfigured) {
        setAnalyticsMetrics({ ...DEFAULT_ANALYTICS_METRICS });
        setAnalyticsError('Supabase not initialized.');
        return;
      }

      const {
        data: { user } = {},
      } = await supabase.auth.getUser();

      if (!user) {
        setAnalyticsMetrics({ ...DEFAULT_ANALYTICS_METRICS });
        setAnalyticsError('Please sign in again.');
        return;
      }

      const response = await fetch(`/api/fetch-analytics?userId=${user.id}`);
      const contentType = response.headers.get('content-type');

      if (!response.ok) {
        const msg = `Server responded ${response.status}`;
        throw new Error(msg);
      }

      if (!contentType || !contentType.includes('application/json')) {
        const text = await response.text();
        throw new Error(`Unexpected response: ${text.substring(0, 100)}`);
      }

      const payload = await response.json();

      if (payload && typeof payload === 'object' && payload.error) {
        throw new Error(payload.error);
      }

      const metrics =
        payload && typeof payload === 'object' && payload.metrics
          ? payload.metrics
          : payload;

      console.log('✅ Loaded analytics metrics:', metrics);
      setAnalyticsMetrics({ ...DEFAULT_ANALYTICS_METRICS, ...metrics });
    } catch (err) {
      console.error('❌ Analytics fetch error:', err);
      setAnalyticsMetrics({ ...DEFAULT_ANALYTICS_METRICS });
      setAnalyticsError('Unable to load analytics right now. Please try again.');
    } finally {
      setLoadingAnalytics(false);
      setAnalyticsInitialized(true);
    }
  }, [isSupabaseConfigured]);

  useEffect(() => {
    if (!isSupabaseConfigured || !supabase) {
      setSession(null);
      return;
    }

    let subscription;

    const initialiseSession = async () => {
      try {
        const { data } = await supabase.auth.getSession();
        setSession(data?.session || null);
      } catch (err) {
        console.error('Error initialising Supabase session:', err);
      }
    };

    initialiseSession();

    const { data: listener } = supabase.auth.onAuthStateChange((_event, newSession) => {
      setSession(newSession);
      if (newSession?.user?.id) {
        setAuthModalOpen(false);
      } else {
        setSavedReports((current) => (current.length > 0 ? [] : current));
        setSelectedReportId('');
      }
    });

    subscription = listener?.subscription;

    return () => {
      subscription?.unsubscribe?.();
    };
  }, []);

  useEffect(() => {
    if (!sessionUserId) {
      setSavedReports((current) => (current.length > 0 ? [] : current));
      setSelectedReportId('');
      return;
    }

    fetchSavedReportsRef.current();
  }, [sessionUserId]);

  useEffect(() => {
    if (!session?.user && (activeTab === 'my-reports' || activeTab === 'analytics')) {
      setActiveTab('rent-roll');
    }
  }, [session?.user, activeTab]);

  useEffect(() => {
    if (!session?.user?.id || !isSupabaseConfigured || !supabase) {
      return;
    }

    let isMounted = true;

    const ensureAndLoadProfile = async () => {
      const userId = session.user.id;
      const emailCandidate =
        sessionEmail ||
        session.user.email ||
        session.user.user_metadata?.email ||
        session.user.user_metadata?.email_address ||
        '';

      try {
        await supabase
          .from('profiles')
          .upsert(
            {
              id: userId,
              email: emailCandidate || null,
            },
            { onConflict: 'id' }
          );
      } catch (ensureError) {
        console.warn('Unable to ensure Supabase profile exists:', ensureError);
      }

      try {
        const { data, error } = await supabase
          .from('profiles')
          .select('name, company, phone, email')
          .eq('id', userId)
          .single();

        if (!isMounted) {
          return;
        }

        if (error) {
          const code = error?.code || error?.details;
          if (code && code !== 'PGRST116') {
            throw error;
          }

          handleProfileUpdated({
            name: '',
            company: '',
            phone: '',
            email: emailCandidate || '',
          });
          return;
        }

        handleProfileUpdated({
          name: data?.name || '',
          company: data?.company || '',
          phone: data?.phone || '',
          email: data?.email || emailCandidate || '',
        });
      } catch (fetchError) {
        if (isMounted) {
          console.error('Error fetching Supabase profile:', fetchError);
        }
      }
    };

    ensureAndLoadProfile();

    return () => {
      isMounted = false;
    };
  }, [handleProfileUpdated, isSupabaseConfigured, session, session?.user?.id, sessionEmail, supabase]);

  useEffect(() => {
    if (activeTab !== 'analytics') {
      return;
    }

    if (!analyticsInitialized) {
      fetchAnalytics();
    }
  }, [activeTab, analyticsInitialized, fetchAnalytics]);

  useEffect(() => {
    if (!session?.user) {
      return;
    }

    const metadata = session.user.user_metadata || {};

    setContactInfo((prev) => {
      const next = { ...prev };
      let changed = false;

      const assignIfEmpty = (key, value) => {
        if (next[key]) {
          return;
        }

        if (typeof value === 'string') {
          const trimmed = value.trim();
          if (trimmed) {
            next[key] = trimmed;
            changed = true;
          }
        }
      };

      assignIfEmpty('name', metadata.full_name || metadata.name || metadata.user_name);
      assignIfEmpty('company', metadata.company || metadata.organization);
      assignIfEmpty('phone', metadata.phone || metadata.phone_number || metadata.phoneNumber);
      assignIfEmpty(
        'email',
        metadata.email ||
          metadata.email_address ||
          session.user.email ||
          sessionEmail
      );

      return changed ? next : prev;
    });
  }, [session, sessionEmail]);

  const savedReportCount = savedReports.length;

  useEffect(() => {
    if (activeTab !== 'my-reports') {
      return;
    }

    if (!sessionUserId) {
      return;
    }

    if (loadingReports) {
      return;
    }

    if (savedReportCount > 0) {
      return;
    }

    fetchSavedReportsRef.current();
  }, [activeTab, sessionUserId, loadingReports, savedReportCount]);

  useEffect(() => {
    if (!propertyInfo.name) {
      return;
    }

    if (reportName === '' || reportName === 'Mobile Home Park Report') {
      setReportName(propertyInfo.name);
    }
  }, [propertyInfo.name, reportName]);

  const handleRefreshReports = useCallback(() => {
    if (!session?.user?.id) {
      return;
    }

    fetchSavedReportsRef.current();
  }, [session]);

  const handleRefreshAnalytics = useCallback(() => {
    fetchAnalytics();
  }, [fetchAnalytics]);

  const handleSignOut = useCallback(async () => {
    if (!isSupabaseConfigured || !supabase) {
      return;
    }

    try {
      await supabase.auth.signOut();
    } catch (err) {
      console.error('Error signing out of Supabase:', err);
    } finally {
      setSession(null);
      setSavedReports([]);
      setSelectedReportId('');
      setLoadingReportId(null);
      setReportName('Mobile Home Park Report');
      setReportSort({ column: 'date', direction: 'desc' });
    }
  }, []);

  const requireAuth = useCallback(async () => {
    if (!isSupabaseConfigured || !supabase) {
      alert('Supabase is not configured. Please add your Supabase credentials to enable this feature.');
      const error = new Error('Supabase is not configured');
      error.code = 'SUPABASE_NOT_CONFIGURED';
      throw error;
    }

    const { data, error } = await supabase.auth.getUser();

    if (error || !data?.user) {
      setAuthModalOpen(true);
      alert('Please sign in to continue.');
      const authError = new Error(error?.message || 'User not authenticated');
      authError.code = AUTH_REQUIRED_ERROR;
      throw authError;
    }

    return data.user;
  }, [setAuthModalOpen]);

  const loadReportData = useCallback(
    (data, { reportIdString } = {}) => {
      if (!data || typeof data !== 'object') {
        return false;
      }

      const normaliseCollection = (value) => {
        if (Array.isArray(value)) {
          return value;
        }
        if (value && typeof value === 'object') {
          return Object.values(value);
        }
        return null;
      };

      const savedState =
        data.report_state && typeof data.report_state === 'object'
          ? data.report_state
          : null;

      const resolvedUnits = savedState?.units || normaliseCollection(data.rent_roll);
      if (Array.isArray(resolvedUnits) && resolvedUnits.length > 0) {
        setUnits(resolvedUnits);
      }

      const normaliseSiteCount = (value) => {
        if (typeof value === 'number' && Number.isFinite(value)) {
          return value;
        }

        if (typeof value === 'string') {
          const parsed = Number(value);
          if (Number.isFinite(parsed)) {
            return parsed;
          }
        }

        return null;
      };

      const fallbackSiteCount =
        normaliseSiteCount(savedState?.propertyInfo?.totalLots) ??
        normaliseSiteCount(savedState?.calculations?.totalUnits) ??
        normaliseSiteCount(data.total_lots) ??
        (Array.isArray(resolvedUnits) ? resolvedUnits.length : null);

      if (savedState?.propertyInfo) {
        setPropertyInfo((prev) => {
          const next = {
            ...prev,
            ...savedState.propertyInfo,
          };

          if (
            fallbackSiteCount !== null &&
            (next.totalLots === undefined || next.totalLots === '' || !Number.isFinite(Number(next.totalLots)))
          ) {
            next.totalLots = fallbackSiteCount;
          }

          return next;
        });
      } else {
        setPropertyInfo({
          name: data.report_name || data.park_name || DEFAULT_PROPERTY_INFO.name,
          address: data.park_address || '',
          city: data.park_city || '',
          state: data.park_state || '',
          totalLots: fallbackSiteCount ?? '',
        });
      }

      if (savedState?.contactInfo) {
        setContactInfo(savedState.contactInfo);
      } else {
        setContactInfo({
          name: data.user_name || '',
          email: data.user_email || sessionEmail || '',
          phone: data.user_phone || '',
          company: data.user_company || '',
        });
      }

      if (Array.isArray(savedState?.additionalIncome)) {
        setAdditionalIncome(savedState.additionalIncome);
      } else {
        const incomeItems = normaliseCollection(data.additional_income);
        if (Array.isArray(incomeItems) && incomeItems.length > 0) {
          setAdditionalIncome(incomeItems);
        }
      }

      if (Array.isArray(savedState?.unmappedIncomeItems)) {
        setUnmappedIncomeItems(savedState.unmappedIncomeItems);
      } else {
        setUnmappedIncomeItems([]);
      }

      let nextExpenses = null;
      if (Array.isArray(savedState?.expenses)) {
        nextExpenses = savedState.expenses;
      } else {
        const expenseItems = normaliseCollection(data.expense_items);
        if (Array.isArray(expenseItems) && expenseItems.length > 0) {
          nextExpenses = expenseItems;
        }
      }

      if (Array.isArray(nextExpenses)) {
        setExpenses(nextExpenses);
      } else {
        setExpenses(createDefaultExpenses());
      }

      if (Array.isArray(savedState?.unmappedExpenseItems)) {
        setUnmappedExpenseItems(savedState.unmappedExpenseItems);
      } else {
        setUnmappedExpenseItems([]);
      }

      if (typeof savedState?.managementPercent === 'number') {
        setManagementPercent(savedState.managementPercent);
      }

      if (savedState?.purchaseInputs) {
        setPurchaseInputs({
          ...DEFAULT_PURCHASE_INPUTS,
          ...savedState.purchaseInputs,
        });
      } else {
        setPurchaseInputs({
          purchasePrice: data.purchase_price ?? DEFAULT_PURCHASE_INPUTS.purchasePrice,
          closingCosts: data.closing_costs ?? DEFAULT_PURCHASE_INPUTS.closingCosts,
          downPaymentPercent:
            data.down_payment_percent ?? DEFAULT_PURCHASE_INPUTS.downPaymentPercent,
          interestRate: data.interest_rate ?? DEFAULT_PURCHASE_INPUTS.interestRate,
          amortizationYears:
            data.amortization_years ??
            data.loan_term_years ??
            DEFAULT_PURCHASE_INPUTS.amortizationYears,
          loanTermYears: data.loan_term_years ?? DEFAULT_PURCHASE_INPUTS.loanTermYears,
          interestOnlyPeriodYears:
            data.interest_only_period_years ?? DEFAULT_PURCHASE_INPUTS.interestOnlyPeriodYears,
        });
      }

      if (typeof savedState?.expenseRatio === 'number') {
        setExpenseRatio(savedState.expenseRatio);
      } else if (typeof data.expense_ratio === 'number') {
        setExpenseRatio(data.expense_ratio);
      } else {
        setExpenseRatio(0);
      }

      if (savedState?.irrInputs) {
        setIrrInputs(savedState.irrInputs);
      }

      if (savedState?.proformaInputs) {
        setProformaInputs(normaliseProformaInputs(savedState.proformaInputs));
      }

      if (savedState?.pnlTotals) {
        setPnlTotals(savedState.pnlTotals);
      } else {
        setPnlTotals(null);
      }

      if (savedState?.pnlMappingStats) {
        setPnlMappingStats(savedState.pnlMappingStats);
      } else {
        setPnlMappingStats(null);
      }

      if (typeof savedState?.projectionYears === 'number') {
        setProjectionYears(savedState.projectionYears);
      } else if (typeof data.projection_years === 'number') {
        setProjectionYears(data.projection_years);
      } else {
        setProjectionYears(5);
      }

      if (typeof savedState?.useActualIncome === 'boolean') {
        setUseActualIncome(savedState.useActualIncome);
      }

      if (typeof savedState?.actualIncome === 'number') {
        setActualIncome(savedState.actualIncome);
      }

      setSelectedUnits([]);

      const resolvedReportIdString =
        reportIdString ||
        (data.id !== undefined && data.id !== null ? String(data.id) : '');

      if (resolvedReportIdString) {
        setSelectedReportId(resolvedReportIdString);
      }

      setReportName(
        savedState?.reportName ||
          data.report_name ||
          data.park_name ||
          reportName ||
          'Mobile Home Park Report'
      );
      setActiveTab(savedState?.activeTab || 'rent-roll');

      return true;
    },
    [reportName, sessionEmail]
  );

  const loadReport = useCallback(
    async (report) => {
      if (!isSupabaseConfigured || !supabase) {
        alert('Supabase is not configured. Please add your Supabase credentials to enable loading reports.');
        return;
      }

      if (!session?.user?.id) {
        setAuthModalOpen(true);
        return;
      }

      const resolvedReportId =
        (report && typeof report === 'object' ? report.id : report) || null;

      if (!resolvedReportId) {
        alert('Unable to load the selected report.');
        return;
      }

      const reportIdString = String(resolvedReportId);
      setLoadingReportId(reportIdString);

      const apiBase = process.env.REACT_APP_API_BASE || '';
      const accessToken = session?.access_token || null;

      try {
        const response = await fetch(`${apiBase}/api/load-report`, {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({ reportId: resolvedReportId, accessToken }),
        });

        let payload = null;

        try {
          payload = await response.json();
        } catch (parseError) {
          console.error('Unable to parse load report response JSON:', parseError);
        }

        if (payload?.warnings) {
          payload.warnings
            .filter(Boolean)
            .forEach((warning) =>
              console.warn('Load report warning:', warning)
            );
        }

        if (!response.ok || !payload?.success || !payload?.data) {
          const message = payload?.error || response.statusText || 'Unable to load the selected report.';

          if (response.status === 404 || /not found/i.test(message)) {
            alert('Report not found.');
            return;
          }

          console.error('Error loading saved report:', {
            status: response.status,
            message,
            details: payload?.details || null,
          });
          alert('Unable to load the selected report.');
          return;
        }

        const applied = loadReportData(payload.data, { reportIdString });

        if (!applied) {
          alert('Unable to load the selected report.');
          return;
        }

        alert('Report loaded successfully.');
      } catch (err) {
        console.error('Unexpected error loading report:', err);
        alert('Unable to load the selected report.');
      } finally {
        setLoadingReportId(null);
      }
    },
    [loadReportData, session]
  );

  // Add/Remove units
  const addUnit = () => {
    const newId = Math.max(...units.map(u => u.id), 0) + 1;
    setUnits([...units, {
      id: newId,
      lotNumber: newId.toString(),
      tenant: 'Vacant',
      rent: 450,
      occupied: false
    }]);
  };

  const addMultipleUnits = (count) => {
    const newUnits = [];
    const startId = Math.max(...units.map(u => u.id), 0) + 1;
    for (let i = 0; i < count; i++) {
      newUnits.push({
        id: startId + i,
        lotNumber: (startId + i).toString(),
        tenant: 'Vacant',
        rent: 450,
        occupied: false
      });
    }
    setUnits([...units, ...newUnits]);
  };

  const removeUnit = (id) => {
    if (units.length > 1) {
      setUnits(units.filter(u => u.id !== id));
    }
  };

  const updateUnit = (id, field, value) => {
    setUnits(units.map(u => 
      u.id === id ? { ...u, [field]: value } : u
    ));
  };

  const toggleUnitSelection = (id) => {
    if (selectedUnits.includes(id)) {
      setSelectedUnits(selectedUnits.filter(uid => uid !== id));
    } else {
      setSelectedUnits([...selectedUnits, id]);
    }
  };

  const selectAllUnits = () => {
    setSelectedUnits(units.map(u => u.id));
  };

  const deselectAllUnits = () => {
    setSelectedUnits([]);
  };

  const bulkUpdateOccupancy = (occupied) => {
    if (selectedUnits.length === 0) {
      alert('Please select at least one lot first');
      return;
    }
    setUnits(units.map(u => 
      selectedUnits.includes(u.id) ? { ...u, occupied, tenant: occupied ? 'Occupied' : 'Vacant' } : u
    ));
    setSelectedUnits([]);
  };

  const bulkUpdateRent = (rent) => {
    if (selectedUnits.length === 0) {
      alert('Please select at least one lot first');
      return;
    }
    const rentValue = parseFloat(rent);
    if (isNaN(rentValue) || rentValue < 0) {
      alert('Please enter a valid rent amount');
      return;
    }
    setUnits(units.map(u =>
      selectedUnits.includes(u.id) ? { ...u, rent: rentValue } : u
    ));
    setSelectedUnits([]);
  };

  const addQuickPopulateRow = useCallback(() => {
    setQuickPopulateRows((prev) => [
      ...prev,
      {
        id: quickPopulateIdRef.current++,
        numberOfLots: '',
        rentAmount: '',
        occupancyStatus: 'occupied',
      },
    ]);
  }, []);

  const updateQuickPopulateRow = useCallback((id, field, value) => {
    setQuickPopulateRows((prev) =>
      prev.map((row) => (row.id === id ? { ...row, [field]: value } : row))
    );
  }, []);

  const removeQuickPopulateRow = useCallback((id) => {
    setQuickPopulateRows((prev) => {
      if (prev.length === 1) {
        return prev;
      }

      return prev.filter((row) => row.id !== id);
    });
  }, []);

  const applyQuickPopulate = useCallback(() => {
    const groups = quickPopulateRows
      .map((row) => {
        const lots = parseInt(row.numberOfLots, 10);
        if (!Number.isFinite(lots) || lots <= 0) {
          return null;
        }

        const rentValue = parseFloat(row.rentAmount);

        return {
          lots,
          rent: Number.isFinite(rentValue) && rentValue >= 0 ? rentValue : 0,
          occupied: row.occupancyStatus === 'occupied',
        };
      })
      .filter(Boolean);

    if (groups.length === 0) {
      alert('Add at least one valid quick populate row before applying.');
      return;
    }

    let appendedCount = 0;
    let resultingLength = null;

    setUnits((prevUnits) => {
      let highestLotNumber = 0;
      let maxId = 0;

      prevUnits.forEach((unit) => {
        if (!unit) {
          return;
        }

        const numericLot = parseInt(unit.lotNumber, 10);
        if (Number.isFinite(numericLot) && numericLot > highestLotNumber) {
          highestLotNumber = numericLot;
        }

        const numericId =
          typeof unit.id === 'number'
            ? unit.id
            : parseInt(String(unit.id), 10);

        if (Number.isFinite(numericId) && numericId > maxId) {
          maxId = numericId;
        }
      });

      if (!Number.isFinite(highestLotNumber) || highestLotNumber < prevUnits.length) {
        highestLotNumber = prevUnits.length;
      }

      let nextId = maxId > 0 ? maxId + 1 : 1;
      const generatedUnits = [];

      groups.forEach((group) => {
        for (let i = 0; i < group.lots; i += 1) {
          highestLotNumber += 1;
          generatedUnits.push({
            id: nextId,
            lotNumber: `${highestLotNumber}`,
            tenant: group.occupied ? 'Occupied' : 'Vacant',
            rent: group.rent,
            occupied: group.occupied,
          });
          nextId += 1;
        }
      });

      appendedCount = generatedUnits.length;

      if (appendedCount === 0) {
        resultingLength = prevUnits.length;
        return prevUnits;
      }

      const updatedUnits = [...prevUnits, ...generatedUnits];
      resultingLength = updatedUnits.length;
      return updatedUnits;
    });

    setSelectedUnits([]);

    if (appendedCount > 0 && Number.isFinite(resultingLength)) {
      setVacantTargetLots(String(resultingLength));
    }
  }, [quickPopulateRows]);

  const clearRentRoll = useCallback(() => {
    setUnits([]);
    setSelectedUnits([]);
    setVacantTargetLots('');
    setQuickPopulateRows([
      {
        id: 1,
        numberOfLots: '',
        rentAmount: '',
        occupancyStatus: 'occupied',
      },
    ]);
    quickPopulateIdRef.current = 2;
  }, []);

  const vacantRemainingLots = useCallback(() => {
    const target = parseInt(vacantTargetLots, 10);

    if (!Number.isFinite(target) || target <= 0) {
      alert('Enter a valid total lot count before filling remaining lots.');
      return;
    }

    if (target <= units.length) {
      alert('Total lots must be greater than the current number of rows.');
      return;
    }

    setUnits((prevUnits) => {
      let highestLotNumber = 0;
      let maxId = 0;

      prevUnits.forEach((unit) => {
        if (!unit) {
          return;
        }

        const numericLot = parseInt(unit.lotNumber, 10);
        if (Number.isFinite(numericLot) && numericLot > highestLotNumber) {
          highestLotNumber = numericLot;
        }

        const numericId =
          typeof unit.id === 'number'
            ? unit.id
            : parseInt(String(unit.id), 10);

        if (Number.isFinite(numericId) && numericId > maxId) {
          maxId = numericId;
        }
      });

      if (!Number.isFinite(highestLotNumber) || highestLotNumber < prevUnits.length) {
        highestLotNumber = prevUnits.length;
      }

      let nextId = maxId > 0 ? maxId + 1 : 1;
      const updatedUnits = [...prevUnits];

      while (updatedUnits.length < target) {
        highestLotNumber += 1;
        updatedUnits.push({
          id: nextId,
          lotNumber: `${highestLotNumber}`,
          tenant: 'Vacant',
          rent: 0,
          occupied: false,
        });
        nextId += 1;
      }

      return updatedUnits;
    });

    setSelectedUnits([]);
    setVacantTargetLots(String(target));
  }, [units.length, vacantTargetLots]);

  // Additional Income Functions
  const addIncomeItem = useCallback(() => {
    setAdditionalIncome((prev) => {
      const nextId = prev.reduce((maxId, item) => {
        const numericId = Number(item?.id);
        if (Number.isFinite(numericId)) {
          return Math.max(maxId, numericId);
        }
        return maxId;
      }, 0) + 1;

      const existingNames = prev.map((item) => item?.name).filter(Boolean);
      const label = generateUniqueLabel(
        selectedIncomeCategory || 'New Income',
        existingNames
      );

      return [
        ...prev,
        {
          id: nextId,
          name: label,
          amount: 0,
        },
      ];
    });
  }, [selectedIncomeCategory]);

  const removeIncomeItem = useCallback((id) => {
    setAdditionalIncome((prev) => prev.filter((item) => item.id !== id));
  }, []);

  const updateIncomeItem = useCallback((id, field, value) => {
    setAdditionalIncome((prev) =>
      prev.map((item) => (item.id === id ? { ...item, [field]: value } : item))
    );
  }, []);

  const clearIncomeItems = useCallback(() => {
    const hasMapped = additionalIncome.length > 0;
    const hasUnmapped = unmappedIncomeItems.length > 0;

    if (!hasMapped && !hasUnmapped) {
      return;
    }

    const confirmed = window.confirm('Clear all income line items?');
    if (!confirmed) {
      return;
    }

    setAdditionalIncome([]);
    setUnmappedIncomeItems([]);
    setPnlTotals(null);
    setPnlMappingStats(null);
  }, [additionalIncome.length, unmappedIncomeItems.length]);

  // Expense Functions
  const addExpenseItem = useCallback(() => {
    setExpenses((prev) => {
      const nextId = prev.reduce((maxId, expense) => {
        const numericId = Number(expense?.id);
        if (Number.isFinite(numericId)) {
          return Math.max(maxId, numericId);
        }
        return maxId;
      }, 0) + 1;

      const existingNames = prev.map((expense) => expense?.name).filter(Boolean);
      const label = generateUniqueLabel(
        selectedExpenseCategory || 'New Expense',
        existingNames
      );

      return [
        ...prev,
        {
          id: nextId,
          name: label,
          amount: 0,
        },
      ];
    });
  }, [selectedExpenseCategory]);

  const removeExpenseItem = useCallback((id) => {
    setExpenses((prev) => prev.filter((expense) => expense.id !== id));
  }, []);

  const updateExpenseItem = useCallback((id, field, value) => {
    setExpenses((prev) =>
      prev.map((expense) =>
        expense.id === id ? { ...expense, [field]: value } : expense
      )
    );
  }, []);

  const clearExpenseItems = useCallback(() => {
    const hasMapped = expenses.length > 0;
    const hasUnmapped = unmappedExpenseItems.length > 0;

    if (!hasMapped && !hasUnmapped) {
      return;
    }

    const confirmed = window.confirm('Clear all expense line items?');
    if (!confirmed) {
      return;
    }

    setExpenses([]);
    setUnmappedExpenseItems([]);
  }, [expenses.length, unmappedExpenseItems.length]);

  // Calculations
  const calculations = useMemo(() => {
    // Rent Roll Metrics
    const totalUnits = units.length;
    const occupiedUnits = units.filter((u) => u.occupied).length;
    const physicalOccupancy = totalUnits > 0 ? (occupiedUnits / totalUnits) * 100 : 0;
    const grossPotentialRent = units.reduce((sum, u) => sum + Number(u.rent), 0) * 12;
    const rentRollIncome =
      units.filter((u) => u.occupied).reduce((sum, u) => sum + Number(u.rent), 0) * 12;

    // Determine which income to use
    const lotRentIncome = useActualIncome ? Number(actualIncome) : rentRollIncome;

    // Additional Income
    const totalUnmappedIncome = unmappedIncomeItems.reduce(
      (sum, item) => sum + Number(item.amount),
      0
    );
    const mappedAdditionalIncomeTotal = additionalIncome.reduce(
      (sum, item) => sum + Number(item.amount),
      0
    );
    const totalAdditionalIncome = mappedAdditionalIncomeTotal + totalUnmappedIncome;

    // Total Income
    const effectiveGrossIncome = lotRentIncome + totalAdditionalIncome;
    const vacancyLoss = grossPotentialRent - lotRentIncome;
    const economicOccupancy = grossPotentialRent > 0 ? (lotRentIncome / grossPotentialRent) * 100 : 0;

    // Operating Expenses
    const managementFee = effectiveGrossIncome * (managementPercent / 100);
    const totalUnmappedExpenses = unmappedExpenseItems.reduce(
      (sum, item) => sum + Number(item.amount),
      0
    );
    const detailedExpenses =
      expenses.reduce((sum, exp) => sum + Number(exp.amount), 0) +
      managementFee +
      totalUnmappedExpenses;
    const ratioValue = Number(expenseRatio);
    const expenseRatioPercent = Number.isFinite(ratioValue) ? Math.max(ratioValue, 0) : 0;
    const useExpenseRatioOverride = expenseRatioPercent > 0;
    const totalOpEx = useExpenseRatioOverride
      ? effectiveGrossIncome * (expenseRatioPercent / 100)
      : detailedExpenses;
    const totalExpenses = totalOpEx;

    // NOI
    const noi = effectiveGrossIncome - totalOpEx;
    const capRate = (noi / purchaseInputs.purchasePrice) * 100;

    // Financing
    const totalInvestment = purchaseInputs.purchasePrice + purchaseInputs.closingCosts;
    const downPayment = totalInvestment * (purchaseInputs.downPaymentPercent / 100);
    const loanAmount = totalInvestment - downPayment;
    const annualRate = purchaseInputs.interestRate / 100;
    const monthlyRate = annualRate / 12;
    const amortizationYears = Number(purchaseInputs.amortizationYears) || 0;
    const amortizationMonthsTotal = Math.max(Math.round(amortizationYears * 12), 0);
    const totalTermYears = Number(purchaseInputs.loanTermYears) || 0;
    const totalTermMonths = Math.max(Math.round(totalTermYears * 12), 0);
    const requestedInterestOnlyYears = Number(purchaseInputs.interestOnlyPeriodYears) || 0;
    const maxInterestOnlyYears = amortizationYears > 0
      ? Math.min(totalTermYears, amortizationYears)
      : totalTermYears;
    const interestOnlyYears = Math.max(0, Math.min(requestedInterestOnlyYears, maxInterestOnlyYears));
    const interestOnlyMonths = Math.min(
      Math.round(interestOnlyYears * 12),
      totalTermMonths,
      amortizationMonthsTotal > 0 ? amortizationMonthsTotal : totalTermMonths
    );
    const amortizationMonthsForPayment =
      amortizationMonthsTotal > 0 ? Math.max(amortizationMonthsTotal - interestOnlyMonths, 0) : 0;

    let interestOnlyMonthlyPayment = 0;
    if (loanAmount > 0) {
      interestOnlyMonthlyPayment = monthlyRate > 0 ? loanAmount * monthlyRate : 0;
    }

    let amortizingMonthlyPayment = 0;
    if (loanAmount > 0 && amortizationMonthsForPayment > 0) {
      if (monthlyRate > 0) {
        const factor = Math.pow(1 + monthlyRate, amortizationMonthsForPayment);
        amortizingMonthlyPayment = (loanAmount * monthlyRate * factor) / (factor - 1);
      } else {
        amortizingMonthlyPayment = loanAmount / amortizationMonthsForPayment;
      }
    } else if (loanAmount > 0) {
      amortizingMonthlyPayment = interestOnlyMonthlyPayment;
    }

    const loanSchedule = [];
    let remainingBalance = loanAmount;

    for (let month = 1; month <= totalTermMonths; month += 1) {
      if (remainingBalance <= 0) {
        loanSchedule.push({
          payment: 0,
          interestPayment: 0,
          principalPayment: 0,
          remainingBalance: 0,
        });
        continue;
      }

      const withinInterestOnly = month <= interestOnlyMonths;
      let payment = 0;
      let interestPayment = 0;

      if (monthlyRate > 0) {
        interestPayment = remainingBalance * monthlyRate;
        if (withinInterestOnly) {
          payment = interestOnlyMonthlyPayment;
        } else if (amortizationMonthsForPayment > 0) {
          payment = amortizingMonthlyPayment;
        } else {
          payment = interestPayment;
        }
      } else {
        interestPayment = 0;
        if (withinInterestOnly) {
          payment = 0;
        } else if (amortizationMonthsForPayment > 0) {
          payment = amortizingMonthlyPayment;
        } else {
          payment = 0;
        }
      }

      let principalPayment = payment - interestPayment;

      if (!Number.isFinite(principalPayment) || principalPayment < 0) {
        principalPayment = 0;
      }

      if (principalPayment > remainingBalance) {
        principalPayment = remainingBalance;
        payment = interestPayment + principalPayment;
      }

      remainingBalance = Math.max(0, remainingBalance - principalPayment);

      loanSchedule.push({
        payment,
        interestPayment,
        principalPayment,
        remainingBalance,
      });
    }

    const annualDebtServiceSchedule = [];
    if (totalTermMonths > 0) {
      const totalYears = Math.ceil(totalTermMonths / 12);
      for (let yearIndex = 0; yearIndex < totalYears; yearIndex += 1) {
        const start = yearIndex * 12;
        const payments = loanSchedule.slice(start, start + 12);
        if (payments.length === 0) {
          break;
        }

        const totalPayment = payments.reduce((sum, entry) => sum + entry.payment, 0);
        const totalInterestPaid = payments.reduce(
          (sum, entry) => sum + entry.interestPayment,
          0
        );
        const totalPrincipalPaid = payments.reduce(
          (sum, entry) => sum + entry.principalPayment,
          0
        );
        const endingBalance = payments[payments.length - 1]?.remainingBalance ?? 0;

        annualDebtServiceSchedule.push({
          year: yearIndex + 1,
          totalPayment,
          totalInterest: totalInterestPaid,
          totalPrincipal: totalPrincipalPaid,
          endingBalance,
        });
      }
    }

    const firstYearDebtService =
      annualDebtServiceSchedule[0]?.totalPayment ||
      loanSchedule.slice(0, 12).reduce((sum, entry) => sum + entry.payment, 0);
    const firstMonthPayment = loanSchedule[0]?.payment || 0;
    const maturityBalance =
      loanSchedule.length > 0
        ? loanSchedule[loanSchedule.length - 1]?.remainingBalance ?? loanAmount
        : loanAmount;

    // 5/7/10-Year Proforma Calculations
    const projectionCount = Number.isFinite(Number(projectionYears))
      ? Math.max(Number(projectionYears), 1)
      : 5;

    const calculateProforma = () => {
      const years = [];
      let currentOccupiedUnits = occupiedUnits;
      const baseRent = occupiedUnits > 0 ? lotRentIncome / occupiedUnits / 12 : 0;
      let currentRent = Number.isFinite(baseRent) ? baseRent : 0;
      let currentOtherIncome = totalAdditionalIncome;
      let currentExpensesValue = totalOpEx;

      const resolveMode = (mode) =>
        mode === 'dollar' || mode === 'flat' ? 'dollar' : 'percent';

      const toNumber = (value) => {
        const parsed = Number(value);
        return Number.isFinite(parsed) ? parsed : 0;
      };

      const applyRentIncrease = (rent, value, mode) => {
        const safeBase = Number.isFinite(rent) ? rent : 0;
        const increaseValue = toNumber(value);
        const resolvedMode = resolveMode(mode);

        if (!increaseValue) {
          return {
            nextRent: safeBase,
            amountChange: 0,
            percentChange: 0,
            mode: 'none',
          };
        }

        if (resolvedMode === 'dollar') {
          const nextRentRaw = safeBase + increaseValue;
          const nextRent = Math.max(0, nextRentRaw);
          const amountChange = nextRent - safeBase;
          const percentChange = safeBase !== 0 ? (amountChange / safeBase) * 100 : null;

          return {
            nextRent,
            amountChange,
            percentChange,
            mode: 'dollar',
          };
        }

        const percent = increaseValue;
        const nextRentRaw = safeBase * (1 + percent / 100);
        const nextRent = Math.max(0, nextRentRaw);
        const amountChange = nextRent - safeBase;

        return {
          nextRent,
          amountChange,
          percentChange: percent,
          mode: 'percent',
        };
      };

      for (let year = 1; year <= projectionCount; year += 1) {
        let newLeases = 0;
        if (year === 1) newLeases = toNumber(proformaInputs.year1NewLeases);
        else if (year === 2) newLeases = toNumber(proformaInputs.year2NewLeases);
        else if (year === 3) newLeases = toNumber(proformaInputs.year3NewLeases);
        else if (year === 4) newLeases = toNumber(proformaInputs.year4NewLeases);
        else if (year === 5) newLeases = toNumber(proformaInputs.year5NewLeases);

        currentOccupiedUnits = Math.min(currentOccupiedUnits + newLeases, totalUnits);

        let appliedIncrease;
        if (year === 1) {
          appliedIncrease = applyRentIncrease(
            currentRent,
            proformaInputs.year1RentIncreaseValue,
            proformaInputs.year1RentIncreaseMode
          );
        } else if (year === 2) {
          appliedIncrease = applyRentIncrease(
            currentRent,
            proformaInputs.year2RentIncreaseValue,
            proformaInputs.year2RentIncreaseMode
          );
        } else {
          appliedIncrease = applyRentIncrease(
            currentRent,
            proformaInputs.annualRentIncrease,
            proformaInputs.annualRentIncreaseMode
          );
        }

        currentRent = appliedIncrease.nextRent;

        if (appliedIncrease.percentChange !== null && appliedIncrease.percentChange !== 0) {
          currentOtherIncome =
            currentOtherIncome * (1 + appliedIncrease.percentChange / 100);
        }

        const yearLotRent = currentRent * currentOccupiedUnits * 12;
        const yearTotalIncome = yearLotRent + currentOtherIncome;

        let yearExpensesValue;
        if (useExpenseRatioOverride) {
          yearExpensesValue = yearTotalIncome * (expenseRatioPercent / 100);
          currentExpensesValue = yearExpensesValue;
        } else {
          if (year > 1) {
            currentExpensesValue =
              currentExpensesValue *
              (1 + toNumber(proformaInputs.annualExpenseIncrease) / 100);
          }
          yearExpensesValue = currentExpensesValue;
        }

        const yearNOI = yearTotalIncome - yearExpensesValue;
        const yearDebtEntry = annualDebtServiceSchedule[year - 1] || null;
        const yearDebtService = yearDebtEntry ? yearDebtEntry.totalPayment : 0;
        const yearCashFlow = yearNOI - yearDebtService;
        const yearOccupancy = totalUnits > 0 ? (currentOccupiedUnits / totalUnits) * 100 : 0;

        years.push({
          year,
          occupiedUnits: currentOccupiedUnits,
          occupancyRate: yearOccupancy,
          avgMonthlyRent: currentRent,
          lotRentIncome: yearLotRent,
          otherIncome: currentOtherIncome,
          totalIncome: yearTotalIncome,
          expenses: yearExpensesValue,
          noi: yearNOI,
          debtService: yearDebtService,
          cashFlow: yearCashFlow,
          rentIncreaseAmount: appliedIncrease.amountChange,
          rentIncreasePercent: appliedIncrease.percentChange,
          rentIncreaseMode: appliedIncrease.mode,
        });
      }

      return years;
    };

    const proformaYears = calculateProforma();
    const firstYearData = proformaYears[0] || null;

    const annualDebtService = firstYearData?.debtService ?? firstYearDebtService;
    const monthlyPayment = firstYearData ? firstYearData.debtService / 12 : firstMonthPayment;
    const cashFlow = firstYearData ? firstYearData.cashFlow : noi - annualDebtService;
    const cashOnCash = downPayment > 0 ? (cashFlow / downPayment) * 100 : 0;
    const dscr = annualDebtService > 0 ? noi / annualDebtService : 0;

    // Per Unit Metrics
    const incomePerUnit = totalUnits > 0 ? effectiveGrossIncome / totalUnits : 0;
    const expensePerUnit = totalUnits > 0 ? totalOpEx / totalUnits : 0;
    const noiPerUnit = totalUnits > 0 ? noi / totalUnits : 0;

    // IRR Calculation
    const holdPeriod = Number(irrInputs.holdPeriod) || 0;
    const exitCapRate = irrInputs.exitCapRate / 100;
    const exitValue = exitCapRate > 0 ? noi / exitCapRate : 0;

    const monthsHeld = Math.round(holdPeriod * 12);
    let remainingBalanceAtExit = loanAmount;
    if (loanSchedule.length > 0) {
      if (monthsHeld <= 0) {
        remainingBalanceAtExit = loanAmount;
      } else if (monthsHeld <= loanSchedule.length) {
        remainingBalanceAtExit = loanSchedule[monthsHeld - 1].remainingBalance;
      } else {
        remainingBalanceAtExit = 0;
      }
    }

    const exitProceeds = exitValue - remainingBalanceAtExit;
    const totalCashInvested = downPayment;

    const calculateIRR = () => {
      if (holdPeriod <= 0) {
        return 0;
      }

      const cashFlows = [-totalCashInvested];
      for (let year = 1; year <= holdPeriod; year += 1) {
        const index = Math.min(year - 1, proformaYears.length - 1);
        const yearData = index >= 0 ? proformaYears[index] : null;
        const yearCashFlow = yearData ? yearData.cashFlow : cashFlow;

        if (year < holdPeriod) {
          cashFlows.push(yearCashFlow);
        } else {
          cashFlows.push(yearCashFlow + exitProceeds);
        }
      }

      let rate = 0.1;
      const maxIterations = 100;
      const tolerance = 0.0001;

      for (let i = 0; i < maxIterations; i += 1) {
        let npv = 0;
        let dnpv = 0;

        for (let j = 0; j < cashFlows.length; j += 1) {
          npv += cashFlows[j] / Math.pow(1 + rate, j);
          dnpv -= j * cashFlows[j] / Math.pow(1 + rate, j + 1);
        }

        const newRate = rate - npv / dnpv;

        if (!Number.isFinite(newRate)) {
          return rate * 100;
        }

        if (Math.abs(newRate - rate) < tolerance) {
          return newRate * 100;
        }

        rate = newRate;
      }

      return rate * 100;
    };

    const irr = calculateIRR();

    const distributions = [];
    for (let year = 1; year <= holdPeriod; year += 1) {
      const index = Math.min(year - 1, proformaYears.length - 1);
      const yearData = index >= 0 ? proformaYears[index] : null;
      const yearCashFlow = yearData ? yearData.cashFlow : cashFlow;
      if (year === holdPeriod) {
        distributions.push(yearCashFlow + exitProceeds);
      } else {
        distributions.push(yearCashFlow);
      }
    }

    const totalCashReceived = distributions.reduce((sum, value) => sum + value, 0);
    const equityMultiple = totalCashInvested > 0 ? totalCashReceived / totalCashInvested : 0;

    return {
      totalUnits,
      occupiedUnits,
      physicalOccupancy,
      grossPotentialRent,
      rentRollIncome,
      lotRentIncome,
      totalAdditionalIncome,
      mappedAdditionalIncomeTotal,
      totalUnmappedIncome,
      effectiveGrossIncome,
      vacancyLoss,
      economicOccupancy,
      managementFee,
      totalExpenses,
      totalOpEx,
      totalUnmappedExpenses,
      noi,
      capRate,
      totalInvestment,
      downPayment,
      loanAmount,
      monthlyPayment,
      annualDebtService,
      cashFlow,
      cashOnCash,
      dscr,
      incomePerUnit,
      expensePerUnit,
      noiPerUnit,
      exitValue,
      remainingBalance: remainingBalanceAtExit,
      exitProceeds,
      irr,
      equityMultiple,
      proformaYears,
      annualDebtServiceSchedule,
      interestOnlyMonthlyPayment,
      postInterestOnlyMonthlyPayment: amortizingMonthlyPayment,
      interestOnlyPeriodYears: interestOnlyYears,
      loanMaturityBalance: maturityBalance,
      amortizationYears,
      loanTermYears: totalTermYears,
      projectionYears: projectionCount,
    };
  }, [
    units,
    additionalIncome,
    unmappedIncomeItems,
    useActualIncome,
    actualIncome,
    expenses,
    unmappedExpenseItems,
    managementPercent,
    purchaseInputs,
    irrInputs,
    proformaInputs,
    expenseRatio,
    projectionYears,
  ]);

  const averageRentInfo = useMemo(() => {
    if (!Array.isArray(units) || units.length === 0) {
      return { value: null, hasValues: false };
    }

    const rentValues = [];

    units.forEach((unit) => {
      if (!unit || typeof unit !== 'object') {
        return;
      }

      const rentLikeKeys = Object.keys(unit).filter((key) => /rent/i.test(key));

      if (rentLikeKeys.length > 0) {
        rentLikeKeys.forEach((key) => {
          const numericValue = Number(unit[key]);
          if (Number.isFinite(numericValue)) {
            rentValues.push(numericValue);
          }
        });
        return;
      }

      const fallbackValue = Number(unit.rent);
      if (Number.isFinite(fallbackValue)) {
        rentValues.push(fallbackValue);
      }
    });

    if (rentValues.length === 0) {
      return { value: null, hasValues: false };
    }

    const total = rentValues.reduce((sum, value) => sum + value, 0);
    return { value: total / rentValues.length, hasValues: true };
  }, [units]);

  const formatCurrency = (value) => {
    return new Intl.NumberFormat('en-US', {
      style: 'currency',
      currency: 'USD',
      minimumFractionDigits: 0,
      maximumFractionDigits: 0
    }).format(value);
  };

  const formatCurrencyWithCents = (value) => {
    return new Intl.NumberFormat('en-US', {
      style: 'currency',
      currency: 'USD',
      minimumFractionDigits: 2,
      maximumFractionDigits: 2,
    }).format(value);
  };

  const formatPercent = (value) => {
    return `${value.toFixed(2)}%`;
  };

  const propertyAverageRentDisplay = averageRentInfo.hasValues
    ? formatCurrencyWithCents(averageRentInfo.value)
    : '—';

  const analyticsCardData = [
    {
      id: 'totalReports',
      label: 'Total Reports',
      value: analyticsMetrics.totalReports,
      icon: BarChart3,
      accentClass: 'bg-blue-100 text-blue-600',
      formatValue: (value) => value.toLocaleString('en-US'),
    },
    {
      id: 'averagePurchasePrice',
      label: 'Average Purchase Price',
      value: analyticsMetrics.averagePurchasePrice,
      icon: DollarSign,
      accentClass: 'bg-emerald-100 text-emerald-600',
      formatValue: (value) => formatCurrency(value),
    },
    {
      id: 'averagePricePerSite',
      label: 'Average Price per Site',
      value: analyticsMetrics.averagePricePerSite,
      icon: HomeIcon,
      accentClass: 'bg-indigo-100 text-indigo-600',
      formatValue: (value) => formatCurrency(value),
    },
    {
      id: 'averageCapRate',
      label: 'Average Cap Rate',
      value: analyticsMetrics.averageCapRate,
      icon: Percent,
      accentClass: 'bg-purple-100 text-purple-600',
      formatValue: (value) => formatPercent(value),
    },
    {
      id: 'averageExpenseRatio',
      label: 'Average Expense Ratio',
      value: analyticsMetrics.averageExpenseRatio,
      icon: PieChart,
      accentClass: 'bg-amber-100 text-amber-600',
      formatValue: (value) => formatPercent(value),
    },
  ];

  const describeRentIncrease = (year) => {
    if (!year || typeof year !== 'object') {
      return '—';
    }

    const amount = Number(year.rentIncreaseAmount);
    const percent = year.rentIncreasePercent;
    const hasAmount = Number.isFinite(amount) && amount !== 0;
    const hasPercent =
      typeof percent === 'number' && Number.isFinite(percent) && percent !== 0;

    if (!hasAmount && !hasPercent) {
      return '—';
    }

    const parts = [];

    if (hasPercent) {
      parts.push(`${percent > 0 ? '+' : ''}${percent.toFixed(2)}%`);
    }

    if (hasAmount) {
      const absoluteAmount = Math.abs(amount);
      parts.push(
        `${amount >= 0 ? '+' : '-'}${formatCurrency(absoluteAmount)} /mo`
      );
    }

    return parts.join(' ');
  };

  const proformaSnapshotYears = useMemo(() => {
    const years = Array.isArray(calculations?.proformaYears)
      ? calculations.proformaYears
      : [];

    return years.slice(0, Math.min(5, years.length));
  }, [calculations]);

  const lastProformaYear =
    calculations.proformaYears.length > 0
      ? calculations.proformaYears[calculations.proformaYears.length - 1]
      : null;
  const noiGrowth = lastProformaYear ? lastProformaYear.noi - calculations.noi : null;
  const noiGrowthPercent =
    lastProformaYear && calculations.noi !== 0
      ? ((lastProformaYear.noi - calculations.noi) / calculations.noi) * 100
      : null;
  const cashFlowGrowth = lastProformaYear
    ? lastProformaYear.cashFlow - calculations.cashFlow
    : null;
  const cashFlowGrowthPercent =
    lastProformaYear && calculations.cashFlow !== 0
      ? ((lastProformaYear.cashFlow - calculations.cashFlow) / calculations.cashFlow) * 100
      : null;
  const exitCapRateDecimal = irrInputs.exitCapRate / 100;
  const lastYearExitValue =
    lastProformaYear && exitCapRateDecimal > 0
      ? lastProformaYear.noi / exitCapRateDecimal
      : null;
  const appreciationValue =
    lastYearExitValue !== null ? lastYearExitValue - purchaseInputs.purchasePrice : null;
  const appreciationPercent =
    appreciationValue !== null && purchaseInputs.purchasePrice
      ? (appreciationValue / purchaseInputs.purchasePrice) * 100
      : null;

  const buildReportHtml = () => {
    const reportContent = document.getElementById('report');
    if (!reportContent) {
      return null;
    }

    return `
<!DOCTYPE html>
<html>
<head>
  <meta charset="UTF-8">
  <title>Mobile Home Park Investment Analysis Report</title>
  <style>
    body {
      font-family: -apple-system, BlinkMacSystemFont, 'Segoe UI', Roboto, sans-serif;
      margin: 40px;
      color: #1f2937;
    }
    .text-center { text-align: center; }
    .border-b-4 { border-bottom: 4px solid #2563eb; }
    .pb-6 { padding-bottom: 1.5rem; }
    .mb-8 { margin-bottom: 2rem; }
    .mb-10 { margin-bottom: 2.5rem; }
    .text-4xl { font-size: 2.25rem; }
    .text-3xl { font-size: 1.875rem; }
    .text-2xl { font-size: 1.5rem; }
    .text-xl { font-size: 1.25rem; }
    .text-lg { font-size: 1.125rem; }
    .font-bold { font-weight: 700; }
    .font-semibold { font-weight: 600; }
    .text-gray-900 { color: #111827; }
    .text-gray-700 { color: #374151; }
    .text-gray-600 { color: #4b5563; }
    .border-b-2 { border-bottom: 2px solid #d1d5db; }
    .pb-2 { padding-bottom: 0.5rem; }
    .mb-4 { margin-bottom: 1rem; }
    .mb-6 { margin-bottom: 1.5rem; }
    .grid { display: grid; }
    .grid-cols-2 { grid-template-columns: repeat(2, minmax(0, 1fr)); }
    .grid-cols-3 { grid-template-columns: repeat(3, minmax(0, 1fr)); }
    .gap-6 { gap: 1.5rem; }
    .gap-8 { gap: 2rem; }
    .bg-blue-50 { background-color: #eff6ff; }
    .bg-green-50 { background-color: #f0fdf4; }
    .bg-purple-50 { background-color: #faf5ff; }
    .bg-red-50 { background-color: #fef2f2; }
    .bg-orange-50 { background-color: #fff7ed; }
    .bg-indigo-50 { background-color: #eef2ff; }
    .bg-gray-50 { background-color: #f9fafb; }
    .p-4 { padding: 1rem; }
    .p-6 { padding: 1.5rem; }
    .rounded { border-radius: 0.25rem; }
    .border { border-width: 1px; }
    .border-2 { border-width: 2px; }
    .border-blue-200 { border-color: #bfdbfe; }
    .border-green-200 { border-color: #bbf7d0; }
    .border-purple-200 { border-color: #e9d5ff; }
    .border-red-600 { border-color: #dc2626; }
    .border-green-600 { border-color: #16a34a; }
    .border-blue-400 { border-color: #60a5fa; }
    .border-green-400 { border-color: #4ade80; }
    .border-blue-300 { border-color: #93c5fd; }
    .border-green-300 { border-color: #86efac; }
    .border-gray-200 { border-color: #e5e7eb; }
    .border-gray-300 { border-color: #d1d5db; }
    .border-orange-300 { border-color: #fdba74; }
    .border-orange-500 { border-color: #f97316; }
    .border-indigo-300 { border-color: #a5b4fc; }
    .text-blue-900 { color: #1e3a8a; }
    .text-green-900 { color: #14532d; }
    .text-purple-900 { color: #581c87; }
    .text-green-700 { color: #15803d; }
    .text-red-700 { color: #b91c1c; }
    .text-blue-700 { color: #1d4ed8; }
    .text-red-600 { color: #dc2626; }
    .text-orange-800 { color: #9a3412; }
    .text-indigo-700 { color: #4338ca; }
    .break-words { overflow-wrap: anywhere; word-break: break-word; }
    .space-y-2 > * + * { margin-top: 0.5rem; }
    .space-y-3 > * + * { margin-top: 0.75rem; }
    .py-1 { padding-top: 0.25rem; padding-bottom: 0.25rem; }
    .py-2 { padding-top: 0.5rem; padding-bottom: 0.5rem; }
    .py-3 { padding-top: 0.75rem; padding-bottom: 0.75rem; }
    .flex { display: flex; }
    .justify-between { justify-content: space-between; }
    .items-center { align-items: center; }
    .pl-4 { padding-left: 1rem; }
    .pt-2 { padding-top: 0.5rem; }
    .mt-1 { margin-top: 0.25rem; }
    .mt-2 { margin-top: 0.5rem; }
    .mt-12 { margin-top: 3rem; }
    .pt-6 { padding-top: 1.5rem; }
    .border-t { border-top-width: 1px; }
    .border-t-2 { border-top-width: 2px; }
    .text-sm { font-size: 0.875rem; }
    @media print {
      @page { size: letter; margin: 0.5in; }
      body { print-color-adjust: exact; -webkit-print-color-adjust: exact; }
    }
  </style>
</head>
<body>
${reportContent.innerHTML}
</body>
</html>`;
  };

  const ensurePreparedByInfo = useCallback(() => {
    const resolvedContact = { ...preparedByContact };

    if (profileDefaults) {
      const updates = {};
      let changed = false;

      ['name', 'company', 'email', 'phone'].forEach((field) => {
        if (!resolvedContact[field] && profileDefaults[field]) {
          resolvedContact[field] = profileDefaults[field];
          updates[field] = profileDefaults[field];
          changed = true;
        }
      });

      if (changed) {
        setContactInfo((current) => ({ ...current, ...updates }));
      }
    }

    const missingFields = Object.entries(resolvedContact)
      .filter(([, value]) => !value)
      .map(([key]) => key);

    if (missingFields.length > 0) {
      alert(
        'Please complete the Prepared By contact information (name, company, email, and phone) before saving the report.'
      );
      return { ok: false, contact: resolvedContact };
    }

    return { ok: true, contact: resolvedContact };
  }, [preparedByContact, profileDefaults]);

  const saveReportToAccount = useCallback(async ({ htmlContent } = {}) => {
    if (!isSupabaseConfigured || !supabase) {
      showToast({ message: '⚠️ Unable to save report to your account.', tone: 'error' });
      alert('Supabase is not configured. Please add your Supabase credentials to enable saving reports.');
      return false;
    }

    let authUser;
    try {
      authUser = await requireAuth();
    } catch (err) {
      if (err?.code === AUTH_REQUIRED_ERROR) {
        return false;
      }

      console.error('Error verifying Supabase authentication before saving:', err);
      showToast({ message: '⚠️ Unable to save report to your account.', tone: 'error' });
      alert('Unable to verify your authentication status. Please try signing in again.');
      return false;
    }

    const finalHtml = htmlContent || buildReportHtml();
    if (!finalHtml) {
      showToast({ message: '⚠️ Unable to save report to your account.', tone: 'error' });
      alert('Unable to capture the report content for saving.');
      return false;
    }

    const { ok: hasPreparedInfo, contact: preparedContact } = ensurePreparedByInfo();
    if (!hasPreparedInfo) {
      return false;
    }

    const effectiveReportName = (reportName && reportName.trim()) || propertyInfo.name || 'Untitled Report';
    const normalizedReportId = selectedReportId ? Number(selectedReportId) : null;

    const effectiveContactInfo = preparedContact;

    const propertyDetails = {
      ...propertyInfo,
      totalLots: calculations.totalUnits,
      occupiedLots: calculations.occupiedUnits,
      physicalOccupancy: calculations.physicalOccupancy,
      economicOccupancy: calculations.economicOccupancy,
    };

    const purchaseDetails = {
      ...purchaseInputs,
      totalInvestment: calculations.totalInvestment,
      downPaymentAmount: calculations.downPayment,
      loanAmount: calculations.loanAmount,
      monthlyPayment: calculations.monthlyPayment,
      annualDebtService: calculations.annualDebtService,
      interestOnlyPeriodYears: purchaseInputs.interestOnlyPeriodYears,
      interestOnlyMonthlyPayment: calculations.interestOnlyMonthlyPayment,
      postInterestOnlyMonthlyPayment: calculations.postInterestOnlyMonthlyPayment,
      annualDebtServiceSchedule: calculations.annualDebtServiceSchedule,
      loanMaturityBalance: calculations.loanMaturityBalance,
    };

    const reportState = {
      units,
      propertyInfo,
      contactInfo: effectiveContactInfo,
      additionalIncome,
      unmappedIncomeItems,
      expenses,
      unmappedExpenseItems,
      managementPercent,
      purchaseInputs,
      irrInputs,
      proformaInputs,
      useActualIncome,
      actualIncome,
      expenseRatio,
      projectionYears,
      reportName: effectiveReportName,
      activeTab,
      calculations,
      pnlTotals,
      pnlMappingStats,
      ownerUserId: authUser?.id || session?.user?.id || null,
      ownerEmail: sessionEmail || authUser?.email || null,
    };

    setSavingReport(true);

    try {
      const apiBase = process.env.REACT_APP_API_BASE || '';
      const response = await fetch(`${apiBase}/api/save-report`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          authUser: {
            id: authUser?.id || session?.user?.id || null,
            email: sessionEmail || authUser?.email || null,
          },
          contactInfo: effectiveContactInfo,
          propertyInfo: propertyDetails,
          purchaseInputs: purchaseDetails,
          calculations,
          units,
          additionalIncome,
          unmappedIncomeItems,
          expenses,
          unmappedExpenseItems,
          managementPercent,
          irrInputs,
          proformaInputs,
          useActualIncome,
          actualIncome,
          expenseRatio,
          projectionYears,
          pnlTotals,
          pnlMappingStats,
          htmlContent: finalHtml,
          userId: authUser?.id,
          reportId: normalizedReportId,
          reportName: effectiveReportName,
          reportState,
        }),
      });

      const result = await response.json();

      if (!response.ok || !result.success) {
        console.error('Save failed:', result);

        const detailParts = [];
        if (result?.error) {
          detailParts.push(result.error);
        }
        const detailMessage = result?.details?.message || result?.details?.details;
        if (detailMessage && detailMessage !== result?.error) {
          detailParts.push(detailMessage);
        }

        showToast({ message: '⚠️ Unable to save report to your account.', tone: 'error' });

        alert(
          ['Failed to save the report to your account.', ...detailParts]
            .filter(Boolean)
            .join('\n\n')
        );
        return false;
      }

      const warnings = Array.isArray(result.warnings)
        ? result.warnings.filter(Boolean)
        : [];

      if (warnings.length > 0) {
        console.warn('Report saved with warnings:', warnings);
        warnings.forEach((warning) => {
          if (typeof warning === 'string' && warning.trim()) {
            showToast({ message: warning, tone: 'warning' });
          }
        });
      }

      const savedRow = Array.isArray(result.data) ? result.data[0] : result.data;

      if (savedRow?.id) {
        setSelectedReportId(String(savedRow.id));
        const savedName =
          savedRow?.report_state?.reportName || savedRow?.report_name || effectiveReportName;
        setReportName(savedName);
      }

      await fetchSavedReports();
      showToast({ message: '💾 Report saved to your account successfully.', tone: 'success' });

      return true;
    } catch (err) {
      if (err?.code === AUTH_REQUIRED_ERROR || err?.code === 'SUPABASE_NOT_CONFIGURED') {
        return false;
      }

      console.error('Error saving report:', err);
      const message = err?.message ? `\n\n${err.message}` : '';
      showToast({ message: '⚠️ Unable to save report to your account.', tone: 'error' });
      alert(`Failed to save the report to your account.${message}`);
      return false;
    } finally {
      setSavingReport(false);
    }
  }, [
    session,
    reportName,
    propertyInfo,
    calculations,
    purchaseInputs,
    units,
    contactInfo,
    additionalIncome,
    expenses,
    managementPercent,
    irrInputs,
    proformaInputs,
    useActualIncome,
    actualIncome,
    activeTab,
    selectedReportId,
    fetchSavedReports,
    sessionEmail,
    expenseRatio,
    projectionYears,
    requireAuth,
    ensurePreparedByInfo,
    showToast,
  ]);

  const downloadReport = async () => {
    let authUser;
    try {
      authUser = await requireAuth();
    } catch (err) {
      if (err?.code === AUTH_REQUIRED_ERROR || err?.code === 'SUPABASE_NOT_CONFIGURED') {
        return;
      }

      console.error('Error verifying authentication before downloading report:', err);
      alert('Unable to verify your authentication status. Please try signing in again.');
      return;
    }

    const { ok: hasPreparedInfo } = ensurePreparedByInfo();
    if (!hasPreparedInfo) {
      return;
    }

    const htmlContent = buildReportHtml();
    if (!htmlContent) {
      alert('Unable to capture report content for download.');
      return;
    }

    const blob = new Blob([htmlContent], { type: 'text/html' });
    const url = URL.createObjectURL(blob);
    const a = document.createElement('a');
    a.href = url;
    const effectiveReportName = (reportName && reportName.trim()) || propertyInfo.name || 'Untitled Report';
    const datePart = new Date().toISOString().split('T')[0];
    a.download = `${slugify(effectiveReportName)}-${datePart}.html`;
    document.body.appendChild(a);
    a.click();
    document.body.removeChild(a);
    // Delay revoking the object URL to avoid some browsers cancelling the download
    setTimeout(() => URL.revokeObjectURL(url), 1000);

    if (authUser?.id || session?.user?.id) {
      await saveReportToAccount({ htmlContent });
    }
  };

  const handleDeleteReport = useCallback(
    async (report) => {
      if (!report || report.id === undefined || report.id === null) {
        showToast({ message: '❌ Failed to delete report.', tone: 'error' });
        return;
      }

      if (!isSupabaseConfigured || !supabase) {
        showToast({ message: '❌ Failed to delete report.', tone: 'error' });
        alert('Supabase is not configured. Please add your Supabase credentials to delete saved reports.');
        return;
      }

      const reportIdValue = report.id;
      const reportIdString = String(reportIdValue);

      const confirmed = window.confirm('Are you sure you want to delete this report? This action cannot be undone.');
      if (!confirmed) {
        return;
      }

      let authUser;
      try {
        authUser = await requireAuth();
      } catch (err) {
        if (err?.code === AUTH_REQUIRED_ERROR || err?.code === 'SUPABASE_NOT_CONFIGURED') {
          return;
        }

        console.error('Error verifying authentication before deleting report:', err);
        showToast({ message: '❌ Failed to delete report.', tone: 'error' });
        alert('Unable to verify your authentication status. Please try signing in again.');
        return;
      }

      const ownerId = authUser?.id || session?.user?.id;
      if (!ownerId) {
        showToast({ message: '❌ Failed to delete report.', tone: 'error' });
        alert('Unable to confirm your account. Please sign in again and retry.');
        return;
      }

      setDeletingReportId(reportIdString);

      try {
        const apiBase = process.env.REACT_APP_API_BASE || '';
        const response = await fetch(`${apiBase}/api/delete-report`, {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({ id: reportIdValue }),
        });

        const result = await response.json();

        if (!response.ok || !result.success) {
          console.error('Failed to delete report:', result);
          showToast({ message: '❌ Failed to delete report.', tone: 'error' });
          const detailMessage = result?.error || 'The report could not be deleted. Please try again.';
          alert(detailMessage);
          return;
        }

        if (selectedReportId === reportIdString) {
          setSelectedReportId('');
        }

        await fetchSavedReports();
        showToast({ message: '✅ Report deleted successfully.', tone: 'success' });
      } catch (err) {
        console.error('Unexpected error deleting report:', err);
        showToast({ message: '❌ Failed to delete report.', tone: 'error' });
        alert('Failed to delete the report. Please try again.');
      } finally {
        setDeletingReportId(null);
      }
    },
    [
      fetchSavedReports,
      isSupabaseConfigured,
      requireAuth,
      selectedReportId,
      session,
      showToast,
      supabase,
    ]
  );

  if (!supabase) {
    return <div>Connecting to database...</div>;
  }

  return (
    <div className="w-full max-w-7xl mx-auto p-6 bg-gray-50">
      <div className="flex flex-col gap-4 md:flex-row md:items-center md:justify-between mb-4">
        <div className="flex flex-wrap items-center gap-3">
          {session?.user ? (
            <div className="flex flex-wrap items-center gap-3 text-sm text-gray-700">
              <span>Manage saved reports from the My Reports tab.</span>
              <button
                type="button"
                onClick={() => setActiveTab('my-reports')}
                className="font-semibold text-blue-600 hover:text-blue-700 transition"
              >
                Go to My Reports
              </button>
            </div>
          ) : (
            <p className="text-sm text-gray-600">
              {isSupabaseConfigured
                ? 'Sign in to save and load reports from the My Reports tab.'
                : 'Add Supabase credentials to enable authentication and saved reports.'}
            </p>
          )}
        </div>
        <div className="flex flex-wrap items-center gap-3">
          {session?.user ? (
            <>
              <span className="text-sm text-gray-700">
                Signed in as{' '}
                <span className="font-semibold">
                  {sessionEmail || session.user.email || session.user.id}
                </span>
              </span>
              <button
                onClick={() => setProfileOpen(true)}
                className="rounded border border-blue-500 px-4 py-2 text-sm font-semibold text-blue-600 transition hover:bg-blue-50"
              >
                My Profile
              </button>
              <button
                onClick={handleSignOut}
                className="rounded border border-gray-400 px-4 py-2 text-sm font-semibold text-gray-700 transition hover:bg-gray-100"
              >
                Sign out
              </button>
            </>
          ) : (
            isSupabaseConfigured && (
              <button
                onClick={() => setAuthModalOpen(true)}
                className="rounded bg-blue-600 px-4 py-2 text-sm font-semibold text-white transition hover:bg-blue-700"
              >
                Sign in / Create account
              </button>
            )
          )}
        </div>
      </div>

      <div className="bg-white rounded-lg shadow-lg">
        {/* Header */}
        <div className="border-b border-gray-200 bg-gradient-to-r from-blue-600 to-blue-700 text-white p-6 rounded-t-lg">
          <div className="grid grid-cols-2 gap-8">
            <div>
              <h1 className="text-3xl font-bold mb-4">Mobile Home Park Financial Model</h1>
              <p className="text-blue-100">Complete Investment Analysis</p>
            </div>
            <div className="space-y-3">
              <div>
                <label className="block text-sm font-semibold text-blue-100 mb-1">Property Name</label>
                <input
                  type="text"
                  value={propertyInfo.name}
                  onChange={(e) => setPropertyInfo({...propertyInfo, name: e.target.value})}
                  className="w-full p-2 border border-blue-400 rounded bg-blue-50 text-blue-900 font-semibold"
                  placeholder="Enter park name"
                />
              </div>
              <div className="grid grid-cols-3 gap-2">
                <div>
                  <label className="block text-xs font-semibold text-blue-100 mb-1">Address</label>
                  <input
                    type="text"
                    value={propertyInfo.address}
                    onChange={(e) => setPropertyInfo({...propertyInfo, address: e.target.value})}
                    className="w-full p-2 border border-blue-400 rounded bg-blue-50 text-blue-900 font-semibold text-sm"
                    placeholder="Address"
                  />
                </div>
                <div>
                  <label className="block text-xs font-semibold text-blue-100 mb-1">City</label>
                  <input
                    type="text"
                    value={propertyInfo.city}
                    onChange={(e) => setPropertyInfo({...propertyInfo, city: e.target.value})}
                    className="w-full p-2 border border-blue-400 rounded bg-blue-50 text-blue-900 font-semibold text-sm"
                    placeholder="City"
                  />
                </div>
                <div>
                  <label className="block text-xs font-semibold text-blue-100 mb-1">State</label>
                  <input
                    type="text"
                    value={propertyInfo.state}
                    onChange={(e) => setPropertyInfo({...propertyInfo, state: e.target.value})}
                    className="w-full p-2 border border-blue-400 rounded bg-blue-50 text-blue-900 font-semibold text-sm"
                    placeholder="State"
                  />
                </div>
              </div>
            </div>
          </div>
        </div>

        {/* Tabs */}
        <div className="border-b border-gray-200 bg-gray-50">
          <div className="flex space-x-1 p-2">
            {[
              'rent-roll',
              'pnl',
              'proforma',
              'returns',
              'report',
              session?.user ? 'analytics' : null,
              session?.user ? 'my-reports' : null,
            ]
              .filter(Boolean)
              .map((tab) => (
                <button
                  key={tab}
                  onClick={() => setActiveTab(tab)}
                  className={`px-6 py-3 rounded-t font-semibold transition-colors ${
                    activeTab === tab
                      ? 'bg-white text-blue-700 border-t-2 border-blue-600'
                      : 'bg-gray-100 text-gray-600 hover:bg-gray-200'
                  }`}
                >
                  {tab === 'rent-roll' && 'Rent Roll'}
                  {tab === 'pnl' && 'P&L Statement'}
                  {tab === 'proforma' && `${projectionYears}-Year Proforma`}
                  {tab === 'returns' && 'Return Metrics'}
                  {tab === 'report' && 'Report'}
                  {tab === 'analytics' && 'Analytics'}
                  {tab === 'my-reports' && 'My Reports'}
                </button>
              ))}
          </div>
        </div>

        {/* Content */}
        <div className="p-6">
          {activeTab === 'analytics' && (
            <div className="space-y-6">
              <div className="flex flex-col gap-2 md:flex-row md:items-center md:justify-between">
                <div>
                  <h2 className="text-2xl font-bold text-gray-800">Analytics</h2>
                  <p className="text-sm text-gray-600">
                    Aggregate metrics for all reports saved to your account.
                  </p>
                </div>
                <button
                  type="button"
                  onClick={handleRefreshAnalytics}
                  disabled={loadingAnalytics}
                  className="inline-flex items-center gap-2 rounded border border-blue-600 px-4 py-2 text-sm font-semibold text-blue-600 transition hover:bg-blue-50 disabled:opacity-60"
                >
                  <RefreshCw className="h-4 w-4" aria-hidden="true" />
                  {loadingAnalytics ? 'Refreshing…' : 'Refresh'}
                  {loadingAnalytics && (
                    <span className="ml-2 animate-spin text-blue-500" role="status" aria-hidden="true">
                      ⏳
                    </span>
                  )}
                </button>
              </div>

              {analyticsError ? (
                <div className="rounded-lg border border-amber-200 bg-amber-50 p-4 text-sm text-amber-800">
                  {analyticsError}
                </div>
              ) : (
                <div className="space-y-4">
                  {loadingAnalytics && (
                    <div className="rounded-lg border border-blue-100 bg-blue-50 px-4 py-3 text-sm text-blue-700">
                      Updating analytics…
                    </div>
                  )}
                  <div className="grid grid-cols-1 gap-4 sm:grid-cols-2 xl:grid-cols-3">
                    {analyticsCardData.map(({ id, label, value, icon: Icon, accentClass, formatValue }) => {
                      const displayValue =
                        value === null || value === undefined
                          ? '—'
                          : formatValue
                          ? formatValue(value)
                          : value.toLocaleString('en-US');

                      return (
                        <div
                          key={id}
                          className="rounded-lg border border-gray-200 bg-white p-5 shadow-sm transition hover:shadow-md"
                        >
                          <div className="flex items-start justify-between">
                            <div>
                              <p className="text-xs font-semibold uppercase tracking-wide text-gray-500">{label}</p>
                              <div className="mt-3 text-3xl font-bold text-gray-900">{displayValue}</div>
                            </div>
                            <div className={`rounded-full p-3 ${accentClass}`}>
                              <Icon className="h-5 w-5" aria-hidden="true" />
                            </div>
                          </div>
                        </div>
                      );
                    })}
                  </div>

                  {analyticsMetrics.totalReports === 0 && !loadingAnalytics && (
                    <div className="rounded-lg border border-gray-200 bg-white p-6 text-sm text-gray-600">
                      No reports found. Save a report to populate your analytics dashboard.
                    </div>
                  )}
                </div>
              )}
            </div>
          )}

          {activeTab === 'my-reports' && (
            <div className="space-y-6">
              <div className="flex flex-col gap-2 md:flex-row md:items-center md:justify-between">
                <div>
                  <h2 className="text-2xl font-bold text-gray-800">My Reports</h2>
                  <p className="text-sm text-gray-600">
                    Select a saved report to load it back into the model.
                  </p>
                </div>
                <button
                  type="button"
                  onClick={handleRefreshReports}
                  disabled={!session?.user?.id || loadingReports}
                  className="rounded border border-blue-600 px-4 py-2 text-sm font-semibold text-blue-600 transition hover:bg-blue-50 disabled:opacity-60"
                >
                  {loadingReports ? 'Refreshing…' : 'Refresh'}
                </button>
              </div>

              {!session?.user ? (
                <div className="rounded-lg border border-gray-200 bg-white p-6 text-sm text-gray-600">
                  {isSupabaseConfigured
                    ? 'Sign in to view and load reports saved to your account.'
                    : 'Add Supabase credentials to enable authentication and saved reports.'}
                </div>
              ) : (
                <div className="rounded-lg border border-gray-200 bg-white shadow-sm">
                  {loadingReports ? (
                    <div className="p-6 text-sm text-gray-600">Loading saved reports…</div>
                  ) : sortedReports.length === 0 ? (
                    <div className="p-6 text-sm text-gray-600">No reports saved yet.</div>
                  ) : (
                    <div className="overflow-x-auto">
                      <table className="min-w-full divide-y divide-gray-200">
                        <thead className="bg-gray-50">
                          <tr>
                            <th scope="col" className="px-4 py-3 text-left text-sm font-semibold text-gray-700">
                              <button
                                type="button"
                                onClick={() => handleReportSort('name')}
                                className="flex items-center gap-1 text-left font-semibold text-gray-700 hover:text-blue-600"
                              >
                                Report Name
                                {reportSort.column === 'name' && (
                                  <span className="text-xs">
                                    {reportSort.direction === 'asc' ? '▲' : '▼'}
                                  </span>
                                )}
                              </button>
                            </th>
                            <th scope="col" className="px-4 py-3 text-left text-sm font-semibold text-gray-700">
                              Property Name
                            </th>
                            <th scope="col" className="px-4 py-3 text-left text-sm font-semibold text-gray-700">
                              <button
                                type="button"
                                onClick={() => handleReportSort('city')}
                                className="flex items-center gap-1 text-left font-semibold text-gray-700 hover:text-blue-600"
                              >
                                City
                                {reportSort.column === 'city' && (
                                  <span className="text-xs">
                                    {reportSort.direction === 'asc' ? '▲' : '▼'}
                                  </span>
                                )}
                              </button>
                            </th>
                            <th scope="col" className="px-4 py-3 text-left text-sm font-semibold text-gray-700">
                              <button
                                type="button"
                                onClick={() => handleReportSort('state')}
                                className="flex items-center gap-1 text-left font-semibold text-gray-700 hover:text-blue-600"
                              >
                                State
                                {reportSort.column === 'state' && (
                                  <span className="text-xs">
                                    {reportSort.direction === 'asc' ? '▲' : '▼'}
                                  </span>
                                )}
                              </button>
                            </th>
                            <th scope="col" className="px-4 py-3 text-left text-sm font-semibold text-gray-700">
                              <button
                                type="button"
                                onClick={() => handleReportSort('sites')}
                                className="flex items-center gap-1 text-left font-semibold text-gray-700 hover:text-blue-600"
                              >
                                # Sites
                                {reportSort.column === 'sites' && (
                                  <span className="text-xs">
                                    {reportSort.direction === 'asc' ? '▲' : '▼'}
                                  </span>
                                )}
                              </button>
                            </th>
                            <th scope="col" className="px-4 py-3 text-left text-sm font-semibold text-gray-700">
                              <button
                                type="button"
                                onClick={() => handleReportSort('price')}
                                className="flex items-center gap-1 text-left font-semibold text-gray-700 hover:text-blue-600"
                              >
                                Purchase Price
                                {reportSort.column === 'price' && (
                                  <span className="text-xs">
                                    {reportSort.direction === 'asc' ? '▲' : '▼'}
                                  </span>
                                )}
                              </button>
                            </th>
                            <th scope="col" className="px-4 py-3 text-left text-sm font-semibold text-gray-700">
                              <button
                                type="button"
                                onClick={() => handleReportSort('date')}
                                className="flex items-center gap-1 text-left font-semibold text-gray-700 hover:text-blue-600"
                              >
                                Date Created
                                {reportSort.column === 'date' && (
                                  <span className="text-xs">
                                    {reportSort.direction === 'asc' ? '▲' : '▼'}
                                  </span>
                                )}
                              </button>
                            </th>
                            <th
                              scope="col"
                              className="px-4 py-3 text-right text-sm font-semibold text-gray-700"
                            >
                              Actions
                            </th>
                          </tr>
                        </thead>
                        <tbody className="divide-y divide-gray-200">
                          {sortedReports.map((report, index) => {
                            const reportIdString = String(report.id);
                            const state = normaliseReportState(report.report_state);
                            const rawDate =
                              report.created_at ||
                              report.updated_at ||
                              state?.savedAt ||
                              state?.createdAt ||
                              state?.updatedAt ||
                              null;
                            const formattedDate = formatReportDate(rawDate) || '—';
                            const purchasePriceValue = resolvePurchasePrice(report, state);
                            const formattedPrice =
                              typeof purchasePriceValue === 'number'
                                ? formatCurrency(purchasePriceValue)
                                : '—';
                            const isLoading = loadingReportId === reportIdString;
                            const isSelected = selectedReportId && selectedReportId === reportIdString;
                            const cityValue = resolveCity(report, state) || '—';
                            const stateValue = resolveState(report, state) || '—';
                            const sitesValue = resolveSiteCount(report, state);
                            const formattedSites = Number.isFinite(sitesValue) ? sitesValue : '—';
                            const rowBase = index % 2 === 0 ? 'bg-white' : 'bg-gray-50';
                            const rowState = isSelected ? 'bg-blue-50 text-blue-800' : rowBase;
                            const rowHover = isSelected ? '' : 'hover:bg-blue-50';
                            const handleSelectReport = () => {
                              if (isLoading) {
                                return;
                              }

                              loadReport(report);
                            };

                            const handleKeySelect = (event) => {
                              if (isLoading) {
                                return;
                              }

                              if (event.key === 'Enter' || event.key === ' ') {
                                event.preventDefault();
                                loadReport(report);
                              }
                            };

                            const isDeleting = deletingReportId === reportIdString;

                            const handleShareReport = async (event) => {
                              event.stopPropagation();
                              event.preventDefault();

                              if (isLoading || isDeleting) {
                                return;
                              }

                              const origin =
                                typeof window !== 'undefined' && window.location
                                  ? window.location.origin
                                  : '';

                              const shareUrl = origin
                                ? `${origin}/shared-report?id=${reportIdString}`
                                : `/shared-report?id=${reportIdString}`;

                              const clipboard =
                                typeof navigator !== 'undefined' ? navigator.clipboard : null;

                              if (clipboard?.writeText) {
                                try {
                                  await clipboard.writeText(shareUrl);
                                  showToast({
                                    message: '🔗 Share link copied to clipboard!',
                                    tone: 'success',
                                  });
                                  return;
                                } catch (clipboardError) {
                                  console.warn('Unable to copy share link automatically:', clipboardError);
                                }
                              }

                              if (typeof window !== 'undefined') {
                                window.prompt('Copy this shareable report URL:', shareUrl);
                              }

                              showToast({
                                message: 'ℹ️ Share URL ready to share.',
                                tone: 'info',
                              });
                            };

                            return (
                              <tr
                                key={report.id}
                                onClick={handleSelectReport}
                                onKeyDown={handleKeySelect}
                                tabIndex={0}
                                role="button"
                                aria-pressed={Boolean(isSelected)}
                                className={`transition-colors ${rowState} ${rowHover} ${
                                  isLoading ? 'cursor-wait opacity-75' : 'cursor-pointer'
                                }`}
                              >
                                <td className="px-4 py-3 align-middle">
                                  <span className="font-semibold text-gray-900">
                                    {isLoading ? 'Loading…' : resolveReportName(report, state)}
                                  </span>
                                </td>
                                <td className="px-4 py-3 align-middle text-sm text-gray-700">
                                  {resolvePropertyName(report, state)}
                                </td>
                                <td className="px-4 py-3 align-middle text-sm text-gray-700">
                                  {cityValue || '—'}
                                </td>
                                <td className="px-4 py-3 align-middle text-sm text-gray-700">
                                  {stateValue || '—'}
                                </td>
                                <td className="px-4 py-3 align-middle text-sm text-gray-700">
                                  {formattedSites}
                                </td>
                                <td className="px-4 py-3 align-middle text-sm text-gray-700">
                                  {formattedPrice}
                                </td>
                                <td className="px-4 py-3 align-middle text-sm text-gray-700">
                                  {formattedDate}
                                </td>
                                <td className="px-4 py-3 align-middle text-sm text-right">
                                  <div className="flex justify-end gap-2">
                                    <button
                                      type="button"
                                      onClick={handleShareReport}
                                      disabled={isLoading || isDeleting}
                                      className="inline-flex items-center gap-1 rounded border border-blue-600 px-3 py-1 text-sm font-semibold text-blue-600 transition hover:bg-blue-50 disabled:opacity-60"
                                    >
                                      <Share2 className="h-4 w-4" aria-hidden="true" />
                                      Share
                                    </button>
                                    <button
                                      type="button"
                                      onClick={(event) => {
                                        event.stopPropagation();
                                        event.preventDefault();
                                        if (isLoading || isDeleting) {
                                          return;
                                        }
                                        handleDeleteReport(report);
                                      }}
                                      disabled={isLoading || isDeleting}
                                      className={`rounded border px-3 py-1 text-sm font-semibold transition ${
                                        isDeleting
                                          ? 'border-gray-300 text-gray-400 cursor-wait'
                                          : 'border-red-500 text-red-600 hover:bg-red-50'
                                      }`}
                                    >
                                      {isDeleting ? 'Deleting…' : 'Delete'}
                                    </button>
                                  </div>
                                </td>
                              </tr>
                            );
                          })}
                        </tbody>
                      </table>
                    </div>
                  )}
                </div>
              )}
            </div>
          )}

          {activeTab === 'rent-roll' && (
            <div className="space-y-6">
              <div className="rounded-lg border border-blue-200 bg-blue-50 p-4 shadow-sm">
                <div className="flex flex-col gap-3 lg:flex-row lg:items-center lg:justify-between">
                  <div>
                    <h3 className="text-lg font-semibold text-blue-900">Quick Populate Rent Roll</h3>
                    <p className="text-sm text-blue-700">
                      Define groups of lots to auto-generate sequential entries.
                    </p>
                  </div>
                  <div className="flex flex-wrap items-center gap-2">
                    <button
                      type="button"
                      onClick={addQuickPopulateRow}
                      className="rounded border border-blue-600 px-3 py-2 text-sm font-semibold text-blue-600 transition hover:bg-blue-100"
                    >
                      + Add Row
                    </button>
                    <button
                      type="button"
                      onClick={applyQuickPopulate}
                      disabled={!hasValidQuickPopulateRows}
                      className="rounded bg-blue-600 px-4 py-2 text-sm font-semibold text-white transition hover:bg-blue-700 disabled:opacity-60"
                    >
                      Apply
                    </button>
                  </div>
                </div>

                <div className="mt-4 space-y-3">
                  {quickPopulateRows.map((row, index) => (
                    <div
                      key={row.id}
                      className="grid grid-cols-1 gap-3 md:grid-cols-7 md:items-end"
                    >
                      <div className="md:col-span-2">
                        <label className="mb-1 block text-xs font-semibold uppercase tracking-wide text-blue-900">
                          Number of Lots
                        </label>
                        <input
                          type="number"
                          min="0"
                          value={row.numberOfLots}
                          onChange={(e) => updateQuickPopulateRow(row.id, 'numberOfLots', e.target.value)}
                          className="w-full rounded border border-blue-300 bg-white p-2 text-sm font-semibold text-blue-900"
                          placeholder="e.g. 40"
                        />
                      </div>
                      <div className="md:col-span-2">
                        <label className="mb-1 block text-xs font-semibold uppercase tracking-wide text-blue-900">
                          Rent Amount
                        </label>
                        <input
                          type="number"
                          min="0"
                          value={row.rentAmount}
                          onChange={(e) => updateQuickPopulateRow(row.id, 'rentAmount', e.target.value)}
                          className="w-full rounded border border-blue-300 bg-white p-2 text-sm font-semibold text-blue-900"
                          placeholder="e.g. 475"
                        />
                      </div>
                      <div className="md:col-span-2">
                        <label className="mb-1 block text-xs font-semibold uppercase tracking-wide text-blue-900">
                          Occupancy
                        </label>
                        <select
                          value={row.occupancyStatus}
                          onChange={(e) => updateQuickPopulateRow(row.id, 'occupancyStatus', e.target.value)}
                          className="w-full rounded border border-blue-300 bg-white p-2 text-sm font-semibold text-blue-900"
                        >
                          <option value="occupied">Occupied</option>
                          <option value="vacant">Vacant</option>
                        </select>
                      </div>
                      <div className="flex items-end justify-start md:justify-end">
                        {quickPopulateRows.length > 1 && (
                          <button
                            type="button"
                            onClick={() => removeQuickPopulateRow(row.id)}
                            className="rounded border border-red-500 px-3 py-2 text-sm font-semibold text-red-600 transition hover:bg-red-50"
                          >
                            Remove
                          </button>
                        )}
                        {quickPopulateRows.length === 1 && (
                          <span className="text-xs text-blue-700">
                            Row {index + 1}
                          </span>
                        )}
                      </div>
                    </div>
                  ))}
                </div>

                <div className="mt-4 flex flex-col gap-3 lg:flex-row lg:items-center lg:justify-between">
                  <div className="flex flex-wrap items-center gap-3">
                    <label
                      htmlFor="vacant-total-lots"
                      className="text-sm font-semibold text-blue-900"
                    >
                      Total Lots Goal
                    </label>
                    <input
                      id="vacant-total-lots"
                      type="number"
                      min="0"
                      value={vacantTargetLots}
                      onChange={(e) => setVacantTargetLots(e.target.value)}
                      className="w-28 rounded border border-blue-300 bg-white p-2 text-sm font-semibold text-blue-900"
                      placeholder="e.g. 120"
                    />
                    <button
                      type="button"
                      onClick={vacantRemainingLots}
                      disabled={!canVacantRemaining}
                      className="rounded border border-blue-600 px-3 py-2 text-sm font-semibold text-blue-600 transition hover:bg-blue-100 disabled:opacity-60"
                    >
                      Vacant the Remaining Lots
                    </button>
                  </div>
                  <div className="flex flex-wrap items-center gap-2">
                    <button
                      type="button"
                      onClick={clearRentRoll}
                      className="rounded border border-red-500 px-3 py-2 text-sm font-semibold text-red-600 transition hover:bg-red-50"
                    >
                      Clear Rent Roll
                    </button>
                  </div>
                </div>

                {quickPopulatePreview.totalLots > 0 && (
                  <div className="mt-4 rounded-md border border-blue-200 bg-white p-4">
                    <div className="text-sm font-semibold text-blue-900">Preview Summary</div>
                    <div className="mt-2 grid grid-cols-2 gap-3 md:grid-cols-4">
                      <div>
                        <div className="text-xs uppercase tracking-wide text-gray-500">Total Lots</div>
                        <div className="text-lg font-semibold text-gray-800">{quickPopulatePreview.totalLots}</div>
                      </div>
                      <div>
                        <div className="text-xs uppercase tracking-wide text-gray-500">Occupied</div>
                        <div className="text-lg font-semibold text-gray-800">{quickPopulatePreview.occupiedLots}</div>
                      </div>
                      <div>
                        <div className="text-xs uppercase tracking-wide text-gray-500">Average Rent</div>
                        <div className="text-lg font-semibold text-gray-800">{formatCurrency(quickPopulatePreview.averageRent || 0)}</div>
                      </div>
                      <div>
                        <div className="text-xs uppercase tracking-wide text-gray-500">Total Rent Income</div>
                        <div className="text-lg font-semibold text-gray-800">{formatCurrency(quickPopulatePreview.totalRentIncome || 0)}</div>
                      </div>
                    </div>
                  </div>
                )}
              </div>

              <div className="flex flex-col gap-3 md:flex-row md:items-center md:justify-between">
                <h2 className="text-2xl font-bold text-gray-800">Rent Roll</h2>
                <div className="flex flex-wrap items-center gap-4">
                  <RentRollUpload onDataParsed={handleRentRollImport} />
                  <div className="flex items-end gap-2">
                    <div>
                      <label className="text-xs font-semibold text-gray-700">Add Multiple Lots</label>
                      <input
                        type="number"
                        id="bulkAddInput"
                        placeholder="e.g. 120"
                        className="w-24 rounded border border-gray-300 bg-blue-50 p-2 text-sm font-semibold text-blue-900"
                        onKeyPress={(e) => {
                          if (e.key === 'Enter') {
                            const count = parseInt(e.target.value);
                            if (count > 0 && count <= 500) {
                              addMultipleUnits(count);
                              e.target.value = '';
                            } else {
                              alert('Please enter a number between 1 and 500');
                            }
                          }
                        }}
                      />
                    </div>
                    <button
                      onClick={() => {
                        const input = document.getElementById('bulkAddInput');
                        const count = parseInt(input.value);
                        if (count > 0 && count <= 500) {
                          addMultipleUnits(count);
                          input.value = '';
                        } else {
                          alert('Please enter a number between 1 and 500');
                        }
                      }}
                      className="rounded bg-green-600 px-4 py-2 text-sm font-semibold text-white transition hover:bg-green-700"
                    >
                      Add Lots
                    </button>
                  </div>
                  <button
                    onClick={addUnit}
                    className="rounded bg-blue-600 px-4 py-2 text-sm font-semibold text-white transition hover:bg-blue-700"
                  >
                    + Add Single Lot
                  </button>
                </div>
              </div>

              {/* Bulk Actions */}
              {selectedUnits.length > 0 && (
                <div className="bg-yellow-50 border-2 border-yellow-400 p-4 rounded-lg">
                  <div className="flex items-center justify-between">
                    <div className="font-bold text-gray-800">
                      {selectedUnits.length} lot{selectedUnits.length > 1 ? 's' : ''} selected
                    </div>
                    <div className="flex items-center space-x-3">
                      <button
                        onClick={() => bulkUpdateOccupancy(true)}
                        className="bg-green-600 text-white px-4 py-2 rounded hover:bg-green-700 transition-colors text-sm font-semibold"
                      >
                        Mark as Occupied
                      </button>
                      <button
                        onClick={() => bulkUpdateOccupancy(false)}
                        className="bg-red-600 text-white px-4 py-2 rounded hover:bg-red-700 transition-colors text-sm font-semibold"
                      >
                        Mark as Vacant
                      </button>
                      <div className="flex items-center space-x-2">
                        <input
                          type="number"
                          id="bulkRentInput"
                          placeholder="Rent"
                          className="w-24 p-2 border border-gray-300 rounded bg-blue-50 text-blue-900 font-semibold"
                        />
                        <button
                          onClick={() => {
                            const rent = document.getElementById('bulkRentInput').value;
                            bulkUpdateRent(rent);
                            document.getElementById('bulkRentInput').value = '';
                          }}
                          className="bg-blue-600 text-white px-4 py-2 rounded hover:bg-blue-700 transition-colors text-sm font-semibold"
                        >
                          Set Rent
                        </button>
                      </div>
                      <button
                        onClick={deselectAllUnits}
                        className="bg-gray-600 text-white px-4 py-2 rounded hover:bg-gray-700 transition-colors text-sm font-semibold"
                      >
                        Deselect All
                      </button>
                    </div>
                  </div>
                </div>
              )}

              {/* Summary Cards */}
              <div className="grid grid-cols-4 gap-4">
                <div className="bg-blue-50 p-4 rounded-lg border border-blue-200">
                  <div className="text-sm text-gray-600">Total Lots</div>
                  <div className="text-2xl font-bold text-blue-700">{calculations.totalUnits}</div>
                </div>
                <div className="bg-green-50 p-4 rounded-lg border border-green-200">
                  <div className="text-sm text-gray-600">Occupied</div>
                  <div className="text-2xl font-bold text-green-700">{calculations.occupiedUnits}</div>
                </div>
                <div className="bg-purple-50 p-4 rounded-lg border border-purple-200">
                  <div className="text-sm text-gray-600">Physical Occupancy</div>
                  <div className="text-2xl font-bold text-purple-700">{formatPercent(calculations.physicalOccupancy)}</div>
                </div>
                <div className="bg-orange-50 p-4 rounded-lg border border-orange-200">
                  <div className="text-sm text-gray-600">Annual Income</div>
                  <div className="text-2xl font-bold text-orange-700">{formatCurrency(calculations.lotRentIncome)}</div>
                </div>
              </div>

              {/* Units Table */}
              <div className="overflow-x-auto">
                <table className="w-full border-collapse">
                  <thead>
                    <tr className="bg-gray-100 border-b-2 border-gray-300">
                      <th className="p-3 text-center font-semibold w-12">
                        <input
                          type="checkbox"
                          onChange={(e) => {
                            if (e.target.checked) {
                              selectAllUnits();
                            } else {
                              deselectAllUnits();
                            }
                          }}
                          checked={selectedUnits.length === units.length && units.length > 0}
                          className="w-5 h-5 cursor-pointer"
                        />
                      </th>
                      <th className="p-3 text-left font-semibold">Lot #</th>
                      <th className="p-3 text-left font-semibold">Status</th>
                      <th className="p-3 text-left font-semibold">Monthly Rent</th>
                      <th className="p-3 text-left font-semibold">Annual Rent</th>
                      <th className="p-3 text-center font-semibold">Action</th>
                    </tr>
                  </thead>
                  <tbody>
                    {units.map((unit) => (
                      <tr key={unit.id} className={`border-b border-gray-200 hover:bg-gray-50 ${selectedUnits.includes(unit.id) ? 'bg-blue-100' : ''}`}>
                        <td className="p-3 text-center">
                          <input
                            type="checkbox"
                            checked={selectedUnits.includes(unit.id)}
                            onChange={() => toggleUnitSelection(unit.id)}
                            className="w-5 h-5 cursor-pointer"
                          />
                        </td>
                        <td className="p-3">
                          <input
                            type="text"
                            value={unit.lotNumber}
                            onChange={(e) => updateUnit(unit.id, 'lotNumber', e.target.value)}
                            className="w-20 p-2 border border-gray-300 rounded bg-blue-50 text-blue-900 font-semibold"
                          />
                        </td>
                        <td className="p-3">
                          <select
                            value={unit.occupied ? 'occupied' : 'vacant'}
                            onChange={(e) => updateUnit(unit.id, 'occupied', e.target.value === 'occupied')}
                            className="w-32 p-2 border border-gray-300 rounded bg-blue-50 text-blue-900 font-semibold"
                          >
                            <option value="occupied">Occupied</option>
                            <option value="vacant">Vacant</option>
                          </select>
                        </td>
                        <td className="p-3">
                          <input
                            type="number"
                            value={unit.rent}
                            onChange={(e) => updateUnit(unit.id, 'rent', e.target.value)}
                            className="w-28 p-2 border border-gray-300 rounded bg-blue-50 text-blue-900 font-semibold"
                          />
                        </td>
                        <td className="p-3 font-semibold">
                          {unit.occupied ? formatCurrency(unit.rent * 12) : formatCurrency(0)}
                        </td>
                        <td className="p-3 text-center">
                          <button
                            onClick={() => removeUnit(unit.id)}
                            className="text-red-600 hover:text-red-800 font-semibold"
                          >
                            Remove
                          </button>
                        </td>
                      </tr>
                    ))}
                  </tbody>
                  <tfoot>
                    <tr className="bg-gray-100 font-bold border-t-2 border-gray-300">
                      <td className="p-3"></td>
                      <td className="p-3" colSpan="3">TOTAL</td>
                      <td className="p-3">{formatCurrency(calculations.lotRentIncome)}</td>
                      <td></td>
                    </tr>
                  </tfoot>
                </table>
              </div>
            </div>
          )}

          {activeTab === 'pnl' && (
            <div className="space-y-6">
              <h2 className="text-2xl font-bold text-gray-800">Profit & Loss Statement</h2>

              <div className="rounded-lg border border-indigo-200 bg-indigo-50 p-4 shadow-sm">
                <div className="flex flex-col gap-3 lg:flex-row lg:items-center lg:justify-between">
                  <div>
                    <h3 className="text-lg font-semibold text-indigo-900">Upload &amp; Map P&amp;L</h3>
                    <p className="text-sm text-indigo-700">
                      Import a PDF or CSV profit &amp; loss statement to auto-map income and expense line items.
                    </p>
                  </div>
                  <PnLUpload
                    onApplyMapping={handlePnLMappingApplied}
                    incomeCategories={INCOME_CATEGORY_OPTIONS}
                    expenseCategories={EXPENSE_CATEGORY_OPTIONS}
                  />
                </div>

                {(pnlMappingStats || pnlTotals) && (
                  <div className="mt-4 rounded-lg border border-indigo-200 bg-white/80 p-4 text-sm text-indigo-900">
                    <div className="flex flex-col gap-3 sm:flex-row sm:items-center sm:justify-between">
                      {pnlMappingStats ? (
                        <div className="font-semibold text-indigo-900">
                          {pnlMappingStats.totalMapped} mapped / {pnlMappingStats.totalRows}{' '}
                          line items • {pnlMappingStats.coverage}% coverage
                        </div>
                      ) : (
                        <div className="font-semibold text-indigo-900">P&amp;L ready for review</div>
                      )}
                      {pnlTotals && (
                        <div className="flex flex-wrap gap-3 text-xs sm:text-sm">
                          <span>
                            Total Income {formatCurrency(pnlTotals.totalIncome ?? 0)}
                          </span>
                          <span>
                            Total Expenses {formatCurrency(pnlTotals.totalExpenses ?? 0)}
                          </span>
                          <span>Net {formatCurrency(pnlTotals.netIncome ?? 0)}</span>
                          {Number.isFinite(Number(pnlTotals.lotRentAnnual)) && (
                            <span>Lot Rent {formatCurrency(pnlTotals.lotRentAnnual)}</span>
                          )}
                        </div>
                      )}
                    </div>
                  </div>
                )}
              </div>

              <div className="space-y-6">
                {/* Income Section */}
                <div className="bg-green-50 p-6 rounded-lg border border-green-200">
                  <div className="flex flex-col gap-3 md:flex-row md:items-center md:justify-between mb-4">
                    <h3 className="text-xl font-bold text-green-800">Income</h3>
                    <div className="flex flex-wrap items-center gap-2">
                      <label htmlFor="income-category" className="text-sm font-semibold text-gray-700">
                        Category
                      </label>
                      <select
                        id="income-category"
                        value={selectedIncomeCategory}
                        onChange={(e) => setSelectedIncomeCategory(e.target.value)}
                        className="p-2 border border-green-300 rounded bg-white text-sm"
                      >
                        {INCOME_CATEGORY_OPTIONS.map((option) => (
                          <option key={option} value={option}>
                            {option}
                          </option>
                        ))}
                      </select>
                      <button
                        onClick={addIncomeItem}
                        className="bg-green-600 text-white px-4 py-2 rounded hover:bg-green-700 transition-colors text-sm"
                      >
                        + Add Income Line
                      </button>
                      <button
                        onClick={clearIncomeItems}
                        className="px-4 py-2 text-sm font-semibold text-green-700 bg-white border border-green-200 rounded hover:bg-green-100 transition-colors"
                      >
                        Clear All Income
                      </button>
                    </div>
                  </div>
                  
                  <div className="space-y-4">
                    {/* Lot Rent Income */}
                    <div className="bg-white p-4 rounded border border-green-200">
                      <div className="font-semibold text-gray-800 mb-3">Lot Rent Income</div>
                      <div className="space-y-2">
                        <div className="flex justify-between text-sm">
                          <span className="text-gray-600">Gross Potential Rent (from Rent Roll)</span>
                          <span className="font-semibold">{formatCurrency(calculations.grossPotentialRent)}</span>
                        </div>
                        
                        <div className="flex items-center space-x-3 pt-2 border-t border-gray-200">
                          <input
                            type="checkbox"
                            id="useActual"
                            checked={useActualIncome}
                            onChange={(e) => setUseActualIncome(e.target.checked)}
                            className="w-4 h-4"
                          />
                          <label htmlFor="useActual" className="text-sm font-semibold text-gray-700">
                            Override with Actual Income:
                          </label>
                          <input
                            type="number"
                            value={actualIncome}
                            onChange={(e) => setActualIncome(Number(e.target.value))}
                            disabled={!useActualIncome}
                            className={`w-40 p-2 border border-gray-300 rounded text-right font-semibold ${
                              useActualIncome ? 'bg-blue-50 text-blue-900' : 'bg-gray-100 text-gray-400'
                            }`}
                          />
                        </div>
                        
                        <div className="flex justify-between pt-2 border-t border-gray-200">
                          <span className="text-gray-700 font-semibold">Lot Rent Income (Used in Calculations)</span>
                          <span className="font-bold text-green-700">{formatCurrency(calculations.lotRentIncome)}</span>
                        </div>
                        
                        {!useActualIncome && (
                          <div className="flex justify-between text-sm text-red-600">
                            <span>Less: Vacancy Loss</span>
                            <span className="font-semibold">({formatCurrency(calculations.vacancyLoss)})</span>
                          </div>
                        )}
                      </div>
                    </div>

                    {/* Additional Income Items */}
                    <div className="bg-white p-4 rounded border border-green-200">
                      <div className="font-semibold text-gray-800 mb-3">Other Income</div>
                      <div className="space-y-2">
                        {additionalIncome.map((item) => (
                          <div key={item.id} className="flex items-center justify-between">
                            <input
                              type="text"
                              value={item.name}
                              onChange={(e) => updateIncomeItem(item.id, 'name', e.target.value)}
                              className="flex-1 p-2 border border-gray-300 rounded bg-blue-50 text-blue-900 font-semibold mr-3"
                              placeholder="Income name"
                            />
                            <input
                              type="number"
                              value={item.amount}
                              onChange={(e) => updateIncomeItem(item.id, 'amount', Number(e.target.value))}
                              className="w-32 p-2 border border-gray-300 rounded text-right bg-blue-50 text-blue-900 font-semibold"
                            />
                            <button
                              onClick={() => removeIncomeItem(item.id)}
                              className="ml-3 text-red-600 hover:text-red-800 font-semibold"
                            >
                              Remove
                            </button>
                          </div>
                        ))}
                        {unmappedIncomeItems.length > 0 && (
                          <details className="rounded border border-yellow-200 bg-yellow-50 px-3 py-2 text-sm text-yellow-900">
                            <summary className="cursor-pointer font-semibold">
                              Other Income (Unmapped) — {formatCurrency(calculations.totalUnmappedIncome)}
                            </summary>
                            <div className="mt-2 space-y-1 text-xs text-yellow-800">
                              {unmappedIncomeItems.map((item) => (
                                <div key={item.id} className="flex items-center justify-between gap-3">
                                  <span className="font-medium">{item.name || item.originalLabel || 'Unlabeled Income'}</span>
                                  <span className="font-semibold">{formatCurrency(item.amount)}</span>
                                </div>
                              ))}
                            </div>
                          </details>
                        )}
                        {calculations.totalUnmappedIncome > 0 && (
                          <div className="flex justify-between text-xs text-yellow-700">
                            <span>Mapped Other Income</span>
                            <span className="font-semibold text-yellow-900">{formatCurrency(calculations.mappedAdditionalIncomeTotal)}</span>
                          </div>
                        )}
                        <div className="flex justify-between pt-2 border-t border-gray-200">
                          <span className="text-gray-700 font-semibold">Total Other Income (incl. unmapped)</span>
                          <span className="font-bold text-green-700">{formatCurrency(calculations.totalAdditionalIncome)}</span>
                        </div>
                      </div>
                    </div>

                    {/* Total Income */}
                    <div className="flex justify-between pt-2 border-t-2 border-green-300 text-lg font-bold text-green-700">
                      <span>Effective Gross Income</span>
                      <span>{formatCurrency(calculations.effectiveGrossIncome)}</span>
                    </div>
                  </div>
                </div>

                {/* Operating Expenses */}
                <div className="bg-red-50 p-6 rounded-lg border border-red-200">
                  <div className="flex flex-col gap-3 md:flex-row md:items-center md:justify-between mb-4">
                    <h3 className="text-xl font-bold text-red-800">Operating Expenses</h3>
                    <div className="flex flex-wrap items-center gap-2">
                      <label htmlFor="expense-category" className="text-sm font-semibold text-gray-700">
                        Category
                      </label>
                      <select
                        id="expense-category"
                        value={selectedExpenseCategory}
                        onChange={(e) => setSelectedExpenseCategory(e.target.value)}
                        className="p-2 border border-red-300 rounded bg-white text-sm"
                      >
                        {EXPENSE_CATEGORY_OPTIONS.map((option) => (
                          <option key={option} value={option}>
                            {option}
                          </option>
                        ))}
                      </select>
                      <button
                        onClick={addExpenseItem}
                        className="bg-red-600 text-white px-4 py-2 rounded hover:bg-red-700 transition-colors text-sm"
                      >
                        + Add Expense Line
                      </button>
                      <button
                        onClick={clearExpenseItems}
                        className="px-4 py-2 text-sm font-semibold text-red-700 bg-white border border-red-200 rounded hover:bg-red-100 transition-colors"
                      >
                        Clear All Expenses
                      </button>
                    </div>
                  </div>
                  <div className="space-y-3">
                    <div className="bg-white p-4 rounded border border-red-200">
                      <label className="font-semibold text-gray-800" htmlFor="expense-ratio">
                        Expense Ratio (%)
                      </label>
                      <div className="mt-2 flex flex-col gap-2 sm:flex-row sm:items-center sm:gap-3">
                        <input
                          id="expense-ratio"
                          type="number"
                          value={expenseRatio}
                          onChange={(e) => {
                            const next = Number(e.target.value);
                            setExpenseRatio(Number.isFinite(next) ? next : 0);
                          }}
                          className="w-32 p-2 border border-red-300 rounded text-right bg-white font-semibold"
                        />
                        <span className="text-sm text-gray-500">Overrides detailed expense inputs.</span>
                      </div>
                    </div>
                    {expenses.map((expense) => {
                      const perLotAmount =
                        calculations.totalUnits > 0
                          ? expense.amount / calculations.totalUnits
                          : 0;

                      return (
                        <div key={expense.id} className="space-y-1">
                          <div className="flex items-center justify-between">
                            <input
                              type="text"
                              value={expense.name}
                              onChange={(e) => updateExpenseItem(expense.id, 'name', e.target.value)}
                              className="flex-1 p-2 border border-gray-300 rounded bg-blue-50 text-blue-900 font-semibold mr-3"
                              placeholder="Expense name"
                            />
                            <input
                              type="number"
                              value={expense.amount}
                              onChange={(e) => updateExpenseItem(expense.id, 'amount', Number(e.target.value))}
                              className="w-32 p-2 border border-gray-300 rounded text-right bg-blue-50 text-blue-900 font-semibold"
                            />
                            <button
                              onClick={() => removeExpenseItem(expense.id)}
                              className="ml-3 text-red-600 hover:text-red-800 font-semibold"
                            >
                              Remove
                            </button>
                          </div>
                          <div className="flex justify-end text-xs text-gray-600 italic mr-20">
                            {formatCurrency(perLotAmount)} per lot/year
                          </div>
                        </div>
                      );
                    })}
                    {unmappedExpenseItems.length > 0 && (
                      <details className="rounded border border-orange-200 bg-orange-50 px-3 py-2 text-sm text-orange-900">
                        <summary className="cursor-pointer font-semibold">
                          Other Expenses (Unmapped) — {formatCurrency(calculations.totalUnmappedExpenses)}
                        </summary>
                        <div className="mt-2 space-y-1 text-xs text-orange-800">
                          {unmappedExpenseItems.map((item) => (
                            <div key={item.id} className="flex items-center justify-between gap-3">
                              <span className="font-medium">{item.name || item.originalLabel || 'Unlabeled Expense'}</span>
                              <span className="font-semibold">{formatCurrency(item.amount)}</span>
                            </div>
                          ))}
                        </div>
                      </details>
                    )}
                    <div className="space-y-1">
                      <div className="flex justify-between items-center">
                        <div className="flex items-center space-x-2">
                          <span className="text-gray-700">Management Fee</span>
                          <input
                            type="number"
                            value={managementPercent}
                            onChange={(e) => setManagementPercent(Number(e.target.value))}
                            className="w-16 p-2 border border-gray-300 rounded text-right bg-blue-50 text-blue-900 font-semibold"
                          />
                          <span className="text-gray-700">%</span>
                        </div>
                        <span className="font-semibold">{formatCurrency(calculations.managementFee)}</span>
                      </div>
                      <div className="flex justify-end text-xs text-gray-600 italic">
                        {formatCurrency(calculations.managementFee / calculations.totalUnits)} per lot/year
                      </div>
                    </div>
                    <div className="flex justify-between pt-2 border-t-2 border-red-300 text-lg font-bold text-red-700">
                      <span>Total Operating Expenses</span>
                      <span>{formatCurrency(calculations.totalOpEx)}</span>
                    </div>
                    <div className="flex justify-end text-sm text-gray-600 font-semibold">
                      {formatCurrency(calculations.totalOpEx / calculations.totalUnits)} per lot/year
                    </div>
                  </div>
                </div>

                {/* NOI */}
                <div className="bg-blue-50 p-6 rounded-lg border-2 border-blue-400">
                  <div className="flex justify-between items-center">
                    <span className="text-2xl font-bold text-blue-800">Net Operating Income (NOI)</span>
                    <span className="text-2xl font-bold text-blue-800">{formatCurrency(calculations.noi)}</span>
                  </div>
                  <div className="mt-4 pt-4 border-t border-blue-300">
                    <div className="flex justify-between text-sm">
                      <span className="text-gray-700">NOI per Lot</span>
                      <span className="font-semibold">{formatCurrency(calculations.noiPerUnit)}</span>
                    </div>
                    <div className="flex justify-between text-sm mt-1">
                      <span className="text-gray-700">Operating Expense Ratio</span>
                      <span className="font-semibold">{formatPercent((calculations.totalOpEx / calculations.effectiveGrossIncome) * 100)}</span>
                    </div>
                  </div>
                </div>
              </div>
            </div>
          )}

          {activeTab === 'returns' && (
            <div className="space-y-6">
              <h2 className="text-2xl font-bold text-gray-800">Return Metrics & Financing</h2>

              {/* Purchase Inputs */}
              <div className="bg-gray-50 p-6 rounded-lg border border-gray-300">
                <h3 className="text-xl font-bold text-gray-800 mb-4">Purchase Details</h3>
                <div className="grid grid-cols-2 gap-4">
                  <div>
                    <label className="block text-sm font-semibold text-gray-700 mb-2">Purchase Price</label>
                    <input
                      type="number"
                      value={purchaseInputs.purchasePrice}
                      onChange={(e) => setPurchaseInputs({...purchaseInputs, purchasePrice: Number(e.target.value)})}
                      className="w-full p-3 border border-gray-300 rounded bg-blue-50 text-blue-900 font-semibold text-lg"
                    />
                  </div>
                  <div>
                    <label className="block text-sm font-semibold text-gray-700 mb-2">Closing Costs</label>
                    <input
                      type="number"
                      value={purchaseInputs.closingCosts}
                      onChange={(e) => setPurchaseInputs({...purchaseInputs, closingCosts: Number(e.target.value)})}
                      className="w-full p-3 border border-gray-300 rounded bg-blue-50 text-blue-900 font-semibold text-lg"
                    />
                  </div>
                </div>
              </div>

              {/* Financing Inputs */}
              <div className="bg-gray-50 p-6 rounded-lg border border-gray-300">
                <h3 className="text-xl font-bold text-gray-800 mb-4">Financing Terms</h3>
                <div className="grid grid-cols-1 gap-4 sm:grid-cols-2 lg:grid-cols-5">
                  <div>
                    <label className="block text-sm font-semibold text-gray-700 mb-2">Down Payment %</label>
                    <input
                      type="number"
                      value={purchaseInputs.downPaymentPercent}
                      onChange={(e) => setPurchaseInputs({...purchaseInputs, downPaymentPercent: Number(e.target.value)})}
                      className="w-full p-3 border border-gray-300 rounded bg-blue-50 text-blue-900 font-semibold text-lg"
                    />
                  </div>
                  <div>
                    <label className="block text-sm font-semibold text-gray-700 mb-2">Interest Rate %</label>
                    <input
                      type="number"
                      step="0.1"
                      value={purchaseInputs.interestRate}
                      onChange={(e) => setPurchaseInputs({...purchaseInputs, interestRate: Number(e.target.value)})}
                      className="w-full p-3 border border-gray-300 rounded bg-blue-50 text-blue-900 font-semibold text-lg"
                    />
                  </div>
                  <div>
                    <label className="block text-sm font-semibold text-gray-700 mb-2">Loan Term (Years)</label>
                    <input
                      type="number"
                      value={purchaseInputs.loanTermYears}
                      onChange={(e) => setPurchaseInputs({...purchaseInputs, loanTermYears: Number(e.target.value)})}
                      className="w-full p-3 border border-gray-300 rounded bg-blue-50 text-blue-900 font-semibold text-lg"
                    />
                  </div>
                  <div>
                    <label className="block text-sm font-semibold text-gray-700 mb-2">Amortization (Years)</label>
                    <input
                      type="number"
                      value={purchaseInputs.amortizationYears}
                      onChange={(e) =>
                        setPurchaseInputs({
                          ...purchaseInputs,
                          amortizationYears: Number(e.target.value),
                        })
                      }
                      className="w-full p-3 border border-gray-300 rounded bg-blue-50 text-blue-900 font-semibold text-lg"
                    />
                  </div>
                  <div>
                    <label className="block text-sm font-semibold text-gray-700 mb-2">Interest-Only Period (Years)</label>
                    <input
                      type="number"
                      value={purchaseInputs.interestOnlyPeriodYears}
                      onChange={(e) =>
                        setPurchaseInputs({
                          ...purchaseInputs,
                          interestOnlyPeriodYears: Number(e.target.value),
                        })
                      }
                      className="w-full p-3 border border-gray-300 rounded bg-blue-50 text-blue-900 font-semibold text-lg"
                    />
                  </div>
                </div>
              </div>

              {/* Key Metrics */}
              <div className="grid grid-cols-2 gap-6">
                <div className="bg-gradient-to-br from-green-50 to-green-100 p-6 rounded-lg border-2 border-green-400">
                  <h3 className="text-lg font-bold text-green-800 mb-4">Unlevered Returns</h3>
                  <div className="space-y-3">
                    <div className="flex justify-between">
                      <span className="text-gray-700">Cap Rate</span>
                      <span className="text-2xl font-bold text-green-700">{formatPercent(calculations.capRate)}</span>
                    </div>
                    <div className="flex justify-between pt-2 border-t border-green-300">
                      <span className="text-gray-700">Annual NOI</span>
                      <span className="font-semibold">{formatCurrency(calculations.noi)}</span>
                    </div>
                  </div>
                </div>

                <div className="bg-gradient-to-br from-blue-50 to-blue-100 p-6 rounded-lg border-2 border-blue-400">
                  <h3 className="text-lg font-bold text-blue-800 mb-4">Levered Returns</h3>
                  <div className="space-y-3">
                    <div className="flex justify-between">
                      <span className="text-gray-700">Cash-on-Cash Return</span>
                      <span className="text-2xl font-bold text-blue-700">{formatPercent(calculations.cashOnCash)}</span>
                    </div>
                    <div className="flex justify-between pt-2 border-t border-blue-300">
                      <span className="text-gray-700">Annual Cash Flow</span>
                      <span className="font-semibold">{formatCurrency(calculations.cashFlow)}</span>
                    </div>
                  </div>
                </div>
              </div>

              {/* Investment Summary */}
              <div className="bg-gradient-to-br from-purple-50 to-purple-100 p-6 rounded-lg border-2 border-purple-400">
                <h3 className="text-xl font-bold text-purple-800 mb-4">Investment Summary</h3>
                <div className="grid grid-cols-2 gap-6">
                  <div className="space-y-3">
                    <div className="flex justify-between">
                      <span className="text-gray-700">Total Investment</span>
                      <span className="font-bold">{formatCurrency(calculations.totalInvestment)}</span>
                    </div>
                    <div className="flex justify-between">
                      <span className="text-gray-700">Down Payment Required</span>
                      <span className="font-bold">{formatCurrency(calculations.downPayment)}</span>
                    </div>
                    <div className="flex justify-between">
                      <span className="text-gray-700">Loan Amount</span>
                      <span className="font-bold">{formatCurrency(calculations.loanAmount)}</span>
                    </div>
                  </div>
                  <div className="space-y-3">
                    <div className="flex justify-between">
                      <span className="text-gray-700">Monthly Payment</span>
                      <span className="font-bold">{formatCurrency(calculations.monthlyPayment)}</span>
                    </div>
                    <div className="flex justify-between">
                      <span className="text-gray-700">Annual Debt Service</span>
                      <span className="font-bold">{formatCurrency(calculations.annualDebtService)}</span>
                    </div>
                    <div className="flex justify-between">
                      <span className="text-gray-700">DSCR</span>
                      <span className={`font-bold ${calculations.dscr >= 1.25 ? 'text-green-700' : 'text-red-700'}`}>
                        {calculations.dscr.toFixed(2)}x
                      </span>
                    </div>
                  </div>
                </div>
              </div>

              {/* Monthly Cash Flow */}
              <div className="bg-gradient-to-br from-orange-50 to-orange-100 p-6 rounded-lg border-2 border-orange-400">
                <h3 className="text-xl font-bold text-orange-800 mb-4">Cash Flow Analysis</h3>
                <div className="space-y-2">
                  <div className="flex justify-between text-lg">
                    <span className="text-gray-700">Monthly Cash Flow</span>
                    <span className="font-bold text-orange-700">{formatCurrency(calculations.cashFlow / 12)}</span>
                  </div>
                  <div className="flex justify-between text-sm text-gray-600">
                    <span>Cash Flow per Lot (Monthly)</span>
                    <span className="font-semibold">{formatCurrency(calculations.cashFlow / 12 / calculations.totalUnits)}</span>
                  </div>
                </div>
              </div>

              {/* IRR Calculator */}
              <div className="bg-gradient-to-br from-indigo-50 to-indigo-100 p-6 rounded-lg border-2 border-indigo-400">
                <h3 className="text-xl font-bold text-indigo-800 mb-4">IRR Analysis</h3>
                
                <div className="grid grid-cols-2 gap-4 mb-6">
                  <div>
                    <label className="block text-sm font-semibold text-gray-700 mb-2">Hold Period (Years)</label>
                    <input
                      type="number"
                      value={irrInputs.holdPeriod}
                      onChange={(e) => setIrrInputs({...irrInputs, holdPeriod: Number(e.target.value)})}
                      className="w-full p-3 border border-gray-300 rounded bg-blue-50 text-blue-900 font-semibold text-lg"
                    />
                  </div>
                  <div>
                    <label className="block text-sm font-semibold text-gray-700 mb-2">Exit Cap Rate %</label>
                    <input
                      type="number"
                      step="0.1"
                      value={irrInputs.exitCapRate}
                      onChange={(e) => setIrrInputs({...irrInputs, exitCapRate: Number(e.target.value)})}
                      className="w-full p-3 border border-gray-300 rounded bg-blue-50 text-blue-900 font-semibold text-lg"
                    />
                  </div>
                </div>

                <div className="space-y-4">
                  <div className="bg-white p-4 rounded border border-indigo-300">
                    <h4 className="font-bold text-gray-800 mb-3">Exit Analysis</h4>
                    <div className="space-y-2">
                      <div className="flex justify-between text-sm">
                        <span className="text-gray-700">Exit Value (at {irrInputs.exitCapRate}% cap):</span>
                        <span className="font-semibold">{formatCurrency(calculations.exitValue)}</span>
                      </div>
                      <div className="flex justify-between text-sm">
                        <span className="text-gray-700">Remaining Loan Balance:</span>
                        <span className="font-semibold">{formatCurrency(calculations.remainingBalance)}</span>
                      </div>
                      <div className="flex justify-between pt-2 border-t border-gray-300 font-bold">
                        <span className="text-gray-700">Net Exit Proceeds:</span>
                        <span className="text-gray-900">{formatCurrency(calculations.exitProceeds)}</span>
                      </div>
                    </div>
                  </div>

                  <div className="grid grid-cols-2 gap-4">
                    <div className="bg-indigo-600 text-white p-4 rounded">
                      <div className="text-sm opacity-90 mb-1">Internal Rate of Return</div>
                      <div className="text-3xl font-bold">{formatPercent(calculations.irr)}</div>
                    </div>
                    <div className="bg-indigo-600 text-white p-4 rounded">
                      <div className="text-sm opacity-90 mb-1">Equity Multiple</div>
                      <div className="text-3xl font-bold">{calculations.equityMultiple.toFixed(2)}x</div>
                    </div>
                  </div>

                  <div className="bg-white p-4 rounded border border-indigo-300">
                    <div className="text-sm text-gray-600">
                      <div className="flex justify-between py-1">
                        <span>Total Cash Invested:</span>
                        <span className="font-semibold">{formatCurrency(calculations.downPayment)}</span>
                      </div>
                      <div className="flex justify-between py-1">
                        <span>Total Cash Flow ({irrInputs.holdPeriod} years):</span>
                        <span className="font-semibold">{formatCurrency(calculations.cashFlow * irrInputs.holdPeriod)}</span>
                      </div>
                      <div className="flex justify-between py-1">
                        <span>Exit Proceeds:</span>
                        <span className="font-semibold">{formatCurrency(calculations.exitProceeds)}</span>
                      </div>
                      <div className="flex justify-between py-2 border-t border-gray-300 font-bold text-indigo-700">
                        <span>Total Return:</span>
                        <span>{formatCurrency(calculations.cashFlow * irrInputs.holdPeriod + calculations.exitProceeds)}</span>
                      </div>
                    </div>
                  </div>
                </div>
              </div>
            </div>
          )}

          {activeTab === 'proforma' && (
            <div className="space-y-6">
              <h2 className="text-2xl font-bold text-gray-800">{projectionYears}-Year Proforma Analysis</h2>
              <div className="flex flex-wrap items-center gap-3 bg-white p-4 rounded border border-gray-200">
                <label htmlFor="projection-years" className="text-sm font-semibold text-gray-700">
                  Projection Years
                </label>
                <select
                  id="projection-years"
                  value={projectionYears}
                  onChange={(e) => setProjectionYears(Number(e.target.value))}
                  className="p-2 border border-gray-300 rounded bg-white text-sm"
                >
                  {[5, 7, 10].map((option) => (
                    <option key={option} value={option}>
                      {option} Years
                    </option>
                  ))}
                </select>
                <span className="text-sm text-gray-500">Extends revenue and return projections.</span>
              </div>

              {/* Lease-Up Strategy Inputs */}
              <div className="bg-gray-50 p-6 rounded-lg border border-gray-300">
                <h3 className="text-xl font-bold text-gray-800 mb-4">Lease-Up Strategy</h3>
                <div className="grid grid-cols-3 gap-4 mb-4">
                  <div>
                    <label className="block text-sm font-semibold text-gray-700 mb-2">Year 1 New Leases</label>
                    <input
                      type="number"
                      value={proformaInputs.year1NewLeases}
                      onChange={(e) => setProformaInputs({...proformaInputs, year1NewLeases: Number(e.target.value)})}
                      className="w-full p-3 border border-gray-300 rounded bg-blue-50 text-blue-900 font-semibold text-lg"
                    />
                  </div>
                  <div>
                    <label className="block text-sm font-semibold text-gray-700 mb-2">Year 2 New Leases</label>
                    <input
                      type="number"
                      value={proformaInputs.year2NewLeases}
                      onChange={(e) => setProformaInputs({...proformaInputs, year2NewLeases: Number(e.target.value)})}
                      className="w-full p-3 border border-gray-300 rounded bg-blue-50 text-blue-900 font-semibold text-lg"
                    />
                  </div>
                  <div>
                    <label className="block text-sm font-semibold text-gray-700 mb-2">Year 3 New Leases</label>
                    <input
                      type="number"
                      value={proformaInputs.year3NewLeases}
                      onChange={(e) => setProformaInputs({...proformaInputs, year3NewLeases: Number(e.target.value)})}
                      className="w-full p-3 border border-gray-300 rounded bg-blue-50 text-blue-900 font-semibold text-lg"
                    />
                  </div>
                </div>
                <div className="grid grid-cols-2 gap-4">
                  <div>
                    <label className="block text-sm font-semibold text-gray-700 mb-2">Year 4 New Leases</label>
                    <input
                      type="number"
                      value={proformaInputs.year4NewLeases}
                      onChange={(e) => setProformaInputs({...proformaInputs, year4NewLeases: Number(e.target.value)})}
                      className="w-full p-3 border border-gray-300 rounded bg-blue-50 text-blue-900 font-semibold text-lg"
                    />
                  </div>
                  <div>
                    <label className="block text-sm font-semibold text-gray-700 mb-2">Year 5 New Leases</label>
                    <input
                      type="number"
                      value={proformaInputs.year5NewLeases}
                      onChange={(e) => setProformaInputs({...proformaInputs, year5NewLeases: Number(e.target.value)})}
                      className="w-full p-3 border border-gray-300 rounded bg-blue-50 text-blue-900 font-semibold text-lg"
                    />
                  </div>
                </div>
              </div>

              {/* Growth Assumptions */}
              <div className="bg-gray-50 p-6 rounded-lg border border-gray-300">
                <h3 className="text-xl font-bold text-gray-800 mb-4">Growth Assumptions</h3>
                <div className="grid grid-cols-1 md:grid-cols-3 gap-4 mb-4">
                  <div>
                    <label className="block text-sm font-semibold text-gray-700 mb-2">Year 1 Rent Increase</label>
                    <div className="flex gap-2">
                      <input
                        type="number"
                        step="0.1"
                        value={proformaInputs.year1RentIncreaseValue}
                        onChange={(e) =>
                          setProformaInputs({
                            ...proformaInputs,
                            year1RentIncreaseValue: Number(e.target.value),
                          })
                        }
                        className="flex-1 p-3 border border-gray-300 rounded bg-blue-50 text-blue-900 font-semibold text-lg"
                      />
                      <select
                        value={proformaInputs.year1RentIncreaseMode}
                        onChange={(e) =>
                          setProformaInputs({
                            ...proformaInputs,
                            year1RentIncreaseMode: e.target.value,
                          })
                        }
                        className="w-32 p-3 border border-gray-300 rounded bg-white text-gray-700 font-semibold"
                      >
                        <option value="percent">% Percent</option>
                        <option value="dollar">Flat $</option>
                      </select>
                    </div>
                  </div>
                  <div>
                    <label className="block text-sm font-semibold text-gray-700 mb-2">Year 2 Rent Increase</label>
                    <div className="flex gap-2">
                      <input
                        type="number"
                        step="0.1"
                        value={proformaInputs.year2RentIncreaseValue}
                        onChange={(e) =>
                          setProformaInputs({
                            ...proformaInputs,
                            year2RentIncreaseValue: Number(e.target.value),
                          })
                        }
                        className="flex-1 p-3 border border-gray-300 rounded bg-blue-50 text-blue-900 font-semibold text-lg"
                      />
                      <select
                        value={proformaInputs.year2RentIncreaseMode}
                        onChange={(e) =>
                          setProformaInputs({
                            ...proformaInputs,
                            year2RentIncreaseMode: e.target.value,
                          })
                        }
                        className="w-32 p-3 border border-gray-300 rounded bg-white text-gray-700 font-semibold"
                      >
                        <option value="percent">% Percent</option>
                        <option value="dollar">Flat $</option>
                      </select>
                    </div>
                  </div>
                  <div>
                    <label className="block text-sm font-semibold text-gray-700 mb-2">Subsequent Annual Rent Increase</label>
                    <div className="flex gap-2">
                      <input
                        type="number"
                        step="0.1"
                        value={proformaInputs.annualRentIncrease}
                        onChange={(e) =>
                          setProformaInputs({
                            ...proformaInputs,
                            annualRentIncrease: Number(e.target.value),
                          })
                        }
                        className="flex-1 p-3 border border-gray-300 rounded bg-blue-50 text-blue-900 font-semibold text-lg"
                      />
                      <select
                        value={proformaInputs.annualRentIncreaseMode}
                        onChange={(e) =>
                          setProformaInputs({
                            ...proformaInputs,
                            annualRentIncreaseMode: e.target.value,
                          })
                        }
                        className="w-32 p-3 border border-gray-300 rounded bg-white text-gray-700 font-semibold"
                      >
                        <option value="percent">% Percent</option>
                        <option value="dollar">Flat $</option>
                      </select>
                    </div>
                  </div>
                </div>
                <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
                  <div>
                    <label className="block text-sm font-semibold text-gray-700 mb-2">Annual Expense Increase %</label>
                    <input
                      type="number"
                      step="0.1"
                      value={proformaInputs.annualExpenseIncrease}
                      onChange={(e) =>
                        setProformaInputs({
                          ...proformaInputs,
                          annualExpenseIncrease: Number(e.target.value),
                        })
                      }
                      className="w-full p-3 border border-gray-300 rounded bg-blue-50 text-blue-900 font-semibold text-lg"
                    />
                  </div>
                </div>
                <div className="mt-4 grid grid-cols-1 md:grid-cols-3 gap-3">
                  {[
                    { label: 'Year 1 Rent Change', index: 0 },
                    { label: 'Year 2 Rent Change', index: 1 },
                    { label: 'Year 3+ Rent Change', index: 2 },
                  ].map(({ label, index }) => {
                    const year = calculations.proformaYears[index] || null;
                    return (
                      <div
                        key={label}
                        className="bg-white border border-gray-200 rounded p-3 shadow-sm"
                      >
                        <div className="text-xs font-semibold text-gray-500 uppercase tracking-wide">
                          {label}
                        </div>
                        <div className="mt-1 text-sm font-semibold text-gray-800">
                          {describeRentIncrease(year)}
                        </div>
                      </div>
                    );
                  })}
                </div>
              </div>

              {/* Current Baseline */}
              <div className="bg-gradient-to-br from-gray-100 to-gray-200 p-6 rounded-lg border-2 border-gray-400">
                <h3 className="text-xl font-bold text-gray-800 mb-4">Current Baseline (Year 0)</h3>
                <div className="grid grid-cols-4 gap-4">
                  <div>
                    <div className="text-sm text-gray-600">Occupied Lots</div>
                    <div className="text-2xl font-bold text-gray-900">{calculations.occupiedUnits} / {calculations.totalUnits}</div>
                  </div>
                  <div>
                    <div className="text-sm text-gray-600">Occupancy Rate</div>
                    <div className="text-2xl font-bold text-gray-900">{formatPercent(calculations.physicalOccupancy)}</div>
                  </div>
                  <div>
                    <div className="text-sm text-gray-600">Current NOI</div>
                    <div className="text-2xl font-bold text-gray-900">{formatCurrency(calculations.noi)}</div>
                  </div>
                  <div>
                    <div className="text-sm text-gray-600">Current Cash Flow</div>
                    <div className="text-2xl font-bold text-gray-900">{formatCurrency(calculations.cashFlow)}</div>
                  </div>
                </div>
              </div>

              {/* Proforma Table */}
              <div className="overflow-x-auto">
                <table className="w-full border-collapse bg-white shadow-lg">
                  <thead>
                    <tr className="bg-gradient-to-r from-blue-600 to-blue-700 text-white">
                      <th className="p-4 text-left font-bold border-r border-blue-500">Metric</th>
                      {calculations.proformaYears.map((year) => (
                        <th key={year.year} className="p-4 text-center font-bold border-r border-blue-500">
                          Year {year.year}
                        </th>
                      ))}
                    </tr>
                  </thead>
                  <tbody>
                    <tr className="bg-purple-50 border-b border-gray-300">
                      <td className="p-4 font-bold text-gray-800 border-r border-gray-300">Occupied Lots</td>
                      {calculations.proformaYears.map((year) => (
                        <td key={year.year} className="p-4 text-center font-semibold border-r border-gray-200">
                          {year.occupiedUnits} / {calculations.totalUnits}
                        </td>
                      ))}
                    </tr>
                    <tr className="bg-purple-100 border-b border-gray-300">
                      <td className="p-4 font-bold text-gray-800 border-r border-gray-300">Occupancy Rate</td>
                      {calculations.proformaYears.map((year) => (
                        <td key={year.year} className="p-4 text-center font-semibold border-r border-gray-200">
                          {formatPercent(year.occupancyRate)}
                        </td>
                      ))}
                    </tr>
                    <tr className="bg-white border-b border-gray-300">
                      <td className="p-4 font-bold text-gray-800 border-r border-gray-300">Avg Monthly Rent</td>
                      {calculations.proformaYears.map((year) => (
                        <td key={year.year} className="p-4 text-center font-semibold border-r border-gray-200">
                          {formatCurrency(year.avgMonthlyRent)}
                        </td>
                      ))}
                    </tr>
                    <tr className="bg-slate-50 border-b border-gray-300">
                      <td className="p-4 font-bold text-gray-800 border-r border-gray-300">Rent Growth Applied (per lot/month)</td>
                      {calculations.proformaYears.map((year) => (
                        <td key={year.year} className="p-4 text-center font-semibold text-gray-700 border-r border-gray-200">
                          {describeRentIncrease(year)}
                        </td>
                      ))}
                    </tr>
                    <tr className="bg-green-50 border-b border-gray-300">
                      <td className="p-4 font-bold text-gray-800 border-r border-gray-300">Lot Rent Income</td>
                      {calculations.proformaYears.map((year) => (
                        <td key={year.year} className="p-4 text-center font-semibold border-r border-gray-200">
                          {formatCurrency(year.lotRentIncome)}
                        </td>
                      ))}
                    </tr>
                    <tr className="bg-green-100 border-b border-gray-300">
                      <td className="p-4 font-bold text-gray-800 border-r border-gray-300">Other Income</td>
                      {calculations.proformaYears.map((year) => (
                        <td key={year.year} className="p-4 text-center font-semibold border-r border-gray-200">
                          {formatCurrency(year.otherIncome)}
                        </td>
                      ))}
                    </tr>
                    <tr className="bg-green-200 border-b-2 border-green-600">
                      <td className="p-4 font-bold text-gray-900 border-r border-gray-300">Total Income</td>
                      {calculations.proformaYears.map((year) => (
                        <td key={year.year} className="p-4 text-center font-bold text-green-700 border-r border-gray-200">
                          {formatCurrency(year.totalIncome)}
                        </td>
                      ))}
                    </tr>
                    <tr className="bg-red-50 border-b-2 border-red-400">
                      <td className="p-4 font-bold text-gray-800 border-r border-gray-300">Operating Expenses</td>
                      {calculations.proformaYears.map((year) => (
                        <td key={year.year} className="p-4 text-center font-semibold text-red-700 border-r border-gray-200">
                          {formatCurrency(year.expenses)}
                        </td>
                      ))}
                    </tr>
                    <tr className="bg-blue-100 border-b-2 border-blue-600">
                      <td className="p-4 font-bold text-gray-900 border-r border-gray-300">Net Operating Income</td>
                      {calculations.proformaYears.map((year) => (
                        <td key={year.year} className="p-4 text-center font-bold text-blue-700 border-r border-gray-200">
                          {formatCurrency(year.noi)}
                        </td>
                      ))}
                    </tr>
                    <tr className="bg-orange-50 border-b border-gray-300">
                      <td className="p-4 font-bold text-gray-800 border-r border-gray-300">Debt Service</td>
                      {calculations.proformaYears.map((year) => (
                        <td key={year.year} className="p-4 text-center font-semibold text-gray-700 border-r border-gray-200">
                          {formatCurrency(year.debtService)}
                        </td>
                      ))}
                    </tr>
                    <tr className="bg-orange-200 border-b-2 border-orange-600">
                      <td className="p-4 font-bold text-gray-900 border-r border-gray-300">Annual Cash Flow</td>
                      {calculations.proformaYears.map((year) => (
                        <td key={year.year} className="p-4 text-center font-bold text-orange-700 border-r border-gray-200">
                          {formatCurrency(year.cashFlow)}
                        </td>
                      ))}
                    </tr>
                  </tbody>
                </table>
              </div>

              {/* Summary Statistics */}
              <div className="grid grid-cols-3 gap-6">
                <div className="bg-gradient-to-br from-green-50 to-green-100 p-6 rounded-lg border-2 border-green-400">
                  <h4 className="text-sm font-semibold text-gray-700 mb-2">{projectionYears}-Year NOI Growth</h4>
                  <div className="text-3xl font-bold text-green-700">
                    {typeof noiGrowth === 'number' ? formatCurrency(noiGrowth) : '—'}
                  </div>
                  <div className="text-sm text-gray-600 mt-2">
                    {typeof noiGrowthPercent === 'number'
                      ? `${formatPercent(noiGrowthPercent)} increase`
                      : '—'}
                  </div>
                </div>

                <div className="bg-gradient-to-br from-blue-50 to-blue-100 p-6 rounded-lg border-2 border-blue-400">
                  <h4 className="text-sm font-semibold text-gray-700 mb-2">{projectionYears}-Year Cash Flow Growth</h4>
                  <div className="text-3xl font-bold text-blue-700">
                    {typeof cashFlowGrowth === 'number' ? formatCurrency(cashFlowGrowth) : '—'}
                  </div>
                  <div className="text-sm text-gray-600 mt-2">
                    {typeof cashFlowGrowthPercent === 'number'
                      ? `${formatPercent(cashFlowGrowthPercent)} increase`
                      : '—'}
                  </div>
                </div>

                <div className="bg-gradient-to-br from-purple-50 to-purple-100 p-6 rounded-lg border-2 border-purple-400">
                  <h4 className="text-sm font-semibold text-gray-700 mb-2">Total {projectionYears}-Year Cash Flow</h4>
                  <div className="text-3xl font-bold text-purple-700">
                    {formatCurrency(calculations.proformaYears.reduce((sum, year) => sum + year.cashFlow, 0))}
                  </div>
                  <div className="text-sm text-gray-600 mt-2">
                    Cumulative cash generated
                  </div>
                </div>
              </div>

              {/* Exit Analysis */}
              <div className="bg-gradient-to-br from-indigo-50 to-indigo-100 p-6 rounded-lg border-2 border-indigo-400">
                <h3 className="text-xl font-bold text-indigo-800 mb-4">Year {projectionYears} Exit Analysis</h3>
                <div className="grid grid-cols-2 gap-6">
                  <div>
                    <div className="space-y-2">
                      <div className="flex justify-between">
                        <span className="text-gray-700">Year {projectionYears} NOI:</span>
                        <span className="font-bold">{lastProformaYear ? formatCurrency(lastProformaYear.noi) : '—'}</span>
                      </div>
                      <div className="flex justify-between">
                        <span className="text-gray-700">Exit Cap Rate:</span>
                        <span className="font-bold">{irrInputs.exitCapRate}%</span>
                      </div>
                      <div className="flex justify-between pt-2 border-t-2 border-indigo-300">
                        <span className="text-gray-900 font-bold">Projected Exit Value:</span>
                        <span className="font-bold text-indigo-700 text-xl">
                          {lastYearExitValue !== null ? formatCurrency(lastYearExitValue) : '—'}
                        </span>
                      </div>
                    </div>
                  </div>
                  <div>
                    <div className="text-sm text-gray-600 mb-2">Value Appreciation</div>
                    <div className="text-3xl font-bold text-indigo-700">
                      {appreciationValue !== null ? formatCurrency(appreciationValue) : '—'}
                    </div>
                    <div className="text-sm text-gray-600 mt-1">
                      {appreciationPercent !== null
                        ? `${formatPercent(appreciationPercent)} increase`
                        : '—'}
                    </div>
                  </div>
                </div>
              </div>
            </div>
          )}

          {activeTab === 'report' && (
            <div className="bg-white">
              <div className="flex flex-col gap-4 lg:flex-row lg:items-center lg:justify-between mb-4 print:hidden">
                <div className="flex flex-wrap items-end gap-3">
                  <input
                    type="text"
                    placeholder="Name"
                    value={contactInfo.name}
                    onChange={(e) => setContactInfo({...contactInfo, name: e.target.value})}
                    className="p-2 border border-gray-300 rounded bg-white text-sm w-40"
                  />
                  <input
                    type="email"
                    placeholder="Email"
                    value={contactInfo.email}
                    onChange={(e) => setContactInfo({...contactInfo, email: e.target.value})}
                    className="p-2 border border-gray-300 rounded bg-white text-sm w-48"
                  />
                  <input
                    type="text"
                    placeholder="Company"
                    value={contactInfo.company}
                    onChange={(e) => setContactInfo({...contactInfo, company: e.target.value})}
                    className="p-2 border border-gray-300 rounded bg-white text-sm w-40"
                  />
                  <input
                    type="tel"
                    placeholder="Phone"
                    value={contactInfo.phone}
                    onChange={(e) => setContactInfo({...contactInfo, phone: e.target.value})}
                    className="p-2 border border-gray-300 rounded bg-white text-sm w-36"
                  />
                  <p className="text-xs text-gray-500 w-full">
                    These details populate the Prepared By section displayed in the report and exported file.
                  </p>
                  <div className="flex flex-col w-56">
                    <label className="text-sm font-semibold text-gray-700 mb-1">Report Name</label>
                    <input
                      type="text"
                      placeholder="Report name"
                      value={reportName}
                      onChange={(e) => setReportName(e.target.value)}
                      className="p-2 border border-gray-300 rounded bg-white text-sm w-full"
                    />
                    <p className="mt-1 text-xs text-gray-500">Used to identify and save this report.</p>
                  </div>
                </div>
                <div className="flex flex-wrap items-center gap-3 justify-end">
                  {session?.user ? (
                    <button
                      onClick={() => saveReportToAccount()}
                      className="rounded border border-blue-600 px-6 py-2 font-semibold text-blue-600 transition hover:bg-blue-50 disabled:opacity-60"
                      disabled={savingReport}
                    >
                      {savingReport ? 'Saving…' : selectedReportId ? 'Save Changes' : 'Save to Account'}
                    </button>
                  ) : (
                    isSupabaseConfigured && (
                      <button
                        onClick={() => setAuthModalOpen(true)}
                        className="rounded border border-blue-400 px-6 py-2 font-semibold text-blue-600 transition hover:bg-blue-50"
                      >
                        Sign in to save
                      </button>
                    )
                  )}
                  <button
                    onClick={downloadReport}
                    className="bg-blue-600 text-white px-6 py-2 rounded hover:bg-blue-700 transition-colors flex items-center space-x-2"
                    disabled={savingReport}
                  >
                    <Download size={20} />
                    <span>{savingReport ? 'Saving...' : 'Download Report'}</span>
                  </button>
                </div>
              </div>
              
              <div className="bg-white p-12 shadow-sm border border-gray-200" id="report">
                {/* Report Header */}
                <div className="text-center border-b-4 border-blue-600 pb-6 mb-8">
                  <h1 className="text-4xl font-bold text-gray-900 mb-2">Investment Analysis Report</h1>
                  <h2 className="text-3xl text-blue-700 font-bold">{propertyInfo.name}</h2>
                  {(propertyInfo.address || propertyInfo.city || propertyInfo.state) && (
                    <p className="text-xl text-gray-700 mt-2">
                      {propertyInfo.address && `${propertyInfo.address}, `}
                      {propertyInfo.city && `${propertyInfo.city}, `}
                      {propertyInfo.state}
                    </p>
                  )}
                  <p className="text-gray-600 mt-3">Report Generated: {new Date().toLocaleDateString('en-US', { year: 'numeric', month: 'long', day: 'numeric' })}</p>
                </div>

                {/* Prepared By */}
                <div className="mb-10">
                  <h2 className="text-2xl font-bold text-gray-900 border-b-2 border-gray-300 pb-2 mb-4">Prepared By</h2>
                  <div className="grid grid-cols-2 gap-6">
                    <div className="bg-gray-50 p-4 rounded border border-gray-200">
                      <div className="text-sm text-gray-600 mb-1">Name</div>
                      <div className="text-lg font-semibold text-gray-900">
                        {preparedByContact.name || '—'}
                      </div>
                    </div>
                    <div className="bg-gray-50 p-4 rounded border border-gray-200">
                      <div className="text-sm text-gray-600 mb-1">Company</div>
                      <div className="text-lg font-semibold text-gray-900">
                        {preparedByContact.company || '—'}
                      </div>
                    </div>
                    <div className="bg-gray-50 p-4 rounded border border-gray-200">
                      <div className="text-sm text-gray-600 mb-1">Email</div>
                      <div className="text-lg font-semibold text-gray-900 break-words">
                        {preparedByContact.email ? (
                          <a
                            href={`mailto:${preparedByContact.email}`}
                            style={{ color: '#1d4ed8', textDecoration: 'underline' }}
                          >
                            {preparedByContact.email}
                          </a>
                        ) : (
                          '—'
                        )}
                      </div>
                    </div>
                    <div className="bg-gray-50 p-4 rounded border border-gray-200">
                      <div className="text-sm text-gray-600 mb-1">Phone</div>
                      <div className="text-lg font-semibold text-gray-900">
                        {preparedByContact.phone || '—'}
                      </div>
                    </div>
                  </div>
                </div>

                {/* Executive Summary */}
                <div className="mb-10">
                  <h2 className="text-2xl font-bold text-gray-900 border-b-2 border-gray-300 pb-2 mb-4">Executive Summary</h2>
                  <div className="grid grid-cols-3 gap-6">
                    <div className="bg-blue-50 p-4 rounded border border-blue-200">
                      <div className="text-sm text-gray-600 mb-1">Purchase Price</div>
                      <div className="text-2xl font-bold text-blue-900">{formatCurrency(calculations.totalInvestment)}</div>
                    </div>
                    <div className="bg-green-50 p-4 rounded border border-green-200">
                      <div className="text-sm text-gray-600 mb-1">Cap Rate</div>
                      <div className="text-2xl font-bold text-green-900">{formatPercent(calculations.capRate)}</div>
                    </div>
                    <div className="bg-purple-50 p-4 rounded border border-purple-200">
                      <div className="text-sm text-gray-600 mb-1">Cash-on-Cash Return</div>
                      <div className="text-2xl font-bold text-purple-900">{formatPercent(calculations.cashOnCash)}</div>
                    </div>
                  </div>
                </div>

                {/* Property Overview */}
                <div className="mb-10">
                  <h2 className="text-2xl font-bold text-gray-900 border-b-2 border-gray-300 pb-2 mb-4">Property Overview</h2>
                  <div className="grid grid-cols-2 gap-x-8 gap-y-3">
                    <div className="flex justify-between py-2 border-b border-gray-200">
                      <span className="font-semibold text-gray-700">Total Lots:</span>
                      <span className="text-gray-900">{calculations.totalUnits}</span>
                    </div>
                    <div className="flex justify-between py-2 border-b border-gray-200">
                      <span className="font-semibold text-gray-700">Occupied Lots:</span>
                      <span className="text-gray-900">{calculations.occupiedUnits}</span>
                    </div>
                    <div className="flex justify-between py-2 border-b border-gray-200">
                      <span className="font-semibold text-gray-700">Physical Occupancy:</span>
                      <span className="text-gray-900">{formatPercent(calculations.physicalOccupancy)}</span>
                    </div>
                    <div className="flex justify-between py-2 border-b border-gray-200">
                      <span className="font-semibold text-gray-700">Economic Occupancy:</span>
                      <span className="text-gray-900">{formatPercent(calculations.economicOccupancy)}</span>
                    </div>
                    <div className="col-span-2 flex justify-between border-b border-gray-200 py-2">
                      <span className="font-semibold text-gray-700">Average Rent:</span>
                      <span className="text-gray-900">{propertyAverageRentDisplay}</span>
                    </div>
                  </div>
                </div>

                {/* Income Statement */}
                <div className="mb-10">
                  <h2 className="text-2xl font-bold text-gray-900 border-b-2 border-gray-300 pb-2 mb-4">Income Statement</h2>
                  
                  <div className="mb-6">
                    <h3 className="text-lg font-bold text-gray-800 mb-3 bg-green-50 p-2">Income</h3>
                    <div className="pl-4 space-y-2">
                      <div className="flex justify-between py-1">
                        <span className="text-gray-700">Gross Potential Rent</span>
                        <span className="font-semibold">{formatCurrency(calculations.grossPotentialRent)}</span>
                      </div>
                      {!useActualIncome && (
                        <div className="flex justify-between py-1 text-red-600">
                          <span className="pl-4">Less: Vacancy Loss</span>
                          <span className="font-semibold">({formatCurrency(calculations.vacancyLoss)})</span>
                        </div>
                      )}
                      <div className="flex justify-between py-1 border-b border-gray-200">
                        <span className="text-gray-700 font-semibold">Lot Rent Income</span>
                        <span className="font-semibold">{formatCurrency(calculations.lotRentIncome)}</span>
                      </div>
                      {additionalIncome.map((item) => (
                        <div key={item.id} className="flex justify-between py-1">
                          <span className="text-gray-700">{item.name}</span>
                          <span className="font-semibold">{formatCurrency(item.amount)}</span>
                        </div>
                      ))}
                      <div className="flex justify-between py-2 border-t-2 border-green-600 font-bold text-green-700">
                        <span>Effective Gross Income</span>
                        <span>{formatCurrency(calculations.effectiveGrossIncome)}</span>
                      </div>
                    </div>
                  </div>

                  <div className="mb-6">
                    <h3 className="text-lg font-bold text-gray-800 mb-3 bg-red-50 p-2">Operating Expenses</h3>
                    <div className="pl-4 space-y-2">
                      {expenses.map((expense) => (
                        <div key={expense.id} className="flex justify-between py-1">
                          <span className="text-gray-700">{expense.name}</span>
                          <span className="font-semibold">{formatCurrency(expense.amount)}</span>
                        </div>
                      ))}
                      <div className="flex justify-between py-1">
                        <span className="text-gray-700">Management Fee ({managementPercent}%)</span>
                        <span className="font-semibold">{formatCurrency(calculations.managementFee)}</span>
                      </div>
                      <div className="flex justify-between py-2 border-t-2 border-red-600 font-bold text-red-700">
                        <span>Total Operating Expenses</span>
                        <span>{formatCurrency(calculations.totalOpEx)}</span>
                      </div>
                    </div>
                  </div>

                  <div className="bg-blue-50 p-4 rounded border-2 border-blue-400">
                    <div className="flex justify-between items-center">
                      <span className="text-xl font-bold text-blue-900">Net Operating Income</span>
                      <span className="text-2xl font-bold text-blue-900">{formatCurrency(calculations.noi)}</span>
                    </div>
                  </div>
                </div>

                {proformaSnapshotYears.length > 0 && (
                  <div className="mb-10">
                    <h2 className="text-2xl font-bold text-gray-900 border-b-2 border-gray-300 pb-2 mb-4">
                      Five-Year Proforma Summary
                    </h2>
                    <div style={{ overflowX: 'auto' }}>
                      <table style={{ width: '100%', borderCollapse: 'collapse' }}>
                        <thead>
                          <tr style={{ background: 'linear-gradient(90deg, #2563eb, #1d4ed8)', color: '#ffffff' }}>
                            <th
                              style={{
                                padding: '1rem',
                                textAlign: 'left',
                                fontWeight: 700,
                                border: '1px solid #bfdbfe',
                              }}
                            >
                              Metric
                            </th>
                            {proformaSnapshotYears.map((year) => (
                              <th
                                key={year.year}
                                style={{
                                  padding: '1rem',
                                  textAlign: 'center',
                                  fontWeight: 700,
                                  border: '1px solid #bfdbfe',
                                }}
                              >
                                Year {year.year}
                              </th>
                            ))}
                          </tr>
                        </thead>
                        <tbody>
                          <tr style={{ backgroundColor: '#faf5ff' }}>
                            <td style={{ padding: '1rem', fontWeight: 600, color: '#1f2937', border: '1px solid #d1d5db' }}>
                              Occupied Lots
                            </td>
                            {proformaSnapshotYears.map((year) => (
                              <td
                                key={`occupied-${year.year}`}
                                style={{ padding: '1rem', textAlign: 'center', fontWeight: 600, border: '1px solid #e5e7eb' }}
                              >
                                {year.occupiedUnits} / {calculations.totalUnits}
                              </td>
                            ))}
                          </tr>
                          <tr style={{ backgroundColor: '#f3e8ff' }}>
                            <td style={{ padding: '1rem', fontWeight: 600, color: '#1f2937', border: '1px solid #d1d5db' }}>
                              Occupancy Rate
                            </td>
                            {proformaSnapshotYears.map((year) => (
                              <td
                                key={`occupancy-${year.year}`}
                                style={{ padding: '1rem', textAlign: 'center', fontWeight: 600, border: '1px solid #e5e7eb' }}
                              >
                                {formatPercent(year.occupancyRate)}
                              </td>
                            ))}
                          </tr>
                          <tr style={{ backgroundColor: '#ffffff' }}>
                            <td style={{ padding: '1rem', fontWeight: 600, color: '#1f2937', border: '1px solid #d1d5db' }}>
                              Avg Monthly Rent
                            </td>
                            {proformaSnapshotYears.map((year) => (
                              <td
                                key={`rent-${year.year}`}
                                style={{ padding: '1rem', textAlign: 'center', fontWeight: 600, border: '1px solid #e5e7eb' }}
                              >
                                {formatCurrency(year.avgMonthlyRent)}
                              </td>
                            ))}
                          </tr>
                          <tr style={{ backgroundColor: '#f8fafc' }}>
                            <td style={{ padding: '1rem', fontWeight: 600, color: '#1f2937', border: '1px solid #d1d5db' }}>
                              Rent Growth Applied (per lot/month)
                            </td>
                            {proformaSnapshotYears.map((year) => (
                              <td
                                key={`growth-${year.year}`}
                                style={{
                                  padding: '1rem',
                                  textAlign: 'center',
                                  fontWeight: 600,
                                  color: '#374151',
                                  border: '1px solid #e5e7eb',
                                }}
                              >
                                {describeRentIncrease(year)}
                              </td>
                            ))}
                          </tr>
                          <tr style={{ backgroundColor: '#f0fdf4' }}>
                            <td style={{ padding: '1rem', fontWeight: 600, color: '#1f2937', border: '1px solid #d1d5db' }}>
                              Lot Rent Income
                            </td>
                            {proformaSnapshotYears.map((year) => (
                              <td
                                key={`lot-income-${year.year}`}
                                style={{ padding: '1rem', textAlign: 'center', fontWeight: 600, border: '1px solid #e5e7eb' }}
                              >
                                {formatCurrency(year.lotRentIncome)}
                              </td>
                            ))}
                          </tr>
                          <tr style={{ backgroundColor: '#dcfce7' }}>
                            <td style={{ padding: '1rem', fontWeight: 600, color: '#1f2937', border: '1px solid #d1d5db' }}>
                              Other Income
                            </td>
                            {proformaSnapshotYears.map((year) => (
                              <td
                                key={`other-income-${year.year}`}
                                style={{ padding: '1rem', textAlign: 'center', fontWeight: 600, border: '1px solid #e5e7eb' }}
                              >
                                {formatCurrency(year.otherIncome)}
                              </td>
                            ))}
                          </tr>
                          <tr style={{ backgroundColor: '#bbf7d0' }}>
                            <td
                              style={{
                                padding: '1rem',
                                fontWeight: 700,
                                color: '#14532d',
                                border: '1px solid #d1d5db',
                              }}
                            >
                              Total Income
                            </td>
                            {proformaSnapshotYears.map((year) => (
                              <td
                                key={`total-income-${year.year}`}
                                style={{
                                  padding: '1rem',
                                  textAlign: 'center',
                                  fontWeight: 700,
                                  color: '#15803d',
                                  border: '1px solid #e5e7eb',
                                }}
                              >
                                {formatCurrency(year.totalIncome)}
                              </td>
                            ))}
                          </tr>
                          <tr style={{ backgroundColor: '#fef2f2' }}>
                            <td
                              style={{
                                padding: '1rem',
                                fontWeight: 600,
                                color: '#b91c1c',
                                border: '1px solid #d1d5db',
                              }}
                            >
                              Operating Expenses
                            </td>
                            {proformaSnapshotYears.map((year) => (
                              <td
                                key={`expenses-${year.year}`}
                                style={{
                                  padding: '1rem',
                                  textAlign: 'center',
                                  fontWeight: 600,
                                  color: '#b91c1c',
                                  border: '1px solid #e5e7eb',
                                }}
                              >
                                {formatCurrency(year.expenses)}
                              </td>
                            ))}
                          </tr>
                          <tr style={{ backgroundColor: '#dbeafe' }}>
                            <td
                              style={{
                                padding: '1rem',
                                fontWeight: 700,
                                color: '#1d4ed8',
                                border: '1px solid #d1d5db',
                              }}
                            >
                              Net Operating Income
                            </td>
                            {proformaSnapshotYears.map((year) => (
                              <td
                                key={`noi-${year.year}`}
                                style={{
                                  padding: '1rem',
                                  textAlign: 'center',
                                  fontWeight: 700,
                                  color: '#1d4ed8',
                                  border: '1px solid #e5e7eb',
                                }}
                              >
                                {formatCurrency(year.noi)}
                              </td>
                            ))}
                          </tr>
                          <tr style={{ backgroundColor: '#fff7ed' }}>
                            <td style={{ padding: '1rem', fontWeight: 600, color: '#9a3412', border: '1px solid #d1d5db' }}>
                              Debt Service
                            </td>
                            {proformaSnapshotYears.map((year) => (
                              <td
                                key={`debt-${year.year}`}
                                style={{ padding: '1rem', textAlign: 'center', fontWeight: 600, border: '1px solid #e5e7eb' }}
                              >
                                {formatCurrency(year.debtService)}
                              </td>
                            ))}
                          </tr>
                          <tr style={{ backgroundColor: '#fed7aa' }}>
                            <td
                              style={{
                                padding: '1rem',
                                fontWeight: 700,
                                color: '#9a3412',
                                border: '1px solid #d1d5db',
                              }}
                            >
                              Annual Cash Flow
                            </td>
                            {proformaSnapshotYears.map((year) => (
                              <td
                                key={`cashflow-${year.year}`}
                                style={{
                                  padding: '1rem',
                                  textAlign: 'center',
                                  fontWeight: 700,
                                  color: '#9a3412',
                                  border: '1px solid #e5e7eb',
                                }}
                              >
                                {formatCurrency(year.cashFlow)}
                              </td>
                            ))}
                          </tr>
                        </tbody>
                      </table>
                    </div>
                  </div>
                )}

                {/* Investment Analysis */}
                <div className="mb-10">
                  <h2 className="text-2xl font-bold text-gray-900 border-b-2 border-gray-300 pb-2 mb-4">Investment Analysis</h2>
                  
                  <div className="grid grid-cols-2 gap-8 mb-6">
                    <div>
                      <h3 className="text-lg font-bold text-gray-800 mb-3">Purchase Details</h3>
                      <div className="space-y-2">
                        <div className="flex justify-between py-2 border-b border-gray-200">
                          <span className="text-gray-700">Purchase Price:</span>
                          <span className="font-semibold">{formatCurrency(purchaseInputs.purchasePrice)}</span>
                        </div>
                        <div className="flex justify-between py-2 border-b border-gray-200">
                          <span className="text-gray-700">Closing Costs:</span>
                          <span className="font-semibold">{formatCurrency(purchaseInputs.closingCosts)}</span>
                        </div>
                        <div className="flex justify-between py-2 border-b border-gray-200 font-bold">
                          <span className="text-gray-700">Total Investment:</span>
                          <span className="text-gray-900">{formatCurrency(calculations.totalInvestment)}</span>
                        </div>
                      </div>
                    </div>
                    
                    <div>
                      <h3 className="text-lg font-bold text-gray-800 mb-3">Financing Terms</h3>
                      <div className="space-y-2">
                        <div className="flex justify-between py-2 border-b border-gray-200">
                          <span className="text-gray-700">Down Payment ({purchaseInputs.downPaymentPercent}%):</span>
                          <span className="font-semibold">{formatCurrency(calculations.downPayment)}</span>
                        </div>
                        <div className="flex justify-between py-2 border-b border-gray-200">
                          <span className="text-gray-700">Loan Amount:</span>
                          <span className="font-semibold">{formatCurrency(calculations.loanAmount)}</span>
                        </div>
                        <div className="flex justify-between py-2 border-b border-gray-200">
                          <span className="text-gray-700">Interest Rate:</span>
                          <span className="font-semibold">{purchaseInputs.interestRate}%</span>
                        </div>
                        <div className="flex justify-between py-2 border-b border-gray-200">
                          <span className="text-gray-700">Loan Term:</span>
                          <span className="font-semibold">{purchaseInputs.loanTermYears} years</span>
                        </div>
                        <div className="flex justify-between py-2 border-b border-gray-200">
                          <span className="text-gray-700">Amortization:</span>
                          <span className="font-semibold">{purchaseInputs.amortizationYears} years</span>
                        </div>
                        <div className="flex justify-between py-2">
                          <span className="text-gray-700">Balloon Balance at Maturity:</span>
                          <span className="font-semibold">{formatCurrency(calculations.loanMaturityBalance)}</span>
                        </div>
                      </div>
                    </div>
                  </div>

                  <div className="grid grid-cols-2 gap-8">
                    <div className="bg-gradient-to-br from-green-50 to-green-100 p-6 rounded border-2 border-green-400">
                      <h3 className="text-lg font-bold text-green-800 mb-4">Unlevered Returns</h3>
                      <div className="space-y-3">
                        <div className="flex justify-between items-center pb-3 border-b border-green-300">
                          <span className="text-gray-700">Cap Rate:</span>
                          <span className="text-3xl font-bold text-green-700">{formatPercent(calculations.capRate)}</span>
                        </div>
                        <div className="flex justify-between">
                          <span className="text-gray-700">NOI per Lot:</span>
                          <span className="font-semibold">{formatCurrency(calculations.noiPerUnit)}</span>
                        </div>
                        <div className="flex justify-between">
                          <span className="text-gray-700">Annual NOI:</span>
                          <span className="font-semibold">{formatCurrency(calculations.noi)}</span>
                        </div>
                      </div>
                    </div>

                    <div className="bg-gradient-to-br from-blue-50 to-blue-100 p-6 rounded border-2 border-blue-400">
                      <h3 className="text-lg font-bold text-blue-800 mb-4">Levered Returns</h3>
                      <div className="space-y-3">
                        <div className="flex justify-between items-center pb-3 border-b border-blue-300">
                          <span className="text-gray-700">Cash-on-Cash:</span>
                          <span className="text-3xl font-bold text-blue-700">{formatPercent(calculations.cashOnCash)}</span>
                        </div>
                        <div className="flex justify-between">
                          <span className="text-gray-700">Annual Cash Flow:</span>
                          <span className="font-semibold">{formatCurrency(calculations.cashFlow)}</span>
                        </div>
                        <div className="flex justify-between">
                          <span className="text-gray-700">DSCR:</span>
                          <span className={`font-semibold ${calculations.dscr >= 1.25 ? 'text-green-700' : 'text-red-700'}`}>
                            {calculations.dscr.toFixed(2)}x
                          </span>
                        </div>
                      </div>
                    </div>
                  </div>
                </div>

                {/* Key Performance Metrics */}
                <div className="mb-10">
                  <h2 className="text-2xl font-bold text-gray-900 border-b-2 border-gray-300 pb-2 mb-4">Key Performance Metrics</h2>
                  <div className="grid grid-cols-3 gap-6 mb-6">
                    <div className="bg-gray-50 p-4 rounded border border-gray-300">
                      <div className="text-sm text-gray-600 mb-1">Income per Lot</div>
                      <div className="text-xl font-bold text-gray-900">{formatCurrency(calculations.incomePerUnit)}</div>
                    </div>
                    <div className="bg-gray-50 p-4 rounded border border-gray-300">
                      <div className="text-sm text-gray-600 mb-1">Expenses per Lot</div>
                      <div className="text-xl font-bold text-gray-900">{formatCurrency(calculations.expensePerUnit)}</div>
                    </div>
                    <div className="bg-gray-50 p-4 rounded border border-gray-300">
                      <div className="text-sm text-gray-600 mb-1">Operating Expense Ratio</div>
                      <div className="text-xl font-bold text-gray-900">{formatPercent((calculations.totalOpEx / calculations.effectiveGrossIncome) * 100)}</div>
                    </div>
                  </div>
                  
                  <div className="bg-indigo-50 p-6 rounded border-2 border-indigo-300">
                    <h3 className="text-lg font-bold text-indigo-800 mb-4">Projected Returns ({irrInputs.holdPeriod} Year Hold)</h3>
                    <div className="grid grid-cols-2 gap-6">
                      <div>
                        <div className="text-sm text-gray-600 mb-1">Internal Rate of Return (IRR)</div>
                        <div className="text-3xl font-bold text-indigo-700">{formatPercent(calculations.irr)}</div>
                      </div>
                      <div>
                        <div className="text-sm text-gray-600 mb-1">Equity Multiple</div>
                        <div className="text-3xl font-bold text-indigo-700">{calculations.equityMultiple.toFixed(2)}x</div>
                      </div>
                    </div>
                    <div className="mt-4 pt-4 border-t border-indigo-300 text-sm text-gray-700">
                      <div className="flex justify-between py-1">
                        <span>Exit Cap Rate:</span>
                        <span className="font-semibold">{irrInputs.exitCapRate}%</span>
                      </div>
                      <div className="flex justify-between py-1">
                        <span>Projected Exit Value:</span>
                        <span className="font-semibold">{formatCurrency(calculations.exitValue)}</span>
                      </div>
                    </div>
                  </div>
                </div>

                {/* Cash Flow Summary */}
                <div className="mb-6">
                  <h2 className="text-2xl font-bold text-gray-900 border-b-2 border-gray-300 pb-2 mb-4">Annual Cash Flow Summary</h2>
                  <div className="bg-gradient-to-br from-orange-50 to-orange-100 p-6 rounded border-2 border-orange-400">
                    <div className="space-y-3">
                      <div className="flex justify-between py-2 border-b border-orange-300">
                        <span className="text-gray-700">Net Operating Income:</span>
                        <span className="font-bold text-gray-900">{formatCurrency(calculations.noi)}</span>
                      </div>
                      <div className="flex justify-between py-2 border-b border-orange-300">
                        <span className="text-gray-700">Less: Annual Debt Service:</span>
                        <span className="font-bold text-red-700">({formatCurrency(calculations.annualDebtService)})</span>
                      </div>
                      <div className="flex justify-between py-3 border-t-2 border-orange-500">
                        <span className="text-xl font-bold text-orange-800">Annual Cash Flow:</span>
                        <span className="text-2xl font-bold text-orange-800">{formatCurrency(calculations.cashFlow)}</span>
                      </div>
                      <div className="flex justify-between pt-2">
                        <span className="text-gray-700">Monthly Cash Flow:</span>
                        <span className="font-bold text-gray-900">{formatCurrency(calculations.cashFlow / 12)}</span>
                      </div>
                    </div>
                  </div>
                </div>

                {/* Footer */}
                <div className="mt-12 pt-6 border-t-2 border-gray-300 text-center text-sm text-gray-600">
                  <p>This analysis is for informational purposes only and should not be considered investment advice.</p>
                  <p className="mt-1">Please consult with qualified professionals before making any investment decisions.</p>
                </div>
              </div>
            </div>
          )}
        </div>
      </div>

      <ProfileModal
        open={profileOpen}
        onClose={() => setProfileOpen(false)}
        onProfileUpdated={handleProfileUpdated}
      />

      <AuthModal
        isOpen={authModalOpen}
        onClose={() => setAuthModalOpen(false)}
        onAuthSuccess={async () => {
          if (isSupabaseConfigured && supabase) {
            try {
              const { data } = await supabase.auth.getSession();
              if (data?.session?.user?.id) {
                fetchSavedReports({ sessionOverride: data.session });
              }
            } catch (err) {
              console.error('Error refreshing saved reports after sign-in:', err);
            }
          }
        }}
      />

      <style>{`
        @media print {
          @page {
            size: letter;
            margin: 0.5in;
          }
          
          body {
            print-color-adjust: exact;
            -webkit-print-color-adjust: exact;
          }
          
          .print\\:hidden {
            display: none !important;
          }
          
          #report {
            page-break-inside: avoid;
          }
          
          .bg-blue-50,
          .bg-green-50,
          .bg-red-50,
          .bg-purple-50,
          .bg-orange-50,
          .bg-indigo-50,
          .bg-gray-50 {
            print-color-adjust: exact;
            -webkit-print-color-adjust: exact;
          }
        }
      `}</style>
    </div>
  );
};

export default MobileHomeParkModel;
