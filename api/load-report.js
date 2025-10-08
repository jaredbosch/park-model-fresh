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

const loadReportById = async ({ reportId, userId }) => {
  const warnings = new Set();
  const strategies = [];

  if (userId) {
    strategies.push({
      label: 'user_id',
      apply: (query) => query.eq('user_id', userId),
    });
  }

  strategies.push({ label: 'none', apply: (query) => query });

  let lastError = null;

  for (const strategy of strategies) {
    try {
      let query = supabase
        .from('reports')
        .select('*')
        .eq('id', reportId)
        .limit(1);

      query = strategy.apply(query);

      const response = await query.maybeSingle();

      if (response.error) {
        lastError = response.error;

        if (response.error.code === '42703') {
          const missingColumnMatch =
            response.error.message?.match(/column\s+"?([^"\s]+)"?/i) ||
            response.error.message?.match(/column\s+'?([^'\s]+)'?/i) ||
            response.error.details?.match(/column\s+"?([^"\s]+)"?/i) ||
            response.error.details?.match(/column\s+'?([^'\s]+)'?/i);

          const missingColumn = sanitizeColumnName(missingColumnMatch?.[1]);

          if (missingColumn) {
            warnings.add(
              `Supabase load query skipped missing column "${missingColumn}" while retrieving the report.`,
            );
          }

          continue;
        }

        if (
          response.error.code === '42501' ||
          /permission denied/i.test(`${response.error.message} ${response.error.details}`)
        ) {
          return {
            error: {
              status: 403,
              message:
                'Supabase Row Level Security prevented loading this report. Update your policies to allow select access for the owner.',
              details: response.error.message || response.error.details,
            },
            warnings: Array.from(warnings),
          };
        }

        continue;
      }

      if (response.data) {
        if (strategy.label === 'none' && userId) {
          const ownerId =
            response.data?.report_state?.ownerUserId ||
            response.data?.report_state?.userId ||
            response.data?.report_state?.sessionUserId ||
            null;

          if (ownerId && ownerId !== userId) {
            warnings.add('Loaded report did not belong to the requesting user and was skipped.');
            continue;
          }
        }

        return {
          data: response.data,
          warnings: Array.from(warnings),
        };
      }
    } catch (strategyError) {
      lastError = strategyError;
      console.error('Unexpected error loading report by ID:', strategyError);
    }
  }

  if (lastError) {
    return {
      error: {
        status: 500,
        message: 'Failed to load the requested report from Supabase.',
        details: lastError.message || lastError.details || null,
      },
      warnings: Array.from(warnings),
    };
  }

  return {
    error: {
      status: 404,
      message: 'Report not found.',
    },
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
      error: 'Supabase credentials are missing. Add SUPABASE_URL and SUPABASE_SERVICE_ROLE_KEY to load saved reports.',
    });
  }

  const { reportId, accessToken } = req.body || {};

  if (!reportId) {
    return res.status(400).json({
      success: false,
      error: 'A reportId is required to load a saved report.',
    });
  }

  let userId = null;

  if (accessToken) {
    const { data: userData, error: authError } = await supabase.auth.getUser(accessToken);

    if (authError) {
      return res.status(401).json({
        success: false,
        error: 'Unable to verify the Supabase session for the requested report.',
        details: authError.message || authError.details || null,
      });
    }

    userId = userData?.user?.id || null;
  }

  const { data, error, warnings } = await loadReportById({ reportId, userId });

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
