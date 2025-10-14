import OpenAI from 'openai';
import pdfParse from 'pdf-parse';

const openaiApiKey = process.env.OPENAI_API_KEY;
const openaiClient = openaiApiKey ? new OpenAI({ apiKey: openaiApiKey }) : null;

const SYSTEM = `
You extract a rent roll from text. Return STRICT JSON ONLY, no prose.

Absolutely do not infer or fabricate fields. If a field isn't present on a row, omit it for that row.

For each row (tenant/unit/lot), return:
- lot_number: the exact numeric lot/site/unit identifier from the source, without text like "lot". KEEP leading zeros if present. Valid examples: "002", "020", "0021", "1306". INVALID: "lot 002", "space 02".
- occupied: true/false. If text indicates "vacant", "empty", "–", etc., set false; otherwise true when a tenant is listed or the status clearly indicates occupied.
- rent: the monthly base lot/space rent as a number (USD). DO NOT include utilities, taxes, insurance, fees, or "Total". Prefer a column named "RC", "Base Rent", "Lot Rent", "Space Rent", "Rent" (in that order). Only if NONE exist, leave rent absent for that row.
- tenant (optional): string tenant name as shown; if empty row or vacant, omit.

NEVER use a "Total" column or sum multiple charges. Ignore Water, Utilities, Taxes, Insurance, Fees, and similar.

Rows must map only to actual units/lots/sites.
No auto-incrementing. No guessing.
`;

const JSON_SCHEMA = {
  type: 'object',
  properties: {
    rows: {
      type: 'array',
      items: {
        type: 'object',
        properties: {
          lot_number: { type: 'string', pattern: '^[0-9]{1,4}$' },
          occupied: { type: 'boolean' },
          rent: { type: 'number' },
          tenant: { type: 'string' },
        },
        required: ['lot_number', 'occupied'],
      },
    },
  },
  required: ['rows'],
};

function normalizeLot(lotRaw) {
  if (!lotRaw) {
    return null;
  }

  const stringValue = String(lotRaw).trim();
  if (!stringValue) {
    return null;
  }

  const match = stringValue.match(/(\d{1,4})$/);
  if (!match) {
    return null;
  }

  const rawDigits = match[1];
  const display = rawDigits.padStart(3, '0');
  const numeric = parseInt(rawDigits, 10);

  if (!Number.isFinite(numeric)) {
    return null;
  }

  return { display, numeric, original: stringValue };
}

function validateRows(rows) {
  const warnings = [];
  const duplicateLots = new Set();
  const missingRentLots = new Set();
  let missingRentRowCount = 0;

  const seen = new Map();
  rows.forEach((row) => {
    const key = row.lotNumber;
    seen.set(key, (seen.get(key) || 0) + 1);
    if (seen.get(key) > 1) {
      duplicateLots.add(key);
    }

    if (row.occupied && (row.rent === null || row.rent === undefined)) {
      missingRentLots.add(key);
      missingRentRowCount += 1;
    }
  });

  if (duplicateLots.size > 0) {
    warnings.push({
      code: 'duplicate_lots',
      message: `Duplicate lot numbers detected: ${Array.from(duplicateLots).join(', ')}`,
      severity: 'warning',
    });
  }

  if (missingRentRowCount > 0) {
    warnings.push({
      code: 'missing_rent',
      message: `${missingRentRowCount} occupied row(s) lack rent. Check RC/Base Rent/Space Rent columns in the source.`,
      severity: 'warning',
    });
  }

  const numericLots = rows
    .map((row) => row.lotNumeric)
    .filter((value) => Number.isFinite(value))
    .sort((a, b) => a - b);

  let includeSequenceWarning = false;

  if (numericLots.length >= 3) {
    const totalLots = rows.length;
    const uniqueLots = Array.from(new Set(numericLots));
    const minLot = uniqueLots[0];
    const maxLot = uniqueLots[uniqueLots.length - 1];
    const expectedRange = maxLot - minLot + 1;
    let missingCount = 0;
    let largeGapDetected = false;

    for (let index = 1; index < uniqueLots.length; index += 1) {
      const gap = uniqueLots[index] - uniqueLots[index - 1];
      if (gap > 1) {
        missingCount += gap - 1;
      }
      if (gap > 10) {
        largeGapDetected = true;
      }
    }

    const missingRatio = expectedRange > 0 ? missingCount / expectedRange : 0;
    if ((missingRatio > 0.2 || largeGapDetected) && totalLots >= 200) {
      includeSequenceWarning = true;
    }
  }

  if (includeSequenceWarning) {
    warnings.push({
      code: 'non_sequential',
      message: 'Non-sequential lot numbers detected. This may be normal, but review for missing rows.',
      severity: 'info',
    });
  }

  return {
    warnings,
    duplicateLots,
    missingRentLots,
  };
}

