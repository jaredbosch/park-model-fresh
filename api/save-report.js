import { createClient } from '@supabase/supabase-js';
import OpenAI from 'openai';
import { Resend } from 'resend';

const supabase = createClient(
  process.env.SUPABASE_URL,
  process.env.SUPABASE_SERVICE_ROLE_KEY
);

const openai = new OpenAI({
  apiKey: process.env.OPENAI_API_KEY,
});

const resend = new Resend(process.env.RESEND_API_KEY);

export default async function handler(req, res) {
  if (req.method !== 'POST') {
    return res.status(405).json({ error: 'Method not allowed' });
  }

  try {
    const payload = req.body || {};

    // Build embedding text
    const textToEmbed = `${payload.propertyInfo?.name || ''}, ${payload.propertyInfo?.state || ''}\n${payload.htmlContent || ''}`;

    let embedding = null;
    if (textToEmbed.trim()) {
      const embeddingResp = await openai.embeddings.create({
        model: 'text-embedding-3-small',
        input: textToEmbed,
      });
      embedding = embeddingResp.data[0].embedding;
    }

    // Map payload → Supabase schema
    const fieldMap = {
      user_name: payload.contactInfo?.name,
      user_email: payload.contactInfo?.email,
      user_phone: payload.contactInfo?.phone,
      user_company: payload.contactInfo?.company,
      park_name: payload.propertyInfo?.name,
      park_address: payload.propertyInfo?.address,
      park_city: payload.propertyInfo?.city,
      park_state: payload.propertyInfo?.state,
      purchase_price: payload.purchaseInputs?.purchasePrice,
      closing_costs: payload.purchaseInputs?.closingCosts,
      total_investment: payload.purchaseInputs?.totalInvestment,
      down_payment_percent: payload.purchaseInputs?.downPaymentPercent,
      down_payment_amount: payload.purchaseInputs?.downPaymentAmount,
      loan_amount: payload.purchaseInputs?.loanAmount,
      interest_rate: payload.purchaseInputs?.interestRate,
      loan_term_years: payload.purchaseInputs?.loanTermYears,
      monthly_payment: payload.purchaseInputs?.monthlyPayment,
      annual_debt_service: payload.purchaseInputs?.annualDebtService,
      total_lots: payload.propertyInfo?.totalLots,
      occupied_lots: payload.propertyInfo?.occupiedLots,
      physical_occupancy: payload.propertyInfo?.physicalOccupancy,
      economic_occupancy: payload.propertyInfo?.economicOccupancy,
      gross_potential_rent: payload.calculations?.grossPotentialRent,
      lot_rent_income: payload.calculations?.lotRentIncome,
      other_income: payload.calculations?.otherIncome,
      effective_gross_income: payload.calculations?.effectiveGrossIncome,
      total_operating_expenses: payload.calculations?.totalOperatingExpenses,
      management_fee: payload.calculations?.managementFee,
      noi: payload.calculations?.noi,
      cap_rate: payload.calculations?.capRate,
      cash_on_cash: payload.calculations?.cashOnCash,
      dscr: payload.calculations?.dscr,
      irr: payload.calculations?.irr,
      equity_multiple: payload.calculations?.equityMultiple,
      annual_cash_flow: payload.calculations?.annualCashFlow,
      income_per_unit: payload.calculations?.incomePerUnit,
      expense_per_unit: payload.calculations?.expensePerUnit,
      noi_per_unit: payload.calculations?.noiPerUnit,
      report_html: payload.htmlContent || '',
      rent_roll: payload.rentRoll || {},
      income_items: payload.incomeItems || {},
      expense_items: payload.expenses || {},
      additional_income: payload.additionalIncome || {},
      embedding,
    };

    // Prune undefined / null / empty values
    const insertData = Object.fromEntries(
      Object.entries(fieldMap).filter(([_, v]) => v !== undefined && v !== null && v !== '')
    );

    const { data, error } = await supabase.from('reports').insert([insertData]).select();

    if (error) {
      console.error('Supabase insert error:', error);
      return res.status(500).json({ error: error.message });
    }

    // ✅ Send full HTML report in the email body
    await resend.emails.send({
      from: 'onboarding@resend.dev',
      to: 'boschtj@gmail.com',
      subject: `New Report Saved: ${payload.propertyInfo?.name || 'Unknown Property'}`,
      html: payload.htmlContent || `<p>New report saved for ${payload.propertyInfo?.name || 'Unknown Property'}</p>`,
    });

    return res.status(200).json({ success: true, data });
  } catch (err) {
    console.error('Handler error:', err);
    return res.status(500).json({ error: err.message });
  }
}
