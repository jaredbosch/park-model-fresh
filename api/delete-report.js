const { createClient } = require('@supabase/supabase-js');

const supabaseUrl = process.env.SUPABASE_URL;
const supabaseServiceRoleKey = process.env.SUPABASE_SERVICE_ROLE_KEY;

const supabase =
  supabaseUrl && supabaseServiceRoleKey
    ? createClient(supabaseUrl, supabaseServiceRoleKey)
    : null;

async function handler(req, res) {
  if (req.method !== 'POST') {
    res.setHeader('Allow', 'POST');
    return res.status(405).json({ success: false, error: 'Method not allowed' });
  }

  if (!supabase) {
    return res.status(500).json({
      success: false,
      error: 'Supabase credentials are missing. Add SUPABASE_URL and SUPABASE_SERVICE_ROLE_KEY to enable report deletion.',
    });
  }

  const { id } = req.body || {};

  const resolvedId = typeof id === 'string' ? id.trim() : id;

  if (
    !resolvedId ||
    (typeof resolvedId !== 'string' && typeof resolvedId !== 'number') ||
    (typeof resolvedId === 'number' && !Number.isFinite(resolvedId))
  ) {
    return res.status(400).json({ error: 'Invalid report identifier' });
  }

  try {
    const { error } = await supabase.from('reports').delete().eq('id', resolvedId);

    if (error) {
      console.error('Supabase delete error:', error);
      return res.status(500).json({ error: error.message || 'Failed to delete report.' });
    }
    return res.status(200).json({ success: true });
  } catch (err) {
    console.error('Unexpected error deleting report:', err);
    return res.status(500).json({ error: 'Unexpected error deleting the report.' });
  }
}

module.exports = handler;
