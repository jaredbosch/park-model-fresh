const { createClient } = require('@supabase/supabase-js');

const supabaseUrl = process.env.SUPABASE_URL;
const supabaseServiceRoleKey = process.env.SUPABASE_SERVICE_ROLE_KEY;

const supabase =
  supabaseUrl && supabaseServiceRoleKey
    ? createClient(supabaseUrl, supabaseServiceRoleKey)
    : null;

async function handler(req, res) {
  try {
    if (!supabase) {
      console.error('❌ Supabase credentials missing for analytics endpoint.');
      return res.status(500).json({ error: 'Supabase not configured.' });
    }

    const userId =
      (req.query && (req.query.userId || req.query.userid)) ||
      (req.body && req.body.userId);

    if (!userId) {
      return res.status(400).json({ error: 'Missing userId parameter.' });
    }

    const { data, error } = await supabase
      .from('reports')
      .select('purchase_price, num_lots, cap_rate, total_expenses, total_income')
      .eq('user_id', userId);

    if (error) {
      console.error('❌ Supabase analytics query failed:', error);
      return res.status(500).json({ error: error.message });
    }

    const metrics = computeAnalytics(data || []);
    console.log(`✅ Analytics computed for user ${userId}:`, metrics);

    return res.status(200).json({ metrics });
  } catch (err) {
    console.error('⚠️ Analytics API error:', err);
    return res.status(500).json({ error: err.message });
  }
}

function computeAnalytics(reports = []) {
  if (!reports.length) {
    return { totalReports: 0 };
  }

  const sum = (key) =>
    reports.reduce((acc, report) => acc + (parseFloat(report[key]) || 0), 0);

  const avg = (key) => (reports.length ? sum(key) / reports.length : 0);

  const totalIncome = sum('total_income');
  const totalExpenses = sum('total_expenses');

  return {
    totalReports: reports.length,
    avgPurchasePrice: avg('purchase_price'),
    avgCapRate: avg('cap_rate'),
    avgExpenseRatio: totalIncome > 0 ? totalExpenses / totalIncome : 0,
  };
}

module.exports = handler;
