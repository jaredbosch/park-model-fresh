import { createClient } from '@supabase/supabase-js';
import OpenAI from 'openai';

const supabase = createClient(
  process.env.SUPABASE_URL,
  process.env.SUPABASE_SERVICE_ROLE_KEY
);

const openai = new OpenAI({
  apiKey: process.env.OPENAI_API_KEY,
});

export default async function handler(req, res) {
  if (req.method !== 'POST') {
    return res.status(405).json({ error: 'Method not allowed' });
  }

  try {
    const payload = req.body || {};

    // Generate embedding text (park info + state + maybe report_html)
    const textToEmbed = `${payload.park_name || ''}, ${payload.park_state || ''}\n${payload.report_html || ''}`;

    let embedding = null;
    if (textToEmbed.trim()) {
      const embeddingResp = await openai.embeddings.create({
        model: 'text-embedding-3-small',
        input: textToEmbed,
      });
      embedding = embeddingResp.data[0].embedding;
    }

    // Build insert object
    const insertData = Object.fromEntries(
      Object.entries({
        ...payload,
        embedding,
      }).filter(([_, v]) => v !== undefined && v !== null && v !== '')
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
