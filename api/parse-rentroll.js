import OpenAI from 'openai';
import pdfParse from 'pdf-parse';

const openaiApiKey = process.env.OPENAI_API_KEY;
const openaiClient = openaiApiKey ? new OpenAI({ apiKey: openaiApiKey }) : null;

const toBoolean = (value) => {
  if (typeof value === 'boolean') {
    return value;
  }
  if (typeof value === 'number') {
    return value > 0;
  }
  if (typeof value === 'string') {
    const trimmed = value.trim().toLowerCase();
    if (!trimmed) {
      return false;
    }
    return ['true', 'yes', 'y', 'occupied', '1'].some((entry) => trimmed === entry);
  }
  return false;
};

const toNumber = (value) => {
  const numeric = Number(value);
  return Number.isFinite(numeric) ? numeric : 0;
};

const normaliseRows = (rows = []) =>
  rows
    .filter((row) => row && typeof row === 'object')
    .map((row, index) => {
      const occupied = toBoolean(
        row.occupied ?? row.isOccupied ?? row.status ?? row.occupancy ?? row.vacant === false
      );
      const rent = toNumber(row.rent ?? row.monthlyRent ?? row.amount ?? row.payment);
      const rawLot =
        row.lotNumber ?? row.lot ?? row.lot_no ?? row.space ?? row.unit ?? row.site ?? row.padNumber;
      const lotNumber = rawLot !== undefined && rawLot !== null && `${rawLot}`.trim()
        ? `${rawLot}`.trim()
        : `${index + 1}`;
      const rawTenant =
        row.tenantName ?? row.tenant ?? row.name ?? row.resident ?? row.tenant_name ?? row.occupant;
      const tenantName = rawTenant && `${rawTenant}`.trim() ? `${rawTenant}`.trim() : null;

      return {
        lotNumber,
        tenantName,
        occupied,
        rent,
      };
    });

function computeSummaryStats(rows = []) {
  const totalLots = rows.length;
  const occupiedLots = rows.filter((row) => toBoolean(row.occupied)).length;
  const rents = rows
    .map((row) => toNumber(row.rent))
    .filter((rent) => !Number.isNaN(rent) && rent > 0);
  const avgRent = rents.length ? rents.reduce((sum, rent) => sum + rent, 0) / rents.length : 0;
  const modeRent = (() => {
    if (rents.length === 0) {
      return null;
    }
    const counts = new Map();
    rents.forEach((rent) => {
      counts.set(rent, (counts.get(rent) || 0) + 1);
    });
    const [mode] = Array.from(counts.entries()).sort((a, b) => b[1] - a[1])[0];
    return mode ?? null;
  })();

  return {
    totalLots,
    occupiedLots,
    avgRent: Math.round(avgRent),
    modeRent: typeof modeRent === 'number' && Number.isFinite(modeRent) ? modeRent : null,
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
              { type: 'image_url', image_url: `data:application/pdf;base64,${file}` },
            ],
          },
        ],
      });
      text = ocrResponse.choices?.[0]?.message?.content || '';
    }

    if (!text) {
      throw new Error('No text could be extracted from the provided file.');
    }

    const chunks = [];
    for (let i = 0; i < text.length; i += 10000) {
      chunks.push(text.slice(i, i + 10000));
    }

    const nonEmptyChunks = chunks.filter((chunk) => chunk.trim().length > 0);
    if (nonEmptyChunks.length === 0) {
      nonEmptyChunks.push(text);
    }

    const parseChunk = async (chunk) => {
      const prompt = `
You are a document parser for mobile home park rent rolls.
Extract only the base lot rent for each lot (exclude utilities such as water, trash, sewer, insurance, pet fees, or other charges).
Return a JSON array in this format:
[
  { "lotNumber": number | string, "tenantName": string | null, "occupied": boolean, "rent": number }
]
Rules:
- "rent" must represent the lot/base rent only. Ignore or subtract bundled utilities or other fees when possible.
- Ignore totals, headers, or summary rows.
- Treat missing tenant names as null.
- If only one numeric rent-like value is present, use it as the lot rent.
- Include every identifiable lot entry even across multiple pages.

Text:
${chunk}
`;

      const response = await openaiClient.chat.completions.create({
        model: 'gpt-4o-mini',
        response_format: { type: 'json_object' },
        messages: [{ role: 'user', content: prompt }],
      });

      const content = response.choices?.[0]?.message?.content;
      if (!content) {
        return [];
      }

      try {
        const parsed = JSON.parse(content);
        if (Array.isArray(parsed)) {
          return parsed;
        }
        if (Array.isArray(parsed?.rows)) {
          return parsed.rows;
        }
        if (Array.isArray(parsed?.data)) {
          return parsed.data;
        }
        return [];
      } catch (error) {
        return [];
      }
    };

    const parsedChunks = await Promise.all(nonEmptyChunks.map((chunk) => parseChunk(chunk)));
    const candidateRows = parsedChunks.flat();
    const normalised = normaliseRows(candidateRows);
    const summary = computeSummaryStats(normalised);

    return res.status(200).json({ success: true, data: normalised, summary });
  } catch (error) {
    console.error('Error parsing rent roll:', error);
    return res.status(500).json({ success: false, error: error.message || 'Unknown error' });
  }
}
