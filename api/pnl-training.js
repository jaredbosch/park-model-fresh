import OpenAI from 'openai';
import { createClient } from '@supabase/supabase-js';

const openaiApiKey = process.env.OPENAI_API_KEY;
const supabaseUrl = process.env.NEXT_PUBLIC_SUPABASE_URL;
const supabaseServiceRoleKey = process.env.SUPABASE_SERVICE_ROLE_KEY;

const openaiClient = openaiApiKey ? new OpenAI({ apiKey: openaiApiKey }) : null;
const supabase =
  supabaseUrl && supabaseServiceRoleKey
    ? createClient(supabaseUrl, supabaseServiceRoleKey)
    : null;

export default async function handler(req, res) {
  if (req.method !== 'POST') {
    res.setHeader('Allow', ['POST']);
    res.status(405).json({ success: false, error: 'Method not allowed' });
    return;
  }

  try {
    const { examples } = req.body || {};
    if (!Array.isArray(examples) || examples.length === 0) {
      res.status(400).json({ success: false, error: 'No mapping examples provided.' });
      return;
    }

    if (!openaiClient || !supabase) {
      res.status(200).json({ success: true, skipped: true, stored: 0 });
      return;
    }

    const filtered = examples.filter(
      (example) =>
        example &&
        typeof example.label === 'string' &&
        example.label.trim().length > 0 &&
        typeof example.category === 'string' &&
        example.category.trim().length > 0
    );

    if (filtered.length === 0) {
      res.status(400).json({ success: false, error: 'No valid mapping examples provided.' });
      return;
    }

    const embeddingResponse = await openaiClient.embeddings.create({
      model: 'text-embedding-3-small',
      input: filtered.map((example) => example.label),
    });

    const records = filtered
      .map((example, index) => {
        const embedding = embeddingResponse.data?.[index]?.embedding;
        if (!embedding) {
          return null;
        }

        return {
          raw_label: example.label,
          mapped_category: example.category,
          section: example.section || null,
          embedding,
          created_at: new Date().toISOString(),
        };
      })
      .filter(Boolean);

    if (records.length === 0) {
      res.status(200).json({ success: true, stored: 0, skipped: true });
      return;
    }

    const { error } = await supabase.from('pnl_label_training').insert(records);
    if (error) {
      throw error;
    }

    res.status(200).json({ success: true, stored: records.length });
  } catch (error) {
    console.error('Unable to persist P&L training examples:', error);
    res.status(500).json({ success: false, error: error.message || 'Unable to store training data.' });
  }
}
