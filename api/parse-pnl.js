import OpenAI from 'openai';
import pdfParse from 'pdf-parse';
import { createClient } from '@supabase/supabase-js';
import fs from 'fs';
import path from 'path';

const openaiApiKey = process.env.OPENAI_API_KEY;
const openaiClient = openaiApiKey ? new OpenAI({ apiKey: openaiApiKey }) : null;

const supabaseUrl = process.env.NEXT_PUBLIC_SUPABASE_URL;
const supabaseServiceRoleKey = process.env.SUPABASE_SERVICE_ROLE_KEY;
const supabase =
  supabaseUrl && supabaseServiceRoleKey
    ? createClient(supabaseUrl, supabaseServiceRoleKey)
    : null;

const categoryMapPath = path.resolve(process.cwd(), 'config', 'category_map.json');
let categoryMap = {};
try {
  if (fs.existsSync(categoryMapPath)) {
    const raw = fs.readFileSync(categoryMapPath, 'utf-8');
    const parsed = JSON.parse(raw);
    if (parsed && typeof parsed === 'object') {
      categoryMap = parsed;
    }
  }
} catch (error) {
  console.warn('Unable to load category map configuration:', error);
}

const MONTH_HEADERS = /^(jan|feb|mar|apr|may|jun|jul|aug|sep|oct|nov|dec)$/i;

const SUMMARY_TERMS = /(total|subtotal|grand|net)/i;
const SUMMARY_COLUMN = /^(ytd|total|grand\s+total)$/i;

const STRUCTURED_SYSTEM_PROMPT =
  'Extract structured Profit & Loss data from text into JSON format with income, expense, other expense, and net income totals. Identify account level rows only.';

const STRUCTURED_SCHEMA = {
  type: 'object',
  additionalProperties: false,
  properties: {
    income: {
      type: 'array',
      items: {
        type: 'object',
        additionalProperties: false,
        properties: {
          label: { type: 'string' },
          amount: { type: 'number' },
        },
        required: ['label', 'amount'],
      },
    },
    expense: {
      type: 'array',
      items: {
        type: 'object',
        additionalProperties: false,
        properties: {
          label: { type: 'string' },
          amount: { type: 'number' },
        },
        required: ['label', 'amount'],
      },
    },
    other_expense: {
      type: 'array',
      items: {
        type: 'object',
        additionalProperties: false,
        properties: {
          label: { type: 'string' },
          amount: { type: 'number' },
        },
        required: ['label', 'amount'],
      },
    },
    net_income: { type: 'number' },
  },
  required: ['income', 'expense'],
};

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

function normaliseLabelKey(label = '') {
  return label.toLowerCase().trim();
}

function mapCategoryLabel(label = '') {
  const normalized = normaliseLabelKey(label);
  if (!normalized) {
    return null;
  }

  for (const [category, synonyms] of Object.entries(categoryMap)) {
    if (!synonyms || !Array.isArray(synonyms)) {
      continue;
    }

    if (normaliseLabelKey(category) && normalized.includes(normaliseLabelKey(category))) {
      return category;
    }

    const matched = synonyms.some((syn) => normalized.includes(normaliseLabelKey(syn)));
    if (matched) {
      return category;
    }
  }

  return null;
}