function computeSummaryStats(rows = [], warnings = []) {
  const totalLots = rows.length;
  const occupiedLots = rows.filter((row) => row.occupied).length;

  const rents = rows
    .filter((row) => row.occupied && typeof row.rent === 'number' && Number.isFinite(row.rent))
    .map((row) => row.rent);

  const averageRent = rents.length
    ? Math.round(rents.reduce((sum, rent) => sum + rent, 0) / rents.length)
    : null;

  const monthlyIncome = rents.reduce((sum, rent) => sum + rent, 0);
  const totalAnnualIncome = Math.round(monthlyIncome * 12);
  const vacantLots = totalLots - occupiedLots;
  const vacancyRate = totalLots > 0 ? Number(((vacantLots / totalLots) * 100).toFixed(1)) : 0;
  const occupancyRate = totalLots > 0 ? Number(((occupiedLots / totalLots) * 100).toFixed(1)) : 0;

  const rentFrequency = new Map();
  rents.forEach((rent) => {
    rentFrequency.set(rent, (rentFrequency.get(rent) || 0) + 1);
  });

  let modeRent = null;
  let highestFrequency = 0;
  rentFrequency.forEach((count, rent) => {
    if (count > highestFrequency) {
      highestFrequency = count;
      modeRent = rent;
    }
  });

  return {
    totalLots,
    occupiedLots,
    averageRent,
    modeRent,
    totalAnnualIncome,
    vacancyRate,
    occupancyRate,
    warnings,
  };
}
export default async function handler(req, res) {
  if (req.method !== 'POST') {
    res.setHeader('Allow', 'POST');
    return res.status(405).json({ success: false, error: 'Method not allowed' });
  }

  if (!openaiClient) {
    return res.status(500).json({ success: false, error: 'OpenAI API key is not configured.' });
  }

  try {
    const { file, filename } = req.body || {};

    if (!file || !filename) {
      return res
        .status(400)
        .json({ success: false, error: 'Missing file payload or filename for rent roll parsing.' });
    }

    const buffer = Buffer.from(file, 'base64');
    let text = '';

    if (filename.toLowerCase().endsWith('.pdf')) {
      const pdfData = await pdfParse(buffer);
      text = pdfData.text?.trim() || '';
    } else {
      text = buffer.toString('utf-8');
    }

    if (!text || text.length < 200) {
      const base64Image = `data:application/pdf;base64,${file}`;
      const ocrResponse = await openaiClient.chat.completions.create({
        model: 'gpt-4o-mini',
        messages: [
          {
            role: 'system',
            content: 'You are an OCR assistant for rent roll documents. Extract all visible text clearly.',
          },
          {
            role: 'user',
            content: [
              { type: 'text', text: 'Extract text from this rent roll PDF:' },
              { type: 'image_url', image_url: base64Image },
            ],
          },
        ],
      });
      text = ocrResponse.choices?.[0]?.message?.content || '';
    }

    if (!text) {
      throw new Error('No text could be extracted from the provided file.');
    }

    const lines = text.split(/\r?\n/);
    const totalValues = [];
    lines.forEach((line) => {
      if (!/total/i.test(line)) {
        return;
      }
      const matches = line.match(/[-+]?[0-9]{1,3}(?:,[0-9]{3})*(?:\.[0-9]{2})?|[-+]?[0-9]+(?:\.[0-9]{2})?/g);
      if (!matches) {
        return;
      }
      matches.forEach((match) => {
        const numericString = match.replace(/[^0-9.\-]/g, '');
        if (!numericString) {
          return;
        }
        const value = Number(numericString);
        if (Number.isFinite(value)) {
          totalValues.push(value);
        }
      });
    });

    const chunks = [];
    for (let index = 0; index < text.length; index += 10000) {
      chunks.push(text.slice(index, index + 10000));
    }

    const nonEmptyChunks = chunks.filter((chunk) => chunk.trim().length > 0);
    if (nonEmptyChunks.length === 0) {
      nonEmptyChunks.push(text);
    }

    const parseChunk = async (chunk) => {
      const response = await openaiClient.chat.completions.create({
        model: 'gpt-4o-mini',
        response_format: {
          type: 'json_schema',
          json_schema: { name: 'rent_roll', schema: JSON_SCHEMA },
        },
        messages: [
          { role: 'system', content: SYSTEM },
          { role: 'user', content: `Extract rows from this rent roll text:\n${chunk}` },
        ],
      });

      const content = response.choices?.[0]?.message?.content;
      if (!content) {
        return [];
      }

      try {
        const parsed = JSON.parse(content);
        if (Array.isArray(parsed?.rows)) {
          return parsed.rows;
        }
        return [];
      } catch (error) {
        return [];
      }
    };

    const parsedChunks = await Promise.all(nonEmptyChunks.map((chunk) => parseChunk(chunk)));
    const aiRows = parsedChunks.flat();

    const rentMatchesTotal = new Set();
    const totalsList = totalValues;

    const rows = (aiRows || [])
      .map((rawRow) => {
        if (!rawRow || typeof rawRow !== 'object') {
          return null;
        }

        const lot = normalizeLot(rawRow.lot_number);
        if (!lot) {
          return null;
        }

        const occupied = Boolean(rawRow.occupied);
        const rentValue = typeof rawRow.rent === 'number' && Number.isFinite(rawRow.rent)
          ? rawRow.rent
          : null;

        let rent = rentValue;
        if (rent !== null && totalsList.some((value) => Math.abs(value - rent) < 0.01)) {
          rentMatchesTotal.add(lot.display);
          rent = null;
        }

        const tenantValue = typeof rawRow.tenant === 'string' && rawRow.tenant.trim()
          ? rawRow.tenant.trim()
          : null;

        return {
          lotNumber: lot.display,
          lotNumeric: lot.numeric,
          occupied,
          rent,
          tenant: tenantValue,
          tenantName: tenantValue,
          _originalLotToken: lot.original,
        };
      })
      .filter(Boolean);

    const validation = validateRows(rows);
    const decoratedRows = rows.map((row) => ({
      ...row,
      isDuplicate: validation.duplicateLots.has(row.lotNumber),
      missingRent: validation.missingRentLots.has(row.lotNumber) && row.occupied,
    }));

    const warnings = [...validation.warnings];
    if (rentMatchesTotal.size > 0) {
      warnings.push({
        code: 'matched_total',
        message: `Base rent not extracted for lots ${Array.from(rentMatchesTotal).join(', ')} because the value matched a "Total" amount. Please confirm manually.`,
        severity: 'warning',
      });
    }

    const summary = computeSummaryStats(decoratedRows, warnings);

    return res.status(200).json({ success: true, data: decoratedRows, summary });
  } catch (error) {
    console.error('Error parsing rent roll:', error);
    return res.status(500).json({ success: false, error: error.message || 'Unknown error' });
  }
}
