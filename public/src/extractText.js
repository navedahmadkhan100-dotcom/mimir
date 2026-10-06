import path from 'node:path';
import mammoth from 'mammoth';
import { extractText, getDocumentProxy } from 'unpdf';

const PDF_MAX_PAGES = 100;
const PDF_TIMEOUT_MS = 15000;

function withTimeout(promise, ms, message) {
  let timer;
  const timeout = new Promise((_, reject) => {
    timer = setTimeout(() => reject(new Error(message)), ms);
  });
  return Promise.race([promise, timeout]).finally(() => clearTimeout(timer));
}

async function extractPdfText(buffer) {
  try {
    const pdf = await withTimeout(
      getDocumentProxy(new Uint8Array(buffer)),
      PDF_TIMEOUT_MS,
      'PDF parsing timed out.'
    );

    if (pdf.numPages > PDF_MAX_PAGES) {
      throw new Error(`PDF has ${pdf.numPages} pages; maximum supported is ${PDF_MAX_PAGES}.`);
    }

    const result = await withTimeout(
      extractText(pdf, { mergePages: true }),
      PDF_TIMEOUT_MS,
      'PDF text extraction timed out.'
    );

    return typeof result.text === 'string'
      ? result.text
      : Array.isArray(result.text)
        ? result.text.join('\n')
        : '';
  } catch (error) {
    const detail = error?.message || 'Unknown PDF parsing error';
    throw new Error(
      `Unable to extract text from this PDF (${detail}). ` +
      'Try exporting the CV as a new PDF, uploading DOCX, or pasting the CV text.'
    );
  }
}

export async function extractTextFromUpload(file) {
  if (!file) return '';
  const ext = path.extname(file.originalname || '').toLowerCase();
  const mime = file.mimetype || '';

  if (ext === '.txt' || mime.startsWith('text/')) {
    return file.buffer.toString('utf8');
  }

  if (ext === '.docx' || mime === 'application/vnd.openxmlformats-officedocument.wordprocessingml.document') {
    const result = await mammoth.extractRawText({ buffer: file.buffer });
    return result.value || '';
  }

  if (ext === '.pdf' || mime === 'application/pdf') {
    return extractPdfText(file.buffer);
  }

  throw new Error(`Unsupported file type: ${ext || mime || 'unknown'}. Use PDF, DOCX, or TXT.`);
}
