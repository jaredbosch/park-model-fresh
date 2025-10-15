import OpenAI from 'openai';
import pdfParse from 'pdf-parse';

const openaiApiKey = process.env.OPENAI_API_KEY;
const openaiClient = openaiApiKey ? new OpenAI({ apiKey: openaiApiKey }) : null;

const SYSTEM = `
You extract profit and loss statements from text. Return STRICT JSON ONLY, no prose.

Absolutely do not infer or fabricate fields. If a field is missing in the source, omit it.

Some communities label income and expense lines inconsistently. Preserve the original labels when returning results.

JSON must match the provided schema exactly.

Income and expense line items must use the amounts shown in the source. Do not sum or derive new totals beyond what is present in the document.
`;

const JSON_SCHEMA = {
  type: 'object',
  additionalProperties: false,
  properties: {
    income: {
      type: 'object',
      additionalProperties: false,
      properties: {
        total_income: { type: 'number' },
        individual_items: {
          type: 'object',
          additionalProperties: { type: 'number' },
        },
      },
      required: ['total_income'],
    },
    expense: {
      type: 'object',
      additionalProperties: false,
      properties: {
        total_expense: { type: 'number' },
        individual_items: {
          type: 'object',
          additionalProperties: { type: 'number' },
        },
      },
      required: ['total_expense'],
    },
    net_income: { type: 'number' },
  },
  required: ['income', 'expense', 'net_income'],
};

const UNMAPPED_TOTAL_KEYS = new Set(['total', 'totals', 'grand total', 'net income', 'net']);

const MAX_CHARS_PER_CHUNK = 9000;

