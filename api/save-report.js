// api/save-report.js
import { createClient } from '@supabase/supabase-js';
import OpenAI from 'openai';
import { Resend } from 'resend';

// ---- ENV (server-side only) ----
// Make sure these are set in Vercel Project Settings → Environment Variables (Preview & Production):
// SUPABASE_URL
// SUPABASE_SERVICE_ROLE_KEY  (service role; DO NOT expose to client)
// OPENAI_API_KEY
// RESEND_API_KEY

const supabase = createClient(
  process.env.SUPABASE_URL,
  process.env.SUPABASE_SERVICE_ROLE_KEY
);

const openai = new OpenAI({ apiKey: process.env.OPENAI_API_KEY });
const resend = new Resend(process.env.RESEND_API_KEY);

export default async function handler(req, res) {
  if (req.method !== 'POST') return res.status(405).json({ error: 'Method not allowed' });

  try {
    // Expect the client to POST the same fields you currently insert
    const {
      contactInfo,
      propertyInfo,
      purchaseInputs,
      calculations,
      units,
      additionalIncome,
      expenses,
      htmlContent
    } = req.body;

    // 1) Build a compact text to embed (mix key numbers + a bit of context)
    const textForEmbedding = `
      Park: ${propertyInfo?.name || ''}, ${propertyInfo?.city || ''}, ${propertyInfo?.state || ''}
      Company: ${contactInfo?.company || ''} / User: ${contactInfo?.email || ''}

      Financials:
      NOI: ${calculations?.noi ?? ''}, OpEx: ${calculations?.totalOpEx ?? ''}, EGI: ${calculations?.effectiveGrossIncome ?? ''}
      CapRate: ${calculations?.capRate ?? ''}, CoC: ${calculations?.cashOnCash ?? ''}, DSCR: ${calculations?.dscr ?? ''}

      Units:
      Total: ${calculations?.totalUnits ?? ''}, Occupied: ${calculations?.occupiedUnits ?? ''}

      Income Items: ${JSON.stringify(additionalIncome ?? [])}
      Expense Items: ${JSON.stringify(expenses ?? [])}
    `;

    // 2) Generate embedding (1536 dims for text-embedding-3-small)
    const emb = await openai.embeddings.create({
      model: 'text-embedding-3-small',
      input: textForEmbedding
    });
    const embedding = emb?.data?.[0]?.embedding;

    // 3) Insert into Supabase with the embedding vector
    const { data, error } = await supabase
      .from('reports')
      .insert([{
        user_name: contactInfo?.name ?? null,
        user_email: contactInfo?.email ?? null,
        user_phone: contactInfo?.phone ?? null,
        user_company: contactInfo?.company ?? null,

        park_name: propertyInfo?.name ?? null,
        park_address: propertyInfo?.address ?? null,
        park_city: propertyInfo?.city ?? null,
        park_state: propertyInfo?.state ?? null,

        purchase_price: purchaseInputs?.purchasePrice ?? null,
        closing_costs: purchaseInputs?.closingCosts ?? null,
        total_investment: calculations?.totalInvestment ?? null,
        down_payment_percent: purchaseInputs?.downPaymentPercent ?? null,
        down_payment_amount: calculations?.downPayment ?? null,
        loan_amount: calculations?.loanAmount ?? null,
        interest_rate: purchaseInputs?.interestRate ?? null,
        loan_term_years: purchaseInputs?.loanTermYears ?? null,
        monthly_payment: calculations?.monthlyPayment ?? null,
        annual_debt_service: calculations?.annualDebtService ?? null,

        total_lots: calculations?.totalUnits ?? null,
        occupied_lots: calculations?.occupiedUnits ?? null,
        physical_occupancy: calculations?.physicalOccupancy ?? null,
        economic_occupancy: calculations?.economicOccupancy ?? null,

        gross_potential_rent: calculations?.grossPotentialRent ?? null,
        lot_rent_income: calculations?.lotRentIncome ?? null,
        other_income: calculations?.totalAdditionalIncome ?? null,
        effective_gross_income: calculations?.effectiveGrossIncome ?? null,
        total_operating_expenses: calculations?.totalOpEx ?? null,
        management_fee: calculations?.managementFee ?? null,
        noi: calculations?.noi ?? null,
        cap_rate: calculations?.capRate ?? null,
        cash_on_cash: calculations?.cashOnCash ?? null,
        dscr: calculations?.dscr ?? null,
        irr: calculations?.irr ?? null,
        equity_multiple: calculations?.equityMultiple ?? null,
        annual_cash_flow: calculations?.cashFlow ?? null,
        income_per_unit: calculations?.incomePerUnit ?? null,
        expense_per_unit: calculations?.expensePerUnit ?? null,
        noi_per_unit: calculations?.noiPerUnit ?? null,

        report_html: htmlContent ?? null,
        rent_roll: JSON.stringify(units ?? []),
        income_items: JSON.stringify(additionalIncome ?? []),
        expense_items: JSON.stringify(expenses ?? []),

        // 🔑 vector column (1536 dims)
        embedding
      }])
      .select();

    if (error) {
      console.error('Supabase insert error:', error);
      return res.status(500).json({ success: false, error: error.message });
    }

    // 4) (Optional) Email yourself the report using sandbox sender
    try {
      await resend.emails.send({
        from: 'onboarding@resend.dev',     // sandbox sender (works without DNS)
        to: 'boschtj@gmail.com',   // use the SAME email you used to sign up for Resend (sandbox rule)
        subject: '📊 New Report Saved + Embedded',
        html: `
          <h2>New Report Saved</h2>
          <p><strong>Timestamp:</strong> ${new Date().toLocaleString()}</p>
          <p><strong>Park:</strong> ${propertyInfo?.name ?? ''} (${propertyInfo?.city ?? ''}, ${propertyInfo?.state ?? ''})</p>
          <hr />${htmlContent ?? ''}
        `
      });
    } catch (e) {
      // Don’t fail the whole request if email fails
      console.warn('Email send failed (non-fatal):', e?.message || e);
    }

    return res.status(200).json({ success: true, id: data?.[0]?.id || null });
  } catch (err) {
    console.error('save-report route error:', err);
    return res.status(500).json({ success: false, error: err?.message || 'Unknown error' });
  }
}
