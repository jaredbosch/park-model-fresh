const { createClient } = require('@supabase/supabase-js');
const { Resend } = require('resend');
const OpenAI = require('openai');
const { extractKeyMetrics } = require('./utils/extractKeyMetrics');

const supabaseUrl = process.env.SUPABASE_URL;
const supabaseServiceRoleKey = process.env.SUPABASE_SERVICE_ROLE_KEY;
const openAIApiKey = process.env.OPENAI_API_KEY;
const resendApiKey = process.env.RESEND_API_KEY;
const resendFromEmail = process.env.RESEND_FROM_EMAIL || '';
const notificationEmailList = process.env.REPORT_NOTIFICATION_EMAILS || '';

const supabase =
  supabaseUrl && supabaseServiceRoleKey
    ? createClient(supabaseUrl, supabaseServiceRoleKey)
    : null;

const openaiClient = openAIApiKey ? new OpenAI({ apiKey: openAIApiKey }) : null;

const sanitizeColumnName = (rawColumn) => {
  if (!rawColumn) {
    return rawColumn;
  }

  const withoutTable = rawColumn.includes('.')
    ? rawColumn.split('.').pop()
    : rawColumn;

  return withoutTable.replace(/["'`]/g, '').replace(/-/g, '_');
};

const REQUIRED_COLUMNS = new Set(['user_id', 'report_name', 'report_state']);
const RECOMMENDED_COLUMNS = new Set(['report_html']);
const OPTIONAL_PROBE_COLUMNS = new Set();

let cachedReportsSchemaStatus = {
  ok: false,
  checkedAt: 0,
  error: null,
  warning: null,
};

const CACHE_DURATION_MS = 5 * 60 * 1000; // 5 minutes

const ensureReportsSchema = async () => {
  if (!supabase) {
    return {
      ok: false,
      error: {
        message: 'Supabase credentials are missing. Add SUPABASE_URL and SUPABASE_SERVICE_ROLE_KEY.',
      },
    };
  }

  const now = Date.now();
  if (cachedReportsSchemaStatus.ok && now - cachedReportsSchemaStatus.checkedAt < CACHE_DURATION_MS) {
    return cachedReportsSchemaStatus;
  }

  const columnsToCheck = new Set([
    'id',
    ...REQUIRED_COLUMNS,
    ...RECOMMENDED_COLUMNS,
    ...OPTIONAL_PROBE_COLUMNS,
  ]);

  const missingRecommended = new Set();
  const missingOptional = new Set();

  while (columnsToCheck.size > 0) {
    const { error } = await supabase
      .from('reports')
      .select(Array.from(columnsToCheck).join(', '), { head: true, count: 'exact' });

    if (!error) {
      break;
    }

    if (error.code === '42P01') {
      cachedReportsSchemaStatus = {
        ok: false,
        checkedAt: now,
        error: {
          message: "Supabase table 'reports' is missing. Create the table before saving reports.",
          code: error.code,
          details: error.details,
          hint: error.hint,
        },
        warning: null,
      };

      return cachedReportsSchemaStatus;
    }

    const missingColumnMatch =
      error.message?.match(/column\s+"?([^"\s]+)"?/i) ||
      error.message?.match(/column\s+'?([^'\s]+)'?/i) ||
      error.details?.match(/column\s+"?([^"\s]+)"?/i) ||
      error.details?.match(/column\s+'?([^'\s]+)'?/i);

    const missingColumn = sanitizeColumnName(missingColumnMatch?.[1]);

    if (error.code === '42703' && missingColumn) {
      if (REQUIRED_COLUMNS.has(missingColumn)) {
        cachedReportsSchemaStatus = {
          ok: false,
          checkedAt: now,
          error: {
            message: `Supabase 'reports' table is missing the required column "${missingColumn}".`,
            code: error.code,
            details: error.details,
            hint: error.hint,
          },
          warning: null,
        };

        return cachedReportsSchemaStatus;
      }

      if (columnsToCheck.has(missingColumn)) {
        columnsToCheck.delete(missingColumn);

        if (RECOMMENDED_COLUMNS.has(missingColumn)) {
          missingRecommended.add(missingColumn);
        } else {
          missingOptional.add(missingColumn);
        }

        continue;
      }
    }

    let message = 'Unable to access the Supabase reports table. Check the table name and columns.';

    const errorText = `${error.message || ''} ${error.details || ''}`.toLowerCase();

    if (error.code === '42501' || errorText.includes('permission denied')) {
      message =
        'Supabase credentials do not have access to the "reports" table. Use the service role key or update Row Level Security.';
    } else if (!supabaseServiceRoleKey) {
      message =
        'Supabase service role key is missing. Add SUPABASE_SERVICE_ROLE_KEY so the server can manage the "reports" table.';
    }

    cachedReportsSchemaStatus = {
      ok: false,
      checkedAt: now,
      error: {
        message,
        code: error.code,
        details: error.details,
        hint: error.hint,
      },
      warning: null,
    };

    return cachedReportsSchemaStatus;
  }

  const warnings = [];

  if (missingRecommended.size > 0) {
    const recommendedList = Array.from(missingRecommended).sort();
    warnings.push(
      `Supabase 'reports' table is missing optional columns: ${recommendedList.join(
        ', '
      )}. Data will still save, but those fields will be omitted until the columns are added.`
    );
  }

  if (missingOptional.size > 0) {
    const optionalList = Array.from(missingOptional).sort();
    warnings.push(
      `Supabase 'reports' table is missing probe-only columns: ${optionalList.join(
        ', '
      )}.`
    );
  }

  cachedReportsSchemaStatus = {
    ok: true,
    checkedAt: now,
    error: null,
    warning: warnings.length > 0 ? warnings.join(' ') : null,
  };
  return cachedReportsSchemaStatus;
};