function buildResponsePayload(merged = {}, text = '') {
  const safeList = (items) => {
    if (!Array.isArray(items)) {
      if (items && typeof items === 'object') {
        return Object.entries(items)
          .map(([label, amount]) => ({ label, amount: Number(amount) }))
          .filter((entry) => entry.label && Number.isFinite(entry.amount));
      }
      return [];
    }

    return items
      .map((entry) => ({
        label: entry?.label,
        amount: Number(entry?.amount),
      }))
      .filter((entry) => entry.label && Number.isFinite(entry.amount));
  };

  const incomeList = safeList(merged?.income?.individual_items);
  const expenseList = safeList(merged?.expense?.individual_items);
  const otherList = safeList(merged?.other_expense?.individual_items);

  if (incomeList.length === 0 && text?.length > 200) {
    const fallback = extractFallbackRows(text);
    fallback.forEach((row) => {
      if (/4\d{3}/.test(row.label)) {
        incomeList.push({ label: row.label, amount: row.amount });
      } else {
        expenseList.push({ label: row.label, amount: row.amount });
      }
    });
  }

  if (otherList.length > 0) {
    otherList.forEach((row) => {
      expenseList.push({ label: row.label, amount: row.amount });
    });
  }

  const annotateList = (list, section) => {
    return list.map((entry) => {
      const suggestion = mapCategoryLabel(entry.label);
      return {
        ...entry,
        suggestedCategory: suggestion || null,
        section,
      };
    });
  };

  const annotatedIncome = annotateList(incomeList, 'income');
  const annotatedExpense = annotateList(expenseList, 'expense');

  const incomeTotal =
    merged?.income?.total_income ??
    annotatedIncome.reduce((sum, entry) => sum + (entry.amount || 0), 0);
  const expenseTotal =
    merged?.expense?.total_expense ??
    annotatedExpense.reduce((sum, entry) => sum + (entry.amount || 0), 0);
  const netIncome =
    merged?.net_income ??
    annotatedIncome.reduce((sum, entry) => sum + (entry.amount || 0), 0) -
      annotatedExpense.reduce((sum, entry) => sum + (entry.amount || 0), 0);

  const categorySuggestions = {};
  const unmapped = [];

  const addSuggestions = (list) => {
    for (const entry of list) {
      const key = normaliseLabelKey(entry.label);
      if (!key) {
        continue;
      }
      if (entry.suggestedCategory) {
        categorySuggestions[key] = {
          category: entry.suggestedCategory,
          source: 'synonym',
        };
      } else {
        unmapped.push(entry.label);
      }
    }
  };

  addSuggestions(annotatedIncome);
  addSuggestions(annotatedExpense);

  const payload = {
    income: {
      total_income: incomeTotal,
      individual_items: annotatedIncome.map(({ suggestedCategory, section, ...rest }) => rest),
    },
    expense: {
      total_expense: expenseTotal,
      individual_items: annotatedExpense.map(({ suggestedCategory, section, ...rest }) => rest),
    },
    net_income: Number.isFinite(netIncome) ? netIncome : 0,
    category_suggestions: categorySuggestions,
    unmapped,
  };

  return {
    payload,
    categorySuggestions,
    unmapped,
    annotated: { income: annotatedIncome, expense: annotatedExpense },
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

function countLineItems(result = {}) {
  const categories = ['income', 'expense', 'other_expense'];
  return categories.reduce((count, key) => {
    const items = result?.[key]?.individual_items;
    if (items && typeof items === 'object') {
      return count + Object.keys(items).length;
    }
    return count;
  }, 0);
}

function normaliseStructuredResult(structured) {
  if (!structured || typeof structured !== 'object') {
    return null;
  }

  const categories = [
    { key: 'income', totalKey: 'total_income' },
    { key: 'expense', totalKey: 'total_expense' },
    { key: 'other_expense', totalKey: 'total_other_expense' },
  ];

  const normalised = {
    income: { individual_items: {}, total_income: 0 },
    expense: { individual_items: {}, total_expense: 0 },
    other_expense: { individual_items: {}, total_other_expense: 0 },
    net_income: 0,
  };

  for (const { key, totalKey } of categories) {
    const rows = Array.isArray(structured[key]) ? structured[key] : [];
    for (const row of rows) {
      if (!row || typeof row !== 'object') {
        continue;
      }
      const label = row.label || row.name;
      const value = Number(row.amount ?? row.value);
      if (!label || !Number.isFinite(value)) {
        continue;
      }
      normalised[key].individual_items[label] =
        (normalised[key].individual_items[label] || 0) + value;
    }

    const totals = Object.values(normalised[key].individual_items);
    normalised[key][totalKey] = totals.reduce((sum, amount) => sum + amount, 0);
  }

  if (Number.isFinite(structured.net_income)) {
    normalised.net_income = structured.net_income;
  } else {
    normalised.net_income =
      normalised.income.total_income -
      normalised.expense.total_expense -
      normalised.other_expense.total_other_expense;
  }

  return normalised;
}

function mergeParsedResults(primary, secondary) {
  if (!primary && !secondary) {
    return null;
  }
  if (!primary) {
    return secondary;
  }
  if (!secondary) {
    return primary;
  }

  const categories = [
    { key: 'income', totalKey: 'total_income' },
    { key: 'expense', totalKey: 'total_expense' },
    { key: 'other_expense', totalKey: 'total_other_expense' },
  ];

  const merged = {
    income: { individual_items: {}, total_income: 0 },
    expense: { individual_items: {}, total_expense: 0 },
    other_expense: { individual_items: {}, total_other_expense: 0 },
    net_income: 0,
  };

  const incorporate = (source) => {
    for (const { key, totalKey } of categories) {
      const items = source?.[key]?.individual_items;
      if (!items || typeof items !== 'object') {
        continue;
      }
      for (const [label, value] of Object.entries(items)) {
        if (!label || !Number.isFinite(Number(value))) {
          continue;
        }
        merged[key].individual_items[label] =
          (merged[key].individual_items[label] || 0) + Number(value);
      }
      const totals = Object.values(merged[key].individual_items);
      merged[key][totalKey] = totals.reduce((sum, amount) => sum + amount, 0);
    }

    if (Number.isFinite(source?.net_income)) {
      merged.net_income = source.net_income;
    }
  };

  incorporate(primary);
  incorporate(secondary);

  if (!Number.isFinite(merged.net_income)) {
    merged.net_income =
      merged.income.total_income -
      merged.expense.total_expense -
      merged.other_expense.total_other_expense;
  }

  return merged;
}

async function callStructuredExtraction(text) {
  if (!text || !openaiClient) {
    return null;
  }

  try {
    const response = await openaiClient.responses.create({
      model: 'gpt-4.1-mini',
      input: [
        {
          role: 'system',
          content: [{ type: 'input_text', text: STRUCTURED_SYSTEM_PROMPT }],
        },
        {
          role: 'user',
          content: [{ type: 'input_text', text }],
        },
      ],
      text: {
        format: {
          name: 'PnLStructuredExtraction',
          type: 'json_schema',
          schema: STRUCTURED_SCHEMA,
        },
      },
    });

    const rawOutput = response.output_text?.trim() ||
      response.output?.[0]?.content?.[0]?.text?.trim();

    if (!rawOutput) {
      return null;
    }

    const parsed = JSON.parse(rawOutput);
    return normaliseStructuredResult(parsed);
  } catch (error) {
    console.warn('Structured P&L extraction failed:', error);
    return null;
  }
}

async function fetchEmbeddingSuggestions(labels) {
  if (!labels || labels.length === 0 || !openaiClient || !supabase) {
    return {};
  }

  try {
    const uniqueLabels = Array.from(new Set(labels.filter(Boolean)));
    if (uniqueLabels.length === 0) {
      return {};
    }

    const embeddingResponse = await openaiClient.embeddings.create({
      model: 'text-embedding-3-small',
      input: uniqueLabels,
    });

    const suggestions = {};

    await Promise.all(
      uniqueLabels.map(async (label, index) => {
        const embedding = embeddingResponse.data?.[index]?.embedding;
        if (!embedding) {
          return;
        }

        try {
          const { data, error } = await supabase.rpc('match_label_embedding', {
            query_embedding: embedding,
            match_threshold: 0.85,
            match_count: 1,
          });

          if (error) {
            console.warn('Supabase embedding match error:', error);
            return;
          }

          if (Array.isArray(data) && data.length > 0) {
            const match = data[0];
            if (match?.mapped_category) {
              suggestions[normaliseLabelKey(label)] = {
                category: match.mapped_category,
                source: 'embedding',
                score: match.similarity ?? null,
              };
            }
          }
        } catch (matchError) {
          console.warn('Unable to fetch embedding match for label:', label, matchError);
        }
      })
    );

    return suggestions;
  } catch (error) {
    console.warn('Unable to compute embedding suggestions:', error);
    return {};
  }
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

async function performOcrFallback(fileBase64, filename = 'pnl.pdf') {
  ensureClient();

  try {
    const buffer = Buffer.from(fileBase64, 'base64');
    const uploaded = await openaiClient.files.create({
      file: {
        content: buffer,
        filename,
      },
      purpose: 'vision',
    });

    const response = await openaiClient.responses.create({
      model: 'gpt-4o',
      input: [
        {
          role: 'system',
          content: [
            {
              type: 'input_text',
              text: 'You are an OCR assistant that extracts all text from financial statements in correct order.',
            },
          ],
        },
        {
          role: 'user',
          content: [
            { type: 'input_text', text: 'Extract text from all pages of this PDF.' },
            { type: 'input_file', file_id: uploaded.id },
          ],
        },
      ],
    });

    const output = response.output_text?.trim() || response.output?.[0]?.content?.[0]?.text?.trim();

    try {
      await openaiClient.files.del(uploaded.id);
    } catch (cleanupError) {
      console.warn('Unable to clean up OCR file:', cleanupError);
    }

    return output || '';
  } catch (error) {
    console.warn('OCR fallback failed:', error);
    return '';
  }
}

export default async function handler(req, res) {
  if (req.method !== 'POST') {
    res.setHeader('Allow', ['POST']);
    res.status(405).json({ success: false, error: 'Method not allowed' });
    return;
  }

  try {
    const startTime = Date.now();
    const { file, filename } = req.body || {};
    if (!file || !filename) {
      res.status(400).json({ success: false, error: 'Missing file payload.' });
      return;
    }

    const buffer = Buffer.from(file, 'base64');
    let text = await extractTextFromFile(buffer, filename);

    if (!text || text.length < 200) {
      text = await performOcrFallback(file, filename);
    }

    if (!text || text.length === 0) {
      res.status(422).json({ success: false, error: 'Unable to extract text from document.' });
      return;
    }

    text = normalizeText(text);

    if (text.split('\n').length < 5) {
      console.warn('⚠️ Detected short or malformed P&L text, forcing OCR fallback');
      const ocrText = await performOcrFallback(file, filename);
      if (ocrText && ocrText.length > 0) {
        text = normalizeText(ocrText);
      }
    }

    const fallbackRows = extractFallbackRows(text);
    const structuredResult = await callStructuredExtraction(text);
    const parsed = parsePnlText(text);

    let merged = parsed;
    let extractionStrategy = 'rule-parser';
    let modelUsed = 'rule-parser';
    let modelConfidence = 0.65;

    const structuredCount = countLineItems(structuredResult);
    const ruleCount = countLineItems(parsed);

    if (structuredResult && structuredCount > 0) {
      merged = mergeParsedResults(parsed, structuredResult);
      extractionStrategy = 'structured-hybrid';
      modelUsed = 'gpt-4.1-mini + rules';
      modelConfidence = 0.85;
    }

    if ((!merged || countLineItems(merged) === 0) && structuredResult) {
      merged = structuredResult;
    }

    let fallbackCount = 0;
    if (fallbackRows.length > 0) {
      const fallbackParsed = buildFallbackResult(fallbackRows);
      fallbackCount = countLineItems(fallbackParsed);
      if (fallbackCount > 0) {
        merged = mergeParsedResults(merged, fallbackParsed);
        if (extractionStrategy === 'rule-parser' && fallbackRows.length > 10) {
          extractionStrategy = 'fallback-regex';
          modelUsed = 'fallback-regex';
          modelConfidence = 0.6;
        } else {
          modelConfidence = Math.max(modelConfidence, 0.7);
        }
      }
    }

    if (!merged || countLineItems(merged) === 0) {
      res.status(422).json({ success: false, error: 'No valid P&L line items detected.' });
      return;
    }

    const { payload, categorySuggestions, annotated } = buildResponsePayload(merged, text);

    const embeddingLabels = [...annotated.income, ...annotated.expense].map((entry) => entry.label);
    const embeddingSuggestions = await fetchEmbeddingSuggestions(embeddingLabels);

    const combinedSuggestions = { ...categorySuggestions, ...embeddingSuggestions };
    const finalUnmapped = [];

    for (const entry of [...annotated.income, ...annotated.expense]) {
      const key = normaliseLabelKey(entry.label);
      if (!combinedSuggestions[key]) {
        finalUnmapped.push(entry.label);
      }
    }

    payload.category_suggestions = combinedSuggestions;
    payload.unmapped = Array.from(new Set(finalUnmapped));

    const parseDuration = Date.now() - startTime;
    const confidenceScore = Number(modelConfidence.toFixed(2));

    const metadata = {
      income_items: payload.income.individual_items.length,
      expense_items: payload.expense.individual_items.length,
      source_filename: filename,
      parse_time_ms: parseDuration,
      file_length: text.length,
      extraction_strategy: extractionStrategy,
      confidence_score: confidenceScore,
      structured_rows: structuredCount,
      rule_rows: ruleCount,
      fallback_rows: fallbackCount,
      category_suggestions: combinedSuggestions,
      unmapped_count: payload.unmapped.length,
    };

    if (supabase) {
      try {
        await supabase.from('parsed_pnls').insert({
          filename,
          parsed_json: payload,
          metadata,
          parsed_at: new Date().toISOString(),
          model_used: modelUsed,
          version: 2,
          raw_text: text,
          model_confidence: confidenceScore,
          ai_extraction: structuredResult,
        });
      } catch (storageError) {
        console.error('Unable to persist parsed P&L payload:', storageError);
      }
    } else {
      console.warn('Supabase client not available; skipping parsed P&L persistence.');
    }

    res.status(200).json({ success: true, data: payload, metadata });
  } catch (error) {
    console.error('Error parsing P&L:', error);
    const statusCode = error?.statusCode || 500;
    res.status(statusCode).json({ success: false, error: error.message || 'Unexpected error while parsing P&L.' });
  }
}
