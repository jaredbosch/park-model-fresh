const { createClient } = require('@supabase/supabase-js');
const OpenAI = require('openai');
const { Resend } = require('resend');

const supabaseUrl = process.env.SUPABASE_URL;
const supabaseServiceRoleKey = process.env.SUPABASE_SERVICE_ROLE_KEY;
const openaiApiKey = process.env.OPENAI_API_KEY;
const resendApiKey = process.env.RESEND_API_KEY;
const resendFromEmail = process.env.RESEND_FROM_EMAIL || '';
const notificationEmailList = process.env.REPORT_NOTIFICATION_EMAILS || '';

const supabase =
  supabaseUrl && supabaseServiceRoleKey
    ? createClient(supabaseUrl, supabaseServiceRoleKey)
    : null;

const REQUIRED_COLUMNS = new Set();

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

  const columnsToProbe = ['id', 'report_html'];

  const { error } = await supabase
    .from('reports')
    .select(columnsToProbe.join(', '), { head: true, count: 'exact' });

  if (error) {
    const missingColumnMatch =
      error.message?.match(/column\s+"?([^"\s]+)"?/i) ||
      error.message?.match(/column\s+'?([^'\s]+)'?/i) ||
      error.details?.match(/column\s+"?([^"\s]+)"?/i) ||
      error.details?.match(/column\s+'?([^'\s]+)'?/i);

    const missingColumn = missingColumnMatch?.[1];

    if (error.code === '42703' && missingColumn === 'report_html') {
      cachedReportsSchemaStatus = {
        ok: true,
        checkedAt: now,
        error: null,
        warning:
          "Supabase 'reports' table is missing the optional column \"report_html\". The raw HTML will not be stored until the column is added.",
      };

      return cachedReportsSchemaStatus;
    }

    const errorMessage =
      error.code === '42P01'
        ? "Supabase table 'reports' is missing. Create the table before saving reports."
        : missingColumn
        ? `Supabase 'reports' table is missing the required column "${missingColumn}".`
        : 'Unable to access the Supabase reports table. Check the table name and columns.';

    cachedReportsSchemaStatus = {
      ok: false,
      checkedAt: now,
      error: {
        message: errorMessage,
        code: error.code,
        details: error.details,
        hint: error.hint,
      },
      warning: null,
    };

    return cachedReportsSchemaStatus;
  }

  cachedReportsSchemaStatus = { ok: true, checkedAt: now, error: null, warning: null };
  return cachedReportsSchemaStatus;
};

const parseEmailList = (value) =>
  value
    .split(',')
    .map((entry) => entry.trim())
    .filter(Boolean);

const staticNotificationEmails = parseEmailList(notificationEmailList);

const openai = openaiApiKey ? new OpenAI({ apiKey: openaiApiKey }) : null;

const resend = resendApiKey ? new Resend(resendApiKey) : null;

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

    const schemaStatus = await ensureReportsSchema();

    if (schemaStatus.warning) {
      console.warn(schemaStatus.warning);
    }

    if (!schemaStatus.ok) {
      console.error('Supabase reports table validation failed:', schemaStatus.error);
      return res.status(500).json({ success: false, error: schemaStatus.error?.message, details: schemaStatus.error });
    }

    if (!payload.userId) {
      return res.status(400).json({ success: false, error: 'User ID is required to save a report.' });
    }

    const ownerEmail = payload.contactInfo?.email || authUser.email || '';

    // Build embedding text
    const textToEmbed = `${payload.propertyInfo?.name || ''}, ${payload.propertyInfo?.state || ''}\n${payload.htmlContent || ''}`;

    let embedding = null;
    if (textToEmbed.trim() && openai) {
      const embeddingResp = await openai.embeddings.create({
        model: 'text-embedding-3-small',
        input: textToEmbed,
      });
      embedding = embeddingResp.data[0].embedding;
    } else if (textToEmbed.trim() && !openai) {
      console.warn('OPENAI_API_KEY is not set. Embeddings will be skipped.');
    }

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
      monthly_payment: payload.purchaseInputs?.monthlyPayment,
      annual_debt_service: payload.purchaseInputs?.annualDebtService,
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
      embedding,
    };

    // Prune undefined / null / empty values
    const insertData = Object.fromEntries(
      Object.entries(fieldMap).filter(([_, v]) => v !== undefined && v !== null && v !== '')
    );

    const optionalColumns = new Set(
      Object.keys(insertData).filter((column) => !REQUIRED_COLUMNS.has(column))
    );

    const performPersistence = async (dataToPersist) => {
      if (payload.reportId) {
        return supabase
          .from('reports')
          .update(dataToPersist)
          .eq('id', payload.reportId)
          .eq('user_id', payload.userId)
          .select();
      }

      return supabase.from('reports').insert([dataToPersist]).select();
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

      let missingColumn = columnFromMessage?.[1];

      if (missingColumn?.includes('.')) {
        const parts = missingColumn.split('.');
        missingColumn = parts[parts.length - 1];
      }

      if (
        error.code !== '42703' ||
        !missingColumn ||
        !optionalColumns.has(missingColumn) ||
        !Object.prototype.hasOwnProperty.call(dataToPersist, missingColumn)
      ) {
        break;
      }

      console.warn(
        `Column "${missingColumn}" is not present in Supabase. Retrying save without it.`
      );

      const { [missingColumn]: _removed, ...rest } = dataToPersist;
      dataToPersist = rest;
      optionalColumns.delete(missingColumn);
      droppedColumns.push(missingColumn);
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

    const notificationRecipients = new Set(staticNotificationEmails);

    if (payload.contactInfo?.email) {
      notificationRecipients.add(payload.contactInfo.email);
    }

    if (authUser.email) {
      notificationRecipients.add(authUser.email);
    }

    const recipientList = Array.from(notificationRecipients);
    const shouldSendNotification = resend && recipientList.length > 0;

    if (shouldSendNotification) {
      if (!resendFromEmail) {
        console.warn(
          'RESEND_FROM_EMAIL is not set. Skipping notification email even though recipients are available.'
        );
      } else {
        const subjectPrefix = payload.reportId ? 'Updated Report' : 'New Report Saved';
        const reportLabel =
          payload.reportName || payload.propertyInfo?.name || 'Mobile Home Park Report';

        try {
          await resend.emails.send({
            from: resendFromEmail,
            to: recipientList,
            subject: `${subjectPrefix}: ${reportLabel}`,
            html:
              payload.htmlContent ||
              `<p>${subjectPrefix} for ${reportLabel}</p>`,
          });
        } catch (emailError) {
          console.error('Failed to send notification email via Resend:', emailError);
        }
      }
    } else if (!resend) {
      console.warn('RESEND_API_KEY is not set. Notification email will not be sent.');
    } else if (recipientList.length === 0) {
      console.warn('No notification recipients configured. Skipping email send.');
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
