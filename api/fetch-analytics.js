import { createClient } from "@supabase/supabase-js";

const supabaseUrl = process.env.SUPABASE_URL;
const supabaseKey = process.env.SUPABASE_SERVICE_ROLE_KEY;

export default async function handler(req, res) {
  console.log("🟢 Analytics API triggered");

  if (!supabaseUrl || !supabaseKey) {
    console.error("❌ Missing Supabase env vars");
    return res.status(500).json({ error: "Server misconfigured." });
  }

  const supabase = createClient(supabaseUrl, supabaseKey);

  try {
    const userId =
      req.query.userId ||
      (req.body && req.body.userId) ||
      req.query.userid;

    if (!userId) {
      return res.status(400).json({ error: "Missing userId parameter." });
    }

    console.log("Fetching analytics for user:", userId);

    // ✅ Query only relevant numeric columns
    const { data, error } = await supabase
      .from("reports")
      .select(
        `
        id,
        total_lots,
        occupied_lots,
        noi,
        cap_rate,
        cash_on_cash,
        dscr,
        expense_ratio,
        effective_gross_income,
        total_operating_expenses,
        physical_occupancy,
        economic_occupancy
      `
      )
      .eq("user_id", userId);

    if (error) {
      console.error("❌ Supabase analytics query failed:", error);
      return res.status(500).json({ error: error.message });
    }

    if (!data || data.length === 0) {
      console.warn("⚠️ No reports found for user:", userId);
      return res.status(200).json({ metrics: { totalReports: 0 } });
    }

    const metrics = computeAnalytics(data);
    console.log("✅ Computed analytics:", metrics);
    return res.status(200).json({ metrics });
  } catch (err) {
    console.error("🔥 Analytics API crash:", err);
    return res.status(500).json({ error: err.message });
  }
}

function computeAnalytics(reports) {
  const safeAvg = (arr) =>
    arr.length ? arr.reduce((a, b) => a + (parseFloat(b) || 0), 0) / arr.length : 0;
  const sum = (arr) => arr.reduce((a, b) => a + (parseFloat(b) || 0), 0);

  const totalReports = reports.length;
  const totalLots = sum(reports.map((r) => r.total_lots));
  const totalOccupied = sum(reports.map((r) => r.occupied_lots));
  const occupancyRate =
    totalLots > 0 ? (totalOccupied / totalLots) * 100 : 0;

  const avgCapRate = safeAvg(reports.map((r) => r.cap_rate));
  const avgCashOnCash = safeAvg(reports.map((r) => r.cash_on_cash));
  const avgDSCR = safeAvg(reports.map((r) => r.dscr));
  const avgNOI = safeAvg(reports.map((r) => r.noi));
  const avgExpenseRatio = safeAvg(reports.map((r) => r.expense_ratio));
  const avgPhysOcc = safeAvg(reports.map((r) => r.physical_occupancy));
  const avgEconOcc = safeAvg(reports.map((r) => r.economic_occupancy));

  return {
    totalReports,
    totalLots,
    totalOccupied,
    occupancyRate,
    avgCapRate,
    avgCashOnCash,
    avgDSCR,
    avgNOI,
    avgExpenseRatio,
    avgPhysOcc,
    avgEconOcc,
  };
}
