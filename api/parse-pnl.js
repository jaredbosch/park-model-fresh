import fs from 'fs';
import { promises as fsPromises } from 'fs';
import formidable from 'formidable';
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

function extractStructuredLines(rawText) {
  const lines = rawText.split('\n').map((l) => l.replace(/\s+/g, ' ').trim());
  const result = [];
  let currentSection = null;

  for (const line of lines) {
    if (/^INCOME/i.test(line)) currentSection = 'income';
    if (/^EXPENSE/i.test(line)) currentSection = 'expense';

    const match = line.match(/^([0-9]{3,4}\s+[A-Za-z].*?)\s(-?\$?[0-9][\d,]*\.\d{2})$/);
    if (match) {
      result.push({
        code: match[1].split(' ')[0],
        label: match[1].replace(/^[0-9]{3,4}\s*/, '').trim(),
        amount: Number(match[2].replace(/[^0-9.-]/g, '')),
        section: currentSection,
      });
    }
  }
  return result;
}

function ensureClient() {
  if (!openaiClient) {
    const error = new Error('OpenAI API key is not configured.');
    error.statusCode = 500;
    throw error;
  }
}

async function extractStructuredPnlWithGpt(filePath, filename) {
  ensureClient();

  let rawText = '';
  try {
    const buffer = await fsPromises.readFile(filePath);
    const parsedPdf = await pdfParse(buffer);
    rawText = parsedPdf?.text || '';
  } catch (textError) {
    console.warn('Unable to extract text from uploaded file for pre-processing:', textError);
  }

  const normalizedText = rawText
    ? rawText
        .split('\n')
        .map((line) => line.replace(/\s+/g, ' ').trim())
        .filter(Boolean)
        .join('\n')
    : '';

  const structuredLines = rawText ? extractStructuredLines(rawText) : [];
  if (structuredLines.length > 0) {
    console.log(`Structured pre-scan found ${structuredLines.length} line items`);
  }

  const stream = fs.createReadStream(filePath);
  let fileUpload;
  try {
    // Upload file to OpenAI
    fileUpload = await openaiClient.files.create({
      file: stream,
      purpose: 'assistants',
    });

    // Ask GPT-4o to extract structured data
    const userPromptSections = [
      'Extract structured P&L data from the provided material.',
    ];

    if (normalizedText) {
      userPromptSections.push(`Normalized P&L text:\n${normalizedText}`);
    }

    if (structuredLines.length > 0) {
      userPromptSections.push(
        `Regex pre-scan line items (use these to ensure no omissions):\n${JSON.stringify(
          structuredLines,
          null,
          2,
        )}`,
      );
    }

    const response = await openaiClient.chat.completions.create({
      model: 'gpt-4o',
      messages: [
        {
          role: 'system',
          content: `You are a structured data extractor for Profit & Loss statements.  \
Parse the attached document and return **valid JSON** with this exact schema:\n\n{\n  "income": {\n    "individual_items": [\n      { "label": string, "amount": number }\n    ],\n    "total_income": number\n  },\n  "expenses": {\n    "individual_items": [\n      { "label": string, "amount": number }\n    ],\n    "total_expense": number\n  },\n  "net_income": number\n}\n\nRules:\n- Always include multiple individual line items for both income and expenses.\n- Ignore monthly breakdowns — extract only total annual or summary figures.\n- Keep labels short and descriptive (e.g. "Rent Income", "Payroll", "Utilities").\n- Round all amounts to nearest whole dollar.\n- Output must be 100% valid JSON, no explanations or markdown.`,
        },
        {
          role: 'user',
          content: [
            { type: 'text', text: userPromptSections.join('\n\n') },
            { type: 'file', file: { file_id: fileUpload.id } },
          ],
        },
      ],
      response_format: { type: 'json_object' },
    });

    console.log('Raw GPT response:', response.choices?.[0]?.message?.content);

    let content = response.choices?.[0]?.message?.content;
    if (Array.isArray(content)) {
      const textPart = content.find((part) => typeof part?.text === 'string');
      content = textPart?.text;
    }

    if (!content) {
      throw new Error('No structured content returned from OpenAI.');
    }

    const parsed = JSON.parse(content);
    if (
      !parsed ||
      typeof parsed !== 'object' ||
      !('income' in parsed) ||
      !('expenses' in parsed)
    ) {
      console.error('Invalid structured response:', parsed);
      throw new Error('Parser did not return income and expense data.');
    }

    const merged = { ...parsed };

    const normalizeSection = (sectionKey) => {
      const section = merged[sectionKey];
      if (!section || typeof section !== 'object') {
        merged[sectionKey] = { individual_items: {} };
        return;
      }

      const items = section.individual_items;
      if (Array.isArray(items)) {
        merged[sectionKey] = {
          ...section,
          individual_items: items.reduce((acc, item) => {
            if (item && typeof item === 'object' && item.label) {
              acc[item.label] = { label: item.label, amount: item.amount };
            }
            return acc;
          }, {}),
        };
      } else if (!items || typeof items !== 'object') {
        merged[sectionKey] = { ...section, individual_items: {} };
      }
    };

    Object.keys(merged).forEach((key) => {
      if (
        merged[key] &&
        typeof merged[key] === 'object' &&
        'individual_items' in merged[key]
      ) {
        normalizeSection(key);
      }
    });

    normalizeSection('income');
    normalizeSection('expenses');

    const sectionKeyForLine = (section) => {
      if (!section) return null;
      if (section === 'expense') return 'expenses';
      return section;
    };

    for (const line of structuredLines) {
      const targetKey = sectionKeyForLine(line.section) || 'expenses';
      if (!merged[targetKey]) {
        merged[targetKey] = { individual_items: {} };
      }
      if (
        !merged[targetKey].individual_items ||
        Array.isArray(merged[targetKey].individual_items)
      ) {
        normalizeSection(targetKey);
      }

      if (!merged[targetKey].individual_items[line.label]) {
        const normalizedAmount = Number.isFinite(line.amount)
          ? Math.round(line.amount)
          : 0;
        merged[targetKey].individual_items[line.label] = {
          label: line.label,
          amount: normalizedAmount,
        };
      }
    }

    const missing = structuredLines.filter((line) => {
      const sectionKey = sectionKeyForLine(line.section) || 'expenses';
      return !merged[sectionKey]?.individual_items?.[line.label];
    });

    console.warn('Missing after merge:', missing.map((m) => m.label));

    if (supabase && missing.length > 0) {
      try {
        await supabase.from('pnl_debug_log').insert(
          missing.map((m) => ({
            file_name: filename,
            section: m.section,
            label: m.label,
            amount: m.amount,
          })),
        );
      } catch (debugError) {
        console.error('Unable to persist missing line items to Supabase:', debugError);
      }
    }

    Object.keys(merged).forEach((key) => {
      const section = merged[key];
      if (
        section &&
        typeof section === 'object' &&
        section.individual_items &&
        !Array.isArray(section.individual_items)
      ) {
        section.individual_items = Object.values(section.individual_items);
      }
    });

    if (merged.income && Array.isArray(merged.income.individual_items)) {
      const totalIncome = merged.income.individual_items.reduce((sum, item) => {
        const value = Number.isFinite(item?.amount) ? item.amount : 0;
        return sum + value;
      }, 0);
      merged.income.total_income = Math.round(totalIncome);
    }

    if (merged.expenses && Array.isArray(merged.expenses.individual_items)) {
      const totalExpense = merged.expenses.individual_items.reduce((sum, item) => {
        const value = Number.isFinite(item?.amount) ? item.amount : 0;
        return sum + value;
      }, 0);
      merged.expenses.total_expense = Math.round(totalExpense);
    }

    if ('net_income' in merged) {
      const totalIncome = merged.income?.total_income || 0;
      const totalExpense = merged.expenses?.total_expense || 0;
      merged.net_income = Math.round(totalIncome - totalExpense);
    }

    return merged;
  } finally {
    if (typeof stream.close === 'function') {
      stream.close();
    }
    const uploadId = fileUpload?.id;
    try {
      if (uploadId) {
        await openaiClient.files.del(uploadId);
      }
    } catch (cleanupError) {
      console.warn('Unable to delete uploaded P&L file from OpenAI:', cleanupError);
    }
  }
}