const parseEmailList = (value) =>
  value
    .split(',')
    .map((entry) => entry.trim())
    .filter(Boolean);

const staticNotificationEmails = parseEmailList(notificationEmailList);

const resend = resendApiKey ? new Resend(resendApiKey) : null;

const pickFirstRecord = (records) => {
  if (!records) {
    return null;
  }

  if (Array.isArray(records)) {
    return records[0] || null;
  }

  return records;
};

const buildEmbeddingSource = (payload = {}) => {
  const propertyDetails = payload.propertyInfo || {};
  const purchaseDetails = payload.purchaseInputs || {};
  const calculations = payload.calculations || {};
  const contact = payload.contactInfo || {};

  return {
    property_name: propertyDetails.name,
    city: propertyDetails.city,
    state: propertyDetails.state,
    num_lots:
      propertyDetails.totalLots ??
      calculations.totalUnits ??
      propertyDetails.occupiedLots ??
      calculations.occupiedUnits,
    lot_rent: calculations.lotRentIncome ?? propertyDetails.averageRent,
    home_rent:
      calculations.rentalHomeIncome ??
      calculations.totalAdditionalIncome ??
      calculations.otherIncome,
    occupancy_rate:
      propertyDetails.physicalOccupancy ??
      calculations.physicalOccupancy ??
      calculations.economicOccupancy,
    total_expenses: calculations.totalOpEx,
    noi: calculations.noi,
    cap_rate: calculations.capRate,
    loan_amount: purchaseDetails.loanAmount ?? calculations.loanAmount,
    loan_interest_rate: purchaseDetails.interestRate,
    amortization_years: purchaseDetails.amortizationYears,
    loan_maturity_balance:
      purchaseDetails.loanMaturityBalance ?? calculations.loanMaturityBalance,
    prepared_by_name: contact.name,
    prepared_by_company: contact.company,
    prepared_by_email: contact.email,
    prepared_by_phone: contact.phone,
  };
};

const maybeCreateReportEmbedding = async ({ reportRecord, payload, htmlLength }) => {
  if (!openaiClient || !supabase) {
    return;
  }

  if (!reportRecord || !reportRecord.id) {
    return;
  }

  if (typeof htmlLength === 'number' && htmlLength > 50000) {
    return;
  }

  try {
    const keyMetricsPayload = buildEmbeddingSource(payload);
    const compactText = extractKeyMetrics(keyMetricsPayload);

    if (!compactText) {
      return;
    }

    const embeddingResponse = await openaiClient.embeddings.create({
      model: 'text-embedding-3-small',
      input: compactText,
    });

    const embedding = embeddingResponse?.data?.[0]?.embedding;

    if (!Array.isArray(embedding) || embedding.length === 0) {
      return;
    }

    const nowIso = new Date().toISOString();

    const { error: deleteError } = await supabase
      .from('report_embeddings')
      .delete()
      .eq('report_id', reportRecord.id);

    if (deleteError && deleteError.code !== '42P01') {
      console.error('Failed to prune existing report embedding:', deleteError);
    }

    const { error: insertError } = await supabase.from('report_embeddings').insert([
      {
        report_id: reportRecord.id,
        embedding,
        created_at: nowIso,
      },
    ]);

    if (insertError) {
      console.error('Failed to persist report embedding:', insertError);
    }
  } catch (error) {
    console.error('Error generating report embedding:', error);
  }
};

