import OpenAI from 'openai';
import pdfParse from 'pdf-parse';
import { createClient } from '@supabase/supabase-js';

const openaiApiKey = process.env.OPENAI_API_KEY;
const openaiClient = openaiApiKey ? new OpenAI({ apiKey: openaiApiKey }) : null;

const supabaseUrl = process.env.NEXT_PUBLIC_SUPABASE_URL;
const supabaseServiceRoleKey = process.env.SUPABASE_SERVICE_ROLE_KEY;
const supabase =
  supabaseUrl && supabaseServiceRoleKey
    ? createClient(supabaseUrl, supabaseServiceRoleKey)
    : null;

const MONTH_HEADERS = /^(jan|feb|mar|apr|may|jun|jul|aug|sep|oct|nov|dec)$/i;

const SUMMARY_TERMS = /(total|subtotal|grand|net)/i;
const SUMMARY_COLUMN = /^(ytd|total|grand\s+total)$/i;

function normalizeText(rawText = '') {
  return rawText
    .replace(/\r\n|\r/g, '\n')
    .replace(/[ \t]+/g, ' ')
    .replace(/\n{2,}/g, '\n')
    .trim();
}

function extractFallbackRows(text) {
  const rows = [];
  if (!text) {
    return rows;
  }

  const lines = text.split('\n');
  for (const line of lines) {
    if (!line || line.length < 5) {
      continue;
    }

    const match = line.match(
      /^([A-Za-z0-9\s&().\/-]+)\s+([-$]?\d{1,3}(?:,\d{3})*(?:\.\d{1,2})?)$/
    );
    if (!match) {
      continue;
    }

    const label = match[1].trim();
    const amount = Number.parseFloat(match[2].replace(/[^0-9.-]/g, ''));
    if (!label || Number.isNaN(amount)) {
      continue;
    }

    rows.push({ label, amount });
  }

  return rows;
}

function buildFallbackResult(fallbackRows) {
  const incomeItems = {};
  const expenseItems = {};

  for (const { label, amount } of fallbackRows) {
    if (/^4\d{3}/.test(label)) {
      incomeItems[label] = (incomeItems[label] || 0) + amount;
    } else {
      expenseItems[label] = (expenseItems[label] || 0) + amount;
    }
  }

  const incomeTotal = Object.values(incomeItems).reduce((sum, value) => sum + value, 0);
  const expenseTotal = Object.values(expenseItems).reduce((sum, value) => sum + value, 0);

  return {
    income: {
      individual_items: incomeItems,
      total_income: incomeTotal,
    },
    expense: {
      individual_items: expenseItems,
      total_expense: expenseTotal,
    },
    other_expense: {
      individual_items: {},
      total_other_expense: 0,
    },
    net_income: incomeTotal - expenseTotal,
  };
}

function isMonthColumn(text) {
  if (!text) {
    return false;
  }
  return MONTH_HEADERS.test(text.trim().slice(0, 3));
}

function isMonthLabel(text) {
  if (!text) {
    return false;
  }
  return MONTH_HEADERS.test(text.trim().slice(0, 3));
}

function parseDelimitedRow(line) {
  if (!line) {
    return null;
  }

  const trimmed = line.trim();
  if (!trimmed) {
    return [];
  }

  if (trimmed.includes('\t')) {
    return trimmed
      .split(/\t+/)
      .map((cell) => cell.trim())
      .filter((cell) => cell.length > 0);
  }

  if (trimmed.includes(',')) {
    const commaSplit = trimmed
      .split(',')
      .map((cell) => cell.trim())
      .filter((cell) => cell.length > 0);

    if (commaSplit.length > 1) {
      return commaSplit;
    }
  }

  const spaceSplit = trimmed.split(/\s{2,}/);
  if (spaceSplit.length > 1) {
    return spaceSplit.map((cell) => cell.trim()).filter((cell) => cell.length > 0);
  }

  return [trimmed];
}

function parseNumericValue(cell) {
  if (!cell) {
    return null;
  }

  const trimmed = cell.trim();
  if (!trimmed) {
    return null;
  }

  const hasParens = trimmed.includes('(') && trimmed.includes(')');
  const hasTrailingMinus = trimmed.endsWith('-');
  const sanitised = trimmed
    .replace(/\((.*)\)/, '$1')
    .replace(/[^0-9.,-]/g, '')
    .replace(/,/g, '');

  if (!sanitised) {
    return null;
  }

  const value = Number.parseFloat(sanitised);
  if (!Number.isFinite(value)) {
    return null;
  }

  if (hasParens || hasTrailingMinus) {
    return value > 0 ? -value : value;
  }

  return value;
}

function sanitiseLabel(raw = '') {
  return raw.replace(/\s+/g, ' ').replace(/[:\-]+$/, '').trim();
}

