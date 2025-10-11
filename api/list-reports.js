const { createClient } = require('@supabase/supabase-js');

const supabaseUrl = process.env.SUPABASE_URL;
const supabaseServiceRoleKey = process.env.SUPABASE_SERVICE_ROLE_KEY;

const supabase =
  supabaseUrl && supabaseServiceRoleKey
    ? createClient(supabaseUrl, supabaseServiceRoleKey)
    : null;

const sanitizeColumnName = (rawColumn) => {
  if (!rawColumn) {
    return rawColumn;
  }

  const withoutTable = rawColumn.includes('.')
    ? rawColumn.split('.').pop()
    : rawColumn;

  return withoutTable.replace(/["'`]/g, '').replace(/-/g, '_');
};

const columnVariants = [
  'id, report_name, park_name, park_city, park_state, total_lots, created_at, updated_at, report_state',
  'id, report_name, park_name, park_city, park_state, total_lots, created_at, report_state',
  'id, report_name, park_name, park_city, park_state, created_at, report_state',
  'id, park_name, park_city, park_state, created_at, report_state',
  'id, park_name, park_city, park_state, created_at',
  'id, park_name, park_city, park_state',
  'id, park_name',
];

const orderVariants = [
  ['updated_at', 'created_at'],
  ['created_at'],
  [],
];

const getReportsForUser = async (userId) => {
  const warnings = new Set();

  for (const columns of columnVariants) {
    for (const orderColumns of orderVariants) {
      let query = supabase
        .from('reports')
        .select(columns)
        .eq('user_id', userId);

      for (const orderColumn of orderColumns) {
        query = query.order(orderColumn, { ascending: false });
      }

      const { data, error } = await query;

      if (!error) {
        return {
          data: Array.isArray(data) ? data : [],
          warnings: Array.from(warnings),
        };
      }

      if (error.code === '42703') {
        const missingColumnMatch =
          error.message?.match(/column\s+"?([^"\s]+)"?/i) ||
          error.message?.match(/column\s+'?([^'\s]+)'?/i) ||
          error.details?.match(/column\s+"?([^"\s]+)"?/i) ||
          error.details?.match(/column\s+'?([^'\s]+)'?/i);

        const missingColumn = sanitizeColumnName(missingColumnMatch?.[1]);

        if (missingColumn) {
          warnings.add(
            `Supabase reports query skipped missing column "${missingColumn}" while retrieving saved reports.`
          );
        }

        // Try the next combination without failing immediately.
        continue;
      }

      if (error.code === '42501' || /permission denied/i.test(`${error.message} ${error.details}`)) {
        return {
          error: {
            status: 403,
            message:
              'Supabase Row Level Security prevents reading saved reports for this user. Update your policies to allow select access.',
            details: error.message || error.details,
          },
          warnings: Array.from(warnings),
        };
      }

      return {
        error: {
          status: 500,
          message: 'Failed to retrieve saved reports from Supabase.',
          details: error.message || error.details,
        },
        warnings: Array.from(warnings),
      };
    }
  }

  return {
    data: [],
    warnings: Array.from(warnings),
  };
};

async function handler(req, res) {
  if (req.method !== 'POST') {
    res.setHeader('Allow', 'POST');
    return res.status(405).json({ success: false, error: 'Method not allowed' });
  }

  if (!supabase) {
    return res.status(500).json({
      success: false,
      error: 'Supabase credentials are missing. Add SUPABASE_URL and SUPABASE_SERVICE_ROLE_KEY to use saved reports.',
    });
  }

  const { accessToken } = req.body || {};

  if (!accessToken) {
    return res.status(401).json({
      success: false,
      error: 'Supabase access token is required to fetch saved reports.',
    });
  }

  const { data: userData, error: authError } = await supabase.auth.getUser(accessToken);

  if (authError || !userData?.user?.id) {
    return res.status(401).json({
      success: false,
      error: 'Unable to verify the Supabase session. Sign in again and retry.',
      details: authError?.message || authError?.details || null,
    });
  }

  const userId = userData.user.id;

  const { data, error, warnings } = await getReportsForUser(userId);

  if (error) {
    return res.status(error.status || 500).json({
      success: false,
      error: error.message,
      details: error.details || null,
      warnings,
    });
  }

  return res.status(200).json({
    success: true,
    data,
    warnings,
  });
}

module.exports = handler;