const MONTH_TOKEN_REGEX = /^(jan(?:uary)?|feb(?:ruary)?|mar(?:ch)?|apr(?:il)?|may|jun(?:e)?|jul(?:y)?|aug(?:ust)?|sep(?:tember)?|oct(?:ober)?|nov(?:ember)?|dec(?:ember)?)(?:\s|[-\/\'’])?\d{0,4}$/i;

function parseDelimitedRow(line) {
  if (!line) {
    return null;
  }

  const trimmed = line.trim();
  if (!trimmed) {
    return [];
  }

  if (trimmed.includes(',')) {
    return trimmed
      .split(',')
      .map((cell) => cell.trim())
      .filter((cell) => cell.length > 0);
  }

  const tabSplit = trimmed.split(/\t+/);
  if (tabSplit.length > 1) {
    return tabSplit.map((cell) => cell.trim()).filter((cell) => cell.length > 0);
  }

  const spaceSplit = trimmed.split(/\s{2,}/);
  if (spaceSplit.length > 1) {
    return spaceSplit.map((cell) => cell.trim()).filter((cell) => cell.length > 0);
  }

  return [trimmed];
}

function isMonthToken(token) {
  if (!token) {
    return false;
  }
  return MONTH_TOKEN_REGEX.test(token.trim());
}

function isMonthlyHeader(cells) {
  if (!cells || cells.length < 3) {
    return false;
  }

  let monthCount = 0;
  for (let index = 1; index < cells.length; index += 1) {
    if (isMonthToken(cells[index])) {
      monthCount += 1;
    }
  }

  return monthCount >= 3;
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
  const sanitized = trimmed
    .replace(/\((.*)\)/, '$1')
    .replace(/[^0-9.,-]/g, '')
    .replace(/,/g, '');

  if (!sanitized) {
    return null;
  }

  const value = Number.parseFloat(sanitized);
  if (!Number.isFinite(value)) {
    return null;
  }

  if (hasParens || hasTrailingMinus) {
    return value > 0 ? -value : value;
  }

  return value;
}

function collapseMonthlyRecapTables(text) {
  if (!text) {
    return text;
  }

  const lines = text.split(/\r?\n/);
  const output = [];

  for (let index = 0; index < lines.length; index += 1) {
    const line = lines[index];
    const row = parseDelimitedRow(line);

    if (row && row.length >= 3 && isMonthlyHeader(row)) {
      // skip header row, process following account lines until break condition
      while (index + 1 < lines.length) {
        const nextLine = lines[index + 1];
        const nextRow = parseDelimitedRow(nextLine);

        if (!nextLine.trim()) {
          index += 1;
          output.push('');
          break;
        }

        if (!nextRow || nextRow.length < 2 || isMonthlyHeader(nextRow)) {
          break;
        }

        const label = nextRow[0]?.trim();
        if (!label || isMonthToken(label)) {
          index += 1;
          continue;
        }

        let amount = null;
        for (let cellIndex = nextRow.length - 1; cellIndex >= 1; cellIndex -= 1) {
          const numeric = parseNumericValue(nextRow[cellIndex]);
          if (Number.isFinite(numeric)) {
            amount = numeric;
            break;
          }
        }

        if (!Number.isFinite(amount)) {
          index += 1;
          continue;
        }

        const amountString = Number.isInteger(amount) ? String(amount) : amount.toFixed(2);
        output.push(`${label}: ${amountString}`);
        index += 1;
      }

      continue;
    }

    output.push(line);
  }

  return output.join('\n');
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
    } catch (err) {
      console.warn('Unable to parse PDF text, falling back to OCR:', err);
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

function splitIntoChunks(text) {
  if (!text) {
    return [];
  }

  const chunks = [];
  for (let index = 0; index < text.length; index += MAX_CHARS_PER_CHUNK) {
    chunks.push(text.slice(index, index + MAX_CHARS_PER_CHUNK));
  }
  return chunks;
}

async function parseChunk(chunk) {
  ensureClient();

  const prompt = `Extract rows from this P&L statement text. Return JSON that conforms to the following schema:\n${JSON.stringify(
    JSON_SCHEMA
  )}\n\nText:\n${chunk}`;

  const response = await openaiClient.responses.create({
    model: 'gpt-4.1-mini',
    input: [
      {
        role: 'system',
        content: [
          {
            type: 'input_text',
            text: SYSTEM,
          },
        ],
      },
      {
        role: 'user',
        content: [
          {
            type: 'input_text',
            text: prompt,
          },
        ],
      },
    ],
    text: {
      format: {
        name: 'PnLExtraction',
        type: 'json_schema',
        schema: JSON_SCHEMA,
      },
    },
  });

  const outputText = response.output?.[0]?.content?.[0]?.text || '';

  if (!outputText) {
    throw new Error('Unexpected response format from OpenAI for P&L parsing.');
  }

  try {
    return JSON.parse(outputText);
  } catch (err) {
    console.error('Unable to parse OpenAI P&L JSON:', err);
    return null;
  }
}

function mergeChunkResults(results) {
  const merged = {
    income: {
      individual_items: {},
      total_income: 0,
    },
    expense: {
      individual_items: {},
      total_expense: 0,
    },
    net_income: null,
  };

  results.forEach((result) => {
    if (!result || typeof result !== 'object') {
      return;
    }

    const incomeItems = result.income?.individual_items || {};
    Object.entries(incomeItems).forEach(([label, value]) => {
      const trimmedLabel = label?.trim();
      const numericValue = Number(value);
      if (!trimmedLabel || !Number.isFinite(numericValue)) {
        return;
      }
      if (UNMAPPED_TOTAL_KEYS.has(trimmedLabel.toLowerCase())) {
        return;
      }
      merged.income.individual_items[trimmedLabel] = (merged.income.individual_items[trimmedLabel] || 0) + numericValue;
    });

    const expenseItems = result.expense?.individual_items || {};
    Object.entries(expenseItems).forEach(([label, value]) => {
      const trimmedLabel = label?.trim();
      const numericValue = Number(value);
      if (!trimmedLabel || !Number.isFinite(numericValue)) {
        return;
      }
      if (UNMAPPED_TOTAL_KEYS.has(trimmedLabel.toLowerCase())) {
        return;
      }
      merged.expense.individual_items[trimmedLabel] = (merged.expense.individual_items[trimmedLabel] || 0) + numericValue;
    });

    if (Number.isFinite(Number(result.income?.total_income))) {
      merged.income.total_income += Number(result.income.total_income);
    }
    if (Number.isFinite(Number(result.expense?.total_expense))) {
      merged.expense.total_expense += Number(result.expense.total_expense);
    }
    if (Number.isFinite(Number(result.net_income))) {
      merged.net_income = Number(result.net_income);
    }
  });

  const incomeValues = Object.values(merged.income.individual_items);
  const expenseValues = Object.values(merged.expense.individual_items);

  if (!merged.income.total_income && incomeValues.length > 0) {
    merged.income.total_income = incomeValues.reduce((sum, value) => sum + value, 0);
  }
  if (!merged.expense.total_expense && expenseValues.length > 0) {
    merged.expense.total_expense = expenseValues.reduce((sum, value) => sum + value, 0);
  }
  if (merged.net_income === null && incomeValues.length > 0 && expenseValues.length > 0) {
    merged.net_income = merged.income.total_income - merged.expense.total_expense;
  }

  return merged;
}

function sortItemsDescending(items) {
  return items
    .slice()
    .sort((a, b) => {
      if (b.amount === a.amount) {
        return a.label.localeCompare(b.label);
      }
      return b.amount - a.amount;
    });
}

function normaliseItems(rawItems = {}) {
  return Object.entries(rawItems)
    .map(([label, value]) => ({
      label: label.trim(),
      amount: Number(value),
    }))
    .filter((item) => item.label && Number.isFinite(item.amount));
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

    text = collapseMonthlyRecapTables(text);

    if (!text || text.length === 0) {
      res.status(422).json({ success: false, error: 'Unable to extract text from document.' });
      return;
    }

    const chunks = splitIntoChunks(text);
    if (chunks.length === 0) {
      res.status(422).json({ success: false, error: 'No readable text found in document.' });
      return;
    }

    const parsedChunks = await Promise.all(chunks.map((chunk) => parseChunk(chunk)));
    const hasValidChunk = parsedChunks.some((result) => result && typeof result === 'object');
    if (!hasValidChunk) {
      throw new Error('Failed to parse AI response for P&L document.');
    }

    const merged = mergeChunkResults(parsedChunks);

    const incomeItems = sortItemsDescending(normaliseItems(merged.income.individual_items));
    const expenseItems = sortItemsDescending(normaliseItems(merged.expense.individual_items));

    const payload = {
      income: {
        total_income: merged.income.total_income || 0,
        individual_items: incomeItems,
      },
      expense: {
        total_expense: merged.expense.total_expense || 0,
        individual_items: expenseItems,
      },
      net_income: Number.isFinite(merged.net_income) ? merged.net_income : merged.income.total_income - merged.expense.total_expense,
    };

    res.status(200).json({ success: true, data: payload });
  } catch (error) {
    console.error('Error parsing P&L:', error);
    const statusCode = error?.statusCode || 500;
    res.status(statusCode).json({ success: false, error: error.message || 'Unexpected error while parsing P&L.' });
  }
}
