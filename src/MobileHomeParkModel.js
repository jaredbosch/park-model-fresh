import React, { useState, useMemo, useEffect, useCallback, useRef } from 'react';
import { Download } from 'lucide-react';
import supabase, { isSupabaseConfigured } from './supabaseClient';
import AuthModal from './components/AuthModal';

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

const DEFAULT_PROPERTY_INFO = {
  name: 'Mobile Home Park',
  address: '',
  city: '',
  state: ''
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
  loanTermYears: 25
};

const DEFAULT_IRR_INPUTS = {
  holdPeriod: 5,
  exitCapRate: 7.5
};

const DEFAULT_PROFORMA_INPUTS = {
  year1NewLeases: 7,
  year2NewLeases: 5,
  year3NewLeases: 5,
  year4NewLeases: 5,
  year5NewLeases: 5,
  annualRentIncrease: 3,
  annualExpenseIncrease: 2.5
};
const MobileHomeParkModel = () => {
  const [session, setSession] = useState(null);
  const [authModalOpen, setAuthModalOpen] = useState(false);
  const [savedReports, setSavedReports] = useState([]);
  const [reportSort, setReportSort] = useState({ column: 'date', direction: 'desc' });
  const [selectedReportId, setSelectedReportId] = useState('');
  const [loadingReports, setLoadingReports] = useState(false);
  const [loadingReportId, setLoadingReportId] = useState(null);
  const [reportName, setReportName] = useState('Mobile Home Park Report');

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

  const sessionEmail = useMemo(
    () =>
      session?.user?.email ||
      session?.user?.user_metadata?.email ||
      session?.user?.user_metadata?.email_address ||
      '',
    [session]
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

  // Property Information
  const [propertyInfo, setPropertyInfo] = useState(() => ({ ...DEFAULT_PROPERTY_INFO }));
  // Contact info for saving reports (ensure defined to avoid runtime ReferenceError)
  const [contactInfo, setContactInfo] = useState(() => ({ ...DEFAULT_CONTACT_INFO }));
  const [savingReport, setSavingReport] = useState(false);
  
  // Additional Income Inputs
  const [additionalIncome, setAdditionalIncome] = useState([
    { id: 1, name: 'Utility Income', amount: 3600 },
    { id: 2, name: 'Rental Home Income', amount: 12000 },
    { id: 3, name: 'Late Fees', amount: 1200 },
  ]);
  
  const [useActualIncome, setUseActualIncome] = useState(false);
  const [actualIncome, setActualIncome] = useState(0);
  
  // Operating Expense Inputs
  const [expenses, setExpenses] = useState([
    { id: 1, name: 'Property Tax', amount: 18000 },
    { id: 2, name: 'Insurance', amount: 12000 },
    { id: 3, name: 'Utilities', amount: 8400 },
    { id: 4, name: 'Maintenance & Repairs', amount: 15000 },
    { id: 5, name: 'Advertising & Marketing', amount: 2400 },
    { id: 6, name: 'Legal & Professional', amount: 3000 },
    { id: 7, name: 'Administrative', amount: 5000 },
  ]);
  
  const [managementPercent, setManagementPercent] = useState(5);
  
  // Purchase & Financing Inputs
  const [purchaseInputs, setPurchaseInputs] = useState(() => ({ ...DEFAULT_PURCHASE_INPUTS }));

  // IRR Inputs
  const [irrInputs, setIrrInputs] = useState(() => ({ ...DEFAULT_IRR_INPUTS }));

  // Proforma Inputs
  const [proformaInputs, setProformaInputs] = useState(() => ({ ...DEFAULT_PROFORMA_INPUTS }));

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

      if (savedState?.propertyInfo) {
        setPropertyInfo(savedState.propertyInfo);
      } else {
        setPropertyInfo({
          name: data.report_name || data.park_name || DEFAULT_PROPERTY_INFO.name,
          address: data.park_address || '',
          city: data.park_city || '',
          state: data.park_state || '',
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

      if (Array.isArray(savedState?.expenses)) {
        setExpenses(savedState.expenses);
      } else {
        const expenseItems = normaliseCollection(data.expense_items);
        if (Array.isArray(expenseItems) && expenseItems.length > 0) {
          setExpenses(expenseItems);
        }
      }

      if (typeof savedState?.managementPercent === 'number') {
        setManagementPercent(savedState.managementPercent);
      }

      if (savedState?.purchaseInputs) {
        setPurchaseInputs(savedState.purchaseInputs);
      } else {
        setPurchaseInputs({
          purchasePrice: data.purchase_price ?? DEFAULT_PURCHASE_INPUTS.purchasePrice,
          closingCosts: data.closing_costs ?? DEFAULT_PURCHASE_INPUTS.closingCosts,
          downPaymentPercent: data.down_payment_percent ?? DEFAULT_PURCHASE_INPUTS.downPaymentPercent,
          interestRate: data.interest_rate ?? DEFAULT_PURCHASE_INPUTS.interestRate,
          loanTermYears: data.loan_term_years ?? DEFAULT_PURCHASE_INPUTS.loanTermYears,
        });
      }

      if (savedState?.irrInputs) {
        setIrrInputs(savedState.irrInputs);
      }

      if (savedState?.proformaInputs) {
        setProformaInputs(savedState.proformaInputs);
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

  // Additional Income Functions
  const addIncomeItem = () => {
    const newId = Math.max(...additionalIncome.map(i => i.id), 0) + 1;
    setAdditionalIncome([...additionalIncome, {
      id: newId,
      name: 'New Income',
      amount: 0
    }]);
  };

  const removeIncomeItem = (id) => {
    setAdditionalIncome(additionalIncome.filter(i => i.id !== id));
  };

  const updateIncomeItem = (id, field, value) => {
    setAdditionalIncome(additionalIncome.map(i => 
      i.id === id ? { ...i, [field]: value } : i
    ));
  };

  // Expense Functions
  const addExpenseItem = () => {
    const newId = Math.max(...expenses.map(e => e.id), 0) + 1;
    setExpenses([...expenses, {
      id: newId,
      name: 'New Expense',
      amount: 0
    }]);
  };

  const removeExpenseItem = (id) => {
    if (expenses.length > 1) {
      setExpenses(expenses.filter(e => e.id !== id));
    }
  };

  const updateExpenseItem = (id, field, value) => {
    setExpenses(expenses.map(e => 
      e.id === id ? { ...e, [field]: value } : e
    ));
  };

  // Calculations
  const calculations = useMemo(() => {
    // Rent Roll Metrics
    const totalUnits = units.length;
    const occupiedUnits = units.filter(u => u.occupied).length;
    const physicalOccupancy = (occupiedUnits / totalUnits) * 100;
    const grossPotentialRent = units.reduce((sum, u) => sum + Number(u.rent), 0) * 12;
    const rentRollIncome = units.filter(u => u.occupied).reduce((sum, u) => sum + Number(u.rent), 0) * 12;
    
    // Determine which income to use
    const lotRentIncome = useActualIncome ? Number(actualIncome) : rentRollIncome;
    
    // Additional Income
    const totalAdditionalIncome = additionalIncome.reduce((sum, i) => sum + Number(i.amount), 0);
    
    // Total Income
    const effectiveGrossIncome = lotRentIncome + totalAdditionalIncome;
    const vacancyLoss = grossPotentialRent - lotRentIncome;
    const economicOccupancy = (lotRentIncome / grossPotentialRent) * 100;

    // Operating Expenses
    const managementFee = effectiveGrossIncome * (managementPercent / 100);
    const totalExpenses = expenses.reduce((sum, exp) => sum + Number(exp.amount), 0) + managementFee;
    const totalOpEx = totalExpenses;
    
    // NOI
    const noi = effectiveGrossIncome - totalOpEx;
    const capRate = (noi / purchaseInputs.purchasePrice) * 100;
    
    // Financing
    const totalInvestment = purchaseInputs.purchasePrice + purchaseInputs.closingCosts;
    const downPayment = totalInvestment * (purchaseInputs.downPaymentPercent / 100);
    const loanAmount = totalInvestment - downPayment;
    const monthlyRate = purchaseInputs.interestRate / 100 / 12;
    const numPayments = purchaseInputs.loanTermYears * 12;
    const monthlyPayment = loanAmount * (monthlyRate * Math.pow(1 + monthlyRate, numPayments)) / 
                          (Math.pow(1 + monthlyRate, numPayments) - 1);
    const annualDebtService = monthlyPayment * 12;
    
    // Cash Flow
    const cashFlow = noi - annualDebtService;
    const cashOnCash = (cashFlow / downPayment) * 100;
    const dscr = noi / annualDebtService;
    
    // Per Unit Metrics
    const incomePerUnit = effectiveGrossIncome / totalUnits;
    const expensePerUnit = totalOpEx / totalUnits;
    const noiPerUnit = noi / totalUnits;
    
    // IRR Calculation
    const holdPeriod = irrInputs.holdPeriod;
    const exitCapRate = irrInputs.exitCapRate / 100;
    const exitValue = noi / exitCapRate;
    
    // Calculate remaining loan balance at exit
    const monthsHeld = holdPeriod * 12;
    const remainingPayments = numPayments - monthsHeld;
    const remainingBalance = remainingPayments > 0 
      ? loanAmount * ((Math.pow(1 + monthlyRate, numPayments) - Math.pow(1 + monthlyRate, monthsHeld)) / 
        (Math.pow(1 + monthlyRate, numPayments) - 1))
      : 0;
    
    const exitProceeds = exitValue - remainingBalance;
    const totalCashInvested = downPayment;
    
    // Calculate IRR using Newton-Raphson method
    const calculateIRR = () => {
      const cashFlows = [-totalCashInvested];
      for (let i = 1; i <= holdPeriod; i++) {
        if (i < holdPeriod) {
          cashFlows.push(cashFlow);
        } else {
          cashFlows.push(cashFlow + exitProceeds);
        }
      }
      
      let rate = 0.1;
      const maxIterations = 100;
      const tolerance = 0.0001;
      
      for (let i = 0; i < maxIterations; i++) {
        let npv = 0;
        let dnpv = 0;
        
        for (let j = 0; j < cashFlows.length; j++) {
          npv += cashFlows[j] / Math.pow(1 + rate, j);
          dnpv -= j * cashFlows[j] / Math.pow(1 + rate, j + 1);
        }
        
        const newRate = rate - npv / dnpv;
        
        if (Math.abs(newRate - rate) < tolerance) {
          return newRate * 100;
        }
        
        rate = newRate;
      }
      
      return rate * 100;
    };
    
    const irr = calculateIRR();
    const equityMultiple = (exitProceeds + (cashFlow * holdPeriod)) / totalCashInvested;
    
    // 5-Year Proforma Calculations
    const calculateProforma = () => {
      const years = [];
      let currentOccupiedUnits = occupiedUnits;
      let currentRent = lotRentIncome / (occupiedUnits || 1) / 12; // Average monthly rent per occupied unit
      let currentOtherIncome = totalAdditionalIncome;
      let currentExpenses = totalOpEx;
      
      for (let year = 1; year <= 5; year++) {
        // Add new leases
        let newLeases = 0;
        if (year === 1) newLeases = proformaInputs.year1NewLeases;
        if (year === 2) newLeases = proformaInputs.year2NewLeases;
        if (year === 3) newLeases = proformaInputs.year3NewLeases;
        if (year === 4) newLeases = proformaInputs.year4NewLeases;
        if (year === 5) newLeases = proformaInputs.year5NewLeases;
        
        currentOccupiedUnits = Math.min(currentOccupiedUnits + newLeases, totalUnits);
        
        // Apply rent increase
        if (year > 1) {
          currentRent = currentRent * (1 + proformaInputs.annualRentIncrease / 100);
          currentOtherIncome = currentOtherIncome * (1 + proformaInputs.annualRentIncrease / 100);
          currentExpenses = currentExpenses * (1 + proformaInputs.annualExpenseIncrease / 100);
        }
        
        const yearLotRent = currentRent * currentOccupiedUnits * 12;
        const yearTotalIncome = yearLotRent + currentOtherIncome;
        const yearNOI = yearTotalIncome - currentExpenses;
        const yearCashFlow = yearNOI - annualDebtService;
        const yearOccupancy = (currentOccupiedUnits / totalUnits) * 100;
        
        years.push({
          year,
          occupiedUnits: currentOccupiedUnits,
          occupancyRate: yearOccupancy,
          avgMonthlyRent: currentRent,
          lotRentIncome: yearLotRent,
          otherIncome: currentOtherIncome,
          totalIncome: yearTotalIncome,
          expenses: currentExpenses,
          noi: yearNOI,
          debtService: annualDebtService,
          cashFlow: yearCashFlow
        });
      }
      
      return years;
    };
    
    const proformaYears = calculateProforma();
    
    return {
      totalUnits,
      occupiedUnits,
      physicalOccupancy,
      grossPotentialRent,
      rentRollIncome,
      lotRentIncome,
      totalAdditionalIncome,
      effectiveGrossIncome,
      vacancyLoss,
      economicOccupancy,
      managementFee,
      totalExpenses,
      totalOpEx,
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
      remainingBalance,
      exitProceeds,
      irr,
      equityMultiple,
      proformaYears
    };
  }, [units, additionalIncome, useActualIncome, actualIncome, expenses, managementPercent, purchaseInputs, irrInputs, proformaInputs]);

  const formatCurrency = (value) => {
    return new Intl.NumberFormat('en-US', {
      style: 'currency',
      currency: 'USD',
      minimumFractionDigits: 0,
      maximumFractionDigits: 0
    }).format(value);
  };

  const formatPercent = (value) => {
    return `${value.toFixed(2)}%`;
  };

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

  const saveReportToAccount = useCallback(async ({ htmlContent, showAlert = true } = {}) => {
    if (!isSupabaseConfigured || !supabase) {
      alert('Supabase is not configured. Please add your Supabase credentials to enable saving reports.');
      return false;
    }

    if (!session?.user?.id) {
      setAuthModalOpen(true);
      return false;
    }

    const finalHtml = htmlContent || buildReportHtml();
    if (!finalHtml) {
      alert('Unable to capture the report content for saving.');
      return false;
    }

    const effectiveReportName = (reportName && reportName.trim()) || propertyInfo.name || 'Untitled Report';
    const normalizedReportId = selectedReportId ? Number(selectedReportId) : null;

    const effectiveContactInfo = {
      ...contactInfo,
      email: contactInfo?.email || sessionEmail || '',
    };

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
    };

    const reportState = {
      units,
      propertyInfo,
      contactInfo: effectiveContactInfo,
      additionalIncome,
      expenses,
      managementPercent,
      purchaseInputs,
      irrInputs,
      proformaInputs,
      useActualIncome,
      actualIncome,
      reportName: effectiveReportName,
      activeTab,
      calculations,
      ownerUserId: session?.user?.id || null,
      ownerEmail: sessionEmail || null,
    };

    setSavingReport(true);

    try {
      const apiBase = process.env.REACT_APP_API_BASE || '';
      const response = await fetch(`${apiBase}/api/save-report`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          authUser: {
            id: session?.user?.id || null,
            email: sessionEmail || null,
          },
          contactInfo: effectiveContactInfo,
          propertyInfo: propertyDetails,
          purchaseInputs: purchaseDetails,
          calculations,
          units,
          additionalIncome,
          expenses,
          managementPercent,
          irrInputs,
          proformaInputs,
          useActualIncome,
          actualIncome,
          htmlContent: finalHtml,
          userId: session.user.id,
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
      }

      const savedRow = Array.isArray(result.data) ? result.data[0] : result.data;

      if (savedRow?.id) {
        setSelectedReportId(String(savedRow.id));
        const savedName =
          savedRow?.report_state?.reportName || savedRow?.report_name || effectiveReportName;
        setReportName(savedName);
      }

      await fetchSavedReports();

      if (showAlert) {
        const message = warnings.length > 0
          ? ['Report saved to your account.', ...warnings].join('\n\n')
          : 'Report saved to your account.';
        alert(message);
      }

      return true;
    } catch (err) {
      console.error('Error saving report:', err);
      const message = err?.message ? `\n\n${err.message}` : '';
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
  ]);

  const downloadReport = async () => {
    const htmlContent = buildReportHtml();
    if (!htmlContent) {
      alert('Unable to capture report content for download.');
      return;
    }

    const blob = new Blob([htmlContent], { type: 'text/html' });
    const url = URL.createObjectURL(blob);
    const a = document.createElement('a');
    a.href = url;
    a.download = `mobile-home-park-analysis-${new Date().toISOString().split('T')[0]}.html`;
    document.body.appendChild(a);
    a.click();
    document.body.removeChild(a);
    // Delay revoking the object URL to avoid some browsers cancelling the download
    setTimeout(() => URL.revokeObjectURL(url), 1000);

    if (session?.user?.id) {
      await saveReportToAccount({ htmlContent, showAlert: false });
    }
  };

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
            {['rent-roll', 'pnl', 'proforma', 'returns', 'report', 'my-reports'].map((tab) => (
              <button
                key={tab}
                onClick={() => setActiveTab(tab)}
                className={`px-6 py-3 rounded-t font-semibold transition-colors ${
                  activeTab === tab
                    ? 'bg-white text-blue-700 border-t-2 border-blue-600'
                    : 'bg-gray-100 text-gray-600 hover:bg-gray-200'
                }`}
              >
                {tab === 'my-reports' && 'My Reports'}
                {tab === 'rent-roll' && 'Rent Roll'}
                {tab === 'pnl' && 'P&L Statement'}
                {tab === 'proforma' && '5-Year Proforma'}
                {tab === 'returns' && 'Return Metrics'}
                {tab === 'report' && 'Report'}
              </button>
            ))}
          </div>
        </div>

        {/* Content */}
        <div className="p-6">
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
                                  {formattedPrice}
                                </td>
                                <td className="px-4 py-3 align-middle text-sm text-gray-700">
                                  {formattedDate}
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
              <div className="flex justify-between items-center">
                <h2 className="text-2xl font-bold text-gray-800">Rent Roll</h2>
                <div className="flex items-center space-x-4">
                  <div className="flex items-center space-x-2">
                    <label className="text-sm font-semibold text-gray-700">Add Multiple Lots:</label>
                    <input
                      type="number"
                      id="bulkAddInput"
                      placeholder="e.g. 120"
                      className="w-24 p-2 border border-gray-300 rounded bg-blue-50 text-blue-900 font-semibold"
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
                      className="bg-green-600 text-white px-4 py-2 rounded hover:bg-green-700 transition-colors text-sm"
                    >
                      Add Lots
                    </button>
                  </div>
                  <button
                    onClick={addUnit}
                    className="bg-blue-600 text-white px-4 py-2 rounded hover:bg-blue-700 transition-colors"
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

              <div className="space-y-6">
                {/* Income Section */}
                <div className="bg-green-50 p-6 rounded-lg border border-green-200">
                  <div className="flex justify-between items-center mb-4">
                    <h3 className="text-xl font-bold text-green-800">Income</h3>
                    <button
                      onClick={addIncomeItem}
                      className="bg-green-600 text-white px-4 py-2 rounded hover:bg-green-700 transition-colors text-sm"
                    >
                      + Add Income Line
                    </button>
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
                        <div className="flex justify-between pt-2 border-t border-gray-200">
                          <span className="text-gray-700 font-semibold">Total Other Income</span>
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
                  <div className="flex justify-between items-center mb-4">
                    <h3 className="text-xl font-bold text-red-800">Operating Expenses</h3>
                    <button
                      onClick={addExpenseItem}
                      className="bg-red-600 text-white px-4 py-2 rounded hover:bg-red-700 transition-colors text-sm"
                    >
                      + Add Expense Line
                    </button>
                  </div>
                  <div className="space-y-3">
                    {expenses.map((expense) => (
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
                          {formatCurrency(expense.amount / calculations.totalUnits)} per lot/year
                        </div>
                      </div>
                    ))}
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
                <div className="grid grid-cols-3 gap-4">
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
              <h2 className="text-2xl font-bold text-gray-800">5-Year Proforma Analysis</h2>

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
                <div className="grid grid-cols-2 gap-4">
                  <div>
                    <label className="block text-sm font-semibold text-gray-700 mb-2">Annual Rent Increase %</label>
                    <input
                      type="number"
                      step="0.1"
                      value={proformaInputs.annualRentIncrease}
                      onChange={(e) => setProformaInputs({...proformaInputs, annualRentIncrease: Number(e.target.value)})}
                      className="w-full p-3 border border-gray-300 rounded bg-blue-50 text-blue-900 font-semibold text-lg"
                    />
                  </div>
                  <div>
                    <label className="block text-sm font-semibold text-gray-700 mb-2">Annual Expense Increase %</label>
                    <input
                      type="number"
                      step="0.1"
                      value={proformaInputs.annualExpenseIncrease}
                      onChange={(e) => setProformaInputs({...proformaInputs, annualExpenseIncrease: Number(e.target.value)})}
                      className="w-full p-3 border border-gray-300 rounded bg-blue-50 text-blue-900 font-semibold text-lg"
                    />
                  </div>
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

              {/* 5-Year Proforma Table */}
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
                  <h4 className="text-sm font-semibold text-gray-700 mb-2">5-Year NOI Growth</h4>
                  <div className="text-3xl font-bold text-green-700">
                    {formatCurrency(calculations.proformaYears[4].noi - calculations.noi)}
                  </div>
                  <div className="text-sm text-gray-600 mt-2">
                    {formatPercent(((calculations.proformaYears[4].noi - calculations.noi) / calculations.noi) * 100)} increase
                  </div>
                </div>

                <div className="bg-gradient-to-br from-blue-50 to-blue-100 p-6 rounded-lg border-2 border-blue-400">
                  <h4 className="text-sm font-semibold text-gray-700 mb-2">5-Year Cash Flow Growth</h4>
                  <div className="text-3xl font-bold text-blue-700">
                    {formatCurrency(calculations.proformaYears[4].cashFlow - calculations.cashFlow)}
                  </div>
                  <div className="text-sm text-gray-600 mt-2">
                    {formatPercent(((calculations.proformaYears[4].cashFlow - calculations.cashFlow) / calculations.cashFlow) * 100)} increase
                  </div>
                </div>

                <div className="bg-gradient-to-br from-purple-50 to-purple-100 p-6 rounded-lg border-2 border-purple-400">
                  <h4 className="text-sm font-semibold text-gray-700 mb-2">Total 5-Year Cash Flow</h4>
                  <div className="text-3xl font-bold text-purple-700">
                    {formatCurrency(calculations.proformaYears.reduce((sum, year) => sum + year.cashFlow, 0))}
                  </div>
                  <div className="text-sm text-gray-600 mt-2">
                    Cumulative cash generated
                  </div>
                </div>
              </div>

              {/* Year 5 Exit Analysis */}
              <div className="bg-gradient-to-br from-indigo-50 to-indigo-100 p-6 rounded-lg border-2 border-indigo-400">
                <h3 className="text-xl font-bold text-indigo-800 mb-4">Year 5 Exit Analysis</h3>
                <div className="grid grid-cols-2 gap-6">
                  <div>
                    <div className="space-y-2">
                      <div className="flex justify-between">
                        <span className="text-gray-700">Year 5 NOI:</span>
                        <span className="font-bold">{formatCurrency(calculations.proformaYears[4].noi)}</span>
                      </div>
                      <div className="flex justify-between">
                        <span className="text-gray-700">Exit Cap Rate:</span>
                        <span className="font-bold">{irrInputs.exitCapRate}%</span>
                      </div>
                      <div className="flex justify-between pt-2 border-t-2 border-indigo-300">
                        <span className="text-gray-900 font-bold">Projected Exit Value:</span>
                        <span className="font-bold text-indigo-700 text-xl">
                          {formatCurrency(calculations.proformaYears[4].noi / (irrInputs.exitCapRate / 100))}
                        </span>
                      </div>
                    </div>
                  </div>
                  <div>
                    <div className="text-sm text-gray-600 mb-2">Value Appreciation</div>
                    <div className="text-3xl font-bold text-indigo-700">
                      {formatCurrency((calculations.proformaYears[4].noi / (irrInputs.exitCapRate / 100)) - purchaseInputs.purchasePrice)}
                    </div>
                    <div className="text-sm text-gray-600 mt-1">
                      {formatPercent((((calculations.proformaYears[4].noi / (irrInputs.exitCapRate / 100)) - purchaseInputs.purchasePrice) / purchaseInputs.purchasePrice) * 100)} increase
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
                      onClick={() => saveReportToAccount({ showAlert: true })}
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