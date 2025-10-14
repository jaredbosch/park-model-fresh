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

    if (!text || text.length < 100) {
      const base64Image = `data:application/pdf;base64,${file}`;
      const ocrResponse = await openaiClient.chat.completions.create({
        model: 'gpt-4o-mini',
        messages: [
          {
            role: 'system',
            content: 'You are an OCR assistant for rent roll documents. Extract the visible text accurately.',
          },
          {
            role: 'user',
            content: [
              { type: 'text', text: 'Extract all visible text from this rent roll document:' },
              { type: 'image_url', image_url: { url: base64Image } },
            ],
          },
        ],
      });
      text = ocrResponse.choices?.[0]?.message?.content || '';
    }

    if (!text) {
      throw new Error('No text could be extracted from the provided file.');
    }

    const prompt = `
You are a document parser for mobile home park rent rolls.
Return a JSON object with a top-level property 'rows' that contains an array of lot entries in this format:
{
  "rows": [
    { "lotNumber": number | string, "tenantName": string | null, "occupied": boolean, "rent": number }
  ]
}
If no tenant name, use null. If rent missing, use 0.
Be lenient to messy data and extract all rows possible.

Text:
${text.slice(0, 8000)}
`;

    const parseResponse = await openaiClient.chat.completions.create({
      model: 'gpt-4o-mini',
      response_format: { type: 'json_object' },
      messages: [{ role: 'user', content: prompt }],
    });

    const content = parseResponse.choices?.[0]?.message?.content;

    if (!content) {
      throw new Error('OpenAI returned an empty response while parsing the rent roll.');
    }

    let parsedPayload;
    try {
      parsedPayload = JSON.parse(content);
    } catch (parseError) {
      throw new Error('Failed to parse structured JSON from OpenAI response.');
    }

    const candidateRows = Array.isArray(parsedPayload)
      ? parsedPayload
      : Array.isArray(parsedPayload?.rows)
      ? parsedPayload.rows
      : Array.isArray(parsedPayload?.data)
      ? parsedPayload.data
      : [];

    const normalised = normaliseRows(candidateRows);
    const summary = computeSummaryStats(normalised);

    return res.status(200).json({ success: true, data: normalised, summary });
  } catch (error) {
    console.error('Error parsing rent roll:', error);
    return res.status(500).json({ success: false, error: error.message || 'Unknown error' });
  }
}
