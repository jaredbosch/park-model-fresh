import { createClient } from "@supabase/supabase-js";

const supabaseUrl = process.env.SUPABASE_URL;
const supabaseServiceRoleKey = process.env.SUPABASE_SERVICE_ROLE_KEY;

const isNumber = (value) => typeof value === "number" && Number.isFinite(value);
const toNumber = (value) => {
  if (value === null || value === undefined) return null;
  const parsed = Number(value);
  return Number.isFinite(parsed) ? parsed : null;
};

const safeAvg = (values) => {
  const nums = values.filter(isNumber);
  if (nums.length === 0) return 0;
  const total = nums.reduce((sum, value) => sum + value, 0);
  return nums.length > 0 ? total / nums.length : 0;
};

export default async function handler(req, res) {
  console.log("🟢 Analytics API triggered");

  if (!supabaseUrl || !supabaseServiceRoleKey) {
    console.error("❌ Missing Supabase environment variables");
    return res.status(500).json({ error: "Server misconfigured." });
  }

  const supabase = createClient(supabaseUrl, supabaseServiceRoleKey);

  try {
    const userId =
      req.query.userId ||
      (req.body && req.body.userId) ||
      req.query.userid;

    if (!userId) {
      console.warn("⚠️ Missing userId parameter in analytics request");
      return res.status(400).json({ error: "Missing userId parameter." });
    }

    console.log(`Fetching analytics for user: ${userId}`);

    const { data, error } = await supabase
      .from("reports")
      .select(
        "purchase_price, total_lots, cap_rate, total_operating_expenses, effective_gross_income, expense_ratio"
      )
      .eq("user_id", userId);

    if (error) {
      console.error("❌ Supabase analytics query failed:", error);
      return res.status(500).json({ error: error.message });
    }

    if (!data || data.length === 0) {
      console.log("ℹ️ No reports found for user, returning zeros");
      return res.status(200).json({
        totalReports: 0,
        averagePurchasePrice: 0,
        averagePricePerSite: 0,
        averageCapRate: 0,
        averageExpenseRatio: 0,
      });
    }

    const purchasePrices = [];
    const pricePerSiteValues = [];
    const capRates = [];
    const expenseRatios = [];

    data.forEach((row) => {
      const purchasePrice = toNumber(row.purchase_price);
      const totalLots = toNumber(row.total_lots);
      const capRate = toNumber(row.cap_rate);
      const providedExpenseRatio = toNumber(row.expense_ratio);
      const totalOperatingExpenses = toNumber(row.total_operating_expenses);
      const effectiveGrossIncome = toNumber(row.effective_gross_income);

      if (purchasePrice !== null) {
        purchasePrices.push(purchasePrice);
      }

      if (purchasePrice !== null && totalLots !== null && totalLots > 0) {
        pricePerSiteValues.push(purchasePrice / totalLots);
      }

      if (capRate !== null) {
        capRates.push(capRate);
      }

      if (providedExpenseRatio !== null) {
        expenseRatios.push(providedExpenseRatio);
      } else if (
        totalOperatingExpenses !== null &&
        effectiveGrossIncome !== null &&
        effectiveGrossIncome > 0
      ) {
        expenseRatios.push((totalOperatingExpenses / effectiveGrossIncome) * 100);
      }
    });

    const metrics = {
      totalReports: data.length,
      averagePurchasePrice: safeAvg(purchasePrices),
      averagePricePerSite: safeAvg(pricePerSiteValues),
      averageCapRate: safeAvg(capRates),
      averageExpenseRatio: safeAvg(expenseRatios),
    };

    console.log("✅ Computed analytics metrics:", metrics);

    return res.status(200).json(metrics);
  } catch (err) {
    console.error("🔥 Analytics API crash:", err);
    return res.status(500).json({ error: err.message || "Unexpected error" });
  }
}
