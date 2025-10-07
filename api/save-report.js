import { createClient } from '@supabase/supabase-js';
import OpenAI from 'openai';
import { Resend } from 'resend';

const supabaseUrl = process.env.SUPABASE_URL;
const supabaseServiceRoleKey = process.env.SUPABASE_SERVICE_ROLE_KEY;
const openaiApiKey = process.env.OPENAI_API_KEY;
const resendApiKey = process.env.RESEND_API_KEY;

const supabase =
  supabaseUrl && supabaseServiceRoleKey
    ? createClient(supabaseUrl, supabaseServiceRoleKey)
    : null;

const OPTIONAL_COLUMNS = new Set([
  'report_name',
  'report_state',
  'management_percent',
  'irr_inputs',
  'proforma_inputs',
  'use_actual_income',
  'actual_income',
  'embedding',
]);

const openai = openaiApiKey ? new OpenAI({ apiKey: openaiApiKey }) : null;

const resend = resendApiKey ? new Resend(resendApiKey) : null;

export default async function handler(req, res) {
  if (req.method !== 'POST') {
    return res.status(405).json({ error: 'Method not allowed' });
  }

  try {
    const payload = req.body || {};

    if (!supabase) {
      console.error('Missing Supabase credentials.');
      return res.status(500).json({ success: false, error: 'Supabase is not configured on the server.' });
    }

    if (!payload.userId) {
      return res.status(400).json({ success: false, error: 'User ID is required to save a report.' });
    }

    // Build embedding text
    const textToEmbed = `${payload.propertyInfo?.name || ''}, ${payload.propertyInfo?.state || ''}\n${payload.htmlContent || ''}`;

    let embedding = null;
    if (textToEmbed.trim() && openai) {
      const embeddingResp = await openai.embeddings.create({
        model: 'text-embedding-3-small',
        input: textToEmbed,
      });
      embedding = embeddingResp.data[0].embedding;
    } else if (textToEmbed.trim() && !openai) {
      console.warn('OPENAI_API_KEY is not set. Embeddings will be skipped.');
    }

    // Map payload → Supabase schema
    const fieldMap = {
      user_id: payload.userId,
      report_name: payload.reportName,
      report_state: payload.reportState,
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
      total_lots: payload.propertyInfo?.totalLots ?? payload.calculations?.totalUnits,
      occupied_lots: payload.propertyInfo?.occupiedLots ?? payload.calculations?.occupiedUnits,
      physical_occupancy: payload.propertyInfo?.physicalOccupancy ?? payload.calculations?.physicalOccupancy,
      economic_occupancy: payload.propertyInfo?.economicOccupancy ?? payload.calculations?.economicOccupancy,
      gross_potential_rent: payload.calculations?.grossPotentialRent,
      lot_rent_income: payload.calculations?.lotRentIncome,
      other_income:
        payload.calculations?.totalAdditionalIncome ?? payload.calculations?.otherIncome,
      effective_gross_income: payload.calculations?.effectiveGrossIncome,
      total_operating_expenses: payload.calculations?.totalOpEx,
      management_fee: payload.calculations?.managementFee,
      noi: payload.calculations?.noi,
      cap_rate: payload.calculations?.capRate,
      cash_on_cash: payload.calculations?.cashOnCash,
      dscr: payload.calculations?.dscr,
      irr: payload.calculations?.irr,
      equity_multiple: payload.calculations?.equityMultiple,
      annual_cash_flow: payload.calculations?.cashFlow,
      income_per_unit: payload.calculations?.incomePerUnit,
      expense_per_unit: payload.calculations?.expensePerUnit,
      noi_per_unit: payload.calculations?.noiPerUnit,
      report_html: payload.htmlContent || '',
      rent_roll: payload.units || [],
      income_items: payload.additionalIncome || [],
      expense_items: payload.expenses || [],
      additional_income: payload.additionalIncome || [],
      embedding,
    };

    // Prune undefined / null / empty values
    const insertData = Object.fromEntries(
      Object.entries(fieldMap).filter(([_, v]) => v !== undefined && v !== null && v !== '')
    );

    const performPersistence = async (dataToPersist) => {
      if (payload.reportId) {
        return supabase
          .from('reports')
          .update(dataToPersist)
          .eq('id', payload.reportId)
          .eq('user_id', payload.userId)
          .select();
      }

      return supabase.from('reports').insert([dataToPersist]).select();
    };

    let data;
    let error;
    let dataToPersist = { ...insertData };

    for (let attempt = 0; attempt < OPTIONAL_COLUMNS.size + 1; attempt += 1) {
      ({ data, error } = await performPersistence(dataToPersist));

      if (!error) {
        break;
      }

      const missingColumnMatch = error.message?.match(/column "([^"]+)"/i);
      const missingColumn = missingColumnMatch?.[1];

      if (error.code !== '42703' || !missingColumn || !OPTIONAL_COLUMNS.has(missingColumn)) {
        break;
      }

      if (!(missingColumn in dataToPersist)) {
        break;
      }

      console.warn(
        `Column "${missingColumn}" is not present in Supabase. Retrying save without it.`
      );

      const { [missingColumn]: _removed, ...rest } = dataToPersist;
      dataToPersist = rest;
    }

    if (error) {
      console.error('Supabase insert error:', error);
      return res.status(500).json({ error: error.message });
    }

    if (!payload.reportId && resend) {
      await resend.emails.send({
        from: 'onboarding@resend.dev',
        to: 'boschtj@gmail.com',
        subject: `New Report Saved: ${payload.reportName || payload.propertyInfo?.name || 'Unknown Property'}`,
        html:
          payload.htmlContent ||
          `<p>New report saved for ${payload.reportName || payload.propertyInfo?.name || 'Unknown Property'}</p>`,
      });
    } else if (!payload.reportId && !resend) {
      console.warn('RESEND_API_KEY is not set. Notification email will not be sent.');
    }

    return res.status(200).json({ success: true, data });
  } catch (err) {
    console.error('Handler error:', err);
    return res.status(500).json({ error: err.message });
  }
}
