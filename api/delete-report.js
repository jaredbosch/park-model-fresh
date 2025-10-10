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

  const { reportId, userId } = req.body || {};

  const numericId = Number(reportId);
  if (!Number.isFinite(numericId) || numericId <= 0) {
    return res.status(400).json({ success: false, error: 'A valid reportId is required to delete a report.' });
  }

  if (!userId || typeof userId !== 'string') {
    return res.status(400).json({ success: false, error: 'User ID is required to delete a report.' });
  }

  try {
    const { data, error } = await supabase
      .from('reports')
      .delete()
      .eq('id', numericId)
      .eq('user_id', userId)
      .select();

    if (error) {
      console.error('Supabase delete error:', error);
      return res.status(500).json({
        success: false,
        error: error.message || 'Failed to delete the report from Supabase.',
        details: error.details || null,
      });
    }

    const deletedRows = Array.isArray(data) ? data.length : 0;

    if (deletedRows === 0) {
      return res.status(404).json({
        success: false,
        error: 'Report not found or you do not have permission to delete it.',
      });
    }

    return res.status(200).json({ success: true, data });
  } catch (err) {
    console.error('Unexpected error deleting report:', err);
    return res.status(500).json({
      success: false,
      error: 'Unexpected error deleting the report.',
      details: err.message || null,
    });
  }
}

module.exports = handler;
