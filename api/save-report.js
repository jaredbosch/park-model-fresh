import { createClient } from '@supabase/supabase-js';
import OpenAI from 'openai';

const supabase = createClient(
  process.env.SUPABASE_URL,
  process.env.SUPABASE_SERVICE_ROLE_KEY
);

const openai = new OpenAI({
  apiKey: process.env.OPENAI_API_KEY,
});

// Map camelCase → snake_case
const keyMap = {
  additionalIncome: 'additional_income',
  totalLots: 'total_lots',
  occupiedLots: 'occupied_lots',
  physicalOccupancy: 'physical_occupancy',
  economicOccupancy: 'economic_occupancy',
  grossPotentialRent: 'gross_potential_rent',
  lotRentIncome: 'lot_rent_income',
  otherIncome: 'other_income',
  effectiveGrossIncome: 'effective_gross_income',
  totalOperatingExpenses: 'total_operating_expenses',
  managementFee: 'management_fee',
  cashOnCash: 'cash_on_cash',
  annualCashFlow: 'annual_cash_flow',
  incomePerUnit: 'income_per_unit',
  expensePerUnit: 'expense_per_unit',
  noiPerUnit: 'noi_per_unit'
};

function normalizeKeys(payload) {
  const normalized = {};
  for (const [key, value] of Object.entries(payload)) {
    if (keyMap[key]) {
      normalized[keyMap[key]] = value;
    } else {
      normalized[key] = value;
    }
  }
  return normalized;
}

export default async function handler(req, res) {
  if (req.method !== 'POST') {
    return res.status(405).json({ error: 'Method not allowed' });
  }

  try {
    const payload = req.body || {};

    // Generate embedding text
    const textToEmbed = `${payload.park_name || ''}, ${payload.park_state || ''}\n${payload.report_html || ''}`;

    let embedding = null;
    if (textToEmbed.trim()) {
      const embeddingResp = await openai.embeddings.create({
        model: 'text-embedding-3-small',
        input: textToEmbed,
      });
      embedding = embeddingResp.data[0].embedding;
    }

    // Normalize payload keys to match DB
    const normalized = normalizeKeys({
      ...payload,
      embedding,
    });

    // Remove null/undefined/empty
    const insertData = Object.fromEntries(
      Object.entries(normalized).filter(([_, v]) => v !== undefined && v !== null && v !== '')
    );

    const { data, error } = await supabase
      .from('reports')
      .insert([insertData])
      .select();

    if (error) {
      console.error('Supabase insert error:', error);
      return res.status(500).json({ error: error.message });
    }

    return res.status(200).json({ success: true, data });
  } catch (err) {
    console.error('Handler error:', err);
    return res.status(500).json({ error: err.message });
  }
}
