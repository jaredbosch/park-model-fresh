// /api/save-report.js
import { createClient } from '@supabase/supabase-js';
import OpenAI from 'openai';
import { Resend } from 'resend';

export default async function handler(req, res) {
  if (req.method !== 'POST') {
    return res.status(405).json({ error: 'Method not allowed' });
  }

  // Debugging: check required env vars
  const required = [
    'SUPABASE_URL',
    'SUPABASE_SERVICE_ROLE_KEY',
    'OPENAI_API_KEY',
    'RESEND_API_KEY'
  ];
  const missing = required.filter((key) => !process.env[key]);

  if (missing.length > 0) {
    console.error('❌ Missing env vars:', missing);
    return res
      .status(500)
      .json({ error: `Missing environment variables: ${missing.join(', ')}` });
  }

  const supabase = createClient(
    process.env.SUPABASE_URL,
    process.env.SUPABASE_SERVICE_ROLE_KEY
  );

  const openai = new OpenAI({ apiKey: process.env.OPENAI_API_KEY });
  const resend = new Resend(process.env.RESEND_API_KEY);

  try {
    // pull data from request
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

    // ✅ Generate embedding
    const embeddingResponse = await openai.embeddings.create({
      model: 'text-embedding-3-small',
      input: JSON.stringify({
        contactInfo,
        propertyInfo,
        purchaseInputs,
        calculations,
        units,
        additionalIncome,
        expenses
      })
    });

    const embedding = embeddingResponse.data[0].embedding;

    // ✅ Save to Supabase
    const { data, error } = await supabase.from('reports').insert([
      {
        contact_info: contactInfo,
        property_info: propertyInfo,
        purchase_inputs: purchaseInputs,
        calculations,
        units,
        additional_income: additionalIncome,
        expenses,
        html_report: htmlContent,
        embedding
      }
    ]).select();

    if (error) {
      console.error('❌ Supabase save error:', error);
      return res.status(500).json({ error: error.message });
    }

    console.log('✅ Report saved with ID:', data[0].id);

    // ✅ Send confirmation email to you
    await resend.emails.send({
      from: 'reports@redlinecre.com',
      to: 'jared@redlinecre.com',
      subject: '📊 Report Saved to Supabase',
      html: `<h3>Report ID: ${data[0].id}</h3><pre>${htmlContent}</pre>`
    });

    return res.status(200).json({ success: true, id: data[0].id });
  } catch (err) {
    console.error('❌ Error in save-report handler:', err);
    return res.status(500).json({ error: err.message });
  }
}
