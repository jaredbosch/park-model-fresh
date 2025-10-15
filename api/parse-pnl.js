import OpenAI from 'openai';
import { createClient } from '@supabase/supabase-js';

const openaiApiKey = process.env.OPENAI_API_KEY;
const openaiClient = openaiApiKey ? new OpenAI({ apiKey: openaiApiKey }) : null;

const supabaseUrl = process.env.NEXT_PUBLIC_SUPABASE_URL;
const supabaseServiceRoleKey = process.env.SUPABASE_SERVICE_ROLE_KEY;
const supabase =
  supabaseUrl && supabaseServiceRoleKey
    ? createClient(supabaseUrl, supabaseServiceRoleKey)
    : null;

function ensureClient() {
  if (!openaiClient) {
    const error = new Error('OpenAI API key is not configured.');
    error.statusCode = 500;
    throw error;
  }
}

async function extractStructuredPnlWithGpt(buffer, filename) {
  ensureClient();
  // Upload file to OpenAI
  const fileUpload = await openaiClient.files.create({
    file: buffer,
    purpose: 'assistants',
    filename: filename,
  });

  try {
    // Ask GPT-4o to extract structured data
    const response = await openaiClient.responses.create({
      model: 'gpt-4o',
      input: [
        {
          role: 'system',
          content:
            'You are a financial document parser. Extract structured Profit & Loss data from the attached PDF. Return valid JSON with the following structure: { income: [{label, amount}], expenses: [{label, amount}], net_income: number }. Ignore monthly columns and extract only the total annual amount for each line item.',
        },
        {
          role: 'user',
          content: [
            { type: 'input_text', text: 'Extract structured P&L data.' },
            { type: 'input_file', file_id: fileUpload.id },
          ],
        },
      ],
      response_format: { type: 'json_object' },
    });

    const content = response.output?.[0]?.content?.[0]?.text;
    if (!content) {
      throw new Error('No structured content returned from OpenAI.');
    }

    return JSON.parse(content);
  } finally {
    try {
      await openaiClient.files.del(fileUpload.id);
    } catch (cleanupError) {
      console.warn('Unable to delete uploaded P&L file from OpenAI:', cleanupError);
    }
  }
}

export default async function handler(req, res) {
  if (req.method !== 'POST') {
    res.setHeader('Allow', ['POST']);
    res.status(405).json({ success: false, error: 'Method not allowed' });
    return;
  }

  try {
    const { file, filename } = req.body || {};
    if (!file || !filename) {
      res.status(400).json({ success: false, error: 'Missing file payload.' });
      return;
    }

    const buffer = Buffer.from(file, 'base64');
    const parsed = await extractStructuredPnlWithGpt(buffer, filename);

    if (!parsed || typeof parsed !== 'object') {
      res.status(422).json({ success: false, error: 'Unable to parse structured P&L data.' });
      return;
    }

    if (supabase) {
      try {
        await supabase.from('parsed_pnls').insert({
          filename,
          parsed_json: parsed,
          parsed_at: new Date().toISOString(),
          model_used: 'gpt-4o',
        });
      } catch (storageError) {
        console.error('Unable to persist parsed P&L payload:', storageError);
      }
    }

    res.status(200).json({
      success: true,
      data: parsed,
      metadata: {
        source_filename: filename,
        extraction_strategy: 'gpt-4o-structured',
        model_used: 'gpt-4o',
      },
    });
  } catch (error) {
    console.error('Error parsing P&L:', error);
    const statusCode = error?.statusCode || 500;
    res
      .status(statusCode)
      .json({ success: false, error: error.message || 'Unexpected error while parsing P&L.' });
  }
}
