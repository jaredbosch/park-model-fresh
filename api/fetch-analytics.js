// /api/fetch-analytics.js
import { createClient } from "@supabase/supabase-js";

const supabaseUrl = process.env.SUPABASE_URL;
const supabaseKey = process.env.SUPABASE_SERVICE_ROLE_KEY;

export default async function handler(req, res) {
  console.log("🟢 Analytics API hit:", new Date().toISOString());

  // Verify environment vars
  if (!supabaseUrl || !supabaseKey) {
    console.error("❌ Missing Supabase env vars");
    return res.status(500).json({ error: "Server not configured." });
  }

  const supabase = createClient(supabaseUrl, supabaseKey);

  try {
    const userId =
      req.query.userId ||
      (req.body && req.body.userId) ||
      req.query.userid;

    if (!userId) {
      console.warn("⚠️ Missing userId param");
      return res.status(400).json({ error: "Missing userId parameter." });
    }

    console.log("Fetching analytics for user:", userId);

    // Query: adjust field names to exactly match your table schema
    const { data, error } = await supabase
      .from("reports")
      .select(
        "purchase_price, num_lots, cap_rate, total_expenses, total_income"
      )
      .eq("user_id", userId);

    if (error) {
      console.error("❌ Supabase query failed:", error);
      return res.status(500).json({ error: error.message });
    }

    if (!data || !data.length) {
      console.warn("⚠️ No reports found for user:", userId);
      return res.status(200).json({ metrics: { totalReports: 0 } });
    }

    const metrics = computeAnalytics(data);
    console.log("✅ Computed analytics:", metrics);
    return res.status(200).json({ metrics });
  } catch (err) {
    console.error("🔥 Server crash in analytics route:", err);
    return res.status(500).json({ error: err.message });
  }
}

function computeAnalytics(reports = []) {
  const sum = (key) =>
    reports.reduce((acc, r) => acc + (parseFloat(r[key]) || 0), 0);
  const avg = (key) => (reports.length ? sum(key) / reports.length : 0);

  const totalIncome = sum("total_income");
  const totalExpenses = sum("total_expenses");

  return {
    totalReports: reports.length,
    avgPurchasePrice: avg("purchase_price"),
    avgCapRate: avg("cap_rate"),
    avgExpenseRatio: totalIncome ? totalExpenses / totalIncome : 0,
  };
}