export default async function handler(req, res) {
  if (req.method !== 'POST') {
    res.setHeader('Allow', ['POST']);
    res.status(405).json({ success: false, error: 'Method not allowed' });
    return;
  }

  let tempFilePath;
  let originalFilename;

  try {
    await fsPromises.mkdir('/tmp', { recursive: true });

    const form = formidable({
      multiples: false,
      keepExtensions: true,
      maxFileSize: 50 * 1024 * 1024,
      uploadDir: '/tmp',
    });

    const { files } = await new Promise((resolve, reject) => {
      form.parse(req, (err, fields, filesResult) => {
        if (err) {
          reject(err);
          return;
        }
        resolve({ fields, files: filesResult });
      });
    });

    const incomingFile = files?.file;
    const fileDescriptor = Array.isArray(incomingFile) ? incomingFile[0] : incomingFile;

    if (!fileDescriptor) {
      res.status(400).json({ success: false, error: 'No file uploaded.' });
      return;
    }

    tempFilePath = fileDescriptor.filepath || fileDescriptor.path;
    originalFilename = fileDescriptor.originalFilename || fileDescriptor.newFilename || 'upload.pdf';

    if (!tempFilePath) {
      res.status(400).json({ success: false, error: 'Uploaded file is missing a temporary path.' });
      return;
    }

    const parsed = await extractStructuredPnlWithGpt(tempFilePath, originalFilename);

    if (!parsed || typeof parsed !== 'object') {
      res.status(422).json({ success: false, error: 'Unable to parse structured P&L data.' });
      return;
    }

    if (supabase) {
      try {
        await supabase.from('parsed_pnls').insert({
          filename: originalFilename,
          parsed_json: parsed,
          parsed_at: new Date().toISOString(),
          model_used: 'gpt-4o',
        });
      } catch (storageError) {
        console.error('Unable to persist parsed P&L payload:', storageError);
      }
    }

    res.status(200).json({
      success: true,
      data: parsed,
      metadata: {
        source_filename: originalFilename,
        extraction_strategy: 'gpt-4o-structured',
        model_used: 'gpt-4o',
      },
    });
  } catch (error) {
    console.error('Error parsing P&L:', error);
    const statusCode = error?.statusCode || 500;
    res
      .status(statusCode)
      .json({ success: false, error: error.message || 'Unexpected error while parsing P&L.' });
  } finally {
    if (tempFilePath) {
      await fsPromises.unlink(tempFilePath).catch(() => {});
    }
  }
}
