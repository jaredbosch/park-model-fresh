const { createClient } = require('@supabase/supabase-js');

const supabase = createClient(
  process.env.SUPABASE_URL,
  process.env.SUPABASE_ANON_KEY
);

module.exports = async function handler(req, res) {
  // Enable CORS
  res.setHeader('Access-Control-Allow-Origin', '*');
  res.setHeader('Access-Control-Allow-Methods', 'POST, OPTIONS');
  res.setHeader('Access-Control-Allow-Headers', 'Content-Type');

  if (req.method === 'OPTIONS') {
    return res.status(200).end();
  }

  if (req.method !== 'POST') {
    return res.status(405).json({ error: 'Method not allowed' });
  }

  try {
    const { contactInfo, propertyInfo, calculations, units, additionalIncome, expenses, purchaseInputs, irrInputs, reportHtml } = req.body;

    const { data, error } = await supabase
      .from('reports')
      .insert([{
        // User
        user_name: contactInfo.name,
        user_email: contactInfo.email,
        user_phone: contactInfo.phone,
        user_company: contactInfo.company,
        
        // Property
        park_name: propertyInfo.name,
        park_address: propertyInfo.address,
        park_city: propertyInfo.city,
        park_state: propertyInfo.state,
        
        // Purchase
        purchase_price: purchaseInputs.purchasePrice,
        closing_costs: purchaseInputs.closingCosts,
        total_investment: calculations.totalInvestment,
        
        // Financing
        down_payment_percent: purchaseInputs.downPaymentPercent,
        down_payment_amount: calculations.downPayment,
        loan_amount: calculations.loanAmount,
        interest_rate: purchaseInputs.interestRate,
        loan_term_years: purchaseInputs.loanTermYears,
        monthly_payment: calculations.monthlyPayment,
        annual_debt_service: calculations.annualDebtService,
        
        // Metrics
        total_lots: calculations.totalUnits,
        occupied_lots: calculations.occupiedUnits,
        physical_occupancy: calculations.physicalOccupancy,
        economic_occupancy: calculations.economicOccupancy,
        
        // Income/Expenses
        gross_potential_rent: calculations.grossPotentialRent,
        lot_rent_income: calculations.lotRentIncome,
        other_income: calculations.totalAdditionalIncome,
        effective_gross_income: calculations.effectiveGrossIncome,
        total_operating_expenses: calculations.totalOpEx,
        management_fee: calculations.managementFee,
        
        // Performance
        noi: calculations.noi,
        cap_rate: calculations.capRate,
        cash_on_cash: calculations.cashOnCash,
        dscr: calculations.dscr,
        irr: calculations.irr,
        equity_multiple: calculations.equityMultiple,
        annual_cash_flow: calculations.cashFlow,
        
        // Per unit
        income_per_unit: calculations.incomePerUnit,
        expense_per_unit: calculations.expensePerUnit,
        noi_per_unit: calculations.noiPerUnit,
        
        // Full data
        report_html: reportHtml,
        rent_roll: units,
        income_items: additionalIncome,
        expense_items: expenses
      }])
      .select();

    if (error) {
      console.error('Supabase error:', error);
      return res.status(500).json({ error: error.message });
    }

    return res.status(200).json({ success: true, reportId: data[0].id });
  } catch (error) {
    console.error('Server error:', error);
    return res.status(500).json({ error: error.message });
  }
};