async function handler(req, res) {
  if (req.method !== 'POST') {
    return res.status(405).json({ error: 'Method not allowed' });
  }

  try {
    const payload = req.body || {};
    const authUser = payload.authUser || {};

    if (!supabase) {
      console.error('Missing Supabase credentials.');
      return res.status(500).json({ success: false, error: 'Supabase is not configured on the server.' });
    }

    if (!payload.userId) {
      return res.status(400).json({ success: false, error: 'User ID is required to save a report.' });
    }

    const html = payload.htmlContent || payload.html || '';
    const name = payload.reportName || payload.name || 'Untitled Report';
    const metadata = payload.reportState || payload.metadata || null;

    if (html && html.length > 50000) {
      const { data, error } = await supabase
        .from('reports')
        .insert([
          {
            html,
            name,
            metadata,
            user_id: payload.userId,
            created_at: new Date().toISOString(),
          },
        ])
        .select();

      if (error) {
        console.error('Supabase insert error (large html):', error);
        return res.status(500).json({ success: false, error: error.message || 'Failed to save large report.' });
      }

      const reportRecord = pickFirstRecord(data);
      await maybeCreateReportEmbedding({ reportRecord, payload, htmlLength: html.length });

      return res.status(200).json({ success: true, data });
    }

    const schemaStatus = await ensureReportsSchema();

    if (schemaStatus.warning) {
      console.warn(schemaStatus.warning);
    }

    if (!schemaStatus.ok) {
      console.error('Supabase reports table validation failed:', schemaStatus.error);
      return res.status(500).json({ success: false, error: schemaStatus.error?.message, details: schemaStatus.error });
    }

    const ownerEmail = payload.contactInfo?.email || authUser.email || '';

    const reportState =
      payload.reportState && typeof payload.reportState === 'object'
        ? {
            ...payload.reportState,
            ownerUserId: payload.userId,
            ownerEmail,
          }
        : null;

    // Map payload → Supabase schema
    const fieldMap = {
      user_id: payload.userId,
      report_name: payload.reportName,
      report_state: reportState,
      user_name: payload.contactInfo?.name,
      user_email: ownerEmail,
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
      amortization_years: payload.purchaseInputs?.amortizationYears,
      monthly_payment: payload.purchaseInputs?.monthlyPayment,
      annual_debt_service: payload.purchaseInputs?.annualDebtService,
      interest_only_period_years: payload.purchaseInputs?.interestOnlyPeriodYears,
      interest_only_payment: payload.purchaseInputs?.interestOnlyMonthlyPayment,
      amortizing_payment: payload.purchaseInputs?.postInterestOnlyMonthlyPayment,
      loan_maturity_balance: payload.purchaseInputs?.loanMaturityBalance,
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
      expense_ratio: payload.expenseRatio,
      projection_years: payload.projectionYears,
    };

    // Prune undefined / null / empty values
    const insertData = Object.fromEntries(
      Object.entries(fieldMap).filter(([_, v]) => v !== undefined && v !== null && v !== '')
    );

    const optionalColumns = new Set(
      Object.keys(insertData).filter((column) => !REQUIRED_COLUMNS.has(column))
    );

    let skipUserIdFilter = false;

    const performPersistence = async (dataToPersist) => {
      if (payload.reportId) {
        let query = supabase
          .from('reports')
          .update(dataToPersist)
          .eq('id', payload.reportId);

        if (!skipUserIdFilter) {
          query = query.eq('user_id', payload.userId);
        }

        return query.select();
      }

      const nowIso = new Date().toISOString();
      return supabase
        .from('reports')
        .insert([{ ...dataToPersist, created_at: nowIso }])
        .select();
    };

    let data;
    let error;
    let dataToPersist = { ...insertData };

    const droppedColumns = [];

    for (let attempt = 0; attempt < optionalColumns.size + 1; attempt += 1) {
      ({ data, error } = await performPersistence(dataToPersist));

      if (!error) {
        break;
      }

      const columnFromMessage =
        error.message?.match(/column\s+"?([^"\s]+)"?/i) ||
        error.message?.match(/column\s+'?([^'\s]+)'?/i) ||
        error.details?.match(/column\s+"?([^"\s]+)"?/i) ||
        error.details?.match(/column\s+'?([^'\s]+)'?/i);

      const missingColumn = sanitizeColumnName(columnFromMessage?.[1]);

      if (error.code !== '42703' || !missingColumn) {
        break;
      }

      let handled = false;

      if (missingColumn === 'user_id' && payload.reportId && !skipUserIdFilter) {
        console.warn(
          'Supabase reports table is missing the "user_id" column used for ownership filtering. Retrying update without that filter.'
        );
        skipUserIdFilter = true;
        handled = true;
      }

      if (Object.prototype.hasOwnProperty.call(dataToPersist, missingColumn)) {
        console.warn(
          `Column "${missingColumn}" is not present in Supabase. Retrying save without it.`
        );
        const { [missingColumn]: _removed, ...rest } = dataToPersist;
        dataToPersist = rest;
        optionalColumns.delete(missingColumn);
        droppedColumns.push(missingColumn);
        handled = true;
      } else {
        optionalColumns.delete(missingColumn);
      }

      if (handled) {
        continue;
      }

      break;
    }

    if (error) {
      const sanitizedError = {
        message: error.message,
        details: error.details,
        hint: error.hint,
        code: error.code,
      };

      console.error('Supabase insert error:', sanitizedError);
      return res.status(500).json({ success: false, error: error.message, details: sanitizedError });
    }

    if (droppedColumns.length > 0) {
      console.warn(
        `Saved report without unsupported columns: ${droppedColumns.sort().join(', ')}`
      );
    }

    const reportRecord = pickFirstRecord(data);
    await maybeCreateReportEmbedding({
      reportRecord,
      payload,
      htmlLength: html ? html.length : null,
    });

    // ✅ Send full HTML report in the email body
    if (resend) {
      try {
        const isSandbox =
          !process.env.RESEND_FROM_EMAIL || process.env.RESEND_FROM_EMAIL.includes('resend.dev');

        const fromEmail = isSandbox
          ? 'onboarding@resend.dev'
          : process.env.RESEND_FROM_EMAIL || 'reports@redlinecre.com';

        const fallbackRecipient = isSandbox
          ? 'boschtj@gmail.com'
          : payload.contactInfo?.email || 'reports@redlinecre.com';

        const notificationRecipients = new Set(staticNotificationEmails);
        notificationRecipients.add(fallbackRecipient);

        if (authUser.email) {
          notificationRecipients.add(authUser.email);
        }

        if (payload.contactInfo?.email) {
          notificationRecipients.add(payload.contactInfo.email);
        }

        const recipientList = Array.from(notificationRecipients).filter(Boolean);

        if (recipientList.length === 0) {
          console.warn('No notification recipients configured. Skipping email send.');
        } else {
          const propertyName = payload.propertyInfo?.name || 'Unknown Property';
          const htmlContent =
            payload.htmlContent || `<p>New report saved for ${propertyName}</p>`;

          await resend.emails.send({
            from: fromEmail,
            to: recipientList,
            subject: `New Report Saved: ${propertyName}`,
            html: htmlContent,
          });

          console.log(`✅ Email sent to ${recipientList.join(', ')} from ${fromEmail}`);
        }
      } catch (error) {
        console.error('❌ Error sending email:', error);
      }
    } else {
      console.warn('RESEND_API_KEY is not set. Notification email will not be sent.');
    }

    const responseBody = { success: true, data };

    if (schemaStatus.warning) {
      responseBody.warnings = [schemaStatus.warning];
    }

    return res.status(200).json(responseBody);
  } catch (err) {
    console.error('Handler error:', err);
    return res.status(500).json({ error: err.message });
  }
}

module.exports = handler;
module.exports.default = handler;