function determineCategory(label) {
  if (/^4\d{3}/.test(label)) {
    return 'income';
  }
  if (/^6\d{3}/.test(label)) {
    return 'expense';
  }
  if (/^7\d{3}/.test(label)) {
    return 'other_expense';
  }
  return 'other_expense';
}

function extractLabelAndAmount(cells, originalLine, monthlyMode) {
  if (!cells || cells.length === 0) {
    return null;
  }

  if (monthlyMode) {
    const label = cells[0];
    if (!label || isMonthLabel(label)) {
      return null;
    }

    for (let index = cells.length - 1; index >= 1; index -= 1) {
      const numeric = parseNumericValue(cells[index]);
      if (Number.isFinite(numeric)) {
        return { label, value: numeric };
      }
    }

    return null;
  }

  for (let index = cells.length - 1; index >= 0; index -= 1) {
    const numeric = parseNumericValue(cells[index]);
    if (Number.isFinite(numeric)) {
      const labelParts = cells.slice(0, index);
      let label = labelParts.join(' ').trim();

      if (!label && originalLine) {
        const numericText = cells[index];
        const numericPosition = originalLine.lastIndexOf(numericText);
        if (numericPosition !== -1) {
          label = originalLine.slice(0, numericPosition).trim();
        }
      }

      if (!label) {
        continue;
      }

      return { label, value: numeric };
    }
  }

  if (originalLine) {
    const match = originalLine.match(/^(.+?)[\s:\-]+(-?\$?[0-9][0-9,\.\-\(\)]*)$/);
    if (match) {
      const value = parseNumericValue(match[2]);
      if (Number.isFinite(value)) {
        return { label: match[1], value };
      }
    }
  }

  return null;
}

function parsePnlText(text) {
  const result = {
    income: {
      individual_items: {},
      total_income: 0,
    },
    expense: {
      individual_items: {},
      total_expense: 0,
    },
    other_expense: {
      individual_items: {},
      total_other_expense: 0,
    },
    net_income: 0,
  };

  if (!text) {
    return result;
  }

  const lines = text.split(/\r?\n/);
  let inMonthlyTable = false;

  for (const line of lines) {
    if (!line || !line.trim()) {
      inMonthlyTable = false;
      continue;
    }

    const row = parseDelimitedRow(line);
    if (!row || row.length === 0) {
      inMonthlyTable = false;
      continue;
    }

    const trimmedCells = row.map((cell) => cell.trim()).filter((cell) => cell.length > 0);
    if (trimmedCells.length === 0) {
      inMonthlyTable = false;
      continue;
    }

    const monthColumnCount = trimmedCells.slice(1).filter((cell) => isMonthColumn(cell)).length;
    const hasSummaryColumn = trimmedCells.slice(1).some((cell) => SUMMARY_COLUMN.test(cell.trim()));
    if (monthColumnCount >= 3 || (monthColumnCount >= 1 && hasSummaryColumn)) {
      inMonthlyTable = true;
      continue;
    }

    const extracted = extractLabelAndAmount(trimmedCells, line, inMonthlyTable);
    if (!extracted) {
      if (inMonthlyTable && trimmedCells.length <= 1) {
        inMonthlyTable = false;
      }
      continue;
    }

    let { label, value } = extracted;
    label = sanitiseLabel(label);

    if (!label || !Number.isFinite(value)) {
      continue;
    }

    if (isMonthLabel(label)) {
      continue;
    }

    const hasAccountNumber = /^\d{4}/.test(label);
    if (!hasAccountNumber && SUMMARY_TERMS.test(label)) {
      continue;
    }

    const category = determineCategory(label);
    result[category].individual_items[label] =
      (result[category].individual_items[label] || 0) + value;
  }

  const categoryTotals = {
    income: 'total_income',
    expense: 'total_expense',
    other_expense: 'total_other_expense',
  };

  for (const [category, totalKey] of Object.entries(categoryTotals)) {
    const values = Object.values(result[category].individual_items);
    result[category][totalKey] = values.reduce((sum, amount) => sum + amount, 0);
  }

  result.net_income =
    result.income.total_income -
    result.expense.total_expense -
    result.other_expense.total_other_expense;

  return result;
}

function ensureClient() {
  if (!openaiClient) {
    const error = new Error('OpenAI API key is not configured.');
    error.statusCode = 500;
    throw error;
  }
}

async function extractTextFromFile(buffer, filename) {
  let text = '';
  if (filename && filename.toLowerCase().endsWith('.pdf')) {
    try {
      const parsed = await pdfParse(buffer);
      text = parsed.text ? parsed.text.trim() : '';
    } catch (error) {
      console.warn('Unable to parse PDF text, falling back to OCR:', error);
    }
  } else {
    text = buffer.toString('utf-8');
  }
  return text;
}

