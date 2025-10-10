import { createClient } from '@supabase/supabase-js';

const supabaseUrl = process.env.SUPABASE_URL;
const supabaseServiceRoleKey = process.env.SUPABASE_SERVICE_ROLE_KEY;

const supabase =
  supabaseUrl && supabaseServiceRoleKey
    ? createClient(supabaseUrl, supabaseServiceRoleKey)
    : null;

export default async function handler(req, res) {
  try {
    if (!supabase) {
      console.error('Supabase analytics API is missing configuration.');
      return res.status(500).json({ error: 'Supabase not configured.' });
    }

    const { userId } = req.query;
    if (!userId) {
      return res.status(400).json({ error: 'Missing userId parameter.' });
    }

    const { data, error } = await supabase
      .from('reports')
      .select('purchase_price, num_lots, cap_rate, total_expenses, total_income')
      .eq('user_id', userId);

    if (error) {
      console.error('Supabase analytics query failed:', error);
      return res.status(500).json({ error: error.message });
    }

    console.log('Fetched reports count:', data?.length || 0);

    const metrics = computeAnalytics(data);
    res.status(200).json({ metrics });
  } catch (err) {
    console.error('Server analytics error:', err);
    res.status(500).json({ error: err.message });
  }
}

function computeAnalytics(reports = []) {
  if (!Array.isArray(reports) || reports.length === 0) {
    return {
      totalReports: 0,
      averagePurchasePrice: null,
      averagePricePerSite: null,
      averageCapRate: null,
      averageExpenseRatio: null,
    };
  }

  const toNumber = (value) => {
    const numeric = Number(value);
    return Number.isFinite(numeric) ? numeric : 0;
  };

  const average = (values) => {
    if (!Array.isArray(values) || values.length === 0) {
      return null;
    }

    const total = values.reduce((sum, value) => sum + (Number.isFinite(value) ? value : 0), 0);
    return total / values.length;
  };

  const purchasePrices = reports.map((report) => toNumber(report?.purchase_price));
  const pricePerSiteValues = reports.map((report) => {
    const purchasePrice = toNumber(report?.purchase_price);
    const sites = toNumber(report?.num_lots);
    const safeSites = sites > 0 ? sites : 1;
    return purchasePrice / safeSites;
  });
  const capRates = reports.map((report) => toNumber(report?.cap_rate));
  const expenseRatios = reports.map((report) => {
    const expenses = toNumber(report?.total_expenses);
    const income = toNumber(report?.total_income);
    const safeIncome = income !== 0 ? income : 1;
    return (expenses / safeIncome) * 100;
  });

  return {
    totalReports: reports.length,
    averagePurchasePrice: average(purchasePrices),
    averagePricePerSite: average(pricePerSiteValues),
    averageCapRate: average(capRates),
    averageExpenseRatio: average(expenseRatios),
  };
}