async function performOcrFallback(fileBase64) {
  ensureClient();

  const response = await openaiClient.chat.completions.create({
    model: 'gpt-4o-mini',
    messages: [
      {
        role: 'system',
        content:
          'You are an OCR assistant for financial statements. Extract all legible text clearly and accurately.',
      },
      {
        role: 'user',
        content: [
          { type: 'text', text: 'Extract text from this P&L PDF document:' },
          { type: 'image_url', image_url: `data:application/pdf;base64,${fileBase64}` },
        ],
      },
    ],
  });

  return response.choices?.[0]?.message?.content || '';
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
    let text = await extractTextFromFile(buffer, filename);

    if (!text || text.length < 200) {
      text = await performOcrFallback(file);
    }

    if (!text || text.length === 0) {
      res.status(422).json({ success: false, error: 'Unable to extract text from document.' });
      return;
    }

    text = normalizeText(text);

    if (text.split('\n').length < 5) {
      console.warn('⚠️ Detected short or malformed P&L text, forcing OCR fallback');
      const ocrText = await performOcrFallback(file);
      if (ocrText && ocrText.length > 0) {
        text = normalizeText(ocrText);
      }
    }

    const fallbackRows = extractFallbackRows(text);

    if (fallbackRows.length > 10) {
      console.log('✅ Using fallback extraction, skipping OpenAI call');
      const parsed = buildFallbackResult(fallbackRows);

      const metadata = {
        income_items: Object.keys(parsed.income.individual_items).length,
        expense_items: Object.keys(parsed.expense.individual_items).length,
        other_expense_items: Object.keys(parsed.other_expense.individual_items).length,
        source_filename: filename,
        extraction_strategy: 'fallback-regex',
      };

      if (supabase) {
        try {
          await supabase.from('parsed_pnls').insert({
            filename,
            parsed_json: parsed,
            metadata,
            parsed_at: new Date().toISOString(),
            model_used: 'fallback-regex',
          });
        } catch (storageError) {
          console.error('Unable to persist parsed P&L payload:', storageError);
        }
      } else {
        console.warn('Supabase client not available; skipping parsed P&L persistence.');
      }

      res.status(200).json({ success: true, data: parsed, metadata });
      return;
    }

    const parsed = parsePnlText(text);

    const incomeCount = Object.keys(parsed.income.individual_items).length;
    const expenseCount = Object.keys(parsed.expense.individual_items).length;
    const otherExpenseCount = Object.keys(parsed.other_expense.individual_items).length;

    if (incomeCount === 0 && expenseCount === 0 && otherExpenseCount === 0) {
      if (fallbackRows.length > 0) {
        console.warn('⚠️ Structured parser returned no rows; using fallback extraction instead.');
        const fallbackParsed = buildFallbackResult(fallbackRows);
        const metadata = {
          income_items: Object.keys(fallbackParsed.income.individual_items).length,
          expense_items: Object.keys(fallbackParsed.expense.individual_items).length,
          other_expense_items: Object.keys(fallbackParsed.other_expense.individual_items).length,
          source_filename: filename,
          extraction_strategy: 'fallback-regex',
        };

        if (supabase) {
          try {
            await supabase.from('parsed_pnls').insert({
              filename,
              parsed_json: fallbackParsed,
              metadata,
              parsed_at: new Date().toISOString(),
              model_used: 'fallback-regex',
            });
          } catch (storageError) {
            console.error('Unable to persist parsed P&L payload:', storageError);
          }
        } else {
          console.warn('Supabase client not available; skipping parsed P&L persistence.');
        }

        res.status(200).json({ success: true, data: fallbackParsed, metadata });
        return;
      }

      res.status(422).json({ success: false, error: 'No valid P&L line items detected.' });
      return;
    }

    const metadata = {
      income_items: incomeCount,
      expense_items: expenseCount,
      other_expense_items: otherExpenseCount,
      source_filename: filename,
    };

    if (supabase) {
      try {
        await supabase.from('parsed_pnls').insert({
          filename,
          parsed_json: parsed,
          metadata,
          parsed_at: new Date().toISOString(),
          model_used: 'gpt-4.1-mini',
        });
      } catch (storageError) {
        console.error('Unable to persist parsed P&L payload:', storageError);
      }
    } else {
      console.warn('Supabase client not available; skipping parsed P&L persistence.');
    }

    res.status(200).json({ success: true, data: parsed, metadata });
  } catch (error) {
    console.error('Error parsing P&L:', error);
    const statusCode = error?.statusCode || 500;
    res.status(statusCode).json({ success: false, error: error.message || 'Unexpected error while parsing P&L.' });
  }
}